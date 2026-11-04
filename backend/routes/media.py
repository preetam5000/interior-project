import re
import logging
from typing import Literal
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from core.db import db, now_iso, new_id, NO_ID, clean, write_audit
from core.security import get_current_user, CAN_UPLOAD, CAN_APPROVE, CAN_DELETE_MEDIA
from services import pipeline, storage_service as st, story_music_service
from services.settings_service import get_settings
from services.carousel_service import create_post
from services.notification_service import log_activity

router = APIRouter(tags=["media"])
log = logging.getLogger("media")
MAX_BYTES = 300 * 1024 * 1024


class EditIn(BaseModel):
    brightness: float = 1.0
    contrast: float = 1.0
    saturation: float = 1.0
    sharpness: float = 1.0
    warmth: float = 0.0


class GPTEnhanceIn(BaseModel):
    mode: Literal["professional", "luxury", "bright", "instagram_ready", "custom_prompt"] = "professional"
    custom_prompt: str | None = Field(default=None, max_length=1000)
    preview_only: bool = False


class CreatePostIn(BaseModel):
    type: str = "feed"


class GenerateStoryIn(BaseModel):
    music_mode: str = "no_music"
    music_track_id: str | None = None


@router.get("/files/{name}")
async def serve_file(name: str):
    if not re.fullmatch(r"[A-Za-z0-9_\-.]+", name):
        raise HTTPException(400, "Invalid file name")
    try:
        got = await st.get_bytes(name)
    except st.StorageError as e:
        raise HTTPException(502, str(e)) from e
    if not got:
        raise HTTPException(404, "File not found")
    return Response(content=got[0], media_type=got[1], headers={"Cache-Control": "public, max-age=86400"})


@router.get("/posts/story-music")
async def story_music_library(mood: str = "", genre: str = "", duration: int | None = None,
                              project_stage: str = "", room_type: str = "", q: str = "",
                              favorites: bool = False, recently_used: bool = False,
                              user: dict = Depends(get_current_user)):
    return await story_music_service.list_tracks(
        user, mood=mood, genre=genre, duration=duration,
        project_stage=project_stage, room_type=room_type, q=q,
        favorites=favorites, recently_used=recently_used,
    )


@router.get("/posts/story-music/recommendations/{media_id}")
async def story_music_recommendations(media_id: str, user: dict = Depends(get_current_user)):
    media = await db.media.find_one({"id": media_id}, NO_ID)
    if not media or media.get("kind") != "image":
        raise HTTPException(404, "Image not found")
    file_name = (media.get("files") or {}).get("enhanced") or (media.get("files") or {}).get("opencv")
    if file_name:
        try:
            await st.fetch_local(file_name)
        except (FileNotFoundError, st.StorageError):
            log.warning("Could not load scene image for music color scoring: %s", media_id)
    return await story_music_service.recommend_tracks(media, user)


@router.get("/posts/story-music/{track_id}/preview")
async def story_music_preview(track_id: str):
    track = await story_music_service.get_track(track_id)
    if not track:
        raise HTTPException(404, "Music track not found")
    path = story_music_service.track_path(track)
    return FileResponse(path, media_type="audio/mpeg", filename=track["filename"],
                        headers={"Cache-Control": "public, max-age=86400"})


@router.get("/posts/story-music/{track_id}/cover")
async def story_music_cover(track_id: str):
    track = await story_music_service.get_track(track_id)
    if not track:
        raise HTTPException(404, "Music track not found")
    title = re.sub(r"[^A-Za-z0-9 &'-]", "", str(track.get("title") or "Original music"))[:48]
    svg = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 640'>"
           "<defs><linearGradient id='g' x2='1' y2='1'><stop stop-color='#d8c6a2'/><stop offset='1' stop-color='#655642'/></linearGradient></defs>"
           "<rect width='640' height='640' fill='url(#g)'/><circle cx='320' cy='280' r='150' fill='none' stroke='#fff' stroke-opacity='.45' stroke-width='2'/>"
           "<path d='M70 350 Q160 220 250 350 T430 350 T610 350' fill='none' stroke='#fff' stroke-opacity='.65' stroke-width='4'/>"
           f"<text x='320' y='530' text-anchor='middle' fill='white' font-family='sans-serif' font-size='30'>{title}</text></svg>")
    return Response(content=svg, media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})


@router.post("/posts/story-music/{track_id}/favorite")
async def toggle_story_music_favorite(track_id: str, user: dict = Depends(get_current_user)):
    try:
        favorite = await story_music_service.toggle_favorite(track_id, user)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"id": track_id, "favorite": favorite}


