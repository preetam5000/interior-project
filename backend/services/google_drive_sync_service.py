"""Poll only the selected Instagram folder's filtered images child."""

import asyncio
import logging
import time
from datetime import datetime, time as datetime_time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx

from core.config import GOOGLE_DRIVE_SYNC_INTERVAL_SECONDS
from core.db import db, new_id, now_iso, NO_ID
from core.tenant_context import get_actor_id, get_company_id, set_actor_id, set_company_id
from services import google_drive_service as drive, pipeline
from services.settings_service import get_company_settings, update_settings
from services.notification_service import notify

log = logging.getLogger("google_drive_sync")
SUPPORTED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "heic"}
SYNC_ACTOR = {"id": "google-drive-sync", "name": "Google Drive Sync", "role": "system"}
_company_locks: dict[str, asyncio.Lock] = {}
_manual_tasks: dict[str, asyncio.Task] = {}
_retry_tasks: dict[str, asyncio.Task] = {}


def _lock_for(company_id: str) -> asyncio.Lock:
    return _company_locks.setdefault(company_id, asyncio.Lock())


def _duration_seconds(started_at: str | None, ended_at: str | None = None) -> float | None:
    if not started_at:
        return None
    try:
        start = datetime.fromisoformat(started_at)
        end = datetime.fromisoformat(ended_at) if ended_at else datetime.now(timezone.utc)
        return max(0.0, round((end - start).total_seconds(), 3))
    except (TypeError, ValueError):
        return None


async def _notify_safely(kind: str, title: str, message: str, link: str = "/google-drive/imports") -> None:
    try:
        await notify(kind, title, message, link)
    except Exception:
        log.exception("[Drive Sync] Could not create notification: %s", title)


async def _save_sync_history(company_id: str, started_at: str, start_clock: float, files_found: int, results: dict, error: str = "", project_name: str = "") -> None:
    completed_at = now_iso()
    next_sync_at = (datetime.now(timezone.utc) + timedelta(seconds=GOOGLE_DRIVE_SYNC_INTERVAL_SECONDS)).isoformat()
    await db.drive_sync_history.insert_one({
        "id": new_id(),
        "started_at": started_at,
        "completed_at": completed_at,
        "next_sync_at": next_sync_at,
        "duration_seconds": round(time.monotonic() - start_clock, 3),
        "files_found": files_found,
        "files_imported": results.get("imported", 0),
        "duplicates": results.get("duplicates", 0),
        "errors": results.get("failed", 0),
        "error_message": error,
        "project_name": project_name,
    })


def _drive_error_message(exc: Exception) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status == 403:
            return "Google Drive denied access. Reconnect Drive and approve read-only access to files in the selected folder."
        if status == 404:
            return "The selected Instagram folder, filtered images folder, or a Drive file no longer exists. Check the folder selection."
    return str(exc)[:500] or "Google Drive sync failed"


async def _upsert_record(file: dict, folder_id: str, parent_folder_id: str) -> dict:
    file_id = file["id"]
    timestamp = now_iso()
    await db.drive_sync_records.update_one(
        {"drive_file_id": file_id},
        {"$setOnInsert": {
            "id": new_id(),
            "drive_file_id": file_id,
            "drive_folder_id": folder_id,
            "parent_folder_id": parent_folder_id,
            "filename": file["name"],
            "web_view_link": file.get("webViewLink", ""),
            "status": "waiting",
            "progress": 0,
            "stage": "Waiting",
            "attempts": 0,
            "retry_count": 0,
            "media_id": None,
            "error": "",
            "started_at": None,
            "completed_at": None,
            "processing_time": None,
            "cancel_requested": False,
            "created_at": timestamp,
            "updated_at": timestamp,
        }},
        upsert=True,
    )
    await db.drive_sync_records.update_one({"drive_file_id": file_id}, {"$set": {
        "drive_folder_id": folder_id,
        "parent_folder_id": parent_folder_id,
        "source_folder": "filtered images",
        "updated_at": timestamp,
    }})
    return await db.drive_sync_records.find_one({"drive_file_id": file_id}, NO_ID)


async def _update_record(file_id: str, values: dict) -> None:
    await db.drive_sync_records.update_one(
        {"drive_file_id": file_id},
        {"$set": {**values, "updated_at": now_iso()}},
    )


