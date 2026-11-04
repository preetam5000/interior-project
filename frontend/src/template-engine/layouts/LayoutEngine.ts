import type {
  LayoutConfig,
  LayoutPresetId,
  OutputVariant,
  RegionConfig,
  ResolvedLayoutConfig,
  TemplateConfig,
} from "../types";
import {
  PLACEMENTS,
  cropForVariant,
  getLayoutDefinition,
  imageArrangementFor,
  isLayoutPresetId,
  LAYOUTS,
} from "./layouts";

const ROLE_REGION_IDS = ["headline", "subtitle", "logo", "badge", "cta"] as const;

function cloneRegions(regions: Record<string, RegionConfig>): Record<string, RegionConfig> {
  return Object.fromEntries(
    Object.entries(regions).map(([id, region]) => [id, { ...region }]),
  );
}

export function resolveLayout(
  config: LayoutConfig,
  variant: OutputVariant,
): ResolvedLayoutConfig {
  const definition = config.preset
    ? isLayoutPresetId(config.preset)
      ? getLayoutDefinition(config.preset)
      : (() => { throw new Error(`Unknown layout preset "${String(config.preset)}".`); })()
    : undefined;

  const presetRegions: Record<string, RegionConfig> = {};
  if (definition) {
    for (const role of ROLE_REGION_IDS) {
      const placementId = definition.placements[role];
      presetRegions[role] = { ...PLACEMENTS[placementId] };
    }
  }
  const regions = { ...presetRegions, ...cloneRegions(config.regions || {}) };
  if (Object.keys(regions).length === 0) {
    throw new Error("Layout config must provide a preset or at least one named region.");
  }

  const presetImageRegions = definition
    ? imageArrangementFor(definition.id)
    : { main: { x: 0, y: 0, width: 1, height: 1 } };
  const imageRegions = {
    ...cloneRegions(presetImageRegions),
    ...cloneRegions(config.image_regions || {}),
  };
  const variantKey = variant === "story" ? "story" : "portrait";
  const crop = config.crops?.[variantKey] || (definition
    ? cropForVariant(definition, variant)
    : { fit: "cover" as const, focal_point: { x: 0.5, y: 0.5 } });
  const safeArea = config.safe_zones?.[variant]
    || (definition ? definition.safe_zones[variantKey] : config.safe_area || {});

  return {
    ...config,
    safe_area: { ...safeArea },
    regions,
    image_regions: imageRegions,
    crop: { ...crop, focal_point: { ...crop.focal_point } },
  };
}

export function resolveTemplateLayout(
  template: TemplateConfig,
  variant: OutputVariant,
): TemplateConfig {
  const layout = resolveLayout(template.layout, variant);
  const hasPreset = Boolean(template.layout.preset);
  const roleRegion = (configuredRegion: string, role: string): string => {
    if (!hasPreset || configuredRegion === role) return configuredRegion;
    return template.layout.regions?.[configuredRegion] ? configuredRegion : role;
  };

  return {
    ...template,
    layout,
    image_treatment: {
      ...template.image_treatment,
      ...layout.crop,
    },
    logo: {
      ...template.logo,
      region: roleRegion(template.logo.region, "logo"),
    },
    badges: template.badges.map((badge) => ({
      ...badge,
      region: roleRegion(badge.region, "badge"),
    })),
    cta: {
      ...template.cta,
      region: roleRegion(template.cta.region, "cta"),
    },
  };
}

export function getLayoutPresetIds(): LayoutPresetId[] {
  return [
    "hero-bottom",
    "hero-center",
    "split-screen",
    "magazine",
    "minimal",
    "editorial",
    "blueprint",
    "timeline",
    "progress",
    "comparison",
    "collage",
    "full-image",
    "diagonal",
    "luxury",
  ];
}
