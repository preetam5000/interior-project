import specData from "./premium-template-specs.json";
import copyData from "./premium-template-copy.json";
import { createOverlayConfig, type OverlayStyle } from "../overlays/overlayPresets";
import type {
  Anchor,
  BadgeConfig,
  CTAConfig,
  ImageFilterConfig,
  LayoutConfig,
  OverlayConfig,
  RegionConfig,
  TemplateConfig,
  TypographyConfig,
  TypographyPresetId,
} from "../types";

type RegionSpec = [
  number,
  number,
  number,
  number,
  RegionConfig["align"]?,
  Anchor?,
  RegionConfig["clip"]?,
];
type ColorSpec = [string, string, string, string, string];
type SafeSpec = [number, number, number, number];
type PointSpec = [number, number];
type TypeSpec = [
  TypographyPresetId,
  string,
  string,
  number,
  TypographyConfig["weight"],
  number,
  number,
  TypographyConfig["alignment"],
  boolean,
  number,
  number,
  number,
  number,
];
type BadgeSpec = [string, string, string, string, number, Anchor];
type CtaSpec = [string, CTAConfig["style"], string, string, string, number];

interface OverlaySpec extends Partial<OverlayConfig> {
  type: OverlayStyle;
  color: string;
}

export interface PremiumTemplateSpec {
  id: string;
  name: string;
  layout: LayoutConfig["preset"];
  regions: Record<"headline" | "subtitle" | "logo" | "badge" | "cta", RegionSpec>;
  images: Record<string, RegionSpec>;
  safe: { portrait: SafeSpec; story: SafeSpec };
  crop: { portrait: PointSpec; story: PointSpec };
  type: TypeSpec;
  colors: ColorSpec;
  overlays: OverlaySpec[];
  badge: BadgeSpec;
  cta: CtaSpec;
  imageTreatment: [
    ImageFilterConfig["fit"],
    number,
    number,
    number,
    number,
    number,
    number,
  ];
}

interface CopySpec {
  headline: string;
  subtitle: string;
}

const specs = specData as unknown as PremiumTemplateSpec[];
const copy = copyData as Record<string, CopySpec>;
const insetConfig = ([top, right, bottom, left]: SafeSpec) => ({ top, right, bottom, left });

function regionConfig([x, y, width, height, align = "left", anchor = "top_left", clip]: RegionSpec): RegionConfig {
  return { x, y, width, height, align, anchor, ...(clip ? { clip } : {}) };
}

function typographyConfig(spec: PremiumTemplateSpec): TypographyConfig {
  const [
    preset, family, fallback_family, size, weight, letter_spacing, line_height,
    alignment, shadowEnabled, shadowBlur, shadowOffsetY, minScale, maxScale,
  ] = spec.type;
  return {
    preset,
    family,
    fallback_family,
    size,
    weight,
    line_height,
    letter_spacing,
    text_transform: "none",
    alignment,
    color: "$text",
    shadow: {
      enabled: shadowEnabled,
      color: "rgba(0, 0, 0, 0.46)",
      blur: shadowBlur,
      offset_x: 0,
      offset_y: shadowOffsetY,
    },
    responsive_scaling: {
      enabled: true,
      reference_width: 1080,
      min_scale: minScale,
      max_scale: maxScale,
    },
  };
}

function badgeConfig(spec: PremiumTemplateSpec, base: TypographyConfig): BadgeConfig {
  const [text, background_color, text_color, border_color, radius, anchor] = spec.badge;
  return {
    id: "status",
    enabled: true,
    text_binding: `content.badge|${text}`,
    region: "badge",
    anchor,
    typography: {
      ...base,
      size: Math.max(16, base.size * 0.22),
      weight: "semibold",
      line_height: 1.15,
      letter_spacing: base.letter_spacing * 0.35,
      alignment: "center",
      shadow: { ...base.shadow!, enabled: false },
    },
    background_color,
    text_color,
    border_color,
    radius,
    padding: { top: 0.012, right: 0.018, bottom: 0.012, left: 0.018 },
  };
}

