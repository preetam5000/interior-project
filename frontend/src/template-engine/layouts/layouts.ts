import type {
  Anchor,
  ImageCropConfig,
  InsetsConfig,
  LayoutPresetId,
  OutputVariant,
  RegionConfig,
} from "../types";

type PlacementId =
  | "top-left"
  | "top-center"
  | "top-right"
  | "upper-center"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "lower-left"
  | "lower-center"
  | "lower-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "left-panel"
  | "right-panel"
  | "left-column"
  | "right-column"
  | "editorial-title"
  | "editorial-subtitle"
  | "wide-bottom"
  | "compact-top"
  | "timeline-title"
  | "progress-title"
  | "comparison-title"
  | "blueprint-title"
  | "magazine-title"
  | "diagonal-title"
  | "luxury-title";

type ImageArrangement =
  | "full"
  | "upper"
  | "split-left"
  | "split-right"
  | "magazine"
  | "editorial"
  | "blueprint"
  | "timeline"
  | "progress"
  | "comparison"
  | "collage"
  | "diagonal"
  | "luxury";

export interface LayoutDefinition {
  id: LayoutPresetId;
  label: string;
  placements: {
    headline: PlacementId;
    subtitle: PlacementId;
    logo: PlacementId;
    badge: PlacementId;
    cta: PlacementId;
  };
  image_arrangement: ImageArrangement;
  safe_zones: Record<"portrait" | "story", InsetsConfig>;
  crops: Record<"portrait" | "story", ImageCropConfig>;
}

const region = (
  x: number,
  y: number,
  width: number,
  height: number,
  align: RegionConfig["align"] = "left",
  anchor: Anchor = "top_left",
): RegionConfig => ({ x, y, width, height, align, anchor });

export const PLACEMENTS: Record<PlacementId, RegionConfig> = {
  "top-left": region(0.06, 0.04, 0.66, 0.12),
  "top-center": region(0.16, 0.04, 0.68, 0.12, "center", "top_center"),
  "top-right": region(0.28, 0.04, 0.66, 0.12, "right", "top_right"),
  "upper-center": region(0.12, 0.2, 0.76, 0.18, "center", "top_center"),
  "middle-left": region(0.06, 0.39, 0.54, 0.2, "left", "center_left"),
  "middle-center": region(0.12, 0.4, 0.76, 0.2, "center", "center"),
  "middle-right": region(0.4, 0.39, 0.54, 0.2, "right", "center_right"),
  "lower-left": region(0.06, 0.62, 0.66, 0.15, "left", "bottom_left"),
  "lower-center": region(0.14, 0.62, 0.72, 0.15, "center", "bottom_center"),
  "lower-right": region(0.28, 0.62, 0.66, 0.15, "right", "bottom_right"),
  "bottom-left": region(0.06, 0.82, 0.66, 0.12, "left", "bottom_left"),
  "bottom-center": region(0.14, 0.82, 0.72, 0.12, "center", "bottom_center"),
  "bottom-right": region(0.28, 0.82, 0.66, 0.12, "right", "bottom_right"),
  "left-panel": region(0.06, 0.26, 0.38, 0.48),
  "right-panel": region(0.56, 0.26, 0.38, 0.48),
  "left-column": region(0.05, 0.2, 0.38, 0.58),
  "right-column": region(0.57, 0.2, 0.38, 0.58),
  "editorial-title": region(0.08, 0.1, 0.66, 0.27),
  "editorial-subtitle": region(0.08, 0.4, 0.48, 0.2),
  "wide-bottom": region(0.08, 0.73, 0.84, 0.17, "center", "bottom_center"),
  "compact-top": region(0.08, 0.1, 0.5, 0.1),
  "timeline-title": region(0.1, 0.08, 0.8, 0.14, "left"),
  "progress-title": region(0.08, 0.72, 0.66, 0.18),
  "comparison-title": region(0.1, 0.06, 0.8, 0.14, "center", "top_center"),
  "blueprint-title": region(0.08, 0.07, 0.72, 0.16),
  "magazine-title": region(0.07, 0.08, 0.68, 0.24),
  "diagonal-title": region(0.08, 0.64, 0.62, 0.2),
  "luxury-title": region(0.12, 0.67, 0.76, 0.19, "center", "bottom_center"),
};

