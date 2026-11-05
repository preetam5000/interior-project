"""Pillow renderer for saved DesignTemplate v2 documents in editor configs."""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont, ImageOps

from services.design_effects import _blend, apply_element_effects
from services.template_renderer import heading_font, parse_color, sans_font, wrap_text

OUTPUT_SIZES = {"portrait": (1080, 1350), "story": (1080, 1920)}
TEXT_TYPES = {"Text", "Heading", "Subtitle", "Body Text", "Social Handle", "CTA Button", "Badge"}
SHAPE_TYPES = {"Shape", "Gradient", "Decorative Object", "Divider", "Progress Bar"}


def _resolved_color(value: Any, palette: dict[str, Any], fallback: tuple[int, int, int]) -> tuple[int, int, int]:
    if isinstance(value, str) and value.startswith("$"):
        value = palette.get(value[1:], value)
    return parse_color(value, fallback)


def _content(value: Any, config: dict[str, Any]) -> str:
    if not isinstance(value, str):
        return ""
    if value.startswith("content.headline"):
        return str(config.get("headline") or value.partition("|")[2])
    if value.startswith("content.subtitle"):
        return str(config.get("subtitle") or value.partition("|")[2])
    if value.startswith("content.cta"):
        return str(config.get("cta") or value.partition("|")[2])
    return value


def _font(element: dict[str, Any], size: int) -> ImageFont.ImageFont:
    family = str(element.get("fontFamily") or "").lower()
    key = "sans" if any(name in family for name in ("sans", "inter", "arial", "montserrat")) else "serif"
    return heading_font(key, max(1, size))


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.splitlines() or [text]:
        lines.extend(wrap_text(draw, paragraph, font, max(1, width), 100) or [""])
    return lines