@router.post("/media/upload")
async def upload(files: list[UploadFile] = File(...), project_name: str = Form(""), user: dict = Depends(CAN_UPLOAD)):
    results = []
    for f in files:
        data = await f.read()
        if len(data) > MAX_BYTES:
            results.append({"filename": f.filename, "error": "File too large (max 300MB)"})
            continue
        try:
            doc, dup = await pipeline.ingest(data, f.filename, f.content_type, "upload", user, project_name=project_name or None)
            results.append({"filename": f.filename, "media_id": doc["id"], "duplicate": dup, "status": doc["status"]})
        except ValueError as e:
            results.append({"filename": f.filename, "error": str(e)})
        except st.StorageNotConfiguredError as e:
            raise HTTPException(503, str(e)) from e
        except st.StorageError as e:
            raise HTTPException(502, str(e)) from e
    return {"results": results}


@router.get("/media")
async def list_media(status: str = "", kind: str = "", room_type: str = "", style: str = "", stage: str = "", q: str = "",
                     project_id: str = "", drive_project_id: str = "", date_from: str = "", date_to: str = "", sort: str = "newest",
                     limit: int = 200, _: dict = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    if kind:
        query["kind"] = kind
    if room_type:
        query["analysis.room_type"] = room_type
    if style:
        query["analysis.design_style"] = style
    if stage:
        query["analysis.project_stage"] = stage
    if project_id:
        query["project_id"] = project_id
    if drive_project_id:
        query["drive_project_id"] = drive_project_id
    created_at = {}
    if date_from:
        created_at["$gte"] = date_from
    if date_to:
        created_at["$lt"] = date_to
    if created_at:
        query["created_at"] = created_at
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"filename": rx}, {"project_name": rx}, {"analysis.title": rx}, {"analysis.objects": rx}]
    items = await db.media.find(query, NO_ID).sort("created_at", 1 if sort == "oldest" else -1).to_list(min(limit, 500))
    return clean(items)


@router.get("/media/{media_id}")
async def get_media(media_id: str, _: dict = Depends(get_current_user)):
    m = await db.media.find_one({"id": media_id}, NO_ID)
    if not m:
        raise HTTPException(404, "Media not found")
    posts = await db.posts.find({"media_ids": media_id}, {
        **NO_ID, "id": 1, "type": 1, "status": 1, "title": 1, "history": 1,
        "music_mode": 1, "music_track_id": 1, "music_name": 1, "music_selection": 1,
    }).to_list(20)
    history = await db.activity_logs.find({"entity_id": {"$in": [media_id] + [p["id"] for p in posts]}}, NO_ID).sort(
        "created_at", -1).to_list(50)
    return clean({**m, "posts": posts, "history": history})


@router.delete("/media/{media_id}")
async def delete_media(media_id: str, user: dict = Depends(CAN_DELETE_MEDIA)):
    media = await db.media.find_one({"id": media_id}, NO_ID)
    if not media:
        raise HTTPException(404, "Media not found")

    files = media.get("files") or {}
    names = [name for name in files.values() if isinstance(name, str)]
    try:
        await st.delete_media_assets(
            names,
            cloudinary_public_id=media.get("cloudinary_public_id"),
            media_kind=media.get("kind", "image"),
            cloudinary_enhanced_public_id=media.get("cloudinary_enhanced_public_id"),
        )
    except st.StorageError as exc:
        log.exception("Failed to clean up storage for media %s", media_id)
        raise HTTPException(502, str(exc)) from exc

    await db.activity_logs.delete_many({"entity_id": media_id})
    result = await db.media.delete_one({"id": media_id})
    if result.deleted_count != 1:
        log.error("Media record disappeared during deletion: %s", media_id)
        raise HTTPException(404, "Media not found")
    log.info("Deleted media %s and %d associated file(s) by %s", media_id, len(names), user.get("id"))
    return {"ok": True, "deleted_media_id": media_id}


@router.post("/media/{media_id}/reprocess")
async def reprocess(media_id: str, user: dict = Depends(CAN_UPLOAD)):
    if not await db.media.find_one({"id": media_id}):
        raise HTTPException(404, "Media not found")
    await db.media.update_one({"id": media_id}, {"$set": {"status": "queued"}})
    pipeline.schedule(media_id)
    await log_activity("media_reprocess", "Media re-queued for AI processing", user, media_id, "media")
    return {"ok": True}