async def _find_media(file_id: str) -> dict | None:
    return await db.media.find_one({"$or": [
        {"google_drive_file_id": file_id},
        {"drive_file_id": file_id},
    ]}, NO_ID)


async def _finish_from_media(record: dict, media: dict, *, retry_failed: bool) -> str:
    file_id = record["drive_file_id"]
    status = media.get("status")
    if status in {"ready", "skipped", "pending"}:
        completed_at = now_iso()
        if record.get("status") != "completed":
            await _update_record(file_id, {
                "status": "completed", "progress": 100, "stage": "Completed",
                "media_id": media["id"], "error": "", "completed_at": completed_at,
                "processing_time": _duration_seconds(record.get("started_at"), completed_at),
            })
        if media.get("sync_status") != "completed":
            await db.media.update_one({"id": media["id"]}, {"$set": {"sync_status": "completed"}})
        if record.get("status") != "completed":
            await _notify_safely("drive_import_completed", "New image imported", f"{record.get('filename')} is ready in the Media Library.", f"/library?media={media['id']}")
            log.info("[Drive Sync] [%s] Completed: %s", record.get("project_name", "Instagram Folder"), record.get("filename"))
        return "completed"
    if status in {"queued", "processing"}:
        if not media.get("scene_analysis"):
            progress, stage = 46, "Analyzing"
        else:
            progress, stage = 63, "Enhancing"
        if record.get("status") != "processing" or record.get("media_id") != media["id"] or record.get("error") or record.get("progress") != progress:
            await _update_record(file_id, {"status": "processing", "progress": progress, "stage": stage, "media_id": media["id"], "error": ""})
        return "processing"
    if status == "failed":
        if retry_failed:
            await db.media.update_one({"id": media["id"]}, {"$set": {"status": "queued", "sync_status": "processing", "error": None}})
            pipeline.schedule(media["id"])
            await _update_record(file_id, {"status": "processing", "progress": 46, "stage": "Analyzing", "media_id": media["id"], "retry_count": int(record.get("retry_count", 0)) + 1, "error": ""})
            log.info("[Drive Sync] Retrying media pipeline for %s", record.get("filename"))
            return "processing"
        error = media.get("error") or "Media processing failed"
        if record.get("status") != "failed" or record.get("media_id") != media["id"] or record.get("error") != error:
            failed_at = now_iso()
            await _update_record(file_id, {"status": "failed", "progress": 100, "stage": "Failed", "media_id": media["id"], "error": error, "error_message": error, "failed_at": failed_at, "completed_at": failed_at, "processing_time": _duration_seconds(record.get("started_at"), failed_at)})
        if media.get("sync_status") != "failed":
            await db.media.update_one({"id": media["id"]}, {"$set": {"sync_status": "failed"}})
        if record.get("status") != "failed":
            await _notify_safely("drive_import_failed", "Import failed", f"{record.get('filename')}: {error}")
        return "failed"
    return "pending"


