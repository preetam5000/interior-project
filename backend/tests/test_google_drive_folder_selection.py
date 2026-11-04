import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import google_drive_service as drive  # noqa: E402
from services import google_drive_sync_service as sync  # noqa: E402
from services import settings_service as settings  # noqa: E402
from routes import n8n  # noqa: E402


def test_discovers_only_required_direct_child_folders(monkeypatch):
    list_children = AsyncMock(return_value=[
        {"id": "dumped-id", "name": "Dumped Images"},
        {"id": "filtered-id", "name": "filtered images"},
        {"id": "other-id", "name": "archive"},
    ])
    monkeypatch.setattr(drive, "_get_folder", AsyncMock(return_value={
        "id": "parent-id", "name": "sachin instagram", "parents": [],
    }))
    monkeypatch.setattr(drive, "list_child_folders", list_children)

    folders = asyncio.run(drive.discover_instagram_folders("parent-id", "company-id"))

    assert folders == {
        "parent_folder_id": "parent-id",
        "parent_folder_name": "sachin instagram",
        "dumped_folder_id": "dumped-id",
        "filtered_folder_id": "filtered-id",
    }
    list_children.assert_awaited_once_with("parent-id", "company-id")


@pytest.mark.parametrize("children", [
    [{"id": "dumped-id", "name": "dumped images"}],
    [{"id": "filtered-id", "name": "filtered images"}],
    [],
])
def test_discovery_requires_both_child_folders(monkeypatch, children):
    monkeypatch.setattr(drive, "_get_folder", AsyncMock(return_value={
        "id": "parent-id", "name": "sachin instagram", "parents": [],
    }))
    monkeypatch.setattr(drive, "list_child_folders", AsyncMock(return_value=children))

    with pytest.raises(ValueError) as exc:
        asyncio.run(drive.discover_instagram_folders("parent-id", "company-id"))
    assert str(exc.value) == "The selected folder must contain:\n- dumped images\n- filtered images"


def test_saves_parent_id_without_persisting_child_folder_ids(monkeypatch):
    monkeypatch.setattr(drive, "discover_instagram_folders", AsyncMock(return_value={
        "parent_folder_id": "parent-id",
        "parent_folder_name": "sachin instagram",
        "dumped_folder_id": "dumped-id",
        "filtered_folder_id": "filtered-id",
    }))
    update = AsyncMock()
    monkeypatch.setattr(settings, "update_settings", update)

    result = asyncio.run(drive.save_selected_folder("parent-id", "sachin instagram"))

    assert result == {"id": "parent-id", "name": "sachin instagram"}
    saved_settings = update.await_args.args[0]
    assert saved_settings["gdrive_selected_folder_id"] == "parent-id"
    assert saved_settings["gdrive_selected_folder_name"] == "sachin instagram"
    assert "dumped_folder_id" not in saved_settings
    assert "filtered_folder_id" not in saved_settings


def test_sync_lists_files_only_in_filtered_images(monkeypatch):
    discover = AsyncMock(return_value={
        "parent_folder_id": "parent-id",
        "parent_folder_name": "sachin instagram",
        "dumped_folder_id": "dumped-id",
        "filtered_folder_id": "filtered-id",
    })
    list_files = AsyncMock(return_value=[])
    monkeypatch.setattr(drive, "discover_instagram_folders", discover)
    monkeypatch.setattr(drive, "list_folder_files", list_files)
    monkeypatch.setattr(sync, "get_company_settings", AsyncMock(return_value={"gdrive_refresh_token": "token"}))
    monkeypatch.setattr(sync, "update_settings", AsyncMock())
    monkeypatch.setattr(sync, "db", SimpleNamespace(
        drive_sync_records=SimpleNamespace(find_one=AsyncMock(return_value=None)),
    ))
    monkeypatch.setattr(sync, "_save_sync_history", AsyncMock())

    result = asyncio.run(sync._sync_folder("company-id", "parent-id"))

    assert result["ok"] is True
    list_files.assert_awaited_once_with("filtered-id", "company-id")


def test_sync_marks_media_waiting_for_approval_as_completed(monkeypatch):
    update_record = AsyncMock()
    update_media = AsyncMock()
    notify = AsyncMock()
    monkeypatch.setattr(sync, "_update_record", update_record)
    monkeypatch.setattr(sync, "_notify_safely", notify)
    monkeypatch.setattr(sync.db, "media", SimpleNamespace(update_one=update_media))

    result = asyncio.run(sync._finish_from_media(
        {"drive_file_id": "drive-file", "status": "processing", "started_at": None, "filename": "room.png"},
        {"id": "media-id", "status": "pending", "sync_status": "processing"},
        retry_failed=False,
    ))

    assert result == "completed"
    assert update_record.await_args.args[1]["status"] == "completed"
    assert update_media.await_args.args == (
        {"id": "media-id"},
        {"$set": {"sync_status": "completed"}},
    )
    notify.assert_awaited_once()


def test_n8n_config_exposes_only_filtered_folder(monkeypatch):
    monkeypatch.setattr(drive, "discover_instagram_folders", AsyncMock(return_value={
        "parent_folder_id": "parent-id",
        "parent_folder_name": "sachin instagram",
        "dumped_folder_id": "dumped-id",
        "filtered_folder_id": "filtered-id",
    }))

    config = asyncio.run(n8n.config({"company_id": "company-id", "gdrive_selected_folder_id": "parent-id"}))

    assert config["images_folder_id"] == "filtered-id"
    assert config["videos_folder_id"] == ""


def test_n8n_rejects_drive_files_outside_filtered_folder(monkeypatch):
    monkeypatch.setattr(drive, "discover_instagram_folders", AsyncMock(return_value={
        "filtered_folder_id": "filtered-id",
    }))
    monkeypatch.setattr(drive, "get_file_info", AsyncMock(return_value={
        "id": "file-id", "parents": ["dumped-id"], "trashed": False,
    }))

    with pytest.raises(n8n.HTTPException) as exc:
        asyncio.run(n8n._validate_drive_import(
            "file-id",
            {"company_id": "company-id", "gdrive_selected_folder_id": "parent-id"},
        ))
    assert exc.value.detail == "Google Drive imports are allowed only from the filtered images folder"
