import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from core.db import db, now_iso, NO_ID, clean
from core.security import get_current_user, CAN_APPROVE
from services import ai_analyzer, reel_service, storage_service as st
from services.carousel_service import manual_carousel, refresh_carousel_copy
from services.publishing_service import publish_post, PublishError
from services.settings_service import get_settings
from services.notification_service import log_activity, notify
from services.learning_engine import update_adaptive_approval

router = APIRouter(prefix="/posts", tags=["approvals"])
TYPES = ["feed", "story", "carousel", "reel"]
_tasks: set = set()


class PostUpdate(BaseModel):
    title: str | None = None
    caption: str | None = None
    hashtags: list[str] | None = None
    alt_text: str | None = None
    story_text: str | None = None
    type: str | None = None
    media_ids: list[str] | None = None


class ApproveIn(BaseModel):
    publish_now: bool = True


class RejectIn(BaseModel):
    reason: str = ""


class ScheduleIn(BaseModel):
    scheduled_at: str


class RegenIn(BaseModel):
    tone: str = ""
    instructions: str = ""


class ReplaceIn(BaseModel):
    old_media_id: str
    new_media_id: str


class CarouselIn(BaseModel):
    media_ids: list[str]


async def _expand(post: dict) -> dict:
    media = await db.media.find({"id": {"$in": post["media_ids"]}},
                                {**NO_ID, "id": 1, "filename": 1, "kind": 1, "urls": 1, "analysis": 1, "quality": 1,
                                 "enhanced_quality": 1, "enhanced_by": 1, "status": 1}).to_list(20)
    by_id = {m["id"]: m for m in media}
    post["media"] = [by_id[i] for i in post["media_ids"] if i in by_id]
    return post


async def _get(post_id: str) -> dict:
    p = await db.posts.find_one({"id": post_id}, NO_ID)
    if not p:
        raise HTTPException(404, "Post not found")
    return clean(p)


def _hist(user: dict, action: str) -> dict:
    return {"$push": {"history": {"at": now_iso(), "by": user["name"], "action": action}}}


@router.get("")
async def list_posts(status: str = "", type: str = "", limit: int = 100, _: dict = Depends(get_current_user)):
    q = {}
    if status:
        q["status"] = {"$in": status.split(",")}
    if type:
        q["type"] = type
    posts = await db.posts.find(q, NO_ID).sort("created_at", -1).to_list(min(limit, 300))
    return [await _expand(p) for p in posts]


@router.get("/{post_id}")
async def get_post(post_id: str, _: dict = Depends(get_current_user)):
    return await _expand(await _get(post_id))


@router.patch("/{post_id}")
async def update_post(post_id: str, body: PostUpdate, user: dict = Depends(CAN_APPROVE)):
    post = await _get(post_id)
    data = body.model_dump(exclude_none=True)
    if "type" in data and data["type"] not in TYPES:
        raise HTTPException(400, "Invalid content type")
    if "hashtags" in data:
        data["hashtags"] = [h.lstrip("#").strip() for h in data["hashtags"] if h.strip()]
    if "media_ids" in data and set(data["media_ids"]) - set(post["media_ids"]):
        raise HTTPException(400, "Use replace-media to add new media")
    data["updated_at"] = now_iso()
    changed = ", ".join(k for k in data if k != "updated_at")
    await db.posts.update_one({"id": post_id}, {"$set": data, **_hist(user, f"Edited {changed}")})
    return await _expand(await _get(post_id))


@router.post("/{post_id}/approve")
async def approve(post_id: str, body: ApproveIn, user: dict = Depends(CAN_APPROVE)):
    post = await _get(post_id)
    if post["status"] in ("published", "publishing"):
        raise HTTPException(400, "Post already published")
    await db.posts.update_one({"id": post_id}, {"$set": {"status": "approved", "approved_by": user["name"], "approved_at": now_iso(),
                                                         "error": None}, **_hist(user, "Approved")})
    await db.media.update_many({"id": {"$in": post["media_ids"]}}, {"$set": {"status": "approved"}})
    await update_adaptive_approval(post["media_ids"], True)
    await log_activity("post_approved", f"{user['name']} approved \"{post['title']}\"", user, post_id, "post")
    s = await get_settings()
    if body.publish_now and s.get("auto_publish_on_approve", True):
        try:
            return await _expand(await publish_post(post_id, user))
        except PublishError as e:
            raise HTTPException(400, str(e))
    return await _expand(await _get(post_id))


@router.post("/{post_id}/publish")
async def publish_now(post_id: str, user: dict = Depends(CAN_APPROVE)):
    try:
        return await _expand(await publish_post(post_id, user))
    except PublishError as e:
        raise HTTPException(400, str(e))