async def _import_file(company_id: str, file: dict, folder_id: str, parent_folder_id: str, *, retry_failed: bool) -> str:
    file_id = file["id"]
    record = await _upsert_record(file, folder_id, parent_folder_id)
    if record.get("status") in {"completed", "skipped_duplicate", "cancelled"}:
        return "skipped"

    media = await _find_media(file_id)
    if media:
        state = await _finish_from_media(record, media, retry_failed=retry_failed and record.get("status") == "failed")
        if state != "pending":
            return "retried" if retry_failed and state == "processing" else "skipped"

    if record.get("status") == "failed" and not retry_failed:
        return "failed"
    if record.get("status") in {"processing", "uploading"}:
        return "pending"

    filename = Path(file.get("name", "")).name
    extension = Path(filename).suffix.lower().lstrip(".")
    if extension not in SUPPORTED_EXTENSIONS:
        return "ignored"

    started_at = record.get("started_at") or now_iso()
    await _update_record(file_id, {
        "status": "downloading", "progress": 5, "stage": "Downloading",
        "started_at": started_at, "error": "", "error_message": "", "cancel_requested": False,
    })
    log.info("[Drive Sync] Import Started: %s", filename)
    last_error = None
    contents = b""
    mime = file.get("mimeType", "")
    for attempt in range(1, 4):
        current = await db.drive_sync_records.find_one({"drive_file_id": file_id}, NO_ID)
        if current.get("cancel_requested"):
            await _update_record(file_id, {"status": "cancelled", "stage": "Cancelled", "completed_at": now_iso(), "progress": 100})
            return "skipped"
        await _update_record(file_id, {
            "attempts": int(record.get("attempts", 0)) + attempt,
            "retry_count": int(record.get("retry_count", 0)) + max(0, attempt - 1),
        })
        try:
            contents, response_mime = await drive.download_file(file_id)
            mime = mime or response_mime
            break
        except drive.GoogleDriveAuthError:
            raise
        except Exception as exc:
            last_error = exc
            if attempt < 3:
                log.warning("[Drive Sync] Download attempt %s failed for %s: %s", attempt, filename, exc)
                await asyncio.sleep(attempt * 2)
    if not contents:
        message = _drive_error_message(last_error or RuntimeError("Downloaded file was empty"))
        failed_at = now_iso()
        await _update_record(file_id, {"status": "failed", "progress": 100, "stage": "Failed", "error": message, "error_message": message, "failed_at": failed_at, "completed_at": failed_at, "processing_time": _duration_seconds(started_at, failed_at)})
        await _notify_safely("drive_import_failed", "Import failed", f"{filename}: {message}")
        return "failed"

    current = await db.drive_sync_records.find_one({"drive_file_id": file_id}, NO_ID)
    if current.get("cancel_requested"):
        await _update_record(file_id, {"status": "cancelled", "stage": "Cancelled", "completed_at": now_iso(), "progress": 100})
        return "skipped"
    if (await get_company_settings(company_id)).get("gdrive_sync_paused"):
        await _update_record(file_id, {"status": "waiting", "stage": "Waiting", "progress": 0, "cancel_requested": False})
        return "paused"

    await _update_record(file_id, {"status": "uploading", "progress": 32, "stage": "Uploading"})
    log.info("[Drive Sync] Uploading %s to the existing media pipeline", filename)
    try:
        media, duplicate = await pipeline.ingest(
            contents,
            filename,
            mime,
            "google_drive",
            SYNC_ACTOR,
            drive_file_id=file_id,
            folder="filtered images",
            integration_metadata={
                "folder_id": folder_id,
                "parent_folder_id": parent_folder_id,
                "web_view_link": file.get("webViewLink", ""),
            },
        )
        if duplicate:
            await _update_record(file_id, {
                "status": "skipped_duplicate", "progress": 100, "stage": "Skipped Duplicate",
                "media_id": media["id"], "duplicate": True,
                "error": "", "error_message": "", "completed_at": now_iso(),
                "processing_time": _duration_seconds(started_at, now_iso()),
            })
            await _notify_safely("drive_duplicate_skipped", "Duplicate skipped", f"{filename} was already imported.", f"/library?media={media['id']}")
            log.info("[Drive Sync] Duplicate Skipped: %s", filename)
            return "duplicates"
        await _update_record(file_id, {"status": "processing", "progress": 46, "stage": "Analyzing", "media_id": media["id"], "error": "", "error_message": ""})
        media_fields = {
            "drive_sync_record_id": record["id"],
            "google_drive_parent_folder_id": parent_folder_id,
        }
        await db.media.update_one({"id": media["id"]}, {"$set": media_fields})
        log.info("[Drive Sync] Import queued for processing: %s as media %s", filename, media["id"])
        return "imported"
    except Exception as exc:
        message = _drive_error_message(exc)
        failed_at = now_iso()
        await _update_record(file_id, {"status": "failed", "progress": 100, "stage": "Failed", "error": message, "error_message": message, "failed_at": failed_at, "completed_at": failed_at, "processing_time": _duration_seconds(started_at, failed_at)})
        await _notify_safely("drive_import_failed", "Import failed", f"{filename}: {message}")
        log.exception("[Drive Sync] Import Failed: %s", filename)
        return "failed"


