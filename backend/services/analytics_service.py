"""Analytics Service: Instagram insights sync + aggregated metrics from real data."""
from collections import Counter
from datetime import timedelta
import httpx
from core.db import db, now, now_iso, NO_ID
from services.learning_engine import update_instagram_engagement
from services.settings_service import get_settings, instagram_ready
from services.publishing_service import _base, _call, account_info, PublishError

METRICS = ["reach", "likes", "comments", "shares", "saves"]


async def sync() -> dict:
    s = await get_settings()
    if not instagram_ready(s):
        raise PublishError("Connect Instagram in Settings to sync analytics")
    synced = 0
    async with httpx.AsyncClient(timeout=30) as c:
        posts = await db.posts.find({"status": "published", "instagram_media_id": {"$ne": None}}, NO_ID).to_list(500)
        for p in posts:
            vals = {}
            try:
                d = await _call(c, "GET", f"{_base(s)}/{p['instagram_media_id']}/insights",
                                {"metric": "reach,likes,comments,shares,saved", "access_token": s["instagram_access_token"]})
                for row in d.get("data", []):
                    vals["saves" if row["name"] == "saved" else row["name"]] = (row.get("values") or [{}])[0].get("value", 0)
            except PublishError:
                try:
                    d = await _call(c, "GET", f"{_base(s)}/{p['instagram_media_id']}",
                                    {"fields": "like_count,comments_count", "access_token": s["instagram_access_token"]})
                    vals = {"likes": d.get("like_count", 0), "comments": d.get("comments_count", 0)}
                except PublishError:
                    continue
            await db.analytics.update_one({"post_id": p["id"]}, {"$set": {"post_id": p["id"], "type": p["type"], "title": p["title"],
                                                                          **{k: vals.get(k, 0) for k in METRICS}, "synced_at": now_iso()}},
                                          upsert=True)
            await update_instagram_engagement(
                p.get("media_ids", []),
                p["id"],
                vals,
            )
            synced += 1
    acct = await account_info(s)
    await db.follower_snapshots.update_one({"date": now().date().isoformat()}, {"$set": {
        "date": now().date().isoformat(), "followers": acct.get("followers_count", 0), "media_count": acct.get("media_count", 0)}},
        upsert=True)
    return {"synced_posts": synced, "followers": acct.get("followers_count"), "username": acct.get("username")}


async def overview(days: int = 30) -> dict:
    rows = await db.analytics.find({}, NO_ID).to_list(1000)
    totals = {k: sum(r.get(k, 0) for r in rows) for k in METRICS}
    since = (now() - timedelta(days=days)).isoformat()
    published = await db.posts.find({"status": "published", "published_at": {"$gte": since}}, {"published_at": 1, "type": 1}).to_list(2000)
    freq = Counter(p["published_at"][:10] for p in published)
    usage = await db.usage.find({"at": {"$gte": since}}, {"kind": 1, "at": 1}).to_list(10000)
    ai_by_day = Counter(u["at"][:10] for u in usage if u["kind"] == "openai")
    series = []
    for i in range(days - 1, -1, -1):
        d = (now() - timedelta(days=i)).date().isoformat()
        series.append({"date": d[5:], "published": freq.get(d, 0), "ai_calls": ai_by_day.get(d, 0)})
    approved = await db.posts.count_documents({"status": {"$in": ["approved", "scheduled", "published", "publishing", "failed"]}})
    rejected = await db.posts.count_documents({"status": "rejected"})
    decided = approved + rejected
    followers = await db.follower_snapshots.find({}, NO_ID).sort("date", 1).to_list(365)
    by_type = Counter(p["type"] for p in published)
    top = sorted(rows, key=lambda r: r.get("reach", 0) + r.get("likes", 0), reverse=True)[:5]
    return {
        "totals": totals, "series": series, "followers": followers,
        "follower_growth": (followers[-1]["followers"] - followers[0]["followers"]) if len(followers) > 1 else 0,
        "approval_rate": round(approved / decided * 100, 1) if decided else None,
        "approved": approved, "rejected": rejected, "published_by_type": dict(by_type),
        "ai_calls": sum(1 for u in usage if u["kind"] == "openai"), "top_posts": top, "has_insights": bool(rows),
    }