const SAFE_ZONES = {
  generous: {
    portrait: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    story: { top: 0.12, right: 0.07, bottom: 0.14, left: 0.07 },
  },
  storyUi: {
    portrait: { top: 0.05, right: 0.06, bottom: 0.06, left: 0.06 },
    story: { top: 0.16, right: 0.07, bottom: 0.2, left: 0.07 },
  },
  editorial: {
    portrait: { top: 0.09, right: 0.08, bottom: 0.08, left: 0.08 },
    story: { top: 0.14, right: 0.08, bottom: 0.16, left: 0.08 },
  },
} satisfies Record<string, Record<"portrait" | "story", InsetsConfig>>;

const CROPS = {
  center: {
    portrait: { fit: "cover", focal_point: { x: 0.5, y: 0.5 } },
    story: { fit: "cover", focal_point: { x: 0.5, y: 0.45 } },
  },
  upper: {
    portrait: { fit: "cover", focal_point: { x: 0.5, y: 0.38 } },
    story: { fit: "cover", focal_point: { x: 0.5, y: 0.36 } },
  },
  left: {
    portrait: { fit: "cover", focal_point: { x: 0.38, y: 0.5 } },
    story: { fit: "cover", focal_point: { x: 0.4, y: 0.45 } },
  },
  right: {
    portrait: { fit: "cover", focal_point: { x: 0.62, y: 0.5 } },
    story: { fit: "cover", focal_point: { x: 0.6, y: 0.45 } },
  },
} satisfies Record<string, Record<"portrait" | "story", ImageCropConfig>>;

const layout = (
  id: LayoutPresetId,
  label: string,
  placements: LayoutDefinition["placements"],
  image_arrangement: ImageArrangement,
  safe_zones: LayoutDefinition["safe_zones"] = SAFE_ZONES.generous,
  crops: LayoutDefinition["crops"] = CROPS.center,
): LayoutDefinition => ({ id, label, placements, image_arrangement, safe_zones, crops });

