import secrets
from core.db import db, NO_ID, now_iso
from core.tenancy import DEFAULT_COMPANY_ID
from core.tenant_context import get_company_id
from core.config import OPENAI_IMAGE_COST_USD, OPENAI_TEXT_REQUEST_COST_USD
from services.adaptive_profile import PRESETS

SECRET_FIELDS = ["openai_api_key", "cloudinary_api_secret", "instagram_access_token", "n8n_api_key", "cloudinary_api_key", "gdrive_refresh_token"]
COST_FIELDS = {"gpt_image_cost_per_request_usd", "gpt_text_cost_per_request_usd"}

DEFAULTS = {
    "id": "global",
    "openai_api_key": "",
    "openai_model": "gpt-5.4",
    "gpt_image_cost_per_request_usd": OPENAI_IMAGE_COST_USD,
    "gpt_text_cost_per_request_usd": OPENAI_TEXT_REQUEST_COST_USD,
    "visual_debug_enabled": False,
    "cloudinary_cloud_name": "",
    "cloudinary_api_key": "",
    "cloudinary_api_secret": "",
    "instagram_access_token": "",
    "instagram_account_id": "",
    "instagram_api_host": "graph.facebook.com",
    "gdrive_images_folder_id": "",
    "gdrive_videos_folder_id": "",
    "gdrive_account": "",
    "gdrive_refresh_token": "",
    "gdrive_selected_folder_id": "",
    "gdrive_selected_folder_name": "",
    "gdrive_projects_root_id": "",
    "gdrive_projects_root_name": "",
    "gdrive_last_sync": None,
    "gdrive_sync_state": "idle",
    "gdrive_sync_error": "",
    "gdrive_connection_error": "",
    "gdrive_sync_paused": False,
    "brand_name": "Atelier Studio",
    "custom_editing_style": "",
    "brand_prompt_template": "",
    "watermark_text": "",
    "brand_primary_color": "#E5C158",
    "brand_secondary_color": "#09090B",
    "logo_url": "",
    "heading_font": "Cormorant Garamond",
    "body_font": "Plus Jakarta Sans",
    "watermark_enabled": False,
    "default_cta": "Enquire now",
    "caption_tone": "Architectural Digest editorial",
    "theme": "dark",
    "notification_webhook_url": "",
    "auto_publish_on_approve": True,
    "enhancement_preset": "AUTO",
    "n8n_api_key": "",
}


_settings_cache: dict = {}


async def get_settings(company_id: str | None = None) -> dict:
    company_id = company_id or get_company_id() or DEFAULT_COMPANY_ID
    doc = await db.settings.find_one(
        {"company_id": company_id},
        NO_ID,
    )
    if not doc:
        doc = {
            **DEFAULTS,
            "id": company_id,
            "company_id": company_id,
            "n8n_api_key": "isa_" + secrets.token_urlsafe(24),
            "updated_at": now_iso(),
        }
        await db.settings.insert_one(dict(doc))
        doc.pop("_id", None)
    settings = {**DEFAULTS, **doc}
    _settings_cache[company_id] = settings
    return settings


async def get_company_settings(company_id: str) -> dict:
    doc = await db.settings.find_one({"company_id": company_id}, NO_ID)
    if not doc and company_id == DEFAULT_COMPANY_ID:
        return await get_settings(company_id)
    if not doc:
        doc = {
            **DEFAULTS,
            "id": company_id,
            "company_id": company_id,
            "n8n_api_key": "isa_" + secrets.token_urlsafe(24),
            "updated_at": now_iso(),
        }
        await db.settings.insert_one(dict(doc))
    settings = {**DEFAULTS, **doc}
    _settings_cache[company_id] = settings
    return settings


def get_settings_cached() -> dict:
    """Return the last loaded settings without touching the event loop.

    Motor is bound to the loop that created it, so a synchronous caller (such as
    template rendering) cannot safely open a new loop to read the settings
    collection. Every async read refreshes this cache, so the snapshot stays in
    sync with the database. When nothing has been loaded yet the documented
    defaults are returned.
    """
    return {**DEFAULTS, **_settings_cache}


def mask(value: str) -> str:
    if not value:
        return ""
    return "••••" + value[-4:]


def public_settings(s: dict) -> dict:
    out = dict(s)
    for f in SECRET_FIELDS:
        out[f] = mask(s.get(f, ""))
        out[f + "_set"] = bool(s.get(f))
    out["cloudinary_configured"] = cloudinary_ready(s)
    out["instagram_configured"] = instagram_ready(s)
    return out


async def update_settings(
    data: dict,
    company_id: str | None = None,
) -> dict:
    company_id = company_id or get_company_id() or DEFAULT_COMPANY_ID
    clean = {}
    for k, v in data.items():
        if k not in DEFAULTS or k == "id":
            continue
        if k in SECRET_FIELDS and isinstance(v, str) and v.startswith("••••"):
            continue
        if k == "enhancement_preset":
            value = str(v).strip().upper()
            if value not in PRESETS:
                raise ValueError(
                    f"Unsupported enhancement preset: {v}. "
                    f"Choose one of: {', '.join(PRESETS)}"
                )
            clean[k] = value
            continue
        if k in COST_FIELDS:
            if v is None or (isinstance(v, str) and not v.strip()):
                clean[k] = None
                continue
            try:
                amount = float(v)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{k} must be a non-negative amount in USD") from exc
            if amount != amount or amount in (float("inf"), float("-inf")) or amount < 0:
                raise ValueError(f"{k} must be a finite non-negative amount in USD")
            clean[k] = amount
            continue
        clean[k] = v.strip() if isinstance(v, str) else v
    clean["updated_at"] = now_iso()
    await get_company_settings(company_id)
    await db.settings.update_one(
        {"company_id": company_id},
        {"$set": clean},
    )
    return await get_company_settings(company_id)


async def rotate_n8n_key(
    company_id: str = DEFAULT_COMPANY_ID,
) -> str:
    key = "isa_" + secrets.token_urlsafe(24)
    await update_settings({"n8n_api_key": key}, company_id)
    return key


def cloudinary_ready(s: dict) -> bool:
    return all(s.get(k) for k in ["cloudinary_cloud_name", "cloudinary_api_key", "cloudinary_api_secret"])


def instagram_ready(s: dict) -> bool:
    return bool(s.get("instagram_access_token") and s.get("instagram_account_id"))
