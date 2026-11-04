import { resolveTemplateLayout } from "../layouts/LayoutEngine";
import categories from "./premium-template-categories.json";
import type {
  Anchor,
  BadgeConfig,
  DecorationConfig,
  OverlayConfig,
  RegionConfig,
  TemplateConfig,
} from "../types";
import { getPremiumTemplate } from "./premiumTemplates";
import type {
  DesignElement,
  DesignFormat,
  DesignTemplate,
} from "../types/designTemplate";

const FORMAT_SIZES: Record<DesignFormat, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

const BACKEND_PRESET_TEMPLATES = {
  LUXURY_SHOWCASE: "luxury-showcase",
  WORK_IN_PROGRESS: "wardrobe-progress",
  BEFORE_AFTER: "before-after",
  PROJECT_UPDATE: "project-timeline",
  PROMOTION: "limited-offer",
  QUOTE: "client-review",
  TIP: "architecture-notes",
  COMPLETED_PROJECT: "completion-day",
} as const;

const BACKEND_FONTS = {
  serif: ["Playfair Display", "Georgia"],
  classic: ["Georgia", "serif"],
  sans: ["Inter", "Arial"],
  modern: ["Montserrat", "Arial"],
} as const;

const BACKEND_TEXT_ALIGNMENTS = ["left", "center", "right"] as const;
const BACKEND_CTA_POSITIONS = ["stack", "top_right", "bottom_left", "bottom_center", "bottom_right"] as const;
const BACKEND_LOGO_POSITIONS = ["top_left", "top_center", "top_right", "bottom_left", "bottom_center", "bottom_right"] as const;
const BACKEND_BUTTON_STYLES = ["rounded", "square", "outline"] as const;

type BackendPresetKey = keyof typeof BACKEND_PRESET_TEMPLATES;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString<T extends string = string>(
  value: unknown,
  field: string,
  allowed?: readonly T[],
): T {
  if (typeof value !== "string" || (allowed && !allowed.includes(value as T))) {
    throw new Error(`Backend template config "${field}" is invalid.`);
  }
  return value as T;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Backend template config "${field}" must be a finite number.`);
  }
  return value;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Backend template config "${field}" must be a boolean.`);
  }
  return value;
}

function positionRegion(region: RegionConfig, anchor: Anchor): RegionConfig {
  const margin = 0.06;
  const centeredX = (1 - region.width) / 2;
  const rightX = 1 - region.width - margin;
  const bottomY = 1 - region.height - margin;
  const x = anchor.endsWith("left") ? margin
    : anchor.endsWith("right") ? rightX
      : centeredX;
  const y = anchor.startsWith("bottom") ? bottomY
    : anchor.startsWith("top") ? margin
      : (1 - region.height) / 2;
  return { ...region, x, y, anchor };
}