export const LAYOUTS: Record<LayoutPresetId, LayoutDefinition> = {
  "hero-bottom": layout("hero-bottom", "Hero Bottom", {
    headline: "lower-left", subtitle: "bottom-left", logo: "top-left", badge: "top-right", cta: "bottom-right",
  }, "full", SAFE_ZONES.storyUi, CROPS.upper),
  "hero-center": layout("hero-center", "Hero Center", {
    headline: "middle-center", subtitle: "lower-center", logo: "top-center", badge: "top-right", cta: "bottom-center",
  }, "full", SAFE_ZONES.storyUi, CROPS.center),
  "split-screen": layout("split-screen", "Split Screen", {
    headline: "left-panel", subtitle: "left-column", logo: "top-left", badge: "right-panel", cta: "bottom-left",
  }, "split-left", SAFE_ZONES.editorial, CROPS.right),
  magazine: layout("magazine", "Magazine", {
    headline: "magazine-title", subtitle: "editorial-subtitle", logo: "top-right", badge: "compact-top", cta: "bottom-right",
  }, "magazine", SAFE_ZONES.editorial, CROPS.left),
  minimal: layout("minimal", "Minimal", {
    headline: "bottom-left", subtitle: "lower-left", logo: "top-left", badge: "top-right", cta: "bottom-right",
  }, "full", SAFE_ZONES.generous, CROPS.center),
  editorial: layout("editorial", "Editorial", {
    headline: "editorial-title", subtitle: "editorial-subtitle", logo: "top-right", badge: "lower-right", cta: "bottom-left",
  }, "editorial", SAFE_ZONES.editorial, CROPS.left),
  blueprint: layout("blueprint", "Blueprint", {
    headline: "blueprint-title", subtitle: "upper-center", logo: "top-right", badge: "compact-top", cta: "bottom-right",
  }, "blueprint", SAFE_ZONES.editorial, CROPS.center),
  timeline: layout("timeline", "Timeline", {
    headline: "timeline-title", subtitle: "middle-left", logo: "top-right", badge: "middle-right", cta: "bottom-center",
  }, "timeline", SAFE_ZONES.storyUi, CROPS.left),
  progress: layout("progress", "Progress", {
    headline: "progress-title", subtitle: "bottom-left", logo: "top-left", badge: "top-right", cta: "bottom-right",
  }, "progress", SAFE_ZONES.storyUi, CROPS.upper),
  comparison: layout("comparison", "Comparison", {
    headline: "comparison-title", subtitle: "lower-center", logo: "top-left", badge: "top-right", cta: "bottom-center",
  }, "comparison", SAFE_ZONES.editorial, CROPS.center),
  collage: layout("collage", "Collage", {
    headline: "upper-center", subtitle: "lower-left", logo: "top-left", badge: "top-right", cta: "bottom-right",
  }, "collage", SAFE_ZONES.generous, CROPS.center),
  "full-image": layout("full-image", "Full Image", {
    headline: "bottom-left", subtitle: "lower-left", logo: "top-left", badge: "top-right", cta: "bottom-right",
  }, "full", SAFE_ZONES.storyUi, CROPS.upper),
  diagonal: layout("diagonal", "Diagonal", {
    headline: "diagonal-title", subtitle: "bottom-left", logo: "top-right", badge: "upper-center", cta: "bottom-right",
  }, "diagonal", SAFE_ZONES.editorial, CROPS.right),
  luxury: layout("luxury", "Luxury", {
    headline: "luxury-title", subtitle: "bottom-center", logo: "top-center", badge: "top-left", cta: "bottom-right",
  }, "luxury", SAFE_ZONES.generous, CROPS.center),
};

export const IMAGE_ARRANGEMENTS: Record<ImageArrangement, Record<string, RegionConfig>> = {
  full: { main: region(0, 0, 1, 1) },
  upper: { main: region(0, 0, 1, 0.78) },
  "split-left": { main: region(0.48, 0, 0.52, 1) },
  "split-right": { main: region(0, 0, 0.52, 1) },
  magazine: { main: region(0.28, 0, 0.72, 0.78) },
  editorial: { main: region(0.42, 0.08, 0.58, 0.78) },
  blueprint: { main: region(0, 0.22, 1, 0.68) },
  timeline: { main: region(0.38, 0.24, 0.62, 0.58) },
  progress: { main: region(0, 0, 1, 0.68) },
  comparison: {
    before: region(0, 0.2, 0.49, 0.64),
    after: region(0.51, 0.2, 0.49, 0.64),
  },
  collage: {
    main: region(0.28, 0.12, 0.66, 0.62),
    detail: region(0.04, 0.48, 0.38, 0.34),
    accent: region(0.62, 0.62, 0.34, 0.26),
  },
  diagonal: { main: { ...region(0.12, 0, 0.88, 0.72), clip: "diagonal" } },
  luxury: { main: region(0, 0, 1, 0.82) },
};

export function isLayoutPresetId(value: unknown): value is LayoutPresetId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LAYOUTS, value);
}

export function getLayoutDefinition(id: LayoutPresetId): LayoutDefinition {
  return LAYOUTS[id];
}

export function imageArrangementFor(id: LayoutPresetId): Record<string, RegionConfig> {
  return IMAGE_ARRANGEMENTS[LAYOUTS[id].image_arrangement];
}

export function cropForVariant(
  definition: LayoutDefinition,
  variant: OutputVariant,
): ImageCropConfig {
  return definition.crops[variant === "story" ? "story" : "portrait"];
}