@router.post("/media/{media_id}/edit")
async def edit_image(media_id: str, body: EditIn, user: dict = Depends(CAN_APPROVE)):
    m = await db.media.find_one({"id": media_id}, NO_ID)
    if not m or m["kind"] != "image":
        raise HTTPException(404, "Image not found")
    s = await get_settings()
    updates = await pipeline.render_image_outputs(
        m,
        s,
        body.model_dump(),
        classification=m.get("analysis"),
        scene_analysis=m.get("scene_analysis"),
    )
    updates["edited_at"] = now_iso()
    await db.media.update_one({"id": media_id}, {"$set": updates})
    await log_activity("image_edited", f"Manual edit applied to {m['filename']}", user, media_id, "media")
    return clean(await db.media.find_one({"id": media_id}, NO_ID))


@router.post("/media/{media_id}/enhance-gpt")
async def enhance_with_gpt(media_id: str, body: GPTEnhanceIn | None = None, user: dict = Depends(CAN_UPLOAD)):
    m = await db.media.find_one({"id": media_id}, NO_ID)
    if not m or m.get("kind") != "image":
        raise HTTPException(404, "Image not found")
    if body and body.mode == "custom_prompt" and not (body.custom_prompt or "").strip():
        raise HTTPException(400, "Enter a custom prompt for this enhancement mode")
    current_status = (m.get("gpt_image_status") or (m.get("processing_report") or {}).get("gpt_image_status"))
    if current_status == "processing":
        raise HTTPException(409, "GPT enhancement is already running")
    claimed = await db.media.update_one(
        {"id": media_id, "gpt_image_status": {"$ne": "processing"}},
        {"$set": {"gpt_image_status": "processing", "gpt_started_at": now_iso()}},
    )
    if claimed.matched_count != 1:
        raise HTTPException(409, "GPT enhancement is already running")
    settings = await get_settings()
    try:
        if body:
            editor_modes = {
                "professional": "architectural",
                "luxury": "luxury",
                "bright": "bright",
                "instagram_ready": "instagram ready",
                "custom_prompt": "architectural",
            }
            files = m.get("files") or {}
            updates = await pipeline.enhance_media_with_gpt(
                m,
                settings,
                editor_mode=editor_modes[body.mode],
                custom_prompt=body.custom_prompt if body.mode == "custom_prompt" else None,
                source_file_name=files.get("enhanced") or files.get("gpt") or files.get("opencv"),
            )
        else:
            updates = await pipeline.enhance_media_with_gpt(m, settings)
    except Exception as exc:
        log.exception("Could not start GPT enhancement for %s", media_id)
        report = dict(m.get("processing_report") or {})
        report.update({"gpt_image_status": "failed_fallback", "gpt_image_error": str(exc)[:500]})
        updates = {"gpt_image_status": "failed_fallback", "gpt_image_error": str(exc)[:500],
                   "processing_report": report, "actual_gpt_cost_usd": None}
        if body and body.preview_only:
            await db.media.update_one(
                {"id": media_id},
                {"$set": updates, "$unset": {"gpt_started_at": ""}},
            )
            raise HTTPException(502, f"GPT image enhancement failed: {str(exc)[:300]}") from exc
    status = updates.get("gpt_image_status", "failed_fallback")
    if body and body.preview_only:
        if status != "completed":
            await db.media.update_one(
                {"id": media_id},
                {"$set": {"gpt_image_status": status, "gpt_image_error": updates.get("gpt_image_error")},
                 "$unset": {"gpt_started_at": ""}},
            )
            raise HTTPException(502, updates.get("gpt_image_error") or "GPT image enhancement failed")
        preview_url = (updates.get("urls") or {}).get("gpt") or (updates.get("urls") or {}).get("enhanced")
        if not preview_url:
            await db.media.update_one(
                {"id": media_id},
                {"$set": {"gpt_image_status": "failed_fallback"},
                 "$unset": {"gpt_started_at": ""}},
            )
            raise HTTPException(502, "GPT image enhancement did not produce a preview")
        await db.media.update_one(
            {"id": media_id},
            {
                "$set": {
                    "pending_ai_edit": {
                        "updates": updates,
                        "preview_url": preview_url,
                        "mode": body.mode,
                        "previous_gpt_image_status": m.get("gpt_image_status"),
                    },
                    "gpt_image_status": "completed",
                    "gpt_image_error": None,
                },
                "$unset": {"gpt_started_at": ""},
            },
        )
        return clean({
            "status": "completed",
            "image_url": preview_url,
            "quality": updates.get("quality"),
            "gpt_processing_time_ms": updates.get("gpt_image_processing_time_ms", 0),
        })

    await db.media.update_one({"id": media_id}, {"$set": updates})
    current = await db.media.find_one({"id": media_id}, NO_ID)
    await _update_learning_record(media_id, current, status)
    await log_activity(
        "gpt_image_enhancement" if status == "completed" else "gpt_image_enhancement_failed",
        "GPT Image enhancement completed" if status == "completed" else "GPT Image failed; retaining OpenCV preview",
        user, media_id, "media",
    )
    return clean({
        "status": status,
        "image_url": (current.get("urls") or {}).get("gpt") or (current.get("urls") or {}).get("opencv"),
        "quality": current.get("quality"),
        "gpt_processing_time_ms": (current.get("processing_report") or {}).get("gpt_image_processing_time_ms", 0),
        "estimated_cost_usd": current.get("estimated_gpt_cost_usd"),
        "actual_cost_usd": current.get("actual_gpt_cost_usd"),
        "request_id": current.get("gpt_request_id"),
        "error": current.get("gpt_image_error"),
        "media": current,
    })


