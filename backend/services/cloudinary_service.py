"""Cloudinary: storage of originals/edited media + auto-enhance transformations & smart crops."""
import asyncio
import cloudinary
import cloudinary.uploader
import cloudinary.api
from services.settings_service import cloudinary_ready
from services.image_editor import VARIANTS

ENHANCE = [{"effect": "improve:indoor:50"}, {"effect": "auto_color"}, {"effect": "auto_contrast"}, {"effect": "sharpen:60"}]


def _configure(s: dict):
    cloudinary.config(cloud_name=s["cloudinary_cloud_name"], api_key=s["cloudinary_api_key"],
                      api_secret=s["cloudinary_api_secret"], secure=True)


async def upload(s: dict, path: str, public_id: str, resource_type: str = "image") -> dict | None:
    if not cloudinary_ready(s):
        return None
    _configure(s)
    res = await asyncio.to_thread(cloudinary.uploader.upload, str(path), public_id=public_id,
                                  folder="interior-social-ai", resource_type=resource_type, overwrite=True)
    return {"public_id": res["public_id"], "url": res["secure_url"], "bytes": res.get("bytes", 0)}


def _overlay(s: dict) -> list:
    text = s.get("watermark_text") or s.get("brand_name")
    if not s.get("watermark_enabled") or not text:
        return []
    return [{"overlay": {"font_family": "Arial", "font_size": 34, "text": text},
             "gravity": "south_east", "x": 36, "y": 36, "opacity": 65, "color": "#FFFFFF"}]


def enhanced_url(s: dict, public_id: str) -> str:
    _configure(s)
    return cloudinary.CloudinaryImage(public_id).build_url(
        transformation=ENHANCE + [{"quality": "auto", "fetch_format": "jpg"}])


def variant_urls(s: dict, public_id: str) -> dict:
    _configure(s)
    out = {}
    for name, (w, h) in VARIANTS.items():
        out[name] = cloudinary.CloudinaryImage(public_id).build_url(transformation=ENHANCE + [
            {"width": w, "height": h, "crop": "fill", "gravity": "auto"}] + _overlay(s) + [
            {"quality": "auto", "fetch_format": "jpg"}])
    return out


async def ping(s: dict) -> dict:
    _configure(s)
    return await asyncio.to_thread(cloudinary.api.ping)