export function fromBackendTemplateConfig(value: unknown): DesignTemplate {
  if (!isRecord(value)) {
    throw new Error("Backend template config must be an object.");
  }

  const templateType = requiredString(
    value.template_type,
    "template_type",
    Object.keys(BACKEND_PRESET_TEMPLATES) as BackendPresetKey[],
  );
  const base = getPremiumTemplate(BACKEND_PRESET_TEMPLATES[templateType]);
  const headline = requiredString(value.headline, "headline");
  const subtitle = requiredString(value.subtitle, "subtitle");
  const ctaText = requiredString(value.cta, "cta");
  const logoUrl = requiredString(value.logo_url, "logo_url");
  const primaryColor = requiredString(value.primary_color, "primary_color");
  const secondaryColor = requiredString(value.secondary_color, "secondary_color");
  const font = requiredString(value.font, "font", Object.keys(BACKEND_FONTS) as (keyof typeof BACKEND_FONTS)[]);
  const textAlign = requiredString(value.text_align, "text_align", BACKEND_TEXT_ALIGNMENTS);
  const overlayOpacity = requiredNumber(value.overlay_opacity, "overlay_opacity");
  const showBadge = requiredBoolean(value.show_badge, "show_badge");
  const showLogo = requiredBoolean(value.show_logo, "show_logo");
  const ctaPosition = requiredString(value.cta_position, "cta_position", BACKEND_CTA_POSITIONS);
  const logoPosition = requiredString(value.logo_position, "logo_position", BACKEND_LOGO_POSITIONS);
  const buttonStyle = requiredString(value.button_style, "button_style", BACKEND_BUTTON_STYLES);

  if (overlayOpacity < 0 || overlayOpacity > 1) {
    throw new Error('Backend template config "overlay_opacity" must be between 0 and 1.');
  }

  const [fontFamily, fallbackFamily] = BACKEND_FONTS[font];
  const ctaAnchor = ctaPosition === "stack" ? undefined : ctaPosition;
  const regions = { ...base.layout.regions };
  if (ctaAnchor && regions.cta) regions.cta = positionRegion(regions.cta, ctaAnchor);
  if (regions.logo) regions.logo = positionRegion(regions.logo, logoPosition);

  const updated = {
    ...base,
    content_bindings: {
      ...base.content_bindings,
      headline: `content.headline|${headline}`,
      subtitle: `content.subtitle|${subtitle}`,
      cta: `content.cta|${ctaText}`,
    },
    layout: { ...base.layout, regions },
    typography: {
      ...base.typography,
      family: fontFamily,
      fallback_family: fallbackFamily,
      alignment: textAlign,
    },
    colors: {
      ...base.colors,
      primary: primaryColor || base.colors.primary,
      secondary: secondaryColor || base.colors.secondary,
    },
    overlays: base.overlays.map((overlay) => ({ ...overlay, opacity: overlayOpacity })),
    logo: {
      ...base.logo,
      enabled: showLogo,
      asset_ref: logoUrl || base.logo.asset_ref,
    },
    badges: base.badges.map((badge, index) => index === 0
      ? { ...badge, enabled: showBadge }
      : badge),
    cta: {
      ...base.cta,
      text_binding: `content.cta|${ctaText}`,
      style: buttonStyle === "outline" ? "outline" : buttonStyle === "square" ? "filled" : "pill",
      radius: buttonStyle === "square" ? 0 : base.cta.radius,
      background_color: primaryColor || base.cta.background_color,
      border_color: primaryColor || base.cta.border_color,
    },
  } satisfies TemplateConfig;

  const designTemplate = fromLegacyTemplateConfig(updated);
  designTemplate.metadata = {
    ...designTemplate.metadata,
    backendTemplateConfig: value,
    backendTemplateType: templateType,
  };
  return designTemplate;
}

function fallbackText(binding: string): string {
  const fallback = binding.split("|", 2)[1];
  if (fallback) return fallback;
  const key = /^content\.([\w]+)/.exec(binding)?.[1];
  return key ? key.replaceAll("_", " ") : "";
}

function regionOf(template: TemplateConfig, id: string): RegionConfig {
  return template.layout.regions?.[id] || { x: 0, y: 0, width: 1, height: 1 };
}

function legacyInsetsToPixels(insets: BadgeConfig["padding"]): NonNullable<DesignElement["padding"]> {
  const scale = 1080;
  return {
    top: (insets.top || 0) * scale,
    right: (insets.right || 0) * scale,
    bottom: (insets.bottom || 0) * scale,
    left: (insets.left || 0) * scale,
  };
}

function common(
  id: string,
  type: DesignElement["type"],
  region: RegionConfig,
  zIndex: number,
  opacity = 1,
): DesignElement {
  return {
    id,
    type,
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
    rotation: 0,
    opacity,
    zIndex,
    visible: true,
    locked: false,
  };
}