@router.post("/{post_id}/reject")
async def reject(post_id: str, body: RejectIn, user: dict = Depends(CAN_APPROVE)):
    post = await _get(post_id)
    await db.posts.update_one({"id": post_id}, {"$set": {"status": "rejected", "rejection_reason": body.reason, "updated_at": now_iso()},
                                                **_hist(user, f"Rejected{': ' + body.reason if body.reason else ''}")})
    await db.media.update_many({"id": {"$in": post["media_ids"]}}, {"$set": {"status": "rejected"}})
    await update_adaptive_approval(post["media_ids"], False)
    await log_activity("post_rejected", f"{user['name']} rejected \"{post['title']}\"", user, post_id, "post")
    return await _expand(await _get(post_id))


@router.post("/{post_id}/schedule")
async def schedule(post_id: str, body: ScheduleIn, user: dict = Depends(CAN_APPROVE)):
    post = await _get(post_id)
    try:
        when = datetime.fromisoformat(body.scheduled_at.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, "Invalid date")
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    iso = when.astimezone(timezone.utc).isoformat()
    if iso < now_iso():
        raise HTTPException(400, "Schedule time must be in the future")
    await db.posts.update_one({"id": post_id}, {"$set": {"status": "scheduled", "scheduled_at": iso, "error": None, "updated_at": now_iso()},
                                                **_hist(user, f"Scheduled for {iso[:16].replace('T', ' ')} UTC")})
    await db.media.update_many({"id": {"$in": post["media_ids"]}}, {"$set": {"status": "scheduled"}})
    await log_activity("post_scheduled", f"\"{post['title']}\" scheduled", user, post_id, "post")
    return await _expand(await _get(post_id))


@router.post("/{post_id}/regenerate-caption")
async def regen(post_id: str, body: RegenIn, user: dict = Depends(CAN_APPROVE)):
    post = await _get(post_id)
    s = await get_settings()
    try:
        d = await ai_analyzer.regenerate_caption(s, post, body.tone, body.instructions)
    except Exception as e:
        raise HTTPException(502, f"AI caption generation failed: {e}")
    data = {k: d[k] for k in ["caption", "hashtags", "story_text", "alt_text"] if d.get(k)}
    await db.posts.update_one({"id": post_id}, {"$set": {**data, "updated_at": now_iso()}, **_hist(user, "Regenerated caption with AI")})
    return await _expand(await _get(post_id))


@router.post("/{post_id}/replace-media")
async def replace_media(post_id: str, body: ReplaceIn, user: dict = Depends(CAN_APPROVE)):
    post = await _get(post_id)
    if body.old_media_id not in post["media_ids"]:
        raise HTTPException(400, "Media not in post")
    new = await db.media.find_one({"id": body.new_media_id}, NO_ID)
    if not new or not new.get("analysis"):
        raise HTTPException(400, "Replacement media must be processed")
    ids = [body.new_media_id if i == body.old_media_id else i for i in post["media_ids"]]
    await db.posts.update_one({"id": post_id}, {"$set": {"media_ids": ids, "cover_media_id": ids[0], "updated_at": now_iso()},
                                                **_hist(user, f"Replaced media with {new['filename']}")})
    return await _expand(await _get(post_id))


async def _render_reel(post_id: str, user: dict):
    post = await _get(post_id)
    try:
        media = await db.media.find({"id": {"$in": post["media_ids"]}, "kind": "image"}, NO_ID).to_list(20)
        by_id = {m["id"]: m for m in media}
        paths = [str(await st.fetch_local(by_id[i]["files"]["story"])) for i in post["media_ids"] if i in by_id]
        name = f"{post_id}_slideshow_{now_iso()[11:19].replace(':', '')}.mp4"
        await reel_service.slideshow(paths, str(st.work_path(name)))
        url = await st.put_file(name, st.work_path(name), "video/mp4")
        await db.posts.update_one({"id": post_id}, {"$set": {"reel_video_url": url, "reel_status": "ready", "type": "reel",
                                                             "updated_at": now_iso()}, **_hist(user, "Generated Ken Burns slideshow reel")})
        await notify("processing_completed", "Reel ready", f"Slideshow reel for \"{post['title']}\" is ready", f"/approvals/{post_id}")
    except Exception as e:
        await db.posts.update_one({"id": post_id}, {"$set": {"reel_status": "failed", "error": f"Reel render failed: {str(e)[:200]}"}})


@router.post("/{post_id}/generate-reel")
async def generate_reel(post_id: str, user: dict = Depends(CAN_APPROVE)):
    post = await _get(post_id)
    if not post["media_ids"]:
        raise HTTPException(400, "Post has no media")
    await db.posts.update_one({"id": post_id}, {"$set": {"reel_status": "rendering"}})
    t = asyncio.create_task(_render_reel(post_id, user))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    return await _expand(await _get(post_id))


@router.post("/carousel")
async def create_carousel(body: CarouselIn, user: dict = Depends(CAN_APPROVE)):
    s = await get_settings()
    try:
        post = await manual_carousel(body.media_ids, s, user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return await _expand(post)


@router.post("/{post_id}/refresh-carousel-caption")
async def refresh_carousel(post_id: str, user: dict = Depends(CAN_APPROVE)):
    await _get(post_id)
    await refresh_carousel_copy(post_id, await get_settings())
    return await _expand(await _get(post_id))
