import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import storage_service as storage  # noqa: E402


class FakeCursor:
    def __init__(self, records):
        self.records = records

    async def to_list(self, _length):
        return self.records


class FakeFiles:
    def __init__(self, records):
        self.records = records
        self.deleted_query = None

    def find(self, _query, _projection):
        return FakeCursor(self.records)

    async def delete_many(self, query):
        self.deleted_query = query


class FakeDatabase:
    def __init__(self, files):
        self.files = files


def test_delete_media_assets_removes_cloudinary_local_and_db_files(tmp_path, monkeypatch):
    names = ["media_original.jpg", "media_story.jpg", "media_video.mp4"]
    records = [
        {"name": names[0], "provider": "cloudinary", "storage_path": "media/original",
         "resource_type": "image", "content_type": "image/jpeg"},
        {"name": names[1], "provider": "cloudinary", "storage_path": "media/story",
         "resource_type": "image", "content_type": "image/jpeg"},
        {"name": names[2], "provider": "cloudinary", "storage_path": "media/video",
         "resource_type": "video", "content_type": "video/mp4"},
    ]
    files = FakeFiles(records)
    monkeypatch.setattr(storage, "db", FakeDatabase(files))
    monkeypatch.setattr(storage, "WORK_DIR", tmp_path)
    monkeypatch.setattr(storage, "cloudinary_ready", lambda _settings: True)
    monkeypatch.setattr(storage, "get_settings", lambda: asyncio.sleep(0, result={"configured": True}))
    deleted_assets = []

    def destroy(public_id, resource_type, _settings):
        deleted_assets.append((public_id, resource_type))
        return {"result": "ok"}

    monkeypatch.setattr(storage, "_destroy_cloudinary_asset", destroy)
    for name in names:
        (tmp_path / name).write_bytes(b"asset")

    asyncio.run(storage.delete_media_assets(
        names,
        "media/original-upload",
        "image",
        cloudinary_enhanced_public_id="media/enhanced",
    ))

    assert set(deleted_assets) == {
        ("media/original", "image"),
        ("media/story", "image"),
        ("media/video", "video"),
        ("media/original-upload", "image"),
        ("media/enhanced", "image"),
    }
    assert files.deleted_query == {"name": {"$in": names}}
    assert all(not (tmp_path / name).exists() for name in names)


def test_delete_media_assets_keeps_file_records_when_cloudinary_delete_fails(tmp_path, monkeypatch):
    name = "media_original.jpg"
    files = FakeFiles([{
        "name": name,
        "provider": "cloudinary",
        "storage_path": "media/original",
        "resource_type": "image",
        "content_type": "image/jpeg",
    }])
    monkeypatch.setattr(storage, "db", FakeDatabase(files))
    monkeypatch.setattr(storage, "WORK_DIR", tmp_path)
    monkeypatch.setattr(storage, "cloudinary_ready", lambda _settings: True)
    monkeypatch.setattr(storage, "get_settings", lambda: asyncio.sleep(0, result={"configured": True}))
    monkeypatch.setattr(storage, "_destroy_cloudinary_asset", lambda *_args: {"result": "error"})
    (tmp_path / name).write_bytes(b"asset")

    with pytest.raises(storage.StorageError, match="retry the media deletion"):
        asyncio.run(storage.delete_media_assets([name]))

    assert files.deleted_query is None
    assert (tmp_path / name).exists()


def test_delete_media_assets_requires_cloudinary_configuration(tmp_path, monkeypatch):
    name = "media_original.jpg"
    files = FakeFiles([{
        "name": name,
        "provider": "cloudinary",
        "storage_path": "media/original",
        "resource_type": "image",
        "content_type": "image/jpeg",
    }])
    monkeypatch.setattr(storage, "db", FakeDatabase(files))
    monkeypatch.setattr(storage, "WORK_DIR", tmp_path)
    monkeypatch.setattr(storage, "cloudinary_ready", lambda _settings: False)
    monkeypatch.setattr(storage, "get_settings", lambda: asyncio.sleep(0, result={}))

    with pytest.raises(storage.StorageNotConfiguredError, match="credentials are required"):
        asyncio.run(storage.delete_media_assets([name]))

    assert files.deleted_query is None
