"""Render Template Editor configs with the existing TemplateRenderer.

The editor never draws anything itself: a config is translated into the
`recommendation` / `settings` dicts that `TemplateRenderer.render_template`
already understands (plus the optional ``style`` block), so previews and the
exported final image come from exactly the same code path as the pipeline.
"""
from __future__ import annotations

import hashlib
import ipaddress
import logging
import os
import shutil
import socket
import tempfile
import time
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from PIL import Image, ImageDraw, ImageFilter

from services.template_config import DEFAULT_STYLE, logo_url_error
from services.template_renderer import TemplateRenderer

log = logging.getLogger("template_editor")

_TMP = Path(tempfile.gettempdir())
LOGO_DIR = _TMP / "interior-template-logos"
SAMPLE_DIR = _TMP / "interior-template-samples"
LOGO_TTL_SECONDS = 600
MAX_LOGO_BYTES = 5 * 1024 * 1024
MAX_LOGO_EDGE = 1024
PREVIEW_WIDTH = 540
SAMPLE_SIZES = {"portrait": (1080, 1350), "story": (1080, 1920)}


class TemplateRenderError(RuntimeError):
    """Raised when a template could not be rendered."""


# ------------------------------------------------------------------ logo handling --
def normalize_logo_image(data: bytes) -> bytes:
    """Validate an uploaded/downloaded logo and return it as a bounded RGBA PNG."""
    if not data:
        raise TemplateRenderError("The logo file is empty")
    if len(data) > MAX_LOGO_BYTES:
        raise TemplateRenderError("The logo file is larger than 5 MB")
    try:
        with Image.open(BytesIO(data)) as raw:
            raw.load()
            image = raw.convert("RGBA")
    except Exception as exc:
        raise TemplateRenderError("The logo is not a valid image (use PNG, JPG or WEBP)") from exc
    image.thumbnail((MAX_LOGO_EDGE, MAX_LOGO_EDGE), Image.LANCZOS)
    out = BytesIO()
    image.save(out, "PNG", optimize=True)
    return out.getvalue()


def _assert_public_host(host: str) -> None:
    """Refuse hosts that resolve to loopback / private / link-local addresses."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise TemplateRenderError(f"Logo host could not be resolved: {host}") from exc
    for info in infos:
        address = ipaddress.ip_address(info[4][0].split("%")[0])
        if not address.is_global:
            raise TemplateRenderError("logo_url must point to a public address")


def resolve_logo(url: str) -> Path:
    """Download a template logo once (cached) and return a local PNG path.

    Fetching here, instead of letting the renderer open the URL, lets the editor
    block private addresses and redirects and cap the download size.
    """
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    cached = LOGO_DIR / f"{hashlib.sha256(url.encode('utf-8')).hexdigest()[:40]}.png"
    if cached.is_file() and time.time() - cached.stat().st_mtime < LOGO_TTL_SECONDS:
        return cached

    problem = logo_url_error(url)
    if problem:
        raise TemplateRenderError(problem)
    _assert_public_host(urlparse(url).hostname or "")

    try:
        with requests.get(url, stream=True, timeout=(5, 10), allow_redirects=False,
                          headers={"User-Agent": "InteriorSocialAI/1.0"}) as response:
            if response.status_code != 200:
                raise TemplateRenderError(f"Logo download failed (HTTP {response.status_code})")
            data = b""
            for chunk in response.iter_content(64 * 1024):
                data += chunk
                if len(data) > MAX_LOGO_BYTES:
                    raise TemplateRenderError("The logo file is larger than 5 MB")
    except requests.RequestException as exc:
        raise TemplateRenderError("Logo could not be downloaded") from exc

    temp = cached.with_suffix(f".{os.getpid()}.tmp")
    temp.write_bytes(normalize_logo_image(data))
    temp.replace(cached)
    return cached


# ------------------------------------------------------------- config translation --
def build_recommendation(config: dict[str, Any]) -> dict[str, Any]:
    """Renderer recommendation (type, copy and style options) for a template config."""
    style = {key: config.get(key, default) for key, default in DEFAULT_STYLE.items()}
    return {
        "enabled": True,
        "type": config["template_type"],
        "headline": config.get("headline", ""),
        "subtitle": config.get("subtitle", ""),
        "cta": config.get("cta", ""),
        "style": style,
    }


def build_settings(config: dict[str, Any], brand: dict[str, Any], logo_path: Path | None = None) -> dict[str, Any]:
    """Brand settings for the renderer, with the template's own colours / logo applied."""
    settings = {
        "brand_name": brand.get("brand_name") or "",
        "brand_primary_color": config.get("primary_color") or brand.get("brand_primary_color") or "",
        "brand_secondary_color": config.get("secondary_color") or brand.get("brand_secondary_color") or "",
        "logo_url": brand.get("logo_url") or "",
    }
    if logo_path is not None:
        settings["logo_url"] = str(logo_path)
    return settings


