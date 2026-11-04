"""Company-scoped GPT request and estimated-cost analytics."""
from __future__ import annotations

import calendar
from datetime import datetime, time as datetime_time, timedelta, timezone
from zoneinfo import ZoneInfo

from core.db import db, now
from services.settings_service import get_settings

BUSINESS_TZ = ZoneInfo("Asia/Kolkata")


def _utc_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def _priced(condition: dict | None = None) -> dict:
    terms = [{"$isNumber": "$estimated_cost_usd"}]
    if condition:
        terms.append(condition)
    return {"$and": terms} if len(terms) > 1 else terms[0]


def _period_sum(start: str, *, detail: str | None = None) -> dict:
    conditions = [{"$gte": ["$at", start]}, {"$isNumber": "$estimated_cost_usd"}]
    if detail:
        conditions.append({"$eq": ["$detail", detail]})
    return {
        "$sum": {
            "$cond": [
                {"$and": conditions},
                "$estimated_cost_usd",
                0,
            ]
        }
    }


def _period_count(start: str, *, detail: str | None = None, priced_only: bool = False) -> dict:
    conditions = [{"$gte": ["$at", start]}]
    if detail:
        conditions.append({"$eq": ["$detail", detail]})
    if priced_only:
        conditions.append({"$isNumber": "$estimated_cost_usd"})
    return {"$sum": {"$cond": [{"$and": conditions}, 1, 0]}}


async def overview() -> dict:
    local_now = now().astimezone(BUSINESS_TZ)
    today = datetime.combine(local_now.date(), datetime_time.min, tzinfo=BUSINESS_TZ)
    week = today - timedelta(days=today.weekday())
    month = today.replace(day=1)
    chart_start = today - timedelta(days=29)
    days_in_month = calendar.monthrange(local_now.year, local_now.month)[1]

    today_iso, week_iso, month_iso = map(_utc_iso, (today, week, month))
    summary_cursor = await db.usage.aggregate([
        {"$match": {"kind": "openai"}},
        {"$group": {
            "_id": None,
            "gpt_requests": {"$sum": 1},
            "priced_requests": {"$sum": {"$cond": [_priced(), 1, 0]}},
            "total_estimated_api_cost_usd": {"$sum": {"$cond": [_priced(), "$estimated_cost_usd", 0]}},
            "today_requests": _period_count(today_iso),
            "week_requests": _period_count(week_iso),
            "month_requests": _period_count(month_iso),
            "priced_requests_today": _period_count(today_iso, priced_only=True),
            "priced_requests_week": _period_count(week_iso, priced_only=True),
            "priced_requests_month": _period_count(month_iso, priced_only=True),
            "cost_today_usd": _period_sum(today_iso),
            "cost_this_week_usd": _period_sum(week_iso),
            "cost_this_month_usd": _period_sum(month_iso),
            "image_edit_requests": {"$sum": {"$cond": [{"$eq": ["$detail", "edit_image"]}, 1, 0]}},
            "priced_image_edit_requests": {"$sum": {"$cond": [_priced({"$eq": ["$detail", "edit_image"]}), 1, 0]}},
            "image_edit_cost_usd": {"$sum": {"$cond": [_priced({"$eq": ["$detail", "edit_image"]}), "$estimated_cost_usd", 0]}},
        }}
    ])
    summary_rows = await summary_cursor.to_list(1)
    totals = summary_rows[0] if summary_rows else {}
    totals.pop("_id", None)

    daily_cursor = await db.usage.aggregate([
        {"$match": {"kind": "openai", "at": {"$gte": _utc_iso(chart_start)}}},
        {"$addFields": {"parsed_at": {"$dateFromString": {"dateString": "$at"}}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$parsed_at", "timezone": "Asia/Kolkata"}},
            "requests": {"$sum": 1},
            "priced_requests": {"$sum": {"$cond": [_priced(), 1, 0]}},
            "estimated_cost_usd": {"$sum": {"$cond": [_priced(), "$estimated_cost_usd", 0]}},
        }},
        {"$sort": {"_id": 1}},
    ])
    daily_rows = await daily_cursor.to_list(60)
    daily = {row["_id"]: row for row in daily_rows}
    series = []
    for offset in range(30):
        day = (chart_start + timedelta(days=offset)).date().isoformat()
        row = daily.get(day, {})
        series.append({
            "date": day,
            "requests": row.get("requests", 0),
            "priced_requests": row.get("priced_requests", 0),
            "estimated_cost_usd": row.get("estimated_cost_usd", 0),
        })

    image_requests = totals.get("priced_image_edit_requests", 0)
    priced_requests = totals.get("priced_requests", 0)
    images_processed = await db.learning_records.count_documents({})
    total_cost = totals.get("total_estimated_api_cost_usd", 0) if priced_requests else None
    month_cost = totals.get("cost_this_month_usd", 0) if totals.get("priced_requests_month", 0) else None
    estimated_monthly = (
        month_cost / local_now.day * days_in_month
        if month_cost is not None
        else None
    )
    settings = await get_settings()

    return {
        "gpt_requests": totals.get("gpt_requests", 0),
        "requests_today": totals.get("today_requests", 0),
        "requests_this_week": totals.get("week_requests", 0),
        "requests_this_month": totals.get("month_requests", 0),
        "priced_requests": priced_requests,
        "unpriced_requests": max(0, totals.get("gpt_requests", 0) - priced_requests),
        "estimated_api_cost_usd": total_cost,
        "cost_today_usd": totals.get("cost_today_usd") if totals.get("priced_requests_today", 0) else None,
        "cost_this_week_usd": totals.get("cost_this_week_usd") if totals.get("priced_requests_week", 0) else None,
        "cost_this_month_usd": month_cost,
        "gpt_image_requests": totals.get("image_edit_requests", 0),
        "cost_per_image_usd": (
            totals.get("image_edit_cost_usd", 0) / image_requests
            if image_requests
            else None
        ),
        "average_processing_cost_usd": (
            total_cost / images_processed
            if total_cost is not None and images_processed
            else None
        ),
        "images_processed": images_processed,
        "estimated_monthly_spend_usd": estimated_monthly,
        "monthly_estimate_method": "month-to-date priced spend extrapolated across the calendar month",
        "pricing": {
            "gpt_image_cost_per_request_usd": settings.get("gpt_image_cost_per_request_usd"),
            "gpt_text_cost_per_request_usd": settings.get("gpt_text_cost_per_request_usd"),
            "currency": "USD",
        },
        "series": series,
        "timezone": "Asia/Kolkata",
    }
