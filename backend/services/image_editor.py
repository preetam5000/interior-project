"""Conservative, non-generative photographic enhancement for interior images.

The enhancement stage only adjusts existing pixels. It cannot recover clipped
highlights or infer a correct white balance without neutral surfaces, and it
deliberately does not attempt geometric or perspective correction.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Protocol

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps, ImageStat

VARIANTS = {"portrait": (1080, 1350), "square": (1080, 1080), "story": (1080, 1920)}

QualityMetrics = dict[str, float | int | str]
Adjustments = dict[str, float]


class PhotographicEnhancer(Protocol):
    """Interface for deterministic editors that preserve image content."""

    def enhance(
        self,
        img: Image.Image,
        metrics: QualityMetrics | None = None,
        adj: Adjustments | None = None,
    ) -> Image.Image: ...


class GenerativeImageEditor(Protocol):
    """Separate future integration point for explicitly generative providers.

    Generative edits cannot currently be guaranteed to preserve construction
    details, so this interface is intentionally not used by the media pipeline.
    """

    def edit(self, img: Image.Image, *, instruction: str) -> Image.Image: ...


def load(path: str | Path) -> Image.Image:
    """Load an image as RGB while honoring its EXIF orientation."""
    with Image.open(path) as source:
        return ImageOps.exif_transpose(source).convert("RGB")


def quality_metrics(img: Image.Image) -> QualityMetrics:
    g = img.convert("L")
    g.thumbnail((640, 640))
    edge_var = ImageStat.Stat(g.filter(ImageFilter.FIND_EDGES)).var[0]
    sharpness = min(100.0, (edge_var ** 0.5) * 2.2)
    st = ImageStat.Stat(g)
    brightness = st.mean[0] / 255 * 100
    contrast = st.stddev[0] / 128 * 100
    hist = g.histogram()
    total = sum(hist) or 1
    dark, bright = sum(hist[:6]) / total, sum(hist[250:]) / total
    exposure = "underexposed" if brightness < 32 or dark > 0.25 else "overexposed" if brightness > 78 or bright > 0.2 else "balanced"
    noise = ImageStat.Stat(ImageChops.difference(g, g.filter(ImageFilter.MedianFilter(3)))).mean[0]
    overall = max(0.0, min(100.0, sharpness * 0.5 + (100 - abs(brightness - 55) * 1.6) * 0.3 + max(0, 100 - noise * 12) * 0.2))
    return {
        "blur_score": round(100 - sharpness, 1),
        "sharpness": round(sharpness, 1),
        "brightness": round(brightness, 1),
        "contrast": round(contrast, 1),
        "exposure": exposure,
        "noise": round(noise, 2),
        "overall": round(overall, 1),
        "width": img.width,
        "height": img.height,
    }


def ahash(img: Image.Image) -> str:
    small = img.convert("L").resize((8, 8), Image.LANCZOS)
    px = list(small.getdata())
    avg = sum(px) / 64
    bits = "".join("1" if p > avg else "0" for p in px)
    return f"{int(bits, 2):016x}"


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def _adjustment(
    adj: Adjustments,
    name: str,
    default: float,
    minimum: float,
    maximum: float,
) -> float:
    value = float(adj.get(name, default))
    if not math.isfinite(value):
        raise ValueError(f"{name} adjustment must be a finite number")
    return min(maximum, max(minimum, value))


def _luminance(img: Image.Image) -> Image.Image:
    return img.convert("YCbCr").split()[0]


def _with_luminance(img: Image.Image, luminance: Image.Image) -> Image.Image:
    _, cb, cr = img.convert("YCbCr").split()
    return Image.merge("YCbCr", (luminance, cb, cr)).convert("RGB")


def _white_balance(img: Image.Image, strength: float, warmth: float) -> Image.Image:
    """Apply a small gray-neutral correction only when neutral pixels exist."""
    sample = ImageOps.contain(img, (256, 256), Image.Resampling.LANCZOS)
    channels = sample.split()
    brightest = ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])
    darkest = ImageChops.darker(ImageChops.darker(channels[0], channels[1]), channels[2])
    chroma = ImageChops.subtract(brightest, darkest)
    luma = ImageOps.grayscale(sample)
    chroma_mask = chroma.point(lambda value: 255 if value <= 28 else 0)
    luma_mask = luma.point(lambda value: 255 if 90 <= value <= 235 else 0)
    neutral_mask = ImageChops.multiply(chroma_mask, luma_mask)

    gains = [1.0, 1.0, 1.0]
    if ImageStat.Stat(neutral_mask).mean[0] >= 1.0:
        neutral_means = [ImageStat.Stat(channel, mask=neutral_mask).mean[0] for channel in channels]
        target = sum(neutral_means) / 3
        gains = [
            min(1.025, max(0.975, 1 + strength * (target / max(mean, 1.0) - 1)))
            for mean in neutral_means
        ]

    gains[0] *= 1 + warmth * 0.025
    gains[2] *= 1 - warmth * 0.025
    corrected = [
        channel.point(tuple(min(255, max(0, round(value * gain))) for value in range(256)))
        for channel, gain in zip(img.split(), gains)
    ]
    return Image.merge("RGB", corrected)


def _tone_lut(shadows: float, highlights: float) -> tuple[int, ...]:
    values = []
    for value in range(256):
        level = value / 255
        shadow_lift = shadows * 14 * (1 - level) ** 2
        highlight_compression = highlights * 10 * max(0, (level - 0.65) / 0.35) ** 2
        values.append(round(min(255, max(0, value + shadow_lift - highlight_compression))))
    return tuple(values)


class PillowPhotographicEnhancer:
    """A restrained Pillow-only pipeline; no pixels or objects are generated."""

    def enhance(
        self,
        img: Image.Image,
        metrics: QualityMetrics | None = None,
        adj: Adjustments | None = None,
    ) -> Image.Image:
        adjustments = adj or {}
        measured = metrics or quality_metrics(img)
        out = img.convert("RGB")

        warmth = _adjustment(adjustments, "warmth", 0.0, -1.0, 1.0)
        white_balance = _adjustment(adjustments, "white_balance", 0.5, 0.0, 1.0)
        out = _white_balance(out, white_balance, warmth)

        brightness = float(measured.get("brightness", 55))
        exposure_ev = min(0.15, (40 - brightness) / 100) if brightness < 40 else 0.0
        if brightness > 76:
            exposure_ev = -min(0.12, (brightness - 76) / 100)
        exposure = 2 ** exposure_ev
        exposure *= _adjustment(adjustments, "brightness", 1.0, 0.7, 1.3)

        luminance = _luminance(out)
        luminance = ImageEnhance.Brightness(luminance).enhance(exposure)
        shadows = _adjustment(adjustments, "shadows", 0.35, 0.0, 1.0)
        highlights = _adjustment(adjustments, "highlights", 0.35, 0.0, 1.0)
        luminance = luminance.point(_tone_lut(shadows, highlights))

        contrast = _adjustment(adjustments, "contrast", 1.0, 0.7, 1.3)
        luminance = ImageEnhance.Contrast(luminance).enhance(1.025 * contrast)
        out = _with_luminance(out, luminance)

        saturation = _adjustment(adjustments, "saturation", 1.0, 0.7, 1.3)
        out = ImageEnhance.Color(out).enhance(1.015 * saturation)

        clarity = _adjustment(adjustments, "clarity", 0.35, 0.0, 1.0)
        if clarity:
            radius = min(6.0, max(1.0, min(out.size) / 270))
            y = _luminance(out)
            y = y.filter(ImageFilter.UnsharpMask(radius=radius, percent=round(14 * clarity), threshold=4))
            out = _with_luminance(out, y)

        if float(measured.get("noise", 0)) > 4:
            softened = out.filter(ImageFilter.GaussianBlur(radius=0.4))
            out = Image.blend(out, softened, 0.08)

        sharpness = _adjustment(adjustments, "sharpness", 1.0, 0.0, 2.0)
        if sharpness:
            y = _luminance(out)
            radius = min(1.4, max(0.6, min(out.size) / 1200))
            y = y.filter(ImageFilter.UnsharpMask(radius=radius, percent=round(28 * sharpness), threshold=4))
            out = _with_luminance(out, y)
        return out


_DEFAULT_ENHANCER = PillowPhotographicEnhancer()


def enhance(
    img: Image.Image,
    metrics: QualityMetrics | None = None,
    adj: Adjustments | None = None,
) -> Image.Image:
    """Enhance with the default non-generative editor; keeps the legacy API."""
    return _DEFAULT_ENHANCER.enhance(img, metrics, adj)


def watermark(img: Image.Image, text: str) -> Image.Image:
    if not text:
        return img
    out = img.copy()
    d = ImageDraw.Draw(out, "RGBA")
    font = ImageFont.load_default(size=max(18, img.width // 40))
    bbox = d.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((img.width - w - 36, img.height - h - 36), text, font=font, fill=(255, 255, 255, 170))
    return out


def make_variant(img: Image.Image, size: tuple[int, int], wm_text: str = "") -> Image.Image:
    """Fit the whole photograph on an Instagram canvas without cropping details."""
    fitted = ImageOps.pad(
        img,
        size,
        method=Image.Resampling.LANCZOS,
        color=(244, 243, 240),
        centering=(0.5, 0.5),
    )
    return watermark(fitted, wm_text)


def save_jpeg(
    img: Image.Image,
    path: str | Path,
    quality: int = 88,
    metadata: dict | None = None,
) -> None:
    """Save JPEG output, optionally carrying source EXIF/ICC/DPI metadata."""
    save_options = dict(metadata or {})
    img.save(path, "JPEG", quality=quality, optimize=True, progressive=True, **save_options)


def thumb_b64(img: Image.Image, max_side: int = 1024) -> str:
    import base64
    import io

    t = img.copy()
    t.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    t.save(buf, "JPEG", quality=82)
    return base64.b64encode(buf.getvalue()).decode()
