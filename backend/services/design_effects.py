"""Renderer-independent, JSON-safe effect records and Pillow raster adapter."""
from __future__ import annotations

import json
import math
import random
from typing import Any

import numpy as np
from PIL import Image, ImageChops, ImageColor, ImageDraw, ImageEnhance, ImageFilter, ImageOps

EFFECT_TYPES = {
    "drop-shadow", "inner-shadow", "outer-glow", "blur", "glass", "opacity", "blend-mode",
    "gradient-fill", "gradient-border", "stroke", "rounded-corners", "mask", "clipping",
    "color-overlay", "image-filters", "brightness", "contrast", "highlights", "temperature",
    "tint", "vignette", "noise", "film-grain",
}
BLEND_MODES = {"normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion"}


def validate_effects(effects: Any) -> list[str]:
    if effects is None:
        return []
    if not isinstance(effects, list):
        return ["effects must be a list"]
    errors: list[str] = []
    seen: set[str] = set()
    for index, effect in enumerate(effects):
        path = f"effects[{index}]"
        if not isinstance(effect, dict):
            errors.append(f"{path} must be an object")
            continue
        if not isinstance(effect.get("id"), str) or not effect["id"]:
            errors.append(f"{path}.id must be a non-empty string")
        elif effect["id"] in seen:
            errors.append(f"{path}.id must be unique")
        else:
            seen.add(effect["id"])
        if not isinstance(effect.get("type"), str) or effect.get("type") not in EFFECT_TYPES:
            errors.append(f"{path}.type is unsupported")
        if "opacity" in effect and (not isinstance(effect["opacity"], (int, float)) or isinstance(effect["opacity"], bool) or not 0 <= effect["opacity"] <= 1):
            errors.append(f"{path}.opacity must be between 0 and 1")
        if "blendMode" in effect and (not isinstance(effect["blendMode"], str) or effect["blendMode"] not in BLEND_MODES):
            errors.append(f"{path}.blendMode is unsupported")
        if "enabled" in effect and not isinstance(effect["enabled"], bool):
            errors.append(f"{path}.enabled must be a boolean")
        for key in ("blur", "spread", "width", "radius", "amount"):
            number = effect.get(key)
            if key in effect and (isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not 0 <= number <= 1000):
                errors.append(f"{path}.{key} must be between 0 and 1000")
        for key in ("offsetX", "offsetY", "temperature", "tint"):
            number = effect.get(key)
            if key in effect and (isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not -1000 <= number <= 1000):
                errors.append(f"{path}.{key} must be between -1000 and 1000")
        if "color" in effect and not isinstance(effect["color"], str):
            errors.append(f"{path}.color must be text")
    return errors


def serialize_effects(effects: list[dict[str, Any]]) -> str:
    errors = validate_effects(effects)
    if errors:
        raise ValueError("; ".join(errors))
    return json.dumps(effects, separators=(",", ":"), sort_keys=True)


def deserialize_effects(value: str) -> list[dict[str, Any]]:
    try:
        effects = json.loads(value)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Effects must be valid JSON") from exc
    errors = validate_effects(effects)
    if errors:
        raise ValueError("; ".join(errors))
    return effects


def _rgba(color: Any, opacity: float = 1.0) -> tuple[int, int, int, int]:
    try:
        rgb = ImageColor.getrgb(str(color or "#000000"))[:3]
    except ValueError:
        rgb = (0, 0, 0)
    return (*rgb, int(max(0, min(1, opacity)) * 255))


def _gradient(size: tuple[int, int], gradient: dict[str, Any], palette: dict[str, Any]) -> Image.Image:
    width, height = size
    colors = []
    for stop in gradient.get("stops", []):
        value = stop.get("color", "#000000")
        if isinstance(value, str) and value.startswith("$"):
            value = palette.get(value[1:], "#000000")
        colors.append((max(0.0, min(1.0, float(stop.get("position", 0)))), _rgba(value, stop.get("opacity", 1))))
    if len(colors) < 2:
        colors = [(0, _rgba("#000000")), (1, _rgba("#ffffff"))]
    colors.sort(key=lambda item: item[0])
    yy, xx = np.mgrid[0:height, 0:width]
    angle = math.radians(float(gradient.get("angle", 0)))
    if gradient.get("type") == "radial":
        position = np.sqrt(((xx - width / 2) / max(1, width / 2)) ** 2 + ((yy - height / 2) / max(1, height / 2)) ** 2) / math.sqrt(2)
    else:
        position = ((xx - width / 2) * math.cos(angle) + (yy - height / 2) * math.sin(angle)) / (abs(width * math.cos(angle)) + abs(height * math.sin(angle)) + 1e-8) + .5
    channels = []
    for channel in range(4):
        result = np.zeros((height, width), dtype=np.uint8)
        for segment in range(len(colors) - 1):
            left, c1 = colors[segment]; right, c2 = colors[segment + 1]
            fraction = np.clip((position - left) / max(1e-6, right - left), 0, 1)
            mask = (position >= left) & ((position <= right) if segment == len(colors) - 2 else (position < right))
            result[mask] = (c1[channel] + (c2[channel] - c1[channel]) * fraction[mask]).astype(np.uint8)
        result[position < colors[0][0]] = colors[0][1][channel]
        result[position > colors[-1][0]] = colors[-1][1][channel]
        channels.append(result)
    return Image.fromarray(np.stack(channels, axis=2), "RGBA")