async def _sync_folder(company_id: str, parent_folder_id: str, *, retry_failed: bool = False) -> dict:
    settings = await get_company_settings(company_id)
    token_present = bool(settings.get("gdrive_refresh_token"))
    if not token_present:
        return {"ok": False, "connected": False, "message": "Google Drive is not connected"}
    if settings.get("gdrive_connection_error"):
        return {"ok": False, "connected": False, "message": settings["gdrive_connection_error"]}
    if settings.get("gdrive_sync_paused"):
        return {"ok": True, "connected": True, "paused": True, "message": "Google Drive sync is paused"}
    started_at = now_iso()
    start_clock = time.monotonic()
    files_found = 0
    await update_settings({"gdrive_sync_state": "running", "gdrive_sync_error": ""}, company_id)
    log.info("[Drive Sync] Checking filtered images folder for company %s", company_id)
    results = {"imported": 0, "duplicates": 0, "skipped": 0, "failed": 0, "pending": 0, "ignored": 0}
    try:
        discovered = await drive.discover_instagram_folders(parent_folder_id, company_id)
        folder_id = discovered["filtered_folder_id"]
        folder = {"id": folder_id, "name": "filtered images"}
        files = await drive.list_folder_files(folder_id, company_id)
        files_found = len(files)
        # Reconcile prior pipeline jobs first, including jobs that failed after ingestion.
        for file in files:
            if (await get_company_settings(company_id)).get("gdrive_sync_paused"):
                results["paused"] = True
                break
            if Path(file.get("name", "")).suffix.lower().lstrip(".") not in SUPPORTED_EXTENSIONS:
                results["ignored"] += 1
                continue
            record = await _upsert_record(file, folder_id, parent_folder_id)
            media = await _find_media(file["id"])
            if media:
                await db.media.update_one({"id": media["id"]}, {"$set": {
                    "google_drive_parent_folder_id": parent_folder_id,
                    "google_drive_folder_id": folder_id,
                }})
                state = await _finish_from_media(
                    record,
                    media,
                    retry_failed=retry_failed and record.get("status") == "failed",
                )
                results["pending" if state in {"processing", "pending"} else state if state == "failed" else "skipped"] += 1
                if state != "pending":
                    continue
            elif record.get("status") in {"completed", "skipped_duplicate", "cancelled"}:
                results["skipped"] += 1
                continue
            elif record.get("status") == "failed" and not retry_failed:
                results["failed"] += 1
                continue
            else:
                result = await _import_file(company_id, file, folder_id, parent_folder_id, retry_failed=retry_failed)
                if result in results and result != "paused":
                    results[result] += 1
        failed_record = await db.drive_sync_records.find_one({"status": "failed", "drive_folder_id": folder_id}, NO_ID)
        sync_error = (failed_record or {}).get("error", "")
        latest_settings = await get_company_settings(company_id)
        sync_error = "" if latest_settings.get("gdrive_sync_paused") else sync_error
        await update_settings({
            "gdrive_last_sync": now_iso(),
            "gdrive_sync_state": "paused" if latest_settings.get("gdrive_sync_paused") else "error" if sync_error else "idle",
            "gdrive_sync_error": sync_error,
            "gdrive_connection_error": "",
        }, company_id)
        await _save_sync_history(company_id, started_at, start_clock, files_found, results, sync_error, discovered["parent_folder_name"])
        log.info("[Drive Sync] Cycle complete for company %s: %s", company_id, results)
        return {"ok": not bool(sync_error), "connected": True, "message": sync_error or "Sync completed", "folder": folder, "files_found": files_found, **results}
    except drive.GoogleDriveAuthError as exc:
        message = str(exc)
        await update_settings({
            "gdrive_last_sync": now_iso(),
            "gdrive_sync_state": "disconnected",
            "gdrive_sync_error": message,
            "gdrive_connection_error": message,
        }, company_id)
        await _save_sync_history(company_id, started_at, start_clock, files_found, results, message)
        await _notify_safely("drive_disconnected", "Google Drive disconnected", message, "/settings?tab=automation")
        log.warning("[Drive Sync] Google Drive authorization expired for company %s", company_id)
        return {"ok": False, "connected": False, "message": message, "files_found": files_found, **results}
    except Exception as exc:
        message = _drive_error_message(exc)
        await update_settings({
            "gdrive_last_sync": now_iso(),
            "gdrive_sync_state": "error",
            "gdrive_sync_error": message,
        }, company_id)
        await _save_sync_history(company_id, started_at, start_clock, files_found, results, message)
        if "folder" in message.lower():
            await _notify_safely("drive_folder_error", "Google Drive folder needs attention", message, "/settings?tab=automation")
        log.exception("[Drive Sync] Sync cycle failed for company %s", company_id)
        return {"ok": False, "connected": True, "message": message, "files_found": files_found, **results}


