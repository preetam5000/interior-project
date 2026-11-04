"""Language-level interfaces for the versioned template JSON contract.

The JSON Schema in ``schema/template-config.schema.json`` is authoritative for
validation. These TypedDicts provide editor and renderer type hints.
"""
from __future__ import annotations

from typing import Literal, TypedDict


class PointConfig(TypedDict, total=False):
    x: float
    y: float


class InsetsConfig(TypedDict, total=False):
    top: float
    right: float
    bottom: float
    left: float


class RegionConfig(TypedDict, total=False):
    x: float
    y: float
    width: float
    height: float
    anchor: Literal[
        "top_left", "top_center", "top_right",
        "center_left", "center", "center_right",
        "bottom_left", "bottom_center", "bottom_right",
    ]
    align: Literal["left", "center", "right"]
    padding: InsetsConfig
    clip: Literal["none", "diagonal", "circle"]


class ImageCropConfig(TypedDict, total=False):
    fit: Literal["cover", "contain"]
    focal_point: PointConfig


class LayoutConfig(TypedDict, total=False):
    aspect_ratio: str
    safe_area: InsetsConfig
    preset: Literal[
        "hero-bottom", "hero-center", "split-screen", "magazine", "minimal",
        "editorial", "blueprint", "timeline", "progress", "comparison",
        "collage", "full-image", "diagonal", "luxury",
    ]
    regions: dict[str, RegionConfig]
    image_regions: dict[str, RegionConfig]
    safe_zones: dict[str, InsetsConfig]
    crops: dict[str, ImageCropConfig]
    layer_order: list[str]


class TypographyConfig(TypedDict, total=False):
    preset: Literal[
        "luxury", "modern", "minimal", "construction", "editorial",
        "architectural", "magazine", "elegant", "bold", "instagram",
    ]
    family: str
    fallback_family: str
    size: float
    weight: Literal["regular", "medium", "semibold", "bold"]
    line_height: float
    letter_spacing: float
    text_transform: Literal["none", "uppercase", "lowercase", "capitalize"]
    alignment: Literal["left", "center", "right"]
    color: str
    shadow: TextShadowConfig
    responsive_scaling: ResponsiveScalingConfig


class TextShadowConfig(TypedDict, total=False):
    enabled: bool
    color: str
    blur: float
    offset_x: float
    offset_y: float


class ResponsiveScalingConfig(TypedDict, total=False):
    enabled: bool
    reference_width: float
    min_scale: float
    max_scale: float


class ColorConfig(TypedDict, total=False):
    primary: str
    secondary: str
    accent: str
    text: str
    surface: str


class OverlayConfig(TypedDict, total=False):
    id: str
    type: Literal[
        "scrim", "linear_gradient", "radial_gradient", "color_wash",
        "luxury_gradient", "dark_gradient", "glass", "blur", "blueprint_grid",
        "golden_frame", "corner_accents", "progress_ribbon", "diagonal_stripe",
        "noise_texture", "paper_texture", "film_grain",
    ]
    region: str
    color: str
    end_color: str
    opacity: float
    angle: float
    blend_mode: Literal["normal", "multiply", "screen", "overlay"]
    blur_px: float
    spacing: float
    line_width: float
    inset: float
    radius: float
    intensity: float
    text: str
    font_size: float
    seed: int
    scale: float


class LogoConfig(TypedDict, total=False):
    enabled: bool
    asset_ref: str
    region: str
    anchor: str
    width: float
    opacity: float
    treatment: Literal["original", "monochrome", "light", "dark"]


class BadgeConfig(TypedDict, total=False):
    id: str
    enabled: bool
    text_binding: str
    region: str
    anchor: str
    typography: TypographyConfig
    background_color: str
    text_color: str
    border_color: str
    radius: float
    padding: InsetsConfig


class CTAConfig(TypedDict, total=False):
    enabled: bool
    text_binding: str
    region: str
    anchor: str
    style: Literal["filled", "outline", "text", "pill"]
    typography: TypographyConfig
    background_color: str
    text_color: str
    border_color: str
    radius: float
    padding: InsetsConfig


class DecorationConfig(TypedDict, total=False):
    id: str
    type: Literal["line", "frame", "shape", "texture"]
    region: str
    color: str
    opacity: float
    thickness: float
    radius: float
    asset_ref: str


class ImageFilterConfig(TypedDict, total=False):
    fit: Literal["cover", "contain"]
    focal_point: PointConfig
    brightness: float
    contrast: float
    saturation: float
    blur: float
    grayscale: float
    vignette: float


class AnimationConfig(TypedDict, total=False):
    enabled: bool
    duration_ms: int
    easing: Literal["linear", "ease_in", "ease_out", "ease_in_out"]
    poster_time_ms: int
    motions: list[dict[str, object]]


class ContentBindingsConfig(TypedDict, total=False):
    headline: str
    subtitle: str
    cta: str
    badge: str


class TemplateConfig(TypedDict):
    schema_version: int
    id: str
    name: str
    layout: LayoutConfig
    typography: TypographyConfig
    colors: ColorConfig
    overlays: list[OverlayConfig]
    logo: LogoConfig
    badges: list[BadgeConfig]
    cta: CTAConfig
    decorations: list[DecorationConfig]
    image_treatment: ImageFilterConfig
    animations: AnimationConfig
    content_bindings: ContentBindingsConfig


class RenderContext(TypedDict):
    source_image: str
    output_variant: Literal["portrait", "story", "square"]
    content: dict[str, str]
    brand: dict[str, str]
    output_format: Literal["png", "jpeg", "webp"]


class RenderResult(TypedDict):
    output_path: str
    width: int
    height: int
    format: str
