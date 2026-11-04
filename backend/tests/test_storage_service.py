import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import storage_service as storage  # noqa: E402


class FakeFilesCollection:
    def __init__(self):
        self.update = None

    async def update_one(self, query, update, upsert=False):
        self.update = (query, update, upsert)


async def _settings():
    return {}


def _cloudinary_response():
    return {
        "public_id": "interior-social-ai/media/test_original_png",
        "secure_url": "https://res.cloudinary.com/test-cloud/image/upload/v123/interior-social-ai/media/test_original_png.png",
        "format": "png",
        "version": 123,
        "resource_type": "image",
        "bytes": 42,
    }


def test_store_verifies_and_persists_exact_cloudinary_upload(monkeypatch, tmp_path):
    source = tmp_path / "test_original.png"
    source.write_bytes(b"image-bytes")
    response = _cloudinary_response()
    files = FakeFilesCollection()
    upload_options = {}

    def upload(_path, **options):
        upload_options.update(options)
        return response

    monkeypatch.setattr(storage, "cloudinary_ready", lambda _settings: True)
    monkeypatch.setattr(storage, "_configure", lambda _settings: None)
    monkeypatch.setattr(storage.cloudinary.uploader, "upload", upload)
    monkeypatch.setattr(storage.cloudinary.api, "resource", lambda *_args, **_kwargs: dict(response))
    monkeypatch.setattr(storage, "get_settings", lambda: _settings())
    monkeypatch.setattr(storage, "db", SimpleNamespace(files=files))

    url = asyncio.run(storage._store("test_original.png", source, "image/png"))

    query, update, upsert = files.update
    stored = update["$set"]
    assert url == response["secure_url"]
    assert upload_options["public_id"] == "test_original_png"
    assert query == {"name": "test_original.png"}
    assert upsert is True
    assert stored["storage_path"] == response["public_id"]
    assert stored["url"] == response["secure_url"]
    assert stored["resource_type"] == response["resource_type"]
    assert stored["format"] == response["format"]
    assert stored["version"] == response["version"]


def test_cloudinary_public_ids_distinguish_same_stem_with_different_extensions():
    assert storage._public_id("media_original.png") == "media_original_png"
    assert storage._public_id("media_original.jpg") == "media_original_jpg"
    assert storage._public_id("media_original.png") != storage._public_id("media_original.jpg")


def test_failed_cloudinary_asset_verification_does_not_save_storage_reference(
    monkeypatch, tmp_path
):
    source = tmp_path / "test_original.png"
    source.write_bytes(b"image-bytes")
    response = _cloudinary_response()
    files = FakeFilesCollection()
    monkeypatch.setattr(storage, "cloudinary_ready", lambda _settings: True)
    monkeypatch.setattr(storage, "_configure", lambda _settings: None)
    monkeypatch.setattr(storage.cloudinary.uploader, "upload", lambda *_args, **_kwargs: response)

    def missing_asset(*_args, **_kwargs):
        raise RuntimeError("Resource not found")

    monkeypatch.setattr(storage.cloudinary.api, "resource", missing_asset)
    monkeypatch.setattr(storage, "get_settings", lambda: _settings())
    monkeypatch.setattr(storage, "db", SimpleNamespace(files=files))

    async def run_store():
        return await storage._store("test_original.png", source, "image/png")

    with pytest.raises(storage.StorageError, match="could not be verified"):
        asyncio.run(run_store())

    assert files.update is None