async def _sync_company(company_id: str, *, retry_failed: bool = False) -> dict:
    settings = await get_company_settings(company_id)
    parent_folder_id = settings.get("gdrive_selected_folder_id")
    if not parent_folder_id:
        return {"ok": False, "connected": True, "message": "Select an Instagram Folder"}
    return await _sync_folder(company_id, parent_folder_id, retry_failed=retry_failed)


async def sync_company(company_id: str, *, retry_failed: bool = False) -> dict:
    """Run one serialized sync for a tenant without leaking its context to other jobs."""
    async with _lock_for(company_id):
        prior_company, prior_actor = get_company_id(), get_actor_id()
        set_company_id(company_id)
        set_actor_id("google-drive-sync")
        try:
            return await _sync_company(company_id, retry_failed=retry_failed)
        finally:
            set_company_id(prior_company)
            set_actor_id(prior_actor)


async def sync_now(company_id: str) -> dict:
    return await sync_company(company_id, retry_failed=True)


async def request_sync(company_id: str) -> dict:
    """Queue a manual sync and return immediately instead of holding an API request open."""
    settings = await get_company_settings(company_id)
    if not settings.get("gdrive_refresh_token") or settings.get("gdrive_connection_error"):
        return {"ok": False, "message": settings.get("gdrive_connection_error") or "Google Drive is not connected"}
    if not settings.get("gdrive_selected_folder_id"):
        return {"ok": False, "message": "Select an Instagram Folder before syncing"}
    existing = _manual_tasks.get(company_id)
    if existing and not existing.done():
        return {"ok": True, "queued": True, "message": "A manual Google Drive sync is already queued or running"}
    task = asyncio.create_task(sync_company(company_id, retry_failed=True))
    _manual_tasks[company_id] = task

    def _clear(done: asyncio.Task) -> None:
        if _manual_tasks.get(company_id) is done:
            _manual_tasks.pop(company_id, None)
        if not done.cancelled() and done.exception():
            log.error("[Drive Sync] Manual sync task failed for company %s: %s", company_id, done.exception())

    task.add_done_callback(_clear)
    return {"ok": True, "queued": True, "message": "Google Drive sync started"}


async def request_import_now(company_id: str, *, retry_failed: bool = False) -> dict:
    settings = await get_company_settings(company_id)
    if not settings.get("gdrive_refresh_token") or settings.get("gdrive_connection_error"):
        return {"ok": False, "message": settings.get("gdrive_connection_error") or "Google Drive is not connected"}
    if not settings.get("gdrive_selected_folder_id"):
        return {"ok": False, "message": "Select an Instagram Folder before importing"}
    if settings.get("gdrive_sync_paused"):
        return {"ok": False, "message": "Resume Google Drive sync before importing"}
    existing = _manual_tasks.get(company_id)
    if existing and not existing.done():
        return {"ok": True, "queued": True, "message": "A sync is already queued or running"}
    task = asyncio.create_task(sync_company(company_id, retry_failed=retry_failed))
    _manual_tasks[company_id] = task
    task.add_done_callback(lambda done: _clear_manual_task(company_id, done))
    return {"ok": True, "queued": True, "message": "Google Drive import started"}


def _clear_manual_task(company_id: str, done: asyncio.Task) -> None:
    if _manual_tasks.get(company_id) is done:
        _manual_tasks.pop(company_id, None)
    if not done.cancelled() and done.exception():
        log.error("[Drive Sync] Manual sync task failed for company %s: %s", company_id, done.exception())


