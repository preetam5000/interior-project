"""Template editor configuration: built-in presets, option lists and validation.

A template *config* is the flat dict edited in the Template Editor. It is turned
into a renderer recommendation by `template_editor_service`; nothing here touches
the AI recommendation pipeline.
"""
from __future__ import annotations

import ipaddress
import re
from typing import Any
from urllib.parse import urlparse

# Order matches the Template Library. A test asserts this list holds the same types as
# services.template_service.TEMPLATE_TYPES.
TEMPLATE_TYPES = (
    "LUXURY_SHOWCASE",
    "WORK_IN_PROGRESS",
    "BEFORE_AFTER",
    "PROJECT_UPDATE",
    "PROMOTION",
    "QUOTE",
    "TIP",
    "COMPLETED_PROJECT",
)

FONTS = ("serif", "classic", "sans", "modern")
TEXT_ALIGNS = ("left", "center", "right")
CTA_POSITIONS = ("stack", "top_right", "bottom_left", "bottom_center", "bottom_right")
LOGO_POSITIONS = ("top_left", "top_center", "top_right", "bottom_left", "bottom_center", "bottom_right")
BUTTON_STYLES = ("rounded", "square", "outline")

OPTIONS = {
    "fonts": [
        {"value": "serif", "label": "Playfair Serif"},
        {"value": "classic", "label": "Classic Serif"},
        {"value": "sans", "label": "Clean Sans"},
        {"value": "modern", "label": "Modern Bold"},
    ],
    "text_aligns": [{"value": v, "label": v.title()} for v in TEXT_ALIGNS],
    "cta_positions": [
        {"value": "stack", "label": "Below text"},
        {"value": "top_right", "label": "Top right"},
        {"value": "bottom_left", "label": "Bottom left"},
        {"value": "bottom_center", "label": "Bottom center"},
        {"value": "bottom_right", "label": "Bottom right"},
    ],
    "logo_positions": [{"value": v, "label": v.replace("_", " ").title()} for v in LOGO_POSITIONS],
    "button_styles": [{"value": v, "label": v.title()} for v in BUTTON_STYLES],
}

LIMITS = {"headline": 120, "subtitle": 200, "cta": 40, "logo_url": 500, "name": 80}

DEFAULT_STYLE: dict[str, Any] = {
    "font": "serif",
    "text_align": "left",
    "overlay_opacity": 0.6,
    "show_badge": True,
    "show_logo": True,
    "cta_position": "stack",
    "logo_position": "top_left",
    "button_style": "rounded",
}

COPY_FIELDS = ("headline", "subtitle", "cta", "logo_url", "primary_color", "secondary_color")

_PRESET_DATA = (
    ("LUXURY_SHOWCASE", "Luxury Showcase", "Signature hero image for finished interiors.",
     "Where Luxury Meets Living", "Bespoke interiors crafted with timeless elegance", "Enquire now", {}),
    ("WORK_IN_PROGRESS", "Work In Progress", "Behind-the-scenes update with an In Progress badge.",
     "Work In Progress", "Premium wardrobe installation underway", "Follow for updates", {}),
    ("BEFORE_AFTER", "Before & After", "Transformation story with Before / After badges.",
     "The Transformation", "From ordinary to extraordinary", "See the full story", {}),
    ("PROJECT_UPDATE", "Project Update", "Quick progress note from site.",
     "Project Update", "Latest progress from our site", "Follow the journey", {}),
    ("PROMOTION", "Promotion", "Offer or campaign announcement.",
     "Limited Time Offer", "Complimentary design consultation this month", "Book now",
     {"text_align": "center"}),
    ("QUOTE", "Quote", "Editorial quote over a calm photograph.",
     "Design is thinking made visual.", "Saul Bass", "Save for inspiration",
     {"text_align": "center", "font": "classic"}),
    ("TIP", "Tip", "Short design tip with a save call-to-action.",
     "Design Tip", "Layer warm lighting to add depth to any room", "Save this tip", {}),
    ("COMPLETED_PROJECT", "Completed Project", "Celebratory handover with a Completed badge.",
     "Project Completed", "A residence reimagined, down to the last detail", "View the project", {}),
)


class TemplateConfigError(ValueError):
    """Raised when a template config contains an invalid value."""


# ------------------------------------------------------------------ validators --
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
_HEX_COLOR = re.compile(r"#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})")


def _text(value: Any, field: str, limit: int) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise TemplateConfigError(f"{field} must be text")
    cleaned = _CONTROL_CHARS.sub("", value).strip()
    if len(cleaned) > limit:
        raise TemplateConfigError(f"{field} must be {limit} characters or fewer")
    return cleaned


def _color(value: Any, field: str) -> str:
    """'' means "use the brand colour"; anything else must be a hex colour."""
    if value is None or value == "":
        return ""
    match = _HEX_COLOR.fullmatch(value.strip()) if isinstance(value, str) else None
    if not match:
        raise TemplateConfigError(f"{field} must be a hex colour such as #E5C158")
    raw = match.group(1).lower()
    if len(raw) == 3:
        raw = "".join(ch * 2 for ch in raw)
    return f"#{raw}"