# ------------------------------------------------------------------- sample image --
def sample_image_path(variant: str = "portrait") -> Path:
    """A neutral, room-like sample photo for previews that have no real media."""
    size = SAMPLE_SIZES.get(variant, SAMPLE_SIZES["portrait"])
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    path = SAMPLE_DIR / f"sample_{size[0]}x{size[1]}.jpg"
    if path.is_file():
        return path

    width, height = size
    wall = Image.linear_gradient("L").resize(size)
    image = Image.merge("RGB", (
        wall.point(lambda v: 150 + v * 40 // 255),
        wall.point(lambda v: 132 + v * 36 // 255),
        wall.point(lambda v: 112 + v * 30 // 255),
    ))
    draw = ImageDraw.Draw(image, "RGBA")
    floor_y = int(height * 0.68)
    draw.rectangle((0, floor_y, width, height), fill=(92, 70, 52, 255))
    draw.rectangle((int(width * 0.60), int(height * 0.14), int(width * 0.90), int(height * 0.46)),
                   fill=(236, 226, 205, 255))  # window
    draw.rounded_rectangle((int(width * 0.08), int(height * 0.50), int(width * 0.58), int(height * 0.68)),
                           radius=int(width * 0.03), fill=(70, 78, 88, 255))  # sofa
    draw.rounded_rectangle((int(width * 0.10), int(height * 0.44), int(width * 0.56), int(height * 0.54)),
                           radius=int(width * 0.03), fill=(86, 95, 106, 255))
    draw.ellipse((int(width * 0.30), int(height * 0.74), int(width * 0.78), int(height * 0.80)),
                 fill=(60, 44, 32, 160))  # rug shadow
    image = image.filter(ImageFilter.GaussianBlur(1.2))
    temp = path.with_suffix(f".{os.getpid()}.tmp")
    image.save(temp, "JPEG", quality=90)
    temp.replace(path)
    return path


# ------------------------------------------------------------------------ rendering --
def _resolved_logo(config: dict[str, Any]) -> Path | None:
    url = config.get("logo_url") or ""
    return resolve_logo(url) if url else None


def render_config(image_path: str | Path, config: dict[str, Any],
                  brand: dict[str, Any]) -> tuple[bytes, str | None]:
    """Render `config` over a photo with the TemplateRenderer.

    Returns the full-size JPEG bytes and a warning when the template's logo could
    not be loaded (the brand logo / name is used instead).
    """
    logo_error: str | None = None
    try:
        logo = _resolved_logo(config)
    except TemplateRenderError as exc:
        # A broken logo must not block previews; surface it and fall back to the brand logo.
        logo, logo_error = None, str(exc)
        log.warning("Template logo unavailable: %s", exc)

    work = Path(tempfile.mkdtemp(prefix="tpl_render_"))
    try:
        output = TemplateRenderer(output_dir=work).render_template(
            str(image_path), build_recommendation(config), build_settings(config, brand, logo))
        data = Path(output).read_bytes()
    except Exception as exc:
        log.exception("Template render failed")
        raise TemplateRenderError(f"Template could not be rendered: {exc}") from exc
    finally:
        shutil.rmtree(work, ignore_errors=True)

    return data, logo_error


def shrink_preview(jpeg: bytes) -> bytes:
    """Scale a rendered template down to a live-preview sized JPEG."""
    with Image.open(BytesIO(jpeg)) as image:
        ratio = PREVIEW_WIDTH / image.width
        small = image.convert("RGB").resize((PREVIEW_WIDTH, max(1, round(image.height * ratio))), Image.LANCZOS)
    out = BytesIO()
    small.save(out, "JPEG", quality=85)
    return out.getvalue()