async def _retry_one(company_id: str, record_id: str) -> None:
    async with _lock_for(company_id):
        previous_company, previous_actor = get_company_id(), get_actor_id()
        set_company_id(company_id)
        set_actor_id("google-drive-sync")
        try:
            settings = await get_company_settings(company_id)
            if settings.get("gdrive_sync_paused"):
                raise ValueError("Resume Google Drive sync before retrying imports")
            record = await db.drive_sync_records.find_one({"id": record_id}, NO_ID)
            if not record:
                raise ValueError("Import record not found")
            if record.get("status") not in {"failed", "waiting", "pending", "cancelled"}:
                raise ValueError("Only failed, waiting, or cancelled imports can be retried")
            parent_folder_id = settings.get("gdrive_selected_folder_id")
            if not parent_folder_id:
                raise ValueError("Select an Instagram Folder before retrying imports")
            if record.get("parent_folder_id") and record["parent_folder_id"] != parent_folder_id:
                raise ValueError("This import is not in the currently selected Instagram folder")
            folders = await drive.discover_instagram_folders(parent_folder_id, company_id)
            folder_id = folders["filtered_folder_id"]
            file = await drive.get_file_info(record["drive_file_id"], company_id)
            if file.get("trashed") or folder_id not in (file.get("parents") or []):
                raise ValueError("This Drive file is no longer directly inside the selected filtered images folder")
            if Path(file.get("name", "")).suffix.lower().lstrip(".") not in SUPPORTED_EXTENSIONS:
                raise ValueError("This file type is not supported for import")
            retry_count = int(record.get("retry_count", 0)) + 1
            started_at = now_iso()
            await _update_record(record["drive_file_id"], {
                "status": "waiting", "stage": "Waiting", "progress": 0,
                "retry_count": retry_count, "started_at": started_at,
                "completed_at": None, "processing_time": None,
                "error": "", "error_message": "", "cancel_requested": False,
            })
            await _notify_safely("drive_import_retry", "Import retry started", f"Retrying {record.get('filename', 'Drive image')}.")
            log.info("[Drive Sync] Retry requested for %s", record.get("filename"))
            media = await _find_media(record["drive_file_id"])
            updated = await db.drive_sync_records.find_one({"id": record_id}, NO_ID)
            if media and media.get("status") == "failed":
                await _finish_from_media(updated, media, retry_failed=True)
                return
            await _import_file(company_id, file, folder_id, parent_folder_id, retry_failed=True)
        except Exception as exc:
            message = _drive_error_message(exc)
            if isinstance(exc, drive.GoogleDriveAuthError):
                await update_settings({
                    "gdrive_sync_state": "disconnected",
                    "gdrive_sync_error": message,
                    "gdrive_connection_error": message,
                }, company_id)
            record = await db.drive_sync_records.find_one({"id": record_id}, NO_ID)
            if record:
                failed_at = now_iso()
                await _update_record(record["drive_file_id"], {
                    "status": "failed", "stage": "Failed", "progress": 100,
                    "error": message, "error_message": message, "failed_at": failed_at,
                    "completed_at": failed_at,
                })
            await _notify_safely("drive_import_failed", "Import failed", message)
            if isinstance(exc, drive.GoogleDriveAuthError):
                await _notify_safely("drive_disconnected", "Google Drive disconnected", message, "/settings?tab=automation")
            log.exception("[Drive Sync] Retry failed for import %s", record_id)
        finally:
            set_company_id(previous_company)
            set_actor_id(previous_actor)


async def request_retry_import(company_id: str, record_id: str) -> dict:
    task = _retry_tasks.get(record_id)
    if task and not task.done():
        return {"ok": True, "message": "This import is already queued for retry"}
    task = asyncio.create_task(_retry_one(company_id, record_id))
    _retry_tasks[record_id] = task

    def clear(done: asyncio.Task) -> None:
        if _retry_tasks.get(record_id) is done:
            _retry_tasks.pop(record_id, None)

    task.add_done_callback(clear)
    return {"ok": True, "message": "Import retry queued"}


async def cancel_import(company_id: str, record_id: str) -> dict:
    previous_company = get_company_id()
    set_company_id(company_id)
    try:
        record = await db.drive_sync_records.find_one({"id": record_id}, NO_ID)
        if not record:
            raise ValueError("Import record not found")
        if record.get("status") in {"waiting", "pending"}:
            await _update_record(record["drive_file_id"], {"status": "cancelled", "stage": "Cancelled", "progress": 100, "completed_at": now_iso()})
            return {"ok": True, "status": "cancelled"}
        if record.get("status") == "downloading":
            await _update_record(record["drive_file_id"], {"cancel_requested": True})
            return {"ok": True, "status": "cancelling"}
        raise ValueError("This import can no longer be cancelled because processing has started")
    finally:
        set_company_id(previous_company)


async def remove_completed(company_id: str) -> dict:
    previous_company = get_company_id()
    set_company_id(company_id)
    try:
        result = await db.drive_sync_records.delete_many({"status": "completed"})
        return {"ok": True, "removed": result.deleted_count}
    finally:
        set_company_id(previous_company)


async def set_sync_paused(company_id: str, paused: bool) -> dict:
    await update_settings({
        "gdrive_sync_paused": paused,
        "gdrive_sync_state": "paused" if paused else "idle",
    }, company_id)
    return {"ok": True, "paused": paused}


