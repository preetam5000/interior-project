import type {
  Alignment,
  ResponsiveScalingConfig,
  TextShadowConfig,
  TypographyConfig,
  TypographyPresetId,
} from "../types";

export interface TypographyPreset {
  id: TypographyPresetId;
  label: string;
  family: string;
  fallback_family: string;
  weight: TypographyConfig["weight"];
  letter_spacing: number;
  shadow: TextShadowConfig;
  line_height: number;
  alignment: Alignment;
  responsive_scaling: ResponsiveScalingConfig;
}

const noShadow: TextShadowConfig = {
  enabled: false,
  color: "rgba(0, 0, 0, 0.45)",
  blur: 0,
  offset_x: 0,
  offset_y: 0,
};

const softShadow: TextShadowConfig = {
  enabled: true,
  color: "rgba(0, 0, 0, 0.38)",
  blur: 12,
  offset_x: 0,
  offset_y: 3,
};

const scaling: ResponsiveScalingConfig = {
  enabled: true,
  reference_width: 1080,
  min_scale: 0.72,
  max_scale: 1.25,
};

const preset = (
  id: TypographyPresetId,
  label: string,
  family: string,
  fallback_family: string,
  weight: TypographyConfig["weight"],
  letter_spacing: number,
  shadow: TextShadowConfig,
  line_height: number,
  alignment: Alignment,
  responsive_scaling: ResponsiveScalingConfig = scaling,
): TypographyPreset => ({
  id,
  label,
  family,
  fallback_family,
  weight,
  letter_spacing,
  shadow,
  line_height,
  alignment,
  responsive_scaling,
});

export const TYPOGRAPHY_PRESETS: Record<TypographyPresetId, TypographyPreset> = {
  luxury: preset("luxury", "Luxury", "Playfair Display", "Georgia", "regular", 2.4, softShadow, 1.22, "center"),
  modern: preset("modern", "Modern", "Inter", "Arial", "medium", 0.2, noShadow, 1.18, "left"),
  minimal: preset("minimal", "Minimal", "Helvetica Neue", "Arial", "regular", 0.4, noShadow, 1.2, "left"),
  construction: preset("construction", "Construction", "Roboto Condensed", "Arial Narrow", "bold", 1.1, softShadow, 1.08, "left"),
  editorial: preset("editorial", "Editorial", "Cormorant Garamond", "Georgia", "regular", 0.8, noShadow, 1.28, "left"),
  architectural: preset("architectural", "Architectural", "Montserrat", "Arial", "medium", 1.8, noShadow, 1.16, "left"),
  magazine: preset("magazine", "Magazine", "Bodoni 72", "Times New Roman", "regular", 1.2, softShadow, 1.12, "left"),
  elegant: preset("elegant", "Elegant", "Cormorant Garamond", "Georgia", "medium", 1.4, noShadow, 1.3, "center"),
  bold: preset("bold", "Bold", "Montserrat", "Arial", "bold", -0.5, softShadow, 1.05, "left"),
  instagram: preset("instagram", "Instagram", "Inter", "Arial", "semibold", 0, softShadow, 1.15, "center"),
};

export const TYPOGRAPHY_PRESET_IDS = Object.keys(TYPOGRAPHY_PRESETS) as TypographyPresetId[];

export function getTypographyPreset(id: TypographyPresetId): TypographyPreset {
  return TYPOGRAPHY_PRESETS[id];
}
