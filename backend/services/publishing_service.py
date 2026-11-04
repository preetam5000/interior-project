"""Publishing Service: Instagram Graph API (feed, story, carousel, reel) + scheduler."""
import asyncio
import logging
import httpx
from core.db import db, now_iso, NO_ID
from services.settings_service import get_settings, instagram_ready
from services.notification_service import notify, log_activity, track_usage

log = logging.getLogger("publishing")
GRAPH_VERSION = "v21.0"


class PublishError(Exception):
    pass


def _base(s: dict) -> str:
    return f"https://{s.get('instagram_api_host') or 'graph.facebook.com'}/{GRAPH_VERSION}"


async def _call(c: httpx.AsyncClient, method: str, url: str, params: dict) -> dict:
    r = await c.request(method, url, params=params)
    await track_usage("instagram", url.rsplit("/", 1)[-1])
    data = r.json() if r.content else {}
    if r.status_code >= 400 or "error" in data:
        raise PublishError((data.get("error") or {}).get("message") or f"Instagram API error {r.status_code}")
    return data


async def _wait_ready(c, base: str, cid: str, token: str, tries: int = 60):
    for _ in range(tries):
        d = await _call(c, "GET", f"{base}/{cid}", {"fields": "status_code,status", "access_token": token})
        code = d.get("status_code")
        if code == "FINISHED":
            return
        if code in ("ERROR", "EXPIRED"):
            raise PublishError(f"Instagram could not process media: {d.get('status')}")
        await asyncio.sleep(5)
    raise PublishError("Timed out waiting for Instagram to process media")


def caption_text(post: dict) -> str:
    tags = " ".join("#" + h for h in post.get("hashtags", []))
    return f"{post.get('caption', '').strip()}\n\n{tags}".strip()


async def _publish(s: dict, post: dict, media: list[dict]) -> dict:
    base, token, ig = _base(s), s["instagram_access_token"], s["instagram_account_id"]
    cap = caption_text(post)
    async with httpx.AsyncClient(timeout=60) as c:
        t = post["type"]
        if t == "feed":
            cid = (await _call(c, "POST", f"{base}/{ig}/media", {"image_url": media[0]["urls"]["portrait"], "caption": cap,
                                                                  "access_token": token}))["id"]
            await _wait_ready(c, base, cid, token, 12)
        elif t == "story":
            m = media[0]
            params = {"media_type": "STORIES", "access_token": token}
            if post.get("story_video_url"):
                params["video_url"] = post["story_video_url"]
            elif m["kind"] == "video":
                params["video_url"] = m["urls"]["video"]
            else:
                params["image_url"] = m["urls"]["story"]
            cid = (await _call(c, "POST", f"{base}/{ig}/media", params))["id"]
            await _wait_ready(c, base, cid, token)
        elif t == "carousel":
            if len(media) < 2:
                raise PublishError("A carousel needs at least 2 slides")
            children = []
            for m in media[:10]:
                p = {"is_carousel_item": "true", "access_token": token}
                if m["kind"] == "video":
                    p.update({"media_type": "VIDEO", "video_url": m["urls"]["video"]})
                else:
                    p["image_url"] = m["urls"]["portrait"]
                children.append((await _call(c, "POST", f"{base}/{ig}/media", p))["id"])
            for ch in children:
                await _wait_ready(c, base, ch, token)
            cid = (await _call(c, "POST", f"{base}/{ig}/media", {"media_type": "CAROUSEL", "children": ",".join(children),
                                                                  "caption": cap, "access_token": token}))["id"]
            await _wait_ready(c, base, cid, token)
        elif t == "reel":
            video = post.get("reel_video_url") or media[0]["urls"].get("video")
            if not video:
                raise PublishError("No reel video yet — generate a slideshow reel first")
            cid = (await _call(c, "POST", f"{base}/{ig}/media", {"media_type": "REELS", "video_url": video, "caption": cap,
                                                                  "share_to_feed": "true", "access_token": token}))["id"]
            await _wait_ready(c, base, cid, token)
        else:
            raise PublishError(f"Unsupported type {t}")
        pub = await _call(c, "POST", f"{base}/{ig}/media_publish", {"creation_id": cid, "access_token": token})
        info = {}
        try:
            info = await _call(c, "GET", f"{base}/{pub['id']}", {"fields": "permalink", "access_token": token})
        except PublishError:
            pass
        return {"instagram_media_id": pub["id"], "permalink": info.get("permalink")}


async def publish_post(post_id: str, user: dict | None = None) -> dict:
    post = await db.posts.find_one_and_update(
        {"id": post_id, "status": {"$nin": ["published", "publishing", "rejected"]}},
        {"$set": {"status": "publishing", "updated_at": now_iso()}}, projection=NO_ID)
    if not post:
        raise PublishError("Post is already published, publishing or rejected")
    s = await get_settings()
    if not instagram_ready(s):
        msg = "Approved — add your Instagram access token & account ID in Settings to publish."
        await db.posts.update_one({"id": post_id}, {"$set": {"status": "approved", "error": msg}})
        await notify("publish_failed", "Instagram not connected", f"\"{post['title']}\" is approved but couldn't be published.", "/settings")
        return await db.posts.find_one({"id": post_id}, NO_ID)
    media = await db.media.find({"id": {"$in": post["media_ids"]}}, NO_ID).to_list(20)
    by_id = {m["id"]: m for m in media}
    media = [by_id[i] for i in post["media_ids"] if i in by_id]
    try:
        res = await _publish(s, post, media)
        await db.posts.update_one({"id": post_id}, {"$set": {**res, "status": "published", "published_at": now_iso(), "error": None},
                                                    "$push": {"history": {"at": now_iso(), "by": (user or {}).get("name", "Scheduler"),
                                                                          "action": "Published to Instagram"}}})
        await db.media.update_many({"id": {"$in": post["media_ids"]}}, {"$set": {"status": "published"}})
        await notify("publish_success", "Published to Instagram", f"\"{post['title']}\" is live.", f"/approvals/{post_id}")
        await log_activity("post_published", f"{post['type'].title()} \"{post['title']}\" published", user, post_id, "post")
    except Exception as e:
        log.warning("Publish failed: %s", e)
        await db.posts.update_one({"id": post_id}, {"$set": {"status": "failed", "error": str(e)[:500]},
                                                    "$push": {"history": {"at": now_iso(), "by": "System", "action": f"Publish failed: {str(e)[:120]}"}}})
        await notify("publish_failed", "Publishing failed", f"\"{post['title']}\": {str(e)[:160]}", f"/approvals/{post_id}")
    return await db.posts.find_one({"id": post_id}, NO_ID)


async def scheduler_loop():
    while True:
        try:
            due = await db.posts.find({"status": "scheduled", "scheduled_at": {"$lte": now_iso()}}, {"id": 1}).to_list(20)
            for p in due:
                await publish_post(p["id"])
        except Exception as e:
            log.warning("Scheduler error: %s", e)
        await asyncio.sleep(30)


async def account_info(s: dict) -> dict:
    async with httpx.AsyncClient(timeout=30) as c:
        return await _call(c, "GET", f"{_base(s)}/{s['instagram_account_id']}",
                           {"fields": "username,followers_count,media_count", "access_token": s["instagram_access_token"]})
