"""Tenant identity helpers and idempotent legacy-data migration."""
from __future__ import annotations

from typing import Any, Mapping

from core.db import db, now_iso

DEFAULT_COMPANY_ID = "default"
TENANT_COLLECTIONS = (
    "users",
    "media",
    "posts",
    "projects",
    "templates",
    "settings",
    "activity_logs",
    "notifications",
    "analytics",
    "learning_records",
    "usage",
    "files",
    "follower_snapshots",
    "music_favorites",
    "drive_sync_records",
    "drive_sync_history",
    "drive_projects",
)


def tenant_query(company_id: str, query: Mapping[str, Any] | None = None) -> dict:
    """Add a tenant constraint without allowing caller filters to override it."""
    return {"$and": [dict(query or {}), {"company_id": company_id}]}


def require_company_id(user: Mapping[str, Any]) -> str:
    company_id = user.get("company_id")
    if not isinstance(company_id, str) or not company_id:
        raise ValueError("Authenticated account is missing company membership")
    return company_id


async def create_company(
    company_id: str,
    name: str,
    *,
    owner_id: str,
    preset: str = "AUTO",
) -> dict:
    timestamp = now_iso()
    company = {
        "id": company_id,
        "name": name.strip(),
        "owner_id": owner_id,
        "preset": preset,
        "custom_style": "",
        "prompt_template": "",
        "watermark": {"enabled": False, "text": ""},
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    await db.companies.insert_one(dict(company))
    return company


async def migrate_legacy_data() -> None:
    """Create a default tenant and attach pre-tenant records to it once."""
    company = await db.companies.find_one({"id": DEFAULT_COMPANY_ID})
    if not company:
        await db.companies.update_one(
            {"id": DEFAULT_COMPANY_ID},
            {
                "$setOnInsert": {
                    "id": DEFAULT_COMPANY_ID,
                    "name": "Interior Social Studio",
                    "owner_id": None,
                    "preset": "AUTO",
                    "custom_style": "",
                    "prompt_template": "",
                    "watermark": {"enabled": False, "text": ""},
                    "created_at": now_iso(),
                    "updated_at": now_iso(),
                }
            },
            upsert=True,
        )

    for collection_name in TENANT_COLLECTIONS:
        collection = getattr(db, collection_name)
        await collection.update_many(
            {"company_id": {"$exists": False}},
            {"$set": {"company_id": DEFAULT_COMPANY_ID}},
        )