async def get_status(company_id: str) -> dict:
    prior_company = get_company_id()
    set_company_id(company_id)
    try:
        settings = await get_company_settings(company_id)
        folder_id = settings.get("gdrive_selected_folder_id")
        record_filter = {"parent_folder_id": folder_id} if folder_id else {"parent_folder_id": {"$in": []}}
        imported = await db.drive_sync_records.count_documents({
            **record_filter, "status": {"$in": ["completed", "skipped_duplicate"]},
        })
        pending = await db.drive_sync_records.count_documents({**record_filter, "status": {"$in": ["waiting", "pending", "downloading", "uploading", "processing"]}})
        errors = await db.drive_sync_records.count_documents({**record_filter, "status": "failed"})
        ist = ZoneInfo("Asia/Kolkata")
        today = datetime.now(ist).date()
        today_start = datetime.combine(today, datetime_time.min, tzinfo=ist).astimezone(timezone.utc).isoformat()
        imported_today = await db.drive_sync_records.count_documents({
            **record_filter, "status": {"$in": ["completed", "skipped_duplicate"]},
            "completed_at": {"$gte": today_start},
        })
        failed_today = await db.drive_sync_records.count_documents({
            **record_filter, "status": "failed", "failed_at": {"$gte": today_start},
        })
        connected = bool(settings.get("gdrive_refresh_token")) and not bool(settings.get("gdrive_connection_error"))
        interval = GOOGLE_DRIVE_SYNC_INTERVAL_SECONDS
        last_sync = settings.get("gdrive_last_sync")
        next_sync = None
        if last_sync and connected and folder_id and not settings.get("gdrive_sync_paused"):
            try:
                next_sync = (datetime.fromisoformat(last_sync) + timedelta(seconds=interval)).isoformat()
            except ValueError:
                next_sync = None
        recent_syncs = await db.drive_sync_history.find({}, NO_ID).sort("started_at", -1).to_list(10)
        return {
            "connected": connected,
            "last_sync": last_sync,
            "next_sync": next_sync,
            "folder_id": folder_id or "",
            "folder_name": settings.get("gdrive_selected_folder_name", ""),
            "total_imported": imported,
            "imported_today": imported_today,
            "failed_today": failed_today,
            "pending": pending,
            "current_queue_size": pending,
            "errors": errors,
            "sync_state": settings.get("gdrive_sync_state", "idle"),
            "sync_error": settings.get("gdrive_sync_error", ""),
            "connection_error": settings.get("gdrive_connection_error", ""),
            "paused": bool(settings.get("gdrive_sync_paused")),
            "auto_sync": not bool(settings.get("gdrive_sync_paused")),
            "watcher_status": "disconnected" if not connected else "paused" if settings.get("gdrive_sync_paused") else "running" if folder_id else "needs_folder",
            "sync_interval_seconds": interval,
            "recent_syncs": recent_syncs,
        }
    finally:
        set_company_id(prior_company)


def _status_label(status: str) -> str:
    return {
        "pending": "Waiting", "waiting": "Waiting", "downloading": "Downloading",
        "uploading": "Uploading", "processing": "Processing", "completed": "Completed",
        "failed": "Failed", "skipped_duplicate": "Skipped Duplicate", "cancelled": "Cancelled",
    }.get(status, status.replace("_", " ").title())


