"""Luxury social-media template rendering engine built on Pillow.

The renderer takes an enhanced photograph plus a template recommendation and
produces a branded, ready-to-publish social image.

Design language
    * minimal, elegant, premium
    * semi-transparent scrims and subtle gradients (never opaque blocks)
    * rounded badges with soft shadows and gold accent colours
    * large serif headline, smaller subtitle, small CTA, small logo
    * all overlays stay inside the safe area so furniture stays visible

Public API
    TemplateRenderer().render_template(image_path, recommendation, settings) -> str

Optional styling
    ``recommendation["style"]`` may carry template-editor options: font, text_align,
    overlay_opacity, show_badge, show_logo, cta_position and logo_position. When it
    is absent the output is identical to the original layouts.
"""
from __future__ import annotations

import logging
import os
import re
import urllib.request
import uuid
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Sequence

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

log = logging.getLogger("template_renderer")

# --------------------------------------------------------------- constants --
CANVAS_STORY = (1080, 1920)
CANVAS_PORTRAIT = (1080, 1350)

GOLD = (201, 162, 39)
GOLD_SOFT = (226, 202, 124)
INK = (16, 16, 18)

DEFAULT_PRIMARY = GOLD
DEFAULT_SECONDARY = INK

MARGIN_RATIO = 0.075
MAX_HEADLINE_LINES = 3
MAX_SUBTITLE_LINES = 2

# Template-editor options (all optional; the defaults reproduce the original look).
DEFAULT_OVERLAY_OPACITY = 0.6  # opacity at which the scrims keep their original strength
FONT_KEYS = ("serif", "classic", "sans", "modern")
TEXT_ALIGNMENTS = ("left", "center", "right")
CTA_POSITIONS = ("stack", "top_right", "bottom_left", "bottom_center", "bottom_right")
LOGO_POSITIONS = ("top_left", "top_center", "top_right", "bottom_left", "bottom_center", "bottom_right")
BUTTON_STYLES = ("rounded", "square", "outline")

SERIF_FILES = (
    "playfairdisplay-regular.ttf",
    "playfairdisplay.ttf",
    "playfair_display-regular.ttf",
    "dejavuserif.ttf",
    "times.ttf",
    "timesnewroman.ttf",
    "georgia.ttf",
    "constan.ttf",
    "cambria.ttc",
    "nimbusroman-regular.ttf",
    "freeserif.ttf",
    "liberationserif-regular.ttf",
    "serif.ttf",
)

SANS_FILES = (
    "inter-regular.ttf",
    "segoeui.ttf",
    "arial.ttf",
    "helvetica.ttf",
    "dejavusans.ttf",
    "verdana.ttf",
    "tahoma.ttf",
    "calibri.ttf",
)

FONT_SUFFIXES = {".ttf", ".otf", ".ttc"}

# Headline fonts offered by the editor. "serif" (Playfair) and "sans" reuse the lists above.
FONT_CHOICES = {
    "classic": ("georgia.ttf", "times.ttf", "timesnewroman.ttf", "dejavuserif.ttf",
                 "liberationserif-regular.ttf", "freeserif.ttf"),
    "modern": ("montserrat-semibold.ttf", "poppins-semibold.ttf", "segoeuib.ttf", "arialbd.ttf",
                "dejavusans-bold.ttf", "verdanab.ttf"),
}

# ------------------------------------------------------------- font lookups --
def _font_dirs() -> list[Path]:
    """Directories that may contain Playfair Display or a serif fallback."""
    dirs: list[Path] = []
    here = Path(__file__).resolve().parent
    dirs.append(here / "fonts")
    dirs.append(here.parent / "fonts")
    dirs.append(here.parent.parent / "fonts")

    windir = os.environ.get("WINDIR") or os.environ.get("SystemRoot")
    if windir:
        dirs.append(Path(windir) / "Fonts")
    local = os.environ.get("LOCALAPPDATA")
    if local:
        dirs.append(Path(local) / "Microsoft" / "Windows" / "Fonts")

    dirs += [
        Path("/usr/share/fonts"),
        Path("/usr/local/share/fonts"),
        Path("/Library/Fonts"),
        Path("/System/Library/Fonts"),
        Path.home() / ".fonts",
        Path.home() / ".local" / "share" / "fonts",
    ]
    unique: list[Path] = []
    for d in dirs:
        if d not in unique:
            unique.append(d)
    return unique


@lru_cache(maxsize=1)
def _playfair_path() -> str | None:
    """Return the path of a Playfair Display font file when one is installed."""
    for root in _font_dirs():
        try:
            if not root.is_dir():
                continue
            for path in sorted(root.rglob("*")):
                if path.suffix.lower() not in FONT_SUFFIXES:
                    continue
                if "playfair" in path.name.lower():
                    return str(path)
        except OSError:
            continue
    return None


@lru_cache(maxsize=8)
def _named_font_path(candidates: Sequence[str]) -> str | None:
    lowered = {name.lower() for name in candidates}
    for root in _font_dirs():
        try:
            if not root.is_dir():
                continue
            for path in sorted(root.rglob("*")):
                if path.suffix.lower() not in FONT_SUFFIXES:
                    continue
                if path.name.lower() in lowered:
                    return str(path)
        except OSError:
            continue
    return None


