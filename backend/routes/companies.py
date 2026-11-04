import hashlib
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.db import db, new_id, now_iso, NO_ID, write_audit
from core.security import ADMIN_ONLY
from core.tenancy import tenant_query
from services import settings_service as ss
from services.adaptive_profile import PRESETS

router = APIRouter(prefix="/companies", tags=["companies"])
KeyScope = Literal["viewer", "designer", "manager", "n8n"]


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    preset: str | None = None
    custom_style: str | None = Field(default=None, max_length=1000)
    prompt_template: str | None = Field(default=None, max_length=3000)
    watermark_enabled: bool | None = None
    watermark_text: str | None = Field(default=None, max_length=80)


class APIKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    scopes: list[KeyScope] = Field(default_factory=lambda: ["viewer"], min_length=1)


@router.get("/current")
async def current_company(admin: dict = Depends(ADMIN_ONLY)):
    company = await db.companies.find_one({"id": admin["company_id"]}, NO_ID)
    if not company:
        raise HTTPException(404, "Company not found")
    return company


@router.patch("/current")
async def update_company(body: CompanyUpdate, admin: dict = Depends(ADMIN_ONLY)):
    changes = body.model_dump(exclude_none=True)
    if "preset" in changes:
        preset = changes["preset"].strip().upper()
        if preset not in PRESETS:
            raise HTTPException(422, f"Unsupported preset. Choose one of: {', '.join(PRESETS)}")
        changes["preset"] = preset
    changes["updated_at"] = now_iso()
    await db.companies.update_one(
        {"id": admin["company_id"]},
        {"$set": changes},
    )
    settings_changes = {}
    if "preset" in changes:
        settings_changes["enhancement_preset"] = changes["preset"]
    if "watermark_enabled" in changes:
        settings_changes["watermark_enabled"] = changes["watermark_enabled"]
    if "watermark_text" in changes:
        settings_changes["watermark_text"] = changes["watermark_text"]
    if "custom_style" in changes:
        settings_changes["custom_editing_style"] = changes["custom_style"]
    if "prompt_template" in changes:
        settings_changes["brand_prompt_template"] = changes["prompt_template"]
    if settings_changes:
        await ss.update_settings(settings_changes, admin["company_id"])
    await write_audit(
        admin["company_id"],
        "company_settings_updated",
        "companies",
        admin["company_id"],
        sorted(key for key in changes if key != "updated_at"),
    )
    return await current_company(admin)


@router.get("/api-keys")
async def list_api_keys(
    admin: dict = Depends(ADMIN_ONLY),
    limit: int = Query(default=100, ge=1, le=200),
):
    keys = await db.api_keys.find(
        {"company_id": admin["company_id"]},
        {
            **NO_ID,
            "key_hash": 0,
        },
    ).sort("created_at", -1).to_list(limit)
    return keys


@router.post("/api-keys")
async def create_api_key(body: APIKeyCreate, admin: dict = Depends(ADMIN_ONLY)):
    token = "isa_" + secrets.token_urlsafe(32)
    key_id = new_id()
    record = {
        "id": key_id,
        "company_id": admin["company_id"],
        "name": body.name.strip(),
        "key_hash": hashlib.sha256(token.encode()).hexdigest(),
        "scopes": sorted(set(body.scopes)),
        "created_by": admin["id"],
        "created_at": now_iso(),
        "last_used_at": None,
        "revoked_at": None,
    }
    await db.api_keys.insert_one(record)
    await write_audit(
        admin["company_id"],
        "api_key_created",
        "api_keys",
        key_id,
        ["name", "scopes"],
    )
    return {"id": key_id, "name": record["name"], "scopes": record["scopes"], "key": token}


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(key_id: str, admin: dict = Depends(ADMIN_ONLY)):
    result = await db.api_keys.update_one(
        {"id": key_id, "company_id": admin["company_id"], "revoked_at": None},
        {"$set": {"revoked_at": now_iso()}},
    )
    if not result.modified_count:
        raise HTTPException(404, "Active API key not found")
    await write_audit(admin["company_id"], "api_key_revoked", "api_keys", key_id)
    return {"ok": True}


@router.get("/audit-logs")
async def audit_logs(
    admin: dict = Depends(ADMIN_ONLY),
    limit: int = Query(default=100, ge=1, le=500),
):
    entries = await db.audit_logs.find(
        tenant_query(admin["company_id"])
    ).sort("created_at", -1).to_list(limit)
    return entries