async def _present_import(record: dict, media: dict | None, posts: list[dict]) -> dict:
    status = record.get("status", "waiting")
    progress = int(record.get("progress", 0) or 0)
    stage = record.get("stage") or _status_label(status)
    if media:
        if media.get("status") in {"ready", "skipped"} and status not in {"skipped_duplicate", "cancelled"}:
            status, progress, stage = "completed", 100, "Completed"
        elif media.get("status") == "failed":
            status, progress, stage = "failed", 100, "Failed"
        elif media.get("status") in {"queued", "processing"}:
            if media.get("scene_analysis"):
                progress, stage = 63, "Enhancing"
            else:
                progress, stage = 46, "Analyzing"
    analysis = (media or {}).get("analysis") or {}
    post_caption = next((post.get("caption") for post in posts if post.get("caption")), "")
    caption = analysis.get("caption") or post_caption
    approval = posts[0].get("status") if posts else ("Waiting" if media and media.get("status") in {"ready", "skipped"} else "—")
    ai_status = "Failed" if status == "failed" else "Completed" if analysis else "Processing" if status in {"processing", "uploading"} else "Waiting"
    cloudinary_status = "Failed" if status == "failed" and not (media or {}).get("urls", {}).get("original") else "Uploaded" if (media or {}).get("urls", {}).get("original") else "Uploading" if status == "uploading" else "Waiting"
    caption_status = "Failed" if status == "failed" and not caption else "Generated" if caption else "Waiting"
    started_at = record.get("started_at")
    processing_time = record.get("processing_time")
    if processing_time is None and started_at and status not in {"completed", "failed", "skipped_duplicate", "cancelled"}:
        processing_time = _duration_seconds(started_at)
    return {
        **record,
        "status": status,
        "status_label": _status_label(status),
        "progress": progress,
        "stage": stage,
        "processing_status": _status_label(status),
        "ai_status": ai_status,
        "cloudinary_status": cloudinary_status,
        "caption_status": caption_status,
        "approval_status": approval,
        "project_name": record.get("project_name") or (media or {}).get("project_name", "—"),
        "source_folder": record.get("source_folder") or record.get("approved_folder", "filtered images"),
        "thumbnail_url": ((media or {}).get("urls") or {}).get("square") or ((media or {}).get("urls") or {}).get("thumbnail") or ((media or {}).get("urls") or {}).get("original"),
        "media_id": (media or {}).get("id") or record.get("media_id"),
        "processing_time": processing_time,
        "error_message": record.get("error_message") or record.get("error", ""),
    }


async def list_imports(company_id: str, *, status: str = "", limit: int = 50, skip: int = 0) -> dict:
    previous_company = get_company_id()
    set_company_id(company_id)
    try:
        query = {"status": status} if status else {}
        total = await db.drive_sync_records.count_documents(query)
        records = await db.drive_sync_records.find(query, NO_ID).sort("created_at", -1).skip(skip).to_list(limit)
        media_ids = [record.get("media_id") for record in records if record.get("media_id")]
        media_rows = await db.media.find({"id": {"$in": media_ids}}, NO_ID).to_list(len(media_ids)) if media_ids else []
        media_by_id = {media["id"]: media for media in media_rows}
        posts = await db.posts.find({"media_ids": {"$in": media_ids}}, NO_ID).sort("created_at", -1).to_list(max(20, len(media_ids) * 5)) if media_ids else []
        posts_by_media: dict[str, list[dict]] = {}
        for post in posts:
            for media_id in post.get("media_ids", []):
                posts_by_media.setdefault(media_id, []).append(post)
        items = [await _present_import(record, media_by_id.get(record.get("media_id")), posts_by_media.get(record.get("media_id"), [])) for record in records]
        return {"items": items, "total": total, "limit": limit, "skip": skip}
    finally:
        set_company_id(previous_company)


async def get_import(company_id: str, record_id: str) -> dict | None:
    previous_company = get_company_id()
    set_company_id(company_id)
    try:
        record = await db.drive_sync_records.find_one({"id": record_id}, NO_ID)
        if not record:
            return None
        media = await db.media.find_one({"id": record.get("media_id")}, NO_ID) if record.get("media_id") else None
        posts = await db.posts.find({"media_ids": record.get("media_id")}, NO_ID).sort("created_at", -1).to_list(20) if record.get("media_id") else []
        return await _present_import(record, media, posts)
    finally:
        set_company_id(previous_company)


async def run_sync_service() -> None:
    """Long-running polling loop. Each company is isolated and failures never stop the loop."""
    interval = GOOGLE_DRIVE_SYNC_INTERVAL_SECONDS
    log.info("[Drive Sync] Background service started; interval=%ss", interval)
    while True:
        cycle_started = time.monotonic()
        try:
            configured = await db.settings.find({
                "gdrive_refresh_token": {"$nin": [None, ""]},
                "gdrive_connection_error": {"$in": [None, ""]},
                "gdrive_sync_paused": {"$ne": True},
            }, {"company_id": 1}).to_list(1000)
            for entry in configured:
                company_id = entry.get("company_id")
                if company_id:
                    await sync_company(company_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("[Drive Sync] Background poll failed; it will retry next cycle")
        await asyncio.sleep(max(1, interval - (time.monotonic() - cycle_started)))


async def shutdown_sync_service() -> None:
    tasks = list(_manual_tasks.values()) + list(_retry_tasks.values())
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