def _node_layer(
    source: Image.Image,
    element: dict[str, Any],
    document: dict[str, Any],
    config: dict[str, Any],
    logo_path: Path | None,
    scale_x: float,
    scale_y: float,
) -> tuple[Image.Image, tuple[int, int]] | None:
    if not element.get("visible", True):
        return None
    canvas = document["canvas"]
    x = int(round(float(element["x"]) * canvas["width"] * scale_x))
    y = int(round(float(element["y"]) * canvas["height"] * scale_y))
    width = max(1, int(round(float(element["width"]) * canvas["width"] * scale_x)))
    height = max(1, int(round(float(element["height"]) * canvas["height"] * scale_y)))
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    opacity = max(0.0, min(1.0, float(element.get("opacity", 1))))
    palette = document.get("branding", {}).get("palette", {})
    fallback = (245, 245, 245)
    kind = element.get("type")
    style = element.get("style") if isinstance(element.get("style"), dict) else {}
    fill = _resolved_color(element.get("color") or style.get("background"), palette, fallback)
    alpha = 255  # Effect adapter applies element and effect opacity once after drawing.

    if kind in {"Image", "Logo"}:
        image_path = logo_path if kind == "Logo" else None
        if kind == "Logo" and image_path is None:
            return None
        try:
            with Image.open(image_path or source) as raw:
                fit = element.get("crop", "cover")
                if fit == "contain":
                    image = raw.convert("RGBA")
                    image.thumbnail((width, height), Image.LANCZOS)
                    layer.alpha_composite(image, ((width - image.width) // 2, (height - image.height) // 2))
                else:
                    image = ImageOps.fit(raw.convert("RGBA"), (width, height), Image.LANCZOS)
                    layer.alpha_composite(image)
        except (OSError, ValueError):
            return None
    elif kind in SHAPE_TYPES or kind in {"Badge", "CTA Button", "Sticker", "QR Code", "Frame"}:
        background = style.get("background") or element.get("gradient", {}).get("stops", [{}])[0].get("color") or element.get("color")
        fill = _resolved_color(background, palette, fallback)
        radius = max(0, int(round(float(element.get("borderRadius", element.get("radius", 0))) * scale_x)))
        if kind == "Divider":
            draw.rectangle((0, 0, width, height), fill=(*fill, alpha))
        elif kind == "Progress Bar":
            progress = max(0.0, min(100.0, float(element.get("progress", 0)))) / 100
            draw.rounded_rectangle((0, 0, width, height), radius=radius, fill=(128, 128, 128, int(alpha * .3)))
            draw.rounded_rectangle((0, 0, int(width * progress), height), radius=radius, fill=(*fill, alpha))
        else:
            draw.rounded_rectangle((0, 0, width, height), radius=radius, fill=(*fill, alpha))
        border = element.get("border")
        if isinstance(border, dict) and border.get("color"):
            stroke = _resolved_color(border["color"], palette, fallback)
            draw.rounded_rectangle((1, 1, max(1, width - 2), max(1, height - 2)), radius=radius, outline=(*stroke, alpha), width=max(1, int(border.get("width", 1) * scale_x)))

    if kind in TEXT_TYPES or kind in {"Icon", "QR Code"}:
        text = _content(element.get("content") or element.get("icon"), config)
        if text:
            text_color = _resolved_color(element.get("color"), palette, (30, 30, 30))
            padding_value = element.get("padding", 4)
            if isinstance(padding_value, dict):
                pad = int(max(padding_value.get("left", 0), padding_value.get("top", 0)) * scale_x)
            else:
                pad = int(float(padding_value or 0) * scale_x)
            font_size = max(1, int(round(float(element.get("fontSize", 24)) * scale_x)))
            font = _font(element, font_size)
            lines = _wrap(draw, text, font, max(1, width - 2 * pad))
            line_height = max(1, int(font_size * float(element.get("lineHeight", 1.2))))
            total_height = len(lines) * line_height
            top = max(pad, (height - total_height) // 2)
            align = element.get("alignment", "left")
            for line in lines:
                bbox = draw.textbbox((0, 0), line, font=font)
                line_width = bbox[2] - bbox[0]
                left = pad if align == "left" else (width - line_width) // 2 if align == "center" else width - line_width - pad
                draw.text((left, top), line, font=font, fill=(*text_color, alpha))
                top += line_height

    rotation = float(element.get("rotation", 0))
    if rotation:
        layer = layer.rotate(-rotation, resample=Image.Resampling.BICUBIC, expand=True)
        x -= (layer.width - width) // 2
        y -= (layer.height - height) // 2
    layer = apply_element_effects(layer, element, palette)
    return layer, (x, y)


def render_design_document(
    image_path: str | Path,
    document: dict[str, Any],
    config: dict[str, Any],
    variant: str,
    logo_path: Path | None = None,
) -> bytes:
    """Render the persisted v2 document; legacy configs without it use the old renderer."""
    size = OUTPUT_SIZES.get(variant, OUTPUT_SIZES["portrait"])
    with Image.open(image_path) as raw:
        source = ImageOps.fit(ImageOps.exif_transpose(raw).convert("RGBA"), size, Image.LANCZOS)
    document_canvas = document["canvas"]
    scale_x = size[0] / float(document_canvas["width"])
    scale_y = size[1] / float(document_canvas["height"])
    background = document.get("background", {})
    palette = document.get("branding", {}).get("palette", {})
    base_color = _resolved_color(background.get("color"), palette, (255, 255, 255))
    canvas = Image.new("RGBA", size, (*base_color, 255))
    ordered = sorted(document.get("elements", []), key=lambda item: item.get("zIndex", 0))
    rendered_layers: dict[str, tuple[Image.Image, tuple[int, int]]] = {}
    for element in ordered:
        rendered = _node_layer(source, element, document, config, logo_path, scale_x, scale_y)
        if rendered is None:
            continue
        layer, position = rendered
        rendered_layers[str(element.get("id", ""))] = (layer, position)
    for element in ordered:
        rendered = rendered_layers.get(str(element.get("id", "")))
        if rendered is None:
            continue
        layer, position = rendered
        for effect in element.get("effects", []) if isinstance(element.get("effects"), list) else []:
            if effect.get("type") == "mask" and effect.get("sourceId") in rendered_layers:
                mask_layer, mask_position = rendered_layers[effect["sourceId"]]
                mask = Image.new("L", layer.size, 0)
                canvas_mask = Image.new("L", size, 0)
                canvas_mask.paste(mask_layer.getchannel("A"), mask_position)
                mask.paste(canvas_mask.crop((position[0], position[1], position[0] + layer.width, position[1] + layer.height)), (0, 0))
                if effect.get("invert"):
                    mask = ImageOps.invert(mask)
                layer.putalpha(ImageChops.multiply(layer.getchannel("A"), mask))
        blend_mode = next((effect.get("blendMode") for effect in reversed(element.get("effects", [])) if effect.get("type") == "blend-mode"), "normal")
        if blend_mode and blend_mode != "normal":
            left, top = position
            clipped_left, clipped_top = max(0, left), max(0, top)
            clipped_right, clipped_bottom = min(size[0], left + layer.width), min(size[1], top + layer.height)
            if clipped_right <= clipped_left or clipped_bottom <= clipped_top:
                continue
            crop = layer.crop((clipped_left - left, clipped_top - top, clipped_right - left, clipped_bottom - top))
            under = canvas.crop((clipped_left, clipped_top, clipped_right, clipped_bottom))
            blended = _blend(under, crop, blend_mode, 1)
            canvas.paste(blended, (clipped_left, clipped_top))
        else:
            canvas.alpha_composite(layer, position)
    output = BytesIO()
    canvas.convert("RGB").save(output, "JPEG", quality=92, optimize=True, progressive=True)
    return output.getvalue()