def _blend(base: Image.Image, overlay: Image.Image, mode: str, opacity: float) -> Image.Image:
    base = base.convert("RGBA"); overlay = overlay.convert("RGBA")
    a = np.asarray(base).astype(np.float32); b = np.asarray(overlay).astype(np.float32)
    alpha = (b[:, :, 3:4] / 255 * max(0, min(1, opacity)))
    x, y = a[:, :, :3] / 255, b[:, :, :3] / 255
    if mode == "multiply": mixed = x * y
    elif mode == "screen": mixed = 1 - (1 - x) * (1 - y)
    elif mode == "overlay": mixed = np.where(x <= .5, 2 * x * y, 1 - 2 * (1 - x) * (1 - y))
    elif mode == "hard-light": mixed = np.where(y <= .5, 2 * x * y, 1 - 2 * (1 - x) * (1 - y))
    elif mode == "soft-light": mixed = (1 - 2 * y) * x * x + 2 * y * x
    elif mode == "darken": mixed = np.minimum(x, y)
    elif mode == "lighten": mixed = np.maximum(x, y)
    elif mode == "color-dodge": mixed = np.minimum(1, x / np.maximum(1e-6, 1 - y))
    elif mode == "color-burn": mixed = 1 - np.minimum(1, (1 - x) / np.maximum(1e-6, y))
    elif mode == "difference": mixed = np.abs(x - y)
    elif mode == "exclusion": mixed = x + y - 2 * x * y
    else: mixed = y
    rgb = (x * (1 - alpha) + mixed * alpha) * 255
    a[:, :, :3] = rgb
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def _shadow(layer: Image.Image, effect: dict[str, Any], inner: bool = False, glow: bool = False) -> Image.Image:
    width, height = layer.size
    blur = max(0, int(effect.get("blur", 12)))
    dx, dy = int(effect.get("offsetX", 0)), int(effect.get("offsetY", 4))
    mask = layer.getchannel("A")
    if effect.get("spread", 0):
        size = max(3, int(effect.get("spread", 0)) * 2 + 1)
        mask = mask.filter(ImageFilter.MaxFilter(size if size % 2 else size + 1))
    mask = mask.filter(ImageFilter.GaussianBlur(blur))
    if inner:
        shifted = Image.new("L", (width, height)); shifted.paste(mask, (dx, dy))
        mask = ImageChops.subtract(ImageChops.invert(shifted), ImageChops.invert(layer.getchannel("A")))
        shadow = Image.new("RGBA", (width, height), _rgba(effect.get("color", "#000000"), effect.get("opacity", .4)))
        shadow.putalpha(mask.point(lambda value: int(value * max(0, min(1, effect.get("opacity", .4))))))
        layer.alpha_composite(shadow)
        return layer
    shadow = Image.new("RGBA", (width, height), _rgba(effect.get("color", "#000000"), effect.get("opacity", .35)))
    shadow.putalpha(mask.point(lambda value: int(value * max(0, min(1, effect.get("opacity", .35))))))
    shifted = Image.new("RGBA", (width, height)); shifted.alpha_composite(shadow, (dx, dy))
    if glow: shifted = Image.new("RGBA", (width, height), _rgba(effect.get("color", "#ffffff"), effect.get("opacity", .5))); shifted.putalpha(mask.filter(ImageFilter.GaussianBlur(blur)))
    shifted.alpha_composite(layer)
    return shifted


