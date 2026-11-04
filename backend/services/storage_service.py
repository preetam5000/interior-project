"""Cloudinary-backed storage for originals and generated media."""
import asyncio
import logging
import re
import tempfile
from pathlib import Path

import cloudinary
import cloudinary.api
import cloudinary.uploader
import requests

from core.db import db, now_iso
from services.cloudinary_service import _configure
from services.settings_service import cloudinary_ready, get_settings

log = logging.getLogger("storage")
APP_PREFIX = "interior-social-ai/media"
WORK_DIR = Path(tempfile.gettempdir()) / "interior-social-work"
WORK_DIR.mkdir(exist_ok=True)
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif", "avif", "heic"}
VIDEO_EXTENSIONS = {"mp4", "mov", "m4v", "webm", "avi", "mkv"}


class StorageError(RuntimeError):
    pass


class StorageNotConfiguredError(StorageError):
    pass


def _validate_name(name: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", name) or name in {".", ".."}:
        raise ValueError("Invalid storage file name")
    return name


def _resource_type(name: str, content_type: str) -> str:
    extension = Path(name).suffix.lower().lstrip(".")
    if content_type.startswith("image/") or extension in IMAGE_EXTENSIONS:
        return "image"
    if content_type.startswith("video/") or extension in VIDEO_EXTENSIONS:
        return "video"
    return "raw"


def _public_id(name: str) -> str:
    path = Path(name)
    extension = path.suffix.lower().lstrip(".")
    return f"{path.stem}_{extension}" if extension else path.stem


def _upload(path: Path, name: str, content_type: str, settings: dict) -> dict:
    if not cloudinary_ready(settings):
        raise StorageNotConfiguredError(
            "Configure and save Cloudinary cloud name, API key, and API secret in Settings before uploading media."
        )

    resource_type = _resource_type(name, content_type)
    _configure(settings)
    options = {
        "public_id": _public_id(name),
        "folder": APP_PREFIX,
        "resource_type": resource_type,
        "overwrite": True,
        "unique_filename": False,
    }
    uploader = cloudinary.uploader.upload_large if path.stat().st_size >= 90 * 1024 * 1024 else cloudinary.uploader.upload
    try:
        result = uploader(str(path), **options)
    except Exception as exc:
        log.warning("Cloudinary upload failed for %s: %s", name, exc)
        raise StorageError("Cloudinary could not store this file. Check the credentials, account limits, and file type.") from exc

    upload_metadata = {
        "public_id": result.get("public_id"),
        "secure_url": result.get("secure_url"),
        "format": result.get("format"),
        "version": result.get("version"),
        "resource_type": result.get("resource_type"),
    }
    log.info("Cloudinary upload response for %s: %s", name, upload_metadata)
    if not all(upload_metadata.get(field) is not None for field in ("public_id", "secure_url", "format", "version")):
        raise StorageError(f"Cloudinary upload returned incomplete asset metadata for {name}.")
    if upload_metadata["resource_type"] != resource_type:
        raise StorageError(
            f"Cloudinary uploaded {name} as {upload_metadata['resource_type']!r}, expected {resource_type!r}."
        )

    try:
        asset = cloudinary.api.resource(
            upload_metadata["public_id"],
            resource_type=resource_type,
            type="upload",
        )
    except Exception as exc:
        log.warning(
            "Cloudinary could not verify uploaded asset for %s (public_id=%r, version=%r, format=%r): %s",
            name,
            upload_metadata["public_id"],
            upload_metadata["version"],
            upload_metadata["format"],
            exc,
        )
        raise StorageError(f"Cloudinary upload for {name} could not be verified; no storage reference was saved.") from exc

    verified_metadata = {
        "public_id": asset.get("public_id"),
        "secure_url": asset.get("secure_url"),
        "format": asset.get("format"),
        "version": asset.get("version"),
        "resource_type": asset.get("resource_type"),
    }
    if verified_metadata != upload_metadata:
        log.error(
            "Cloudinary upload/asset metadata mismatch for %s: upload=%s verified=%s",
            name,
            upload_metadata,
            verified_metadata,
        )
        raise StorageError(f"Cloudinary asset metadata did not match the upload response for {name}; no storage reference was saved.")

    return {
        "public_id": upload_metadata["public_id"],
        "url": upload_metadata["secure_url"],
        "resource_type": resource_type,
        "format": upload_metadata["format"],
        "version": upload_metadata["version"],
        "size": result.get("bytes", path.stat().st_size),
    }


def _download(url: str) -> tuple[bytes, str]:
    try:
        response = requests.get(url, timeout=(10, 120))
        response.raise_for_status()
        return response.content, response.headers.get("Content-Type", "application/octet-stream")
    except requests.RequestException as exc:
        log.warning("Cloudinary download failed: %s", exc)
        raise StorageError("Cloudinary could not retrieve this file. Check the Cloudinary asset and network connection.") from exc


def work_path(name: str) -> Path:
    return WORK_DIR / _validate_name(name)


async def _store(name: str, path: Path, content_type: str) -> str:
    settings = await get_settings()
    result = await asyncio.to_thread(_upload, path, name, content_type, settings)
    log.info(
        "Saving verified Cloudinary reference for %s: public_id=%r url=%r format=%r version=%r",
        name,
        result["public_id"],
        result["url"],
        result["format"],
        result["version"],
    )
    await db.files.update_one(
        {"name": name},
        {"$set": {
            "name": name,
            "provider": "cloudinary",
            "storage_path": result["public_id"],
            "url": result["url"],
            "resource_type": result["resource_type"],
            "format": result["format"],
            "version": result["version"],
            "content_type": content_type,
            "size": result["size"],
            "is_deleted": False,
            "created_at": now_iso(),
        }},
        upsert=True,
    )
    return result["url"]


async def put_bytes(name: str, data: bytes, content_type: str) -> str:
    path = work_path(name)
    await asyncio.to_thread(path.write_bytes, data)
    return await _store(name, path, content_type)


async def put_file(name: str, path: Path, content_type: str) -> str:
    return await _store(name, Path(path), content_type)


async def get_bytes(name: str) -> tuple[bytes, str] | None:
    name = _validate_name(name)
    record = await db.files.find_one({"name": name, "is_deleted": False})
    if not record:
        return None
    url = record.get("url")
    if not url:
        raise StorageError("This file is in legacy storage. Re-upload it to store it in Cloudinary.")
    log.info(
        "Fetching Cloudinary object for %s: public_id=%r url=%r resource_type=%r",
        name,
        record.get("storage_path"),
        url,
        record.get("resource_type"),
    )
    data, content_type = await asyncio.to_thread(_download, url)
    return data, record.get("content_type") or content_type


async def fetch_local(name: str) -> Path:
    """Ensure a stored object exists in the processing work dir and return the path."""
    path = work_path(name)
    if not path.exists():
        stored = await get_bytes(name)
        if not stored:
            raise FileNotFoundError(name)
        await asyncio.to_thread(path.write_bytes, stored[0])
    return path


def _destroy_cloudinary_asset(public_id: str, resource_type: str, settings: dict) -> dict:
    _configure(settings)
    return cloudinary.uploader.destroy(
        public_id,
        resource_type=resource_type,
        invalidate=True,
    )


async def delete_media_assets(
    names: list[str],
    cloudinary_public_id: str | None = None,
    media_kind: str = "image",
    cloudinary_enhanced_public_id: str | None = None,
) -> None:
    """Remove local files and every Cloudinary asset known for a media item.

    File metadata is retained if any remote deletion fails, allowing the
    operation to be retried without losing the identifiers needed for cleanup.
    """
    safe_names = list(dict.fromkeys(_validate_name(name) for name in names if name))
    records = await db.files.find({"name": {"$in": safe_names}}, {"_id": 0}).to_list(len(safe_names))
    remote_assets: dict[tuple[str, str], None] = {}

    for record in records:
        public_id = record.get("storage_path")
        if record.get("provider") == "cloudinary" and public_id:
            resource_type = record.get("resource_type") or _resource_type(
                record.get("name", ""),
                record.get("content_type", ""),
            )
            remote_assets[(public_id, resource_type)] = None

    if cloudinary_public_id:
        remote_assets[(cloudinary_public_id, "video" if media_kind == "video" else "image")] = None
    if cloudinary_enhanced_public_id:
        remote_assets[(cloudinary_enhanced_public_id, "image")] = None

    if remote_assets:
        settings = await get_settings()
        if not cloudinary_ready(settings):
            raise StorageNotConfiguredError(
                "Cloudinary credentials are required to delete this media's stored assets."
            )

        failures = []
        for public_id, resource_type in remote_assets:
            try:
                result = await asyncio.to_thread(
                    _destroy_cloudinary_asset,
                    public_id,
                    resource_type,
                    settings,
                )
                status = result.get("result") if isinstance(result, dict) else None
                if status not in {"ok", "not found"}:
                    failures.append(f"{public_id} ({status or 'unknown result'})")
            except Exception:
                log.exception("Cloudinary deletion failed for asset %s", public_id)
                failures.append(public_id)
        if failures:
            raise StorageError(
                f"Could not delete {len(failures)} Cloudinary asset(s); retry the media deletion."
            )

    local_failures = []
    for name in safe_names:
        try:
            await asyncio.to_thread(work_path(name).unlink, missing_ok=True)
        except OSError:
            log.exception("Could not delete local media file %s", name)
            local_failures.append(name)
    if local_failures:
        raise StorageError(
            f"Could not remove {len(local_failures)} local media file(s); retry the media deletion."
        )

    if safe_names:
        await db.files.delete_many({"name": {"$in": safe_names}})