function ctaConfig(spec: PremiumTemplateSpec, base: TypographyConfig): CTAConfig {
  const [text, style, background_color, text_color, border_color, radius] = spec.cta;
  return {
    enabled: true,
    text_binding: `content.cta|${text}`,
    region: "cta",
    anchor: spec.regions.cta[5] || "bottom_left",
    style,
    typography: {
      ...base,
      size: Math.max(18, base.size * 0.27),
      weight: "semibold",
      line_height: 1.15,
      letter_spacing: base.letter_spacing * 0.25,
      alignment: "center",
      shadow: { ...base.shadow!, enabled: false },
    },
    background_color,
    text_color,
    border_color,
    radius,
    padding: { top: 0.014, right: 0.024, bottom: 0.014, left: 0.024 },
  };
}

export function buildPremiumTemplate(spec: PremiumTemplateSpec): TemplateConfig {
  const contentCopy = copy[spec.id];
  if (!contentCopy) throw new Error(`Missing copy for premium template "${spec.id}".`);
  const typography = typographyConfig(spec);
  const overlays: OverlayConfig[] = spec.overlays.map((overlay, index) => {
    const { type, ...overrides } = overlay;
    return createOverlayConfig(type, {
      id: `effect-${index + 1}`,
      region: "canvas",
      overrides,
    });
  });
  const colors = {
    primary: spec.colors[0],
    secondary: spec.colors[1],
    accent: spec.colors[2],
    text: spec.colors[3],
    surface: spec.colors[4],
  };
  const layout: LayoutConfig = {
    aspect_ratio: "4:5",
    preset: spec.layout,
    safe_area: insetConfig(spec.safe.portrait),
    safe_zones: {
      portrait: insetConfig(spec.safe.portrait),
      story: insetConfig(spec.safe.story),
      square: insetConfig(spec.safe.portrait),
    },
    regions: Object.fromEntries(
      Object.entries(spec.regions).map(([id, value]) => [id, regionConfig(value)]),
    ),
    image_regions: Object.fromEntries(
      Object.entries(spec.images).map(([id, value]) => [id, regionConfig(value)]),
    ),
    crops: {
      portrait: { fit: "cover", focal_point: { x: spec.crop.portrait[0], y: spec.crop.portrait[1] } },
      story: { fit: "cover", focal_point: { x: spec.crop.story[0], y: spec.crop.story[1] } },
    },
    layer_order: [
      ...Object.keys(spec.images).map((region) => `image:${region}`),
      ...overlays.map((overlay) => `overlay:${overlay.id}`),
      "logo",
      "badge:status",
      "headline",
      "subtitle",
      "cta",
    ],
  };
  const [
    fit,
    brightness,
    contrast,
    saturation,
    blur,
    grayscale,
    vignette,
  ] = spec.imageTreatment;

  return {
    schema_version: 1,
    id: spec.id,
    name: spec.name,
    layout,
    typography,
    colors,
    overlays,
    logo: {
      enabled: false,
      asset_ref: "brand.logo",
      region: "logo",
      anchor: spec.regions.logo[5] || "top_left",
      width: 0.72,
      opacity: 1,
      treatment: "original",
    },
    badges: [badgeConfig(spec, typography)],
    cta: ctaConfig(spec, typography),
    decorations: [],
    image_treatment: {
      fit,
      focal_point: { x: spec.crop.portrait[0], y: spec.crop.portrait[1] },
      brightness,
      contrast,
      saturation,
      blur,
      grayscale,
      vignette,
    },
    animations: {
      enabled: false,
      duration_ms: 0,
      easing: "ease_out",
      poster_time_ms: 0,
      motions: [],
    },
    content_bindings: {
      headline: `content.headline|${contentCopy.headline}`,
      subtitle: `content.subtitle|${contentCopy.subtitle}`,
      cta: `content.cta|${spec.cta[0]}`,
      badge: `content.badge|${spec.badge[0]}`,
    },
  };
}

export const PREMIUM_TEMPLATES: TemplateConfig[] = specs.map(buildPremiumTemplate);
export const PREMIUM_TEMPLATE_BY_ID: Record<string, TemplateConfig> = Object.fromEntries(
  PREMIUM_TEMPLATES.map((template) => [template.id, template]),
);

export function getPremiumTemplate(id: string): TemplateConfig {
  const template = PREMIUM_TEMPLATE_BY_ID[id];
  if (!template) throw new Error(`Unknown premium template "${id}".`);
  return template;
}

export function serializePremiumTemplate(id: string): string {
  return JSON.stringify(getPremiumTemplate(id), null, 2);
}
