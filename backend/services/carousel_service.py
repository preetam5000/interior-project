"""Carousel Generator + post planning (groups same-project images into carousels)."""
import asyncio
import logging
from collections import defaultdict
from core.db import db, new_id, now_iso, NO_ID
from services import ai_analyzer
from services.notification_service import log_activity

log = logging.getLogger("carousel")
_locks: dict = defaultdict(asyncio.Lock)


def _ai_block(a: dict, suggested: str) -> dict:
    return {
        "suggested_type": suggested, "confidence": a.get("confidence"), "reason": a.get("reason"),
        "editing_style": a.get("editing_style"), "priority": a.get("priority"), "recommended_crop": a.get("recommended_crop"),
        "analysis_summary": {k: a.get(k) for k in ["room_type", "project_stage", "design_style", "aesthetic_score", "mood"]},
    }


async def create_post(media: list[dict], ptype: str, user: dict | None = None, extra: dict | None = None) -> dict:
    first = media[0]
    a = first.get("analysis") or {}
    post = {
        "id": new_id(), "type": ptype, "status": "pending", "media_ids": [m["id"] for m in media],
        "cover_media_id": first["id"], "project_id": first.get("project_id"), "project_name": first.get("project_name"),
        "group_key": first.get("group_key"), "title": a.get("title") or first["filename"],
        "caption": a.get("caption", ""), "hashtags": a.get("hashtags", []), "alt_text": a.get("alt_text", ""),
        "story_text": a.get("story_text", ""), "editorial_description": a.get("editorial_description", ""),
        "seo_description": a.get("seo_description", ""), "music_suggestion": a.get("music_suggestion", ""),
        "ai": _ai_block(a, a.get("content_type", ptype)), "scheduled_at": None, "published_at": None,
        "instagram_media_id": None, "permalink": None, "error": None, "reel_video_url": None,
        "history": [{"at": now_iso(), "by": (user or {}).get("name", "AI"), "action": f"Generated as {ptype}"}],
        "created_at": now_iso(), "updated_at": now_iso(), **(extra or {}),
    }
    await db.posts.insert_one(dict(post))
    await db.media.update_many({"id": {"$in": post["media_ids"]}}, {"$set": {"status": "pending"}})
    await log_activity("post_generated", f"{ptype.title()} \"{post['title']}\" queued for approval", user, post["id"], "post")
    post.pop("_id", None)
    return post


async def refresh_carousel_copy(post_id: str, s: dict):
    post = await db.posts.find_one({"id": post_id}, NO_ID)
    media = await db.media.find({"id": {"$in": post["media_ids"]}}, NO_ID).to_list(50)
    slides = [m.get("analysis") or {} for m in media]
    try:
        d = await ai_analyzer.carousel_caption(s, slides)
        await db.posts.update_one({"id": post_id}, {"$set": {
            "title": d.get("title") or post["title"], "caption": d.get("caption") or post["caption"],
            "hashtags": d.get("hashtags") or post["hashtags"], "ai.reason": d.get("reason") or post["ai"].get("reason"),
            "updated_at": now_iso()}})
    except Exception as e:
        log.warning("Carousel caption failed: %s", e)


async def plan_post(m: dict, s: dict) -> dict | None:
    if m["status"] == "skipped":
        return None
    a = m["analysis"]
    ctype = a["content_type"]
    if m["kind"] == "video":
        return await create_post([m], "reel", extra={"reel_video_url": m["urls"].get("video")})
    if ctype == "story":
        return await create_post([m], "story")
    async with _locks[m["group_key"]]:
        existing = await db.posts.find_one({"group_key": m["group_key"], "status": "pending", "type": {"$in": ["feed", "carousel"]}},
                                           NO_ID)
        if existing and len(existing["media_ids"]) < 10:
            ids = existing["media_ids"] + [m["id"]]
            await db.posts.update_one({"id": existing["id"]}, {
                "$set": {"type": "carousel", "media_ids": ids, "ai.suggested_type": "carousel", "updated_at": now_iso()},
                "$push": {"history": {"at": now_iso(), "by": "AI", "action": f"Added {m['filename']} — grouped as carousel"}}})
            await db.media.update_one({"id": m["id"]}, {"$set": {"status": "pending"}})
            await refresh_carousel_copy(existing["id"], s)
            await log_activity("carousel_grouped", f"{m['filename']} grouped into carousel \"{existing['title']}\"", None,
                               existing["id"], "post")
            return None
        return await create_post([m], "feed")


async def manual_carousel(media_ids: list[str], s: dict, user: dict) -> dict:
    media = await db.media.find({"id": {"$in": media_ids}, "kind": "image"}, NO_ID).to_list(20)
    by_id = {m["id"]: m for m in media}
    ordered = [by_id[i] for i in media_ids if i in by_id]
    if len(ordered) < 2:
        raise ValueError("Select at least 2 processed images for a carousel")
    if len(ordered) > 10:
        raise ValueError("Instagram carousels allow a maximum of 10 slides")
    busy = await db.posts.find_one({"media_ids": {"$in": media_ids}, "status": {"$in": ["pending", "approved", "scheduled", "publishing"]}})
    if busy:
        raise ValueError(f"Some images are already in the active post \"{busy['title']}\". Reject it first or pick other images.")
    post = await create_post(ordered, "carousel", user)
    await refresh_carousel_copy(post["id"], s)
    return await db.posts.find_one({"id": post["id"]}, NO_ID)