function badgeElement(template: TemplateConfig, badge: BadgeConfig, zIndex: number): DesignElement {
  const region = regionOf(template, badge.region);
  return {
    ...common(badge.id, "Badge", region, zIndex),
    content: fallbackText(badge.text_binding),
    fontFamily: badge.typography.family,
    fontWeight: badge.typography.weight,
    fontSize: badge.typography.size,
    lineHeight: badge.typography.line_height,
    letterSpacing: badge.typography.letter_spacing,
    color: badge.text_color,
    alignment: "center",
    radius: badge.radius,
    padding: legacyInsetsToPixels(badge.padding),
    style: { background: badge.background_color },
  };
}

function overlayElement(overlay: OverlayConfig, region: RegionConfig, zIndex: number): DesignElement {
  const gradient = overlay.end_color
    ? {
      type: overlay.type.includes("radial") ? "radial" as const : "linear" as const,
      angle: overlay.angle,
      stops: [
        { color: overlay.color, position: 0, opacity: overlay.opacity },
        { color: overlay.end_color, position: 1, opacity: overlay.opacity },
      ],
    }
    : undefined;
  return {
    ...common(overlay.id, "Gradient", region, zIndex, overlay.opacity),
    color: overlay.color,
    ...(gradient ? { gradient } : {}),
    data: { legacyOverlayType: overlay.type },
  };
}

function decorationElement(decoration: DecorationConfig, region: RegionConfig, zIndex: number): DesignElement {
  return {
    ...common(decoration.id, "Decorative Object", region, zIndex, decoration.opacity),
    color: decoration.color,
    borderRadius: decoration.radius,
    data: { legacyDecorationType: decoration.type },
  };
}

function elementForLayer(
  key: string,
  template: TemplateConfig,
  zIndex: number,
): DesignElement | undefined {
  const { layout } = template;
  if (key === "image" || key.startsWith("image:")) {
    const regionId = key === "image" ? "main" : key.slice("image:".length);
    const region = layout.image_regions?.[regionId];
    if (!region) return undefined;
    return {
      ...common(`image-${regionId}`, "Image", region, zIndex),
      source: `asset:${regionId}`,
      crop: layout.crops?.portrait?.fit || template.image_treatment.fit,
      brightness: template.image_treatment.brightness,
      contrast: template.image_treatment.contrast,
      saturation: template.image_treatment.saturation,
      blur: template.image_treatment.blur,
      borderRadius: 0,
      shadow: { color: "transparent", blur: 0, offsetX: 0, offsetY: 0 },
    };
  }
  if (key === "headline" || key === "subtitle") {
    const id = key;
    const region = regionOf(template, id);
    return {
      ...common(id, key === "headline" ? "Heading" : "Subtitle", region, zIndex),
      content: fallbackText(template.content_bindings[key]),
      fontFamily: template.typography.family,
      fontWeight: template.typography.weight,
      fontSize: template.typography.size,
      lineHeight: template.typography.line_height,
      letterSpacing: template.typography.letter_spacing,
      color: template.typography.color,
      alignment: template.typography.alignment,
      shadow: template.typography.shadow?.enabled
        ? {
          color: template.typography.shadow.color,
          blur: template.typography.shadow.blur,
          offsetX: template.typography.shadow.offset_x,
          offsetY: template.typography.shadow.offset_y,
        }
        : undefined,
    };
  }
  if (key === "logo") {
    if (!template.logo.enabled) return undefined;
    return {
      ...common("logo", "Logo", regionOf(template, template.logo.region), zIndex, template.logo.opacity),
      source: template.logo.asset_ref,
    };
  }
  if (key === "cta") {
    if (!template.cta.enabled) return undefined;
    return {
      ...common("cta", "CTA Button", regionOf(template, template.cta.region), zIndex),
      content: fallbackText(template.cta.text_binding),
      fontFamily: template.cta.typography.family,
      fontWeight: template.cta.typography.weight,
      fontSize: template.cta.typography.size,
      lineHeight: template.cta.typography.line_height,
      letterSpacing: template.cta.typography.letter_spacing,
      color: template.cta.text_color,
      alignment: "center",
      radius: template.cta.radius,
      padding: legacyInsetsToPixels(template.cta.padding),
      border: { color: template.cta.border_color, width: 1 },
      gradient: {
        type: "linear",
        stops: [
          { color: template.cta.background_color, position: 0 },
          { color: template.cta.background_color, position: 1 },
        ],
      },
      shadow: template.cta.typography.shadow?.enabled
        ? {
          color: template.cta.typography.shadow.color,
          blur: template.cta.typography.shadow.blur,
          offsetX: template.cta.typography.shadow.offset_x,
          offsetY: template.cta.typography.shadow.offset_y,
        }
        : { color: "transparent", blur: 0, offsetX: 0, offsetY: 0 },
      icon: "",
      style: { background: template.cta.background_color },
    };
  }
  if (key.startsWith("badge:")) {
    const badge = template.badges.find((item) => item.id === key.slice("badge:".length));
    return badge?.enabled ? badgeElement(template, badge, zIndex) : undefined;
  }
  if (key.startsWith("overlay:")) {
    const overlay = template.overlays.find((item) => item.id === key.slice("overlay:".length));
    return overlay ? overlayElement(overlay, regionOf(template, overlay.region), zIndex) : undefined;
  }
  if (key.startsWith("decoration:")) {
    const decoration = template.decorations.find((item) => item.id === key.slice("decoration:".length));
    return decoration
      ? decorationElement(decoration, regionOf(template, decoration.region), zIndex)
      : undefined;
  }
  return undefined;
}