async def _update_learning_record(media_id: str, current: dict, status: str):
    current_report = current.get("processing_report") or {}
    current_profile = current.get("enhancement_profile") or {}
    await db.learning_records.update_one(
        {"media_id": media_id},
        {"$set": {
            "quality": current.get("quality"),
            "quality_after": current.get("quality_after"),
            "quality_gain": current.get("quality_gain"),
            "after_image": {"file": (current.get("files") or {}).get("gpt") or (current.get("files") or {}).get("enhanced"),
                            "url": (current.get("urls") or {}).get("gpt") or (current.get("urls") or {}).get("enhanced")},
            "adaptive_profile": current_profile,
            "gpt_prompt": current.get("gpt_prompt"),
            "enhancement_prompt": current.get("enhancement_prompt"),
            "gpt_status": status,
            "gpt_error": current.get("gpt_image_error"),
            "gpt_request_id": current.get("gpt_request_id"),
            "gpt_attempt_count": current.get("gpt_image_attempt_count"),
            "gpt_image_processing_time_ms": current_report.get("gpt_image_processing_time_ms", 0),
            "opencv_processing_time_ms": current_report.get("opencv_processing_time_ms", 0),
            "processing_time_seconds": current.get("processing_time_seconds", 0),
            "stage_timings": current_report.get("stage_timings", []),
            "execution_report": current_report.get("execution_report", []),
            "stage_images": current_report.get("stage_images", []),
            "api_cost_usd": current.get("api_cost_usd", 0),
            "updated_at": now_iso(),
        }},
    )


@router.post("/media/{media_id}/enhance-gpt/apply")
async def apply_gpt_enhancement(media_id: str, user: dict = Depends(CAN_UPLOAD)):
    media = await db.media.find_one({"id": media_id}, NO_ID)
    if not media or media.get("kind") != "image":
        raise HTTPException(404, "Image not found")
    pending = media.get("pending_ai_edit") or {}
    updates = pending.get("updates")
    if not isinstance(updates, dict) or not (pending.get("preview_url")):
        raise HTTPException(409, "No AI enhancement preview is ready to apply")
    result = await db.media.update_one(
        {"id": media_id, "pending_ai_edit": {"$exists": True}},
        {"$set": {**updates, "edited_at": now_iso()},
         "$unset": {"pending_ai_edit": ""}},
    )
    if result.modified_count != 1:
        raise HTTPException(409, "The AI enhancement preview is no longer available")
    current = await db.media.find_one({"id": media_id}, NO_ID)
    status = current.get("gpt_image_status", "completed")
    await _update_learning_record(media_id, current, status)
    await write_audit(
        user["company_id"],
        "AI image enhanced from Approval Queue.",
        "media",
        media_id,
        ["files", "urls"],
    )
    await log_activity(
        "gpt_image_enhancement",
        "AI image enhanced from Approval Queue.",
        user, media_id, "media",
    )
    return clean({"status": "completed", "media": current})


