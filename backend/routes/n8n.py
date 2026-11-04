"""REST API for n8n. n8n only orchestrates; all logic lives here. Auth: header X-API-Key."""
import json
import hashlib
from pathlib import Path
import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from core.db import db, NO_ID, clean
from core.config import PUBLIC_BASE_URL
from core.tenant_context import set_actor_id, set_company_id
from core.tenancy import DEFAULT_COMPANY_ID
from services import pipeline, storage_service as st, google_drive_service as drive
from services.settings_service import get_company_settings
from services.publishing_service import publish_post, PublishError, caption_text
from services.notification_service import notify

router = APIRouter(prefix="/n8n", tags=["n8n"])
TEMPLATE = Path(__file__).resolve().parent.parent / "n8n" / "interior_social_ai_workflow.json"


async def n8n_auth(x_api_key: str = Header(default="")):
    if x_api_key:
        key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()
        key = await db.api_keys.find_one(
            {"key_hash": key_hash, "revoked_at": None},
            NO_ID,
        )
        if key and "n8n" in key.get("scopes", []):
            set_company_id(key["company_id"])
            set_actor_id(f"api:{key['id']}")
            await db.api_keys.update_one(
                {"id": key["id"], "company_id": key["company_id"]},
                {"$set": {"last_used_at": __import__("core.db", fromlist=["now_iso"]).now_iso()}},
            )
            return await get_company_settings(key["company_id"])
    s = await get_company_settings(DEFAULT_COMPANY_ID)
    if not x_api_key or x_api_key != s["n8n_api_key"]:
        raise HTTPException(401, "Invalid X-API-Key")
    set_company_id(DEFAULT_COMPANY_ID)
    set_actor_id("n8n:legacy")
    return s


class CheckIn(BaseModel):
    drive_file_ids: list[str]


class IngestUrlIn(BaseModel):
    file_url: str
    filename: str
    mime_type: str = ""
    drive_file_id: str | None = None
    folder: str | None = None
    project_name: str | None = None


class PublishedIn(BaseModel):
    instagram_media_id: str
    permalink: str | None = None


class NotifyIn(BaseModel):
    type: str = "processing_completed"
    title: str
    message: str


@router.get("/health")
async def health(_=Depends(n8n_auth)):
    return {"ok": True}


@router.get("/config")
async def config(s=Depends(n8n_auth)):
    parent_folder_id = s.get("gdrive_selected_folder_id")
    if not parent_folder_id:
        raise HTTPException(409, "Select an Instagram Folder before configuring n8n")
    try:
        folders = await drive.discover_instagram_folders(parent_folder_id, s.get("company_id"))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return {
        "images_folder_id": folders["filtered_folder_id"],
        "videos_folder_id": "",
        "ingest_url": f"{PUBLIC_BASE_URL}/api/n8n/ingest",
        "check_url": f"{PUBLIC_BASE_URL}/api/n8n/check-duplicates",
    }


async def _validate_drive_import(file_id: str, settings: dict) -> None:
    parent_folder_id = settings.get("gdrive_selected_folder_id")
    if not parent_folder_id:
        raise HTTPException(409, "Select an Instagram Folder before importing Drive files")
    try:
        folders = await drive.discover_instagram_folders(parent_folder_id, settings.get("company_id"))
        file = await drive.get_file_info(file_id, settings.get("company_id"))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    if file.get("trashed") or folders["filtered_folder_id"] not in (file.get("parents") or []):
        raise HTTPException(403, "Google Drive imports are allowed only from the filtered images folder")


@router.post("/check-duplicates")
async def check(body: CheckIn, _=Depends(n8n_auth)):
    seen = await db.media.find({"drive_file_id": {"$in": body.drive_file_ids}}, {"drive_file_id": 1}).to_list(5000)
    seen_ids = {m["drive_file_id"] for m in seen}
    return {"new": [i for i in body.drive_file_ids if i not in seen_ids], "already_processed": sorted(seen_ids)}