def apply_element_effects(layer: Image.Image, element: dict[str, Any], palette: dict[str, Any] | None = None) -> Image.Image:
    """Apply serialized element effects to an RGBA layer; no browser or renderer types leak in."""
    palette = palette or {}
    raw_effects = element.get("effects", [])
    effects = [effect for effect in raw_effects if isinstance(effect, dict) and effect.get("enabled", True)] if isinstance(raw_effects, list) else []
    if isinstance(element.get("shadow"), dict):
        shadow = element["shadow"]
        effects = [{"id": "legacy-shadow", "type": "drop-shadow", "color": shadow.get("color", "#000000"), "blur": shadow.get("blur", 0), "offsetX": shadow.get("offsetX", 0), "offsetY": shadow.get("offsetY", 0)}, *effects]
    opacity = max(0, min(1, float(element.get("opacity", 1))))
    brightness = float(element.get("brightness", 1)); contrast = float(element.get("contrast", 1)); saturation = float(element.get("saturation", 1))
    for effect in effects:
        kind = effect.get("type")
        if kind == "opacity": opacity *= max(0, min(1, float(effect.get("opacity", 1))))
        elif kind == "brightness": brightness *= float(effect.get("amount", 1))
        elif kind == "contrast": contrast *= float(effect.get("amount", 1))
        elif kind == "image-filters": saturation *= float(effect.get("amount", 1))
    if brightness != 1: layer = ImageEnhance.Brightness(layer).enhance(max(0, brightness))
    if contrast != 1: layer = ImageEnhance.Contrast(layer).enhance(max(0, contrast))
    if saturation != 1: layer = ImageEnhance.Color(layer).enhance(max(0, saturation))
    if element.get("blur", 0): layer = layer.filter(ImageFilter.GaussianBlur(float(element["blur"])))
    for effect in effects:
        kind = effect.get("type"); amount = float(effect.get("amount", 0)); color = effect.get("color", "#000000")
        if kind in {"drop-shadow", "outer-glow", "inner-shadow"}: layer = _shadow(layer, effect, kind == "inner-shadow", kind == "outer-glow")
        elif kind == "blur": layer = layer.filter(ImageFilter.GaussianBlur(max(0, float(effect.get("blur", 0)))))
        elif kind == "glass":
            wash = Image.new("RGBA", layer.size, (255, 255, 255, int(255 * effect.get("opacity", .2))))
            layer = Image.alpha_composite(layer, wash)
        elif kind == "opacity": pass
        elif kind == "blend-mode": pass  # applied against the accumulated canvas below
        elif kind == "gradient-fill":
            gradient = effect.get("gradient")
            if isinstance(gradient, dict):
                fill = _gradient(layer.size, gradient, palette); fill.putalpha(ImageChops.multiply(fill.getchannel("A"), layer.getchannel("A"))); layer = fill
        elif kind == "gradient-border":
            gradient = effect.get("gradient")
            if isinstance(gradient, dict):
                ring = _gradient(layer.size, gradient, palette); mask = Image.new("L", layer.size); draw = ImageDraw.Draw(mask); width = max(1, int(effect.get("width", 2))); draw.rectangle((0, 0, layer.width - 1, layer.height - 1), fill=255); draw.rectangle((width, width, max(width, layer.width - width), max(width, layer.height - width)), fill=0); ring.putalpha(mask); layer.alpha_composite(ring)
        elif kind == "stroke":
            draw = ImageDraw.Draw(layer); draw.rounded_rectangle((1, 1, layer.width - 2, layer.height - 2), radius=int(element.get("radius", 0)), outline=_rgba(color, effect.get("opacity", 1)), width=max(1, int(effect.get("width", 1))))
        elif kind == "rounded-corners" or kind == "clipping" or (kind == "mask" and not effect.get("sourceId")):
            shape = effect.get("shape", "rounded"); mask = Image.new("L", layer.size); draw = ImageDraw.Draw(mask)
            if shape == "rect": mask.paste(255, (0, 0, layer.width, layer.height))
            elif shape == "circle": draw.ellipse((0, 0, layer.width, layer.height), fill=255)
            elif shape == "ellipse": draw.ellipse((0, layer.height * .12, layer.width, layer.height * .88), fill=255)
            elif shape == "diamond": draw.polygon([(layer.width / 2, 0), (layer.width, layer.height / 2), (layer.width / 2, layer.height), (0, layer.height / 2)], fill=255)
            elif shape == "rounded" or kind == "rounded-corners": draw.rounded_rectangle((0, 0, layer.width, layer.height), radius=max(0, int(effect.get("radius", 12))), fill=255)
            layer.putalpha(ImageChops.multiply(layer.getchannel("A"), mask))
        elif kind == "color-overlay": layer = _blend(layer, Image.new("RGBA", layer.size, _rgba(color)), effect.get("blendMode", "normal"), float(effect.get("opacity", 1)))
        elif kind == "highlights": layer = ImageEnhance.Brightness(layer).enhance(max(0, 1 + amount * .35))
        elif kind in {"temperature", "tint"}:
            tone = (255, 178, 90) if kind == "temperature" and float(effect.get("temperature", amount)) >= 0 else (88, 150, 255) if kind == "temperature" else (190, 90, 180)
            layer = _blend(layer, Image.new("RGBA", layer.size, (*tone, 255)), "overlay", min(.45, abs(float(effect.get("temperature", amount) if kind == "temperature" else effect.get("tint", amount))) / 300))
        elif kind == "vignette":
            w, h = layer.size; yy, xx = np.mgrid[0:h, 0:w]; distance = np.sqrt(((xx - w / 2) / max(w / 2, 1)) ** 2 + ((yy - h / 2) / max(h / 2, 1)) ** 2); alpha = np.clip((distance - .45) / .6, 0, 1) * max(0, min(1, amount or .45)); shade = Image.new("RGBA", (w, h), (0, 0, 0, 0)); shade.putalpha(Image.fromarray((alpha * 255).astype("uint8"))); layer.alpha_composite(shade)
        elif kind in {"noise", "film-grain"}:
            rng = np.random.default_rng(int(effect.get("seed", 1))); pixels = np.asarray(layer).astype(np.int16); noise = rng.normal(0, max(1, amount * 80), pixels[:, :, :3].shape[:2] + (1,)); pixels[:, :, :3] = np.clip(pixels[:, :, :3] + noise, 0, 255); layer = Image.fromarray(pixels.astype("uint8"), "RGBA")
    if opacity < 1: layer.putalpha(layer.getchannel("A").point(lambda alpha: int(alpha * opacity)))
    return layer