@router.post("/media/{media_id}/enhance-gpt/discard")
async def discard_gpt_enhancement(media_id: str, _: dict = Depends(CAN_UPLOAD)):
    media = await db.media.find_one({"id": media_id}, NO_ID)
    if not media or media.get("kind") != "image":
        raise HTTPException(404, "Image not found")
    pending = media.get("pending_ai_edit") or {}
    if not pending:
        raise HTTPException(409, "No AI enhancement preview is waiting")
    previous_status = pending.get("previous_gpt_image_status") or "not_run"
    result = await db.media.update_one(
        {"id": media_id, "pending_ai_edit": {"$exists": True}},
        {"$set": {"gpt_image_status": previous_status},
         "$unset": {"pending_ai_edit": "", "gpt_started_at": ""}},
    )
    if result.modified_count != 1:
        raise HTTPException(409, "The AI enhancement preview is no longer available")
    return {"status": "discarded"}


@router.post("/media/{media_id}/generate-story")
async def generate_story(media_id: str, body: GenerateStoryIn, user: dict = Depends(CAN_APPROVE)):
    media = await db.media.find_one({"id": media_id}, NO_ID)
    if not media or media.get("kind") != "image" or not media.get("analysis"):
        raise HTTPException(400, "A processed image is required to generate a story")
    mode_labels = {"no_music": "No Music", "ai_recommended": "AI Recommended", "manual": "Manual Selection"}
    if body.music_mode not in mode_labels:
        raise HTTPException(400, "Choose a valid story music option")
    selected_track = None
    if body.music_mode in {"ai_recommended", "manual"}:
        selected_track = await story_music_service.get_track(body.music_track_id or "")
        if not selected_track:
            raise HTTPException(400, "Choose a recommended or library music track")

    image_name = (media.get("files") or {}).get("story") or (media.get("files") or {}).get("enhanced")
    if not image_name:
        raise HTTPException(400, "A story-sized image is not available")
    image_path = await st.fetch_local(image_name)
    music_path = story_music_service.track_path(selected_track) if selected_track else None
    video_name = f"{media_id}_story_{new_id()[:8]}.mp4"
    video_path = st.work_path(video_name)
    try:
        await story_music_service.render_story(str(image_path), str(video_path), str(music_path) if music_path else None)
        video_url = await st.put_file(video_name, video_path, "video/mp4")
    except Exception as exc:
        log.exception("Story render failed for %s", media_id)
        raise HTTPException(502, f"Story video could not be generated: {str(exc)[:200]}") from exc

    music_name = selected_track["title"] if selected_track else None
    music_duration = int(selected_track.get("duration") or 0) if selected_track else 0
    mode = mode_labels[body.music_mode]
    story_fields = {
        "story_video_url": video_url,
        "story_video_file": video_name,
        "music_mode": mode,
        "music_name": music_name,
        "music_track_id": selected_track["id"] if selected_track else None,
        "music_duration_seconds": music_duration,
        "story_music_used_duration_seconds": story_music_service.STORY_SECONDS if selected_track else 0,
        "story_duration_seconds": story_music_service.STORY_SECONDS,
        "story_generated_at": now_iso(),
        "music_selection": {
            "mode": mode, "name": music_name,
            "duration_seconds": music_duration,
            "used_duration_seconds": story_music_service.STORY_SECONDS if selected_track else 0,
            "track_id": selected_track["id"] if selected_track else None,
        },
    }
    post = await db.posts.find_one({"media_ids": media_id, "type": "story", "status": "pending"}, NO_ID)
    if post:
        await db.posts.update_one(
            {"id": post["id"]},
            {"$set": {**story_fields, "updated_at": now_iso()},
             "$push": {"history": {"at": now_iso(), "by": user.get("name"),
                                    "action": f"Generated story with {mode.lower()}"}}},
        )
        post = await db.posts.find_one({"id": post["id"]}, NO_ID)
    else:
        post = await create_post([media], "story", user, story_fields)
    if selected_track:
        await story_music_service.mark_track_used(selected_track["id"])
    return clean(post)


@router.post("/media/{media_id}/create-post")
async def media_create_post(media_id: str, body: CreatePostIn, user: dict = Depends(CAN_APPROVE)):
    m = await db.media.find_one({"id": media_id}, NO_ID)
    if not m or not m.get("analysis"):
        raise HTTPException(400, "Media must be processed first")
    ptype = "reel" if m["kind"] == "video" else body.type
    extra = {"reel_video_url": m["urls"].get("video")} if m["kind"] == "video" else None
    return await create_post([m], ptype, user, extra)


@router.get("/projects")
async def projects(_: dict = Depends(get_current_user)):
    items = await db.projects.find({}, NO_ID).sort("created_at", -1).to_list(500)
    for p in items:
        p["media_count"] = await db.media.count_documents({"project_id": p["id"]})
    return clean(items)
