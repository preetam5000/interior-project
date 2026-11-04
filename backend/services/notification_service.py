import logging
import httpx
from core.db import db, new_id, now_iso
from services.settings_service import get_settings

log = logging.getLogger("notifications")
_UNSET = object()


async def log_activity(action: str, message: str, user: dict | None = None, entity_id: str | None = None, entity: str | None = None):
    await db.activity_logs.insert_one({
        "id": new_id(), "action": action, "message": message, "entity": entity, "entity_id": entity_id,
        "company_id": (user or {}).get("company_id"),
        "user_name": (user or {}).get("name", "System"), "user_id": (user or {}).get("id"), "created_at": now_iso(),
    })


async def notify(kind: str, title: str, message: str, link: str = ""):
    """kind: processing_completed | approval_required | publish_success | publish_failed"""
    doc = {"id": new_id(), "type": kind, "title": title, "message": message, "link": link, "read": False, "created_at": now_iso()}
    await db.notifications.insert_one(dict(doc))
    s = await get_settings()
    url = s.get("notification_webhook_url")
    if url:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                await c.post(url, json=doc)
        except Exception as e:
            log.warning("Notification webhook failed: %s", e)


async def track_usage(kind: str, detail: str = "", cost_usd: float | None | object = _UNSET):
    event = {"id": new_id(), "kind": kind, "detail": detail, "at": now_iso()}
    if kind == "openai":
        pricing_kind = "gpt_image_cost_per_request_usd" if detail == "edit_image" else "gpt_text_cost_per_request_usd"
        try:
            if cost_usd is _UNSET:
                settings = await get_settings()
                rate = settings.get(pricing_kind)
            else:
                rate = cost_usd
            event.update({
                "pricing_kind": pricing_kind,
                "price_per_request_usd": rate,
                "estimated_cost_usd": rate,
                "currency": "USD",
            })
        except Exception:
            log.exception("Could not load AI request pricing for usage record")
            event.update({"pricing_kind": pricing_kind, "estimated_cost_usd": None, "currency": "USD"})
    await db.usage.insert_one(event)