export function fromLegacyTemplateConfig(config: TemplateConfig): DesignTemplate {
  const resolved = resolveTemplateLayout(config, "portrait");
  const order = resolved.layout.layer_order.length
    ? resolved.layout.layer_order
    : [
      ...Object.keys(resolved.layout.image_regions || {}).map((id) => `image:${id}`),
      ...resolved.overlays.map(({ id }) => `overlay:${id}`),
      ...resolved.decorations.map(({ id }) => `decoration:${id}`),
      "logo",
      ...resolved.badges.map(({ id }) => `badge:${id}`),
      "headline",
      "subtitle",
      "cta",
    ];
  const elements = order
    .map((key, index) => elementForLayer(key, resolved, index))
    .filter((element): element is DesignElement => Boolean(element));
  const size = FORMAT_SIZES.portrait;

  return {
    schemaVersion: 2,
    id: resolved.id,
    name: resolved.name,
    category: (categories as Record<string, string>)[resolved.id]
      || resolved.typography.preset
      || resolved.layout.preset
      || "interior-design",
    description: "Adapted from a legacy template configuration.",
    tags: [resolved.layout.preset, resolved.typography.preset].filter(
      (tag): tag is NonNullable<typeof tag> => tag !== undefined,
    ),
    thumbnail: "",
    supportedFormats: ["portrait", "story", "square"],
    canvas: {
      ...size,
      unit: "px",
      safeZones: Object.fromEntries(
        (["portrait", "story", "square"] as const).map((format) => {
          const zone = resolved.layout.safe_zones?.[format] || resolved.layout.safe_area || {};
          return [format, {
            top: zone.top ?? 0,
            right: zone.right ?? 0,
            bottom: zone.bottom ?? 0,
            left: zone.left ?? 0,
          }];
        }),
      ),
    },
    background: { color: resolved.colors.surface },
    branding: {
      logo: resolved.logo.enabled ? resolved.logo.asset_ref : undefined,
      palette: { ...resolved.colors },
    },
    elements,
    animations: resolved.animations.motions.map((motion, index) => ({
      id: `${resolved.id}-animation-${index + 1}`,
      target: motion.target,
      property: motion.property === "translate_x" ? "translateX"
        : motion.property === "translate_y" ? "translateY"
          : motion.property,
      from: motion.from,
      to: motion.to,
      startMs: motion.start_ms,
      durationMs: motion.duration_ms,
      easing: resolved.animations.easing.replaceAll("_", "-") as DesignTemplate["animations"][number]["easing"],
    })),
    metadata: {
      legacySchemaVersion: resolved.schema_version,
      legacyTemplateConfig: config,
    },
  };
}