def _choice(value: Any, allowed: tuple[str, ...], field: str) -> str:
    text = value.strip().lower() if isinstance(value, str) else ""
    if text not in allowed:
        raise TemplateConfigError(f"{field} must be one of: {', '.join(allowed)}")
    return text


def _flag(value: Any, field: str) -> bool:
    if not isinstance(value, bool):
        raise TemplateConfigError(f"{field} must be true or false")
    return value


def _opacity(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TemplateConfigError("overlay_opacity must be a number between 0 and 1")
    number = float(value)
    if number != number or not 0.0 <= number <= 1.0:
        raise TemplateConfigError("overlay_opacity must be a number between 0 and 1")
    return round(number, 2)


def is_private_host(host: str) -> bool:
    """True for hostnames that obviously point at the local machine or a private network."""
    host = host.strip("[]").lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith((".local", ".internal", ".localhost")):
        return True
    try:
        return not ipaddress.ip_address(host).is_global
    except ValueError:
        return False


def logo_url_error(value: str) -> str | None:
    """Reason a logo URL is not allowed, or None when it is a public http(s) URL."""
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return "logo_url must be an http(s) image URL (or upload a logo)"
    if parsed.username or parsed.password:
        return "logo_url must not contain credentials"
    if is_private_host(parsed.hostname):
        return "logo_url must point to a public address"
    return None


def _logo_url(value: Any) -> str:
    """'' means "use the brand logo". Only public http(s) URLs are accepted.

    The renderer treats any other string as a *local file path*, so paths and
    other schemes are rejected here, before they can reach it.
    """
    if value is None or value == "":
        return ""
    if not isinstance(value, str):
        raise TemplateConfigError("logo_url must be text")
    url = value.strip()
    if len(url) > LIMITS["logo_url"]:
        raise TemplateConfigError(f"logo_url must be {LIMITS['logo_url']} characters or fewer")
    error = logo_url_error(url)
    if error:
        raise TemplateConfigError(error)
    return url


# --------------------------------------------------------------------- presets --
def default_config(template_type: str) -> dict[str, Any]:
    """The built-in starting point for one template type."""
    for key, _name, _desc, headline, subtitle, cta, style in _PRESET_DATA:
        if key == template_type:
            return {
                "template_type": key, "headline": headline, "subtitle": subtitle, "cta": cta,
                "logo_url": "", "primary_color": "", "secondary_color": "",
                **DEFAULT_STYLE, **style,
            }
    raise TemplateConfigError(f"template_type must be one of: {', '.join(TEMPLATE_TYPES)}")


def preset_list() -> list[dict[str, Any]]:
    """All built-in presets, in Template Library order."""
    return [{"key": key, "name": name, "description": desc, "config": default_config(key)}
            for key, name, desc, *_ in _PRESET_DATA]


def preset_name(template_type: str) -> str:
    return next((name for key, name, *_ in _PRESET_DATA if key == template_type), template_type.title())


def sanitize_config(raw: dict[str, Any] | None, base: dict[str, Any] | None = None) -> dict[str, Any]:
    """Validate `raw` laid over `base` (default: the preset of its type); return a clean config.

    Unknown keys are dropped. Raises `TemplateConfigError` for invalid values.
    """
    raw = raw or {}
    if not isinstance(raw, dict):
        raise TemplateConfigError("config must be an object")
    template_type = _choice(raw.get("template_type", (base or {}).get("template_type")),
                            tuple(t.lower() for t in TEMPLATE_TYPES), "template_type").upper()
    start = base if base and base.get("template_type") == template_type else default_config(template_type)
    merged = {**start, **{k: v for k, v in raw.items() if k in DEFAULT_STYLE or k in COPY_FIELDS}}
    return {
        "template_type": template_type,
        "headline": _text(merged.get("headline"), "headline", LIMITS["headline"]),
        "subtitle": _text(merged.get("subtitle"), "subtitle", LIMITS["subtitle"]),
        "cta": _text(merged.get("cta"), "cta", LIMITS["cta"]),
        "logo_url": _logo_url(merged.get("logo_url")),
        "primary_color": _color(merged.get("primary_color"), "primary_color"),
        "secondary_color": _color(merged.get("secondary_color"), "secondary_color"),
        "font": _choice(merged.get("font"), FONTS, "font"),
        "text_align": _choice(merged.get("text_align"), TEXT_ALIGNS, "text_align"),
        "overlay_opacity": _opacity(merged.get("overlay_opacity")),
        "show_badge": _flag(merged.get("show_badge"), "show_badge"),
        "show_logo": _flag(merged.get("show_logo"), "show_logo"),
        "cta_position": _choice(merged.get("cta_position"), CTA_POSITIONS, "cta_position"),
        "logo_position": _choice(merged.get("logo_position"), LOGO_POSITIONS, "logo_position"),
        "button_style": _choice(merged.get("button_style"), BUTTON_STYLES, "button_style"),
    }


def clean_name(value: Any) -> str:
    name = _text(value, "name", LIMITS["name"])
    if not name:
        raise TemplateConfigError("name is required")
    return name