@router.post("/ingest")
async def ingest(file: UploadFile = File(...), drive_file_id: str = Form(""), folder: str = Form(""), project_name: str = Form(""),
                 settings=Depends(n8n_auth)):
    if drive_file_id:
        await _validate_drive_import(drive_file_id, settings)
    data = await file.read()
    try:
        doc, dup = await pipeline.ingest(data, file.filename, file.content_type, "drive", None, drive_file_id or None,
                                         folder or None, project_name or None)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except st.StorageNotConfiguredError as e:
        raise HTTPException(503, str(e)) from e
    except st.StorageError as e:
        raise HTTPException(502, str(e)) from e
    return {"media_id": doc["id"], "duplicate": dup, "status": doc["status"]}


@router.post("/ingest-url")
async def ingest_url(body: IngestUrlIn, settings=Depends(n8n_auth)):
    if body.drive_file_id:
        await _validate_drive_import(body.drive_file_id, settings)
    async with httpx.AsyncClient(timeout=180, follow_redirects=True) as c:
        r = await c.get(body.file_url)
    if r.status_code >= 400:
        raise HTTPException(400, f"Could not download file_url ({r.status_code})")
    try:
        doc, dup = await pipeline.ingest(r.content, body.filename, body.mime_type or r.headers.get("content-type", ""), "drive", None,
                                         body.drive_file_id, body.folder, body.project_name)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except st.StorageNotConfiguredError as e:
        raise HTTPException(503, str(e)) from e
    except st.StorageError as e:
        raise HTTPException(502, str(e)) from e
    return {"media_id": doc["id"], "duplicate": dup, "status": doc["status"]}


@router.get("/media/{media_id}")
async def media_status(media_id: str, _=Depends(n8n_auth)):
    m = await db.media.find_one({"id": media_id}, {**NO_ID, "id": 1, "status": 1, "analysis": 1, "urls": 1, "error": 1})
    if not m:
        raise HTTPException(404, "Not found")
    return clean(m)


def _payload(p: dict, media: list[dict]) -> dict:
    return {"id": p["id"], "type": p["type"], "title": p["title"], "caption": caption_text(p), "scheduled_at": p.get("scheduled_at"),
            "reel_video_url": p.get("reel_video_url"),
            "media": [{"kind": m["kind"], "feed_url": m["urls"].get("portrait"), "story_url": m["urls"].get("story"),
                       "video_url": m["urls"].get("video")} for m in media]}


async def _with_media(posts: list[dict]) -> list[dict]:
    out = []
    for p in posts:
        media = await db.media.find({"id": {"$in": p["media_ids"]}}, NO_ID).to_list(20)
        by_id = {m["id"]: m for m in media}
        out.append(_payload(p, [by_id[i] for i in p["media_ids"] if i in by_id]))
    return out


@router.get("/posts/approved")
async def approved(_=Depends(n8n_auth)):
    return await _with_media(await db.posts.find({"status": "approved"}, NO_ID).to_list(100))


@router.get("/posts/due")
async def due(_=Depends(n8n_auth)):
    from core.db import now_iso
    return await _with_media(await db.posts.find({"status": "scheduled", "scheduled_at": {"$lte": now_iso()}}, NO_ID).to_list(100))


@router.post("/posts/{post_id}/publish")
async def publish(post_id: str, _=Depends(n8n_auth)):
    try:
        p = await publish_post(post_id)
    except PublishError as e:
        raise HTTPException(400, str(e))
    return {"id": p["id"], "status": p["status"], "error": p.get("error"), "permalink": p.get("permalink")}


@router.post("/posts/{post_id}/published")
async def mark_published(post_id: str, body: PublishedIn, _=Depends(n8n_auth)):
    from core.db import now_iso
    p = await db.posts.find_one({"id": post_id})
    if not p:
        raise HTTPException(404, "Not found")
    await db.posts.update_one({"id": post_id}, {"$set": {"status": "published", "published_at": now_iso(),
                                                         "instagram_media_id": body.instagram_media_id, "permalink": body.permalink}})
    await db.media.update_many({"id": {"$in": p["media_ids"]}}, {"$set": {"status": "published"}})
    await notify("publish_success", "Published via n8n", f"\"{p['title']}\" is live.", f"/approvals/{post_id}")
    return {"ok": True}


@router.post("/notify")
async def n8n_notify(body: NotifyIn, _=Depends(n8n_auth)):
    await notify(body.type, body.title, body.message)
    return {"ok": True}


@router.get("/workflow-template")
async def template(s=Depends(n8n_auth)):
    return json.loads(TEMPLATE.read_text().replace("{{BASE_URL}}", PUBLIC_BASE_URL))