@lru_cache(maxsize=256)
def _load_truetype(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


@lru_cache(maxsize=256)
def _fallback_font(size: int) -> ImageFont.FreeTypeFont:
    """Last-resort font so rendering never fails because of a missing file."""
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # very old Pillow
        return ImageFont.load_default()


def serif_font(size: int) -> ImageFont.FreeTypeFont:
    """Playfair Display when available, otherwise any installed serif."""
    path = _playfair_path() or _named_font_path(SERIF_FILES)
    if not path:
        log.warning("No serif font found; falling back to the built-in font")
        return _fallback_font(size)
    try:
        return _load_truetype(path, size)
    except OSError:
        log.warning("Serif font %s could not be loaded", path)
        return _fallback_font(size)


def sans_font(size: int) -> ImageFont.FreeTypeFont:
    """Clean sans-serif used for the small supporting copy."""
    path = _named_font_path(SANS_FILES)
    if not path:
        return serif_font(size)
    try:
        return _load_truetype(path, size)
    except OSError:
        return serif_font(size)


def heading_font(key: str, size: int) -> ImageFont.FreeTypeFont:
    """Headline font for an editor font key; unknown keys keep the serif default."""
    if key == "sans":
        return sans_font(size)
    files = FONT_CHOICES.get(key)
    if files:
        path = _named_font_path(files)
        if path:
            try:
                return _load_truetype(path, size)
            except OSError:
                log.warning("Font %s could not be loaded", path)
    return serif_font(size)


# ------------------------------------------------------------------ colours --
def parse_color(value: object, fallback: tuple[int, int, int]) -> tuple[int, int, int]:
    """Accept #RGB, #RRGGBB, rgb(...) or an RGB tuple; never raise."""
    if isinstance(value, (tuple, list)) and len(value) >= 3:
        try:
            return tuple(max(0, min(255, int(c))) for c in value[:3])  # type: ignore[return-value]
        except (TypeError, ValueError):
            return fallback
    if not value:
        return fallback
    text = str(value).strip()
    hex_match = re.fullmatch(r"#?([0-9a-fA-F]{6})", text)
    if hex_match:
        raw = hex_match.group(1)
        return tuple(int(raw[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    short = re.fullmatch(r"#?([0-9a-fA-F]{3})", text)
    if short:
        return tuple(int(c * 2, 16) for c in short.group(1))  # type: ignore[return-value]
    rgb = re.fullmatch(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)", text, re.IGNORECASE)
    if rgb:
        return tuple(int(rgb.group(i)) for i in (1, 2, 3))  # type: ignore[return-value]
    log.debug("Unrecognised colour %r; using fallback %s", value, fallback)
    return fallback


def mix(first: tuple[int, int, int], second: tuple[int, int, int], ratio: float) -> tuple[int, int, int]:
    """Blend two colours; ratio 0 keeps `first`, ratio 1 yields `second`."""
    ratio = max(0.0, min(1.0, ratio))
    return tuple(int(a + (b - a) * ratio) for a, b in zip(first, second))  # type: ignore[return-value]


def luminance(color: tuple[int, int, int]) -> float:
    return (0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]) / 255.0


# ------------------------------------------------------------ text utilities --
def text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> int:
    """Width of a text run in pixels."""
    if not text:
        return 0
    bbox = draw.textbbox((0, 0), text, font=font)
    return int(bbox[2] - bbox[0])


def line_height(draw: ImageDraw.ImageDraw, font: ImageFont.ImageFont) -> int:
    """Line height for a font: the distance between two consecutive baselines.

    Using the font ascent keeps the spacing consistent with the way the text
    is drawn, so stacked lines never overlap.
    """
    try:
        ascent, descent = font.getmetrics()
        height = int(ascent + descent)
    except (AttributeError, OSError):
        bbox = draw.textbbox((0, 0), "Ag", font=font)
        height = int(bbox[3] - bbox[1])
    return max(1, height)


def _ellipsize(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> str:
    """Trim a line and append an ellipsis so it fits inside `max_width`."""
    if text_width(draw, text, font) <= max_width:
        return text
    trimmed = text
    while trimmed and text_width(draw, trimmed + "...", font) > max_width:
        trimmed = trimmed[:-1]
    return (trimmed.rstrip() + "...") if trimmed else ""


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont,
              max_width: int, max_lines: int) -> list[str]:
    """Greedy word wrap with an ellipsis when the text exceeds `max_lines`."""
    text = " ".join(str(text or "").split())
    if not text:
        return []

    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if text_width(draw, candidate, font) <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
            if len(lines) == max_lines:
                break
    if current and len(lines) < max_lines:
        lines.append(current)

    if len(lines) == max_lines:
        consumed = " ".join(lines)
        if consumed != text:
            remainder = text[len(consumed):].strip()
            lines[-1] = _ellipsize(draw, f"{lines[-1]} {remainder}".strip(), font, max_width)
    return lines


def blend_text(canvas: Image.Image, xy: tuple[int, int], text: str,
               font: ImageFont.ImageFont, fill: tuple[int, int, int, int],
               anchor: str = "ink") -> None:
    """Draw translucent text onto an RGB canvas.

    Pillow's ``ImageDraw.text`` ignores the alpha component of a fill colour
    when the target image is RGB, which would paint opaque black shadows. The
    text is therefore rendered onto a small RGBA tile and composited through
    its own alpha channel.

    ``anchor="ink"`` places the top-left corner of the glyph ink at ``xy``;
    ``anchor="origin"`` behaves like ``ImageDraw.text`` and places the text
    origin there.
    """
    if not text:
        return

    bbox = ImageDraw.Draw(canvas).textbbox((0, 0), text, font=font)
    left, top = int(bbox[0]), int(bbox[1])
    right, bottom = int(bbox[2]), int(bbox[3])
    if right <= left or bottom <= top:
        return

    pad = 2
    tile_width = (right - left) + pad * 2
    tile_height = (bottom - top) + pad * 2
    tile = Image.new("RGBA", (tile_width, tile_height), (0, 0, 0, 0))
    ImageDraw.Draw(tile, "RGBA").text((pad - left, pad - top), text, font=font, fill=fill)

    if anchor == "origin":
        origin_x = int(xy[0]) - pad + left
        origin_y = int(xy[1]) - pad + top
    else:
        origin_x = int(xy[0]) - pad
        origin_y = int(xy[1]) - pad
    canvas.paste(tile, (origin_x, origin_y), tile)


def draw_text_line(canvas: Image.Image, xy: tuple[int, int], text: str,
                   font: ImageFont.ImageFont, fill: tuple[int, int, int, int]) -> None:
    """Draw one line with a soft drop shadow so it stays legible over photos."""
    x, y = xy
    blend_text(canvas, (x + 2, y + 3), text, font, (0, 0, 0, 110))
    blend_text(canvas, (x, y), text, font, fill)


def _choice(value: object, allowed: Sequence[str], default: str) -> str:
    """Normalise an option onto one of `allowed`; anything else yields `default`."""
    text = str(value or "").strip().lower()
    return text if text in allowed else default


def _overlay_scale(value: object) -> float:
    """Multiplier for scrim strength; 1.0 (the original look) when unset or invalid."""
    if value is None or isinstance(value, bool):
        return 1.0
    try:
        opacity = float(value)
    except (TypeError, ValueError):
        return 1.0
    if opacity != opacity:  # NaN
        return 1.0
    return max(0.0, min(1.0, opacity)) / DEFAULT_OVERLAY_OPACITY


# ------------------------------------------------------------------- context --
class _Context:
    """Per-render state shared by the drawing helpers.

    The canvas stays in RGB mode on purpose: Pillow's ``ImageDraw`` blends
    translucent fills correctly onto an RGB image, whereas on an RGBA image it
    *replaces* the alpha channel, which punches transparent holes into the
    photo and turns them black once the result is exported as a JPEG.
    """

    def __init__(self, canvas: Image.Image, recommendation: dict, settings: dict) -> None:
        self.canvas = canvas
        self.width, self.height = canvas.size
        self.margin = int(round(self.width * MARGIN_RATIO))
        self.content_width = self.width - (self.margin * 2)

        self.headline = str(recommendation.get("headline") or "").strip()
        self.subtitle = str(recommendation.get("subtitle") or "").strip()
        self.cta = str(recommendation.get("cta") or "").strip()
        self.badge = str(recommendation.get("badge") or "").strip()
        self.template_type = str(recommendation.get("type") or "NONE").strip().upper()
        self.headline_scale = 1.0

        style = recommendation.get("style")
        style = style if isinstance(style, dict) else {}
        self.font_key = _choice(style.get("font"), FONT_KEYS, "serif")
        self.text_align = _choice(style.get("text_align"), TEXT_ALIGNMENTS, "left")
        self.cta_position = _choice(style.get("cta_position"), CTA_POSITIONS, "stack")
        self.logo_position = _choice(style.get("logo_position"), LOGO_POSITIONS, "top_left")
        self.button_style = _choice(style.get("button_style"), BUTTON_STYLES, "rounded")
        self.show_badge = style.get("show_badge", True) is not False
        self.show_logo = style.get("show_logo", True) is not False
        self.overlay_scale = _overlay_scale(style.get("overlay_opacity"))
        self.logo_box: tuple[int, int, int, int] | None = None

        self.brand_name = str(settings.get("brand_name") or "").strip()
        self.logo_url = str(settings.get("logo_url") or "").strip()
        self.primary = parse_color(settings.get("brand_primary_color"), DEFAULT_PRIMARY)
        self.secondary = parse_color(settings.get("brand_secondary_color"), DEFAULT_SECONDARY)

        # Gold accents stay gold, gently pulled towards the brand primary colour.
        self.accent = mix(GOLD, self.primary, 0.35)
        self.accent_soft = mix(GOLD_SOFT, self.primary, 0.25)
        self.scrim = self.secondary if luminance(self.secondary) < 0.55 else INK
        self.text = (255, 253, 248)
        self.muted = (226, 222, 214)
        self.draw = ImageDraw.Draw(self.canvas, "RGBA")


# ------------------------------------------------------------------ renderer --
class TemplateRenderer:
    """Render branded luxury social templates from an enhanced photo."""

    def __init__(self, output_dir: str | os.PathLike | None = None) -> None:
        self.output_dir = Path(output_dir) if output_dir else self.default_output_dir()

    # ------------------------------------------------------------- helpers --
    @staticmethod
    def default_output_dir() -> Path:
        """`backend/generated/templates`, created on demand."""
        return Path(__file__).resolve().parent.parent / "generated" / "templates"

    def _ensure_output_dir(self) -> Path:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        return self.output_dir

    def _output_path(self, template_type: str) -> Path:
        stamp = uuid.uuid4().hex[:10]
        slug = re.sub(r"[^a-z0-9]+", "_", template_type.lower()).strip("_") or "template"
        return self._ensure_output_dir() / f"{slug}_{stamp}.jpg"

    @staticmethod
    def _prepare_canvas(image: Image.Image) -> Image.Image:
        """Fit the photo onto a story or feed-portrait canvas, keeping it centred."""
        width, height = image.size
        ratio = height / width if width else 1.0
        canvas_size = CANVAS_STORY if ratio >= 1.45 else CANVAS_PORTRAIT
        fitted = ImageOps.fit(image, canvas_size, Image.LANCZOS, centering=(0.5, 0.5))
        return fitted.convert("RGB")

    def render_template(self, image_path: str, recommendation: dict, settings: dict) -> str:
        """Render a branded template and return the absolute output path."""
        try:
            source = Path(image_path)
            if not source.is_file():
                raise FileNotFoundError(f"Template source image not found: {image_path}")

            recommendation = recommendation or {}
            settings = settings or {}

            with Image.open(source) as raw:
                image = ImageOps.exif_transpose(raw).convert("RGB")

            canvas = self._prepare_canvas(image)
            ctx = _Context(canvas, recommendation, settings)

            template_type = ctx.template_type or "NONE"
            renderer = self._renderer_for(template_type)
            renderer(ctx)

            output = self._output_path(template_type)
            canvas.convert("RGB").save(output, "JPEG", quality=92, optimize=True, progressive=True)
            log.info("Rendered %s template to %s", template_type, output)
            return str(output)
        except Exception:
            log.exception("Template rendering failed for %s", image_path)
            raise

    def _renderer_for(self, template_type: str):
        """Map a template type onto its render function; unknown types use the default."""
        mapping = {
            "WORK_IN_PROGRESS": self._render_work_in_progress,
            "COMPLETED_PROJECT": self._render_completed,
            "BEFORE_AFTER": self._render_before_after,
            "LUXURY_SHOWCASE": self._render_default,
            "PROMOTION": self._render_default,
            "QUOTE": self._render_default,
            "TIP": self._render_default,
            "PROJECT_UPDATE": self._render_default,
        }
        renderer = mapping.get(template_type)
        if renderer is None:
            log.info("Unknown template type %r; using the default luxury layout", template_type)
            return self._render_default
        return renderer

    # ------------------------------------------------------- draw primitives --
    def _draw_gradient(self, ctx: _Context, box: tuple[int, int, int, int],
                       color_top: tuple[int, int, int], color_bottom: tuple[int, int, int],
                       alpha_top: int = 0, alpha_bottom: int = 170) -> None:
        """Blend a vertical translucent gradient into a region of the canvas.

        The gradient is drawn on a thin strip and resized, which keeps the
        render fast even on a 1080x1920 story canvas.
        """
        x0, y0, x1, y1 = box
        width = max(1, x1 - x0)
        height = max(1, y1 - y0)
        steps = 256
        strip = Image.new("RGBA", (1, steps))

        for i in range(steps):
            ratio = i / (steps - 1)
            color = mix(color_top, color_bottom, ratio)
            alpha = int(round(alpha_top + (alpha_bottom - alpha_top) * ratio))
            strip.putpixel((0, i), (color[0], color[1], color[2], max(0, min(255, alpha))))

        gradient = strip.resize((width, height), Image.BILINEAR)
        ctx.canvas.paste(gradient, (x0, y0), gradient)

    def _draw_rounded_panel(self, ctx: _Context, box: tuple[int, int, int, int],
                            radius: int, fill: tuple[int, int, int, int],
                            shadow: bool = True, shadow_blur: int = 26) -> None:
        """Draw a rounded rectangle with a soft drop shadow."""
        x0, y0, x1, y1 = box
        if x1 <= x0 or y1 <= y0:
            return

        if shadow:
            pad = shadow_blur
            layer = Image.new("RGBA", (x1 - x0 + pad * 2, y1 - y0 + pad * 2), (0, 0, 0, 0))
            shadow_draw = ImageDraw.Draw(layer, "RGBA")
            shadow_draw.rounded_rectangle(
                (pad, pad, pad + (x1 - x0), pad + (y1 - y0)),
                radius=radius, fill=(0, 0, 0, 120),
            )
            layer = layer.filter(ImageFilter.GaussianBlur(shadow_blur // 2 or 1))
            ctx.canvas.paste(layer, (x0 - pad, y0 - pad), layer)

        ctx.draw.rounded_rectangle(box, radius=radius, fill=fill)

    def _draw_badge(self, ctx: _Context, xy: tuple[int, int], text: str,
                    fill: tuple[int, int, int, int] | None = None,
                    text_color: tuple[int, int, int, int] | None = None,
                    font: ImageFont.ImageFont | None = None,
                    padding: tuple[int, int] = (26, 12),
                    radius: int | None = None,
                    outline: tuple[int, int, int, int] | None = None) -> tuple[int, int, int, int]:
        """Draw a rounded, softly shadowed badge and return its bounding box."""
        if not text or not ctx.show_badge:
            return (0, 0, 0, 0)

        font = font or sans_font(28)
        pad_x, pad_y = padding
        bbox = ctx.draw.textbbox((0, 0), text, font=font)
        text_w = int(bbox[2] - bbox[0])
        text_h = int(bbox[3] - bbox[1])
        width = text_w + pad_x * 2
        height = text_h + pad_y * 2
        x, y = xy
        box = (x, y, x + width, y + height)
        radius = radius if radius is not None else height // 2

        self._draw_rounded_panel(ctx, box, radius, fill or (0, 0, 0, 90))
        if outline:
            ctx.draw.rounded_rectangle(box, radius=radius, outline=outline, width=2)

        tx = x + pad_x
        ty = y + pad_y
        blend_text(ctx.canvas, (tx, ty), text, font, text_color or (255, 255, 255, 235))
        return box

    def _draw_accent_rule(self, ctx: _Context, xy: tuple[int, int],
                          width: int = 96, thickness: int = 4) -> None:
        """Thin gold rule used as an elegant divider."""
        x, y = xy
        self._draw_rounded_panel(ctx, (x, y, x + width, y + thickness), thickness // 2,
                                ctx.accent + (235,), shadow=False)

    # ------------------------------------------------------------ text layers --
    def _draw_headline(self, ctx: _Context, xy: tuple[int, int],
                       max_width: int | None = None) -> int:
        """Draw the large elegant headline; returns the height consumed."""
        if not ctx.headline:
            return 0

        max_width = max_width or ctx.content_width
        size = max(12, int(ctx.width * 0.082 * ctx.headline_scale))
        font = heading_font(ctx.font_key, size)
        lines = wrap_text(ctx.draw, ctx.headline, font, max_width, MAX_HEADLINE_LINES)
        if not lines:
            return 0

        step = int(line_height(ctx.draw, font) * 1.16)
        x, y = xy
        for line in lines:
            draw_text_line(ctx.canvas, (self._aligned_x(ctx, x, line, font, max_width), y), line, font,
                           ctx.text + (255,))
            y += step
        return step * len(lines)

    def _draw_subtitle(self, ctx: _Context, xy: tuple[int, int],
                       max_width: int | None = None) -> int:
        """Draw the smaller supporting copy; returns the height consumed."""
        if not ctx.subtitle:
            return 0

        max_width = max_width or ctx.content_width
        size = int(ctx.width * 0.036)
        font = sans_font(size)
        lines = wrap_text(ctx.draw, ctx.subtitle, font, max_width, MAX_SUBTITLE_LINES)
        if not lines:
            return 0

        step = int(line_height(ctx.draw, font) * 1.42)
        x, y = xy
        for line in lines:
            draw_text_line(ctx.canvas, (self._aligned_x(ctx, x, line, font, max_width), y), line, font,
                           ctx.muted + (245,))
            y += step
        return step * len(lines)

    def _draw_cta(self, ctx: _Context, xy: tuple[int, int]) -> tuple[int, int, int, int]:
        """Draw the small call-to-action pill respecting the button style."""
        if not ctx.cta:
            return (0, 0, 0, 0)

        size = int(ctx.width * 0.028)
        font = sans_font(size)
        label = ctx.cta.upper()
        pad_x, pad_y = 30, 14
        bbox = ctx.draw.textbbox((0, 0), label, font=font)
        width = int(bbox[2] - bbox[0]) + pad_x * 2
        height = int(bbox[3] - bbox[1]) + pad_y * 2
        x, y = xy
        box = (x, y, x + width, y + height)

        button_style = ctx.button_style

        # Filled buttons (rounded or square)
        if button_style in ("rounded", "square"):
            radius = height // 2 if button_style == "rounded" else 0
            self._draw_rounded_panel(ctx, box, radius, ctx.accent + (235,), shadow=True, shadow_blur=22)
            blend_text(ctx.canvas, (x + pad_x, y + pad_y), label, font, (20, 18, 12, 255))
            return box

        # Outline button
        if button_style == "outline":
            # Transparent background, border and text in accent color
            ctx.draw.rounded_rectangle(box, radius=height // 4, outline=ctx.accent + (235,), width=3)
            blend_text(ctx.canvas, (x + pad_x, y + pad_y), label, font, ctx.accent + (235,))
            return box

        # Fallback to rounded if unknown
        self._draw_rounded_panel(ctx, box, height // 2, ctx.accent + (235,), shadow=True, shadow_blur=22)
        blend_text(ctx.canvas, (x + pad_x, y + pad_y), label, font, (20, 18, 12, 255))
        return box



    def _draw_logo(self, ctx: _Context, xy: tuple[int, int] | None = None) -> tuple[int, int, int, int]:
        """Draw the small brand logo (or the brand name) in the safe area.

        `xy` is the top-left default used by the layouts; a template can move the
        logo to another slot of the safe area with ``style.logo_position``.
        """
        if not ctx.show_logo:
            return (0, 0, 0, 0)

        margin = ctx.margin
        size = int(ctx.width * 0.024)

        if xy is None:
            xy = (margin, margin)

        logo = self._load_logo_image(ctx.logo_url)
        if logo is not None:
            max_w = int(ctx.width * 0.20)
            max_h = int(ctx.width * 0.055)
            ratio = min(max_w / logo.width, max_h / logo.height, 1.0)
            resized = logo.resize((max(1, int(logo.width * ratio)), max(1, int(logo.height * ratio))),
                                  Image.LANCZOS)
            x, y = self._logo_xy(ctx, xy, resized.width, resized.height)
            box = (x, y, x + resized.width, y + resized.height)
            ctx.canvas.paste(resized, (x, y), resized)
            ctx.logo_box = box
            return box

        if not ctx.brand_name:
            return (0, 0, 0, 0)

        font = sans_font(size)
        label = ctx.brand_name.upper()
        bbox = ctx.draw.textbbox((0, 0), label, font=font)
        box_w = int(bbox[2] - bbox[0])
        box_h = int(bbox[3] - bbox[1])
        x, y = self._logo_xy(ctx, xy, box_w, box_h)
        draw_text_line(ctx.canvas, (x, y), label, font, ctx.text + (220,))
        box = (x, y, x + box_w, y + box_h)
        ctx.logo_box = box
        return box

    def _load_logo_image(self, logo_url: str) -> Image.Image | None:
        """Load a brand logo from a URL or local path; return None on failure."""
        if not logo_url:
            return None

        source = logo_url.strip()
        try:
            if source.startswith(("http://", "https://")):
                with urllib.request.urlopen(source, timeout=8) as response:
                    data = response.read()
                image = Image.open(BytesIO(data)).convert("RGBA")
            else:
                path = Path(source)
                if not path.is_file():
                    return None
                with Image.open(path) as raw:
                    image = raw.convert("RGBA")
        except Exception as exc:
            log.warning("Brand logo could not be loaded (%s): %s", source, exc)
            return None

        return image

    # ------------------------------------------------------------- layouts --
    def _stack_height(self, ctx: _Context, max_width: int) -> int:
        """Measure the height of the content stack without drawing it."""
        height = int(ctx.width * 0.022) + int(ctx.width * 0.012)
        if ctx.headline:
            font = heading_font(ctx.font_key, int(ctx.width * 0.082 * ctx.headline_scale))
            lines = wrap_text(ctx.draw, ctx.headline, font, max_width, MAX_HEADLINE_LINES)
            if lines:
                height += int(line_height(ctx.draw, font) * 1.16) * len(lines) + int(ctx.width * 0.022)
        if ctx.subtitle:
            font = sans_font(int(ctx.width * 0.036))
            lines = wrap_text(ctx.draw, ctx.subtitle, font, max_width, MAX_SUBTITLE_LINES)
            if lines:
                height += int(line_height(ctx.draw, font) * 1.42) * len(lines) + int(ctx.width * 0.034)
        if ctx.cta and ctx.cta_position == "stack":
            font = sans_font(int(ctx.width * 0.028))
            bbox = ctx.draw.textbbox((0, 0), ctx.cta.upper(), font=font)
            height += int(bbox[3] - bbox[1]) + 28 + int(ctx.width * 0.02)
        return height

    def _fit_stack(self, ctx: _Context, max_width: int, available: int) -> None:
        """Shrink the headline until the stack fits the available space."""
        ctx.headline_scale = 1.0
        if available <= 0:
            return
        for _ in range(6):
            if self._stack_height(ctx, max_width) <= available:
                return
            ctx.headline_scale = round(ctx.headline_scale - 0.07, 3)
            if ctx.headline_scale <= 0.55:
                break

    # ------------------------------------------------------- editor options --
    @staticmethod
    def _scaled(ctx: _Context, strength: int) -> int:
        """Scrim strength after applying the template's overlay opacity."""
        return int(round(max(0.0, min(255.0, strength * ctx.overlay_scale))))

    @staticmethod
    def _slot_x(slot: str, left: int, width: int, item_width: int) -> int:
        """Left edge of an item placed in the left / center / right slot of a container."""
        if slot == "center":
            return left + (width - item_width) // 2
        if slot == "right":
            return left + width - item_width
        return left

    def _block_x(self, ctx: _Context, x: int, item_width: int, max_width: int) -> int:
        """Left edge of a block (rule, CTA) honouring the template's text alignment."""
        return self._slot_x(ctx.text_align, x, max_width, item_width)

    def _aligned_x(self, ctx: _Context, x: int, text: str, font: ImageFont.ImageFont, max_width: int) -> int:
        """Left edge of one text line honouring the template's text alignment."""
        if ctx.text_align == "left":
            return x
        return self._slot_x(ctx.text_align, x, max_width, text_width(ctx.draw, text, font))

    @staticmethod
    def _cta_size(ctx: _Context) -> tuple[int, int]:
        """Width and height of the CTA pill (mirrors the geometry of `_draw_cta`)."""
        font = sans_font(int(ctx.width * 0.028))
        bbox = ctx.draw.textbbox((0, 0), ctx.cta.upper(), font=font)
        return int(bbox[2] - bbox[0]) + 60, int(bbox[3] - bbox[1]) + 28

    def _logo_xy(self, ctx: _Context, default_xy: tuple[int, int], width: int, height: int) -> tuple[int, int]:
        """Top-left corner of the logo for the template's logo position."""
        if ctx.logo_position == "top_left":
            return default_xy
        vertical, horizontal = ctx.logo_position.split("_", 1)
        x = self._slot_x(horizontal, ctx.margin, ctx.content_width, width)
        y = ctx.margin if vertical == "top" else ctx.height - ctx.margin - height
        return (x, y)

    def _place_detached_items(self, ctx: _Context, x: int, bottom: int, max_width: int) -> int:
        """Keep the text stack clear of a bottom logo and draw a detached CTA.

        Returns the bottom limit that is left for the text stack.
        """
        gap = int(ctx.width * 0.028)
        if ctx.logo_box and ctx.logo_position.startswith("bottom"):
            bottom = min(bottom, ctx.logo_box[1] - gap)

        if not ctx.cta or ctx.cta_position == "stack":
            return bottom

        cta_width, cta_height = self._cta_size(ctx)
        if ctx.cta_position == "top_right":
            cta_x = ctx.margin + ctx.content_width - cta_width
            cta_y = ctx.margin
            if ctx.logo_box and ctx.logo_position == "top_right":
                cta_y = ctx.logo_box[3] + gap // 2
            self._draw_cta(ctx, (cta_x, cta_y))
            return bottom

        slot = ctx.cta_position.split("_", 1)[1]
        self._draw_cta(ctx, (self._slot_x(slot, x, max_width, cta_width), bottom - cta_height))
        return bottom - cta_height - gap

    def _draw_bottom_anchored_stack(self, ctx: _Context, x: int, bottom: int,
                                    max_width: int | None = None,
                                    top_limit: int | None = None) -> int:
        """Draw the content stack so it ends exactly at `bottom`.

        The headline is scaled down when needed, which keeps long copy inside
        the safe area instead of running off the edge of the canvas.
        This method is for the original layout (bottom anchored).
        """
        max_width = max_width or ctx.content_width
        top_limit = top_limit if top_limit is not None else ctx.margin
        bottom = self._place_detached_items(ctx, x, bottom, max_width)
        available = max(0, bottom - top_limit)

        self._fit_stack(ctx, max_width, available)
        height = self._stack_height(ctx, max_width)
        y = max(top_limit, bottom - height)
        return self._draw_content_stack(ctx, x, y, max_width)

    def _draw_content_stack(self, ctx: _Context, x: int, y: int,
                            max_width: int | None = None,
                            headline: str | None = None,
                            subtitle: str | None = None,
                            cta: str | None = None) -> int:
        """Draw rule + headline + subtitle + CTA as one vertical stack.

        Returns the y coordinate just below the stack so callers can position
        further elements without duplicating the spacing logic.
        """
        max_width = max_width or ctx.content_width
        original = (ctx.headline, ctx.subtitle, ctx.cta)
        if headline is not None:
            ctx.headline = headline
        if subtitle is not None:
            ctx.subtitle = subtitle
        if cta is not None:
            ctx.cta = cta

        try:
            self._draw_accent_rule(ctx, (self._block_x(ctx, x, 96, max_width), y))
            y += int(ctx.width * 0.022) + int(ctx.width * 0.012)

            headline_height = self._draw_headline(ctx, (x, y), max_width)
            if headline_height:
                y += headline_height + int(ctx.width * 0.022)

            subtitle_height = self._draw_subtitle(ctx, (x, y), max_width)
            if subtitle_height:
                y += subtitle_height + int(ctx.width * 0.034)

            if ctx.cta and ctx.cta_position == "stack":
                cta_width, _ = self._cta_size(ctx)
                self._draw_cta(ctx, (self._block_x(ctx, x, cta_width, max_width), y))
                y += int(ctx.width * 0.02)
            return y
        finally:
            ctx.headline, ctx.subtitle, ctx.cta = original

    # ----------------------------------------------------------- new editor option - text position ---
    def _draw_text_stack_at_position(self, ctx: _Context, x: int, max_width: int, position: str) -> int:
        """Draw the headline, subtitle and CTA as a vertical stack at given position."""
        if position == "top":
            # Use a safe top margin
            y_start = ctx.margin + int(ctx.height * 0.02)
            return self._draw_content_stack(ctx, x, y_start, max_width)

        elif position == "middle":
            stack_height = self._stack_height(ctx, max_width)
            y_start = (ctx.height - stack_height) // 2
            return self._draw_content_stack(ctx, x, y_start, max_width)

        elif position == "bottom":
            # Bottom anchored, same behaviour as existing _draw_bottom_anchored_stack
            return self._draw_bottom_anchored_stack(ctx, x, ctx.height - ctx.margin, max_width)

        else:
            # Default fallback to bottom
            return self._draw_bottom_anchored_stack(ctx, x, ctx.height - ctx.margin, max_width)


    def _draw_bottom_scrim(self, ctx: _Context, strength: int = 175) -> None:
        """Soft bottom gradient so text stays readable over the photo."""
        band = int(ctx.height * 0.46)
        self._draw_gradient(ctx, (0, ctx.height - band, ctx.width, ctx.height),
                            ctx.scrim, ctx.scrim, alpha_top=0, alpha_bottom=self._scaled(ctx, strength))

    def _draw_top_scrim(self, ctx: _Context, strength: int = 110) -> None:
        """Subtle top gradient that anchors the logo and badges."""
        band = int(ctx.height * 0.16)
        self._draw_gradient(ctx, (0, 0, ctx.width, band),
                            ctx.scrim, ctx.scrim, alpha_top=self._scaled(ctx, strength), alpha_bottom=0)

    def _draw_frame(self, ctx: _Context, alpha: int = 70) -> None:
        """Fine gold hairline frame for a premium editorial finish."""
        inset = int(ctx.width * 0.032)
        ctx.draw.rounded_rectangle((inset, inset, ctx.width - inset, ctx.height - inset),
                                   radius=int(ctx.width * 0.02), outline=ctx.accent + (alpha,), width=2)

    def _render_work_in_progress(self, ctx: _Context) -> None:
        """Editorial bottom banner with an 'In Progress' status badge."""
        self._draw_bottom_scrim(ctx, strength=150)
        self._draw_top_scrim(ctx, strength=80)

        badge_y = ctx.margin + int(ctx.height * 0.035)
        self._draw_badge(ctx, (ctx.margin, badge_y), ctx.badge or "In Progress",
                         fill=(0, 0, 0, 92), text_color=ctx.accent_soft + (255,),
                         font=sans_font(int(ctx.width * 0.024)),
                         outline=ctx.accent + (140,))
        self._draw_logo(ctx, (ctx.margin, ctx.margin))
        self._draw_frame(ctx, alpha=55)

        self._draw_bottom_anchored_stack(ctx, ctx.margin, ctx.height - ctx.margin,
                                         top_limit=ctx.height * 0.42)

    def _render_completed(self, ctx: _Context) -> None:
        """Celebratory 'Completed' layout with a gold framed panel."""
        self._draw_bottom_scrim(ctx, strength=155)
        self._draw_top_scrim(ctx, strength=85)

        badge_y = ctx.margin + int(ctx.height * 0.035)
        self._draw_badge(ctx, (ctx.margin, badge_y), ctx.badge or "Completed",
                         fill=ctx.accent + (235,), text_color=(22, 20, 14, 255),
                         font=sans_font(int(ctx.width * 0.024)))
        self._draw_logo(ctx, (ctx.margin, ctx.margin))
        self._draw_frame(ctx, alpha=80)

        panel_bottom = ctx.height - int(ctx.height * 0.09)
        panel_top = panel_bottom - int(ctx.height * 0.32)
        panel = (ctx.margin, panel_top, ctx.width - ctx.margin, panel_bottom)
        self._draw_rounded_panel(ctx, panel, int(ctx.width * 0.028), (10, 10, 12, self._scaled(ctx, 105)),
                                 shadow=True, shadow_blur=40)
        ctx.draw.rounded_rectangle(panel, radius=int(ctx.width * 0.028),
                                   outline=ctx.accent + (110,), width=2)

        inset = int(ctx.width * 0.045)
        self._draw_bottom_anchored_stack(ctx, ctx.margin + inset, panel_bottom - int(ctx.height * 0.035),
                                         max_width=ctx.content_width - inset * 2,
                                         top_limit=panel_top + int(ctx.height * 0.03))

    def _render_before_after(self, ctx: _Context) -> None:
        """Split layout: a 'Before' / 'After' badge pair above the caption."""
        self._draw_bottom_scrim(ctx, strength=150)
        self._draw_top_scrim(ctx, strength=85)

        badge_y = ctx.margin + int(ctx.height * 0.035)
        gap = int(ctx.width * 0.02)
        label_font = sans_font(int(ctx.width * 0.024))
        before_box = self._draw_badge(ctx, (ctx.margin, badge_y), "Before",
                                      fill=(0, 0, 0, 92), text_color=(238, 235, 228, 255),
                                      font=label_font)
        self._draw_badge(ctx, (before_box[2] + gap, badge_y), "After",
                         fill=ctx.accent + (235,), text_color=(22, 20, 14, 255),
                         font=label_font)
        self._draw_logo(ctx, (ctx.margin, ctx.margin))
        self._draw_frame(ctx, alpha=55)

        # A fine divider hints at the split without covering the furniture.
        divider_y = ctx.height - int(ctx.height * 0.40)
        self._draw_rounded_panel(ctx, (ctx.margin, divider_y, ctx.width - ctx.margin,
                                       divider_y + 2), 1, ctx.accent + (90,), shadow=False)

        self._draw_bottom_anchored_stack(ctx, ctx.margin, ctx.height - ctx.margin,
                                         top_limit=divider_y + int(ctx.height * 0.03))

    def _render_default(self, ctx: _Context) -> None:
        """Minimal luxury layout used for showcase, promotion, quote and tips."""
        self._draw_bottom_scrim(ctx, strength=145)
        self._draw_top_scrim(ctx, strength=75)
        self._draw_logo(ctx, (ctx.margin, ctx.margin))
        self._draw_frame(ctx, alpha=45)

        chip = ctx.badge or self._category_chip(ctx)
        if chip:
            badge_y = ctx.margin + int(ctx.height * 0.035)
            self._draw_badge(ctx, (ctx.margin, badge_y), chip,
                             fill=(0, 0, 0, 88), text_color=ctx.accent_soft + (255,),
                             font=sans_font(int(ctx.width * 0.022)),
                             outline=ctx.accent + (120,))

        self._draw_bottom_anchored_stack(ctx, ctx.margin, ctx.height - ctx.margin,
                                         top_limit=ctx.height * 0.40)

    # -------------------------------------------------------------- categories --
    CATEGORY_CHIPS = {
        "LUXURY_SHOWCASE": "Signature",
        "PROMOTION": "Offer",
        "QUOTE": "In Words",
        "TIP": "Design Tip",
        "PROJECT_UPDATE": "Update",
    }

    def _category_chip(self, ctx: _Context) -> str:
        """Short label describing the template category, when one applies."""
        return self.CATEGORY_CHIPS.get(ctx.template_type, "")
