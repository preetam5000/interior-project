import type { OverlayConfig } from "../types";

export type OverlayStyle = Exclude<
  OverlayConfig["type"],
  "scrim" | "linear_gradient" | "radial_gradient" | "color_wash"
>;

export type OverlayPresetDefaults = Omit<OverlayConfig, "id" | "type" | "region">;

const defaults = (
  color: string,
  end_color: string,
  options: Partial<OverlayPresetDefaults> = {},
): OverlayPresetDefaults => ({
  color,
  end_color,
  opacity: 1,
  angle: 90,
  blend_mode: "normal",
  ...options,
});

export const OVERLAY_PRESETS: Record<OverlayStyle, OverlayPresetDefaults> = {
  luxury_gradient: defaults("$secondary", "$primary", { opacity: 0.75, angle: 90 }),
  dark_gradient: defaults("#000000", "#000000", { opacity: 0.82, angle: 90 }),
  glass: defaults("#FFFFFF", "#FFFFFF", {
    opacity: 0.85,
    blur_px: 12,
    intensity: 0.32,
    line_width: 1,
    radius: 24,
  }),
  blur: defaults("#000000", "#000000", {
    opacity: 1,
    blur_px: 10,
    intensity: 0.08,
  }),
  blueprint_grid: defaults("#9EDCFF", "#9EDCFF", {
    opacity: 0.34,
    spacing: 32,
    line_width: 1,
    blend_mode: "screen",
  }),
  golden_frame: defaults("$accent", "$accent", {
    opacity: 0.95,
    inset: 36,
    line_width: 3,
  }),
  corner_accents: defaults("$accent", "$accent", {
    opacity: 0.95,
    inset: 36,
    line_width: 4,
  }),
  progress_ribbon: defaults("$primary", "$accent", {
    opacity: 1,
    angle: 12,
    font_size: 44,
    text: "",
  }),
  diagonal_stripe: defaults("#FFFFFF", "#FFFFFF", {
    opacity: 0.2,
    scale: 48,
    angle: 45,
  }),
  noise_texture: defaults("#FFFFFF", "#FFFFFF", {
    opacity: 0.16,
    scale: 64,
    seed: 1,
    blend_mode: "overlay",
  }),
  paper_texture: defaults("#796E5B", "#F5F0E6", {
    opacity: 0.48,
    scale: 128,
    seed: 7,
    blend_mode: "multiply",
  }),
  film_grain: defaults("#FFFFFF", "#FFFFFF", {
    opacity: 0.2,
    scale: 48,
    seed: 13,
    blend_mode: "overlay",
  }),
};

export interface CreateOverlayOptions {
  id: string;
  region?: string;
  overrides?: Partial<OverlayConfig>;
}

export function createOverlayConfig(
  type: OverlayStyle,
  options: CreateOverlayOptions,
): OverlayConfig {
  return {
    ...OVERLAY_PRESETS[type],
    ...options.overrides,
    id: options.id,
    type,
    region: options.region || "canvas",
  };
}
