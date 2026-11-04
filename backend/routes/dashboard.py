from collections import Counter
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from core.db import db, now, NO_ID, clean
from core.security import get_current_user, CAN_APPROVE
from services import analytics_service, learning_engine, cost_analytics_service
from services.publishing_service import PublishError

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/stats")
async def stats(_: dict = Depends(get_current_user)):
    today = now().date().isoformat()
    month = today[:7]
    media = await db.media.find({}, {"kind": 1, "size_bytes": 1}).to_list(100000)
    files = await db.files.find({"is_deleted": False}, {"size": 1}).to_list(100000)
    posts = await db.posts.find({}, {"type": 1, "status": 1, "published_at": 1}).to_list(100000)
    usage = await db.usage.find({}, {"kind": 1, "at": 1}).to_list(100000)
    types = Counter(p["type"] for p in posts)
    statuses = Counter(p["status"] for p in posts)
    usage_kinds = Counter(u["kind"] for u in usage)
    month_usage = Counter(u["kind"] for u in usage if u["at"][:7] == month)
    return {
        "images_uploaded": sum(1 for m in media if m["kind"] == "image"),
        "videos_uploaded": sum(1 for m in media if m["kind"] == "video"),
        "posts_generated": len(posts), "feed_generated": types.get("feed", 0), "stories_generated": types.get("story", 0),
        "carousels_generated": types.get("carousel", 0), "reels_generated": types.get("reel", 0),
        "pending_approval": statuses.get("pending", 0), "approved": statuses.get("approved", 0),
        "published_today": sum(1 for p in posts if p["status"] == "published" and (p.get("published_at") or "")[:10] == today),
        "published_total": statuses.get("published", 0), "scheduled": statuses.get("scheduled", 0),
        "rejected": statuses.get("rejected", 0), "failed": statuses.get("failed", 0),
        "storage_bytes": sum(f.get("size", 0) for f in files), "original_bytes": sum(m.get("size_bytes", 0) for m in media),
        "api_usage": {"openai_total": usage_kinds.get("openai", 0), "openai_month": month_usage.get("openai", 0),
                      "instagram_total": usage_kinds.get("instagram", 0), "cloudinary_total": usage_kinds.get("cloudinary", 0)},
        "processing": await db.media.count_documents({"status": {"$in": ["queued", "processing"]}}),
    }


@router.get("/dashboard/activity")
async def activity(limit: int = 20, _: dict = Depends(get_current_user)):
    return clean(await db.activity_logs.find({}, NO_ID).sort("created_at", -1).to_list(min(limit, 100)))


@router.get("/dashboard/ai")
async def ai_dashboard(_: dict = Depends(get_current_user)):
    return await learning_engine.dashboard_summary()


@router.get("/dashboard/ai/costs")
async def ai_cost_analytics(_: dict = Depends(get_current_user)):
    return await cost_analytics_service.overview()


@router.get("/dashboard/ai/adaptive-presets")
async def ai_adaptive_presets(_: dict = Depends(get_current_user)):
    return await learning_engine.adaptive_dashboard()


@router.get("/dashboard/ai/records")
async def ai_dashboard_records(
    limit: int = Query(default=30, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    _: dict = Depends(get_current_user),
):
    return clean(await learning_engine.dashboard_records(limit, skip))


@router.get("/dashboard/calendar")
async def calendar(month: str = Query(pattern=r"^\d{4}-\d{2}$"), _: dict = Depends(get_current_user)):
    year, month_number = map(int, month.split("-"))
    try:
        ist = timezone(timedelta(hours=5, minutes=30))
        start_ist = datetime(year, month_number, 1, tzinfo=ist)
        if month_number == 12:
            end_ist = datetime(year + 1, 1, 1, tzinfo=ist)
        else:
            end_ist = datetime(year, month_number + 1, 1, tzinfo=ist)
    except ValueError:
        raise HTTPException(400, "Invalid calendar month")
    start_utc = start_ist.astimezone(timezone.utc).isoformat()
    end_utc = end_ist.astimezone(timezone.utc).isoformat()
    month_range = {"$gte": start_utc, "$lt": end_utc}
    q = {"$or": [{"scheduled_at": month_range}, {"published_at": month_range}]}
    posts = await db.posts.find(q, {**NO_ID, "id": 1, "title": 1, "type": 1, "status": 1, "scheduled_at": 1, "published_at": 1}).to_list(500)
    return clean(posts)


@router.get("/analytics/overview")
async def overview(days: int = 30, _: dict = Depends(get_current_user)):
    return await analytics_service.overview(max(7, min(days, 90)))


@router.post("/analytics/sync")
async def sync(_: dict = Depends(CAN_APPROVE)):
    try:
        return await analytics_service.sync()
    except PublishError as e:
        raise HTTPException(400, str(e))


@router.get("/notifications")
async def notifications(_: dict = Depends(get_current_user)):
    items = await db.notifications.find({}, NO_ID).sort("created_at", -1).to_list(50)
    unread = await db.notifications.count_documents({"read": False})
    return {"items": clean(items), "unread": unread}


@router.post("/notifications/read-all")
async def read_all(_: dict = Depends(get_current_user)):
    await db.notifications.update_many({"read": False}, {"$set": {"read": True}})
    return {"ok": True}


@router.post("/notifications/{nid}/read")
async def read_one(nid: str, _: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": nid}, {"$set": {"read": True}})
    return {"ok": True}
