import type {
  ResponsiveScalingConfig,
  TextShadowConfig,
  TypographyConfig,
  TypographyPresetId,
} from "../types";
import { getTypographyPreset } from "./typographyPresets";

const DEFAULT_SHADOW: TextShadowConfig = {
  enabled: false,
  color: "rgba(0, 0, 0, 0.45)",
  blur: 0,
  offset_x: 0,
  offset_y: 0,
};

const DEFAULT_SCALING: ResponsiveScalingConfig = {
  enabled: false,
  reference_width: 1080,
  min_scale: 0.5,
  max_scale: 2,
};

export type TypographyPresetOverrides = Partial<Pick<
  TypographyConfig,
  | "family"
  | "fallback_family"
  | "weight"
  | "letter_spacing"
  | "shadow"
  | "line_height"
  | "alignment"
  | "responsive_scaling"
>>;

export function applyTypographyPreset(
  current: TypographyConfig,
  presetId: TypographyPresetId,
  overrides: TypographyPresetOverrides = {},
): TypographyConfig {
  const { id, label: _label, ...style } = getTypographyPreset(presetId);
  return {
    ...current,
    ...style,
    ...overrides,
    preset: id,
    size: current.size,
    color: current.color,
    text_transform: current.text_transform,
  };
}

export interface TypographyMetrics {
  scale: number;
  size: number;
  lineHeight: number;
  letterSpacing: number;
}

export function typographyMetrics(
  typography: TypographyConfig,
  canvasWidth: number,
): TypographyMetrics {
  const responsive = typography.responsive_scaling || DEFAULT_SCALING;
  const referenceWidth = Math.max(1, responsive.reference_width);
  const rawScale = responsive.enabled ? canvasWidth / referenceWidth : canvasWidth / 1080;
  const scale = responsive.enabled
    ? Math.max(responsive.min_scale, Math.min(responsive.max_scale, rawScale))
    : rawScale;
  return {
    scale,
    size: typography.size * scale,
    lineHeight: typography.size * typography.line_height * scale,
    letterSpacing: typography.letter_spacing * scale,
  };
}

export function configureTypography(
  context: CanvasRenderingContext2D,
  typography: TypographyConfig,
  canvasWidth: number,
): TypographyMetrics {
  const metrics = typographyMetrics(typography, canvasWidth);
  const shadow = typography.shadow || DEFAULT_SHADOW;
  context.font = fontString(typography, metrics.size);
  context.shadowColor = shadow.enabled ? shadow.color : "rgba(0, 0, 0, 0)";
  context.shadowBlur = shadow.enabled ? shadow.blur * metrics.scale : 0;
  context.shadowOffsetX = shadow.enabled ? shadow.offset_x * metrics.scale : 0;
  context.shadowOffsetY = shadow.enabled ? shadow.offset_y * metrics.scale : 0;
  return metrics;
}

export function fontString(typography: TypographyConfig, size: number): string {
  const weight = typography.weight === "regular" ? "400"
    : typography.weight === "medium" ? "500"
      : typography.weight === "semibold" ? "600" : "700";
  const family = `"${typography.family.replace(/["\\]/g, "")}", "${typography.fallback_family.replace(/["\\]/g, "")}", sans-serif`;
  return `${weight} ${size}px ${family}`;
}

export function measureTrackedText(
  context: CanvasRenderingContext2D,
  text: string,
  letterSpacing: number,
): number {
  const glyphs = Array.from(text);
  return glyphs.reduce((sum, glyph) => sum + context.measureText(glyph).width, 0)
    + Math.max(0, glyphs.length - 1) * letterSpacing;
}

export function drawTrackedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number,
  maxWidth = Number.POSITIVE_INFINITY,
): void {
  if (!text) return;
  const glyphs = Array.from(text);
  const measured = measureTrackedText(context, text, letterSpacing);
  const availableWidth = Math.max(1, maxWidth);
  const compression = Math.min(1, availableWidth / Math.max(1, measured));
  const spacing = letterSpacing * compression;
  const width = measured * compression;
  let cursor = context.textAlign === "center" ? x - width / 2
    : context.textAlign === "right" || context.textAlign === "end" ? x - width : x;
  for (const glyph of glyphs) {
    const glyphWidth = context.measureText(glyph).width;
    if (compression < 1) context.fillText(glyph, cursor, y, glyphWidth * compression);
    else context.fillText(glyph, cursor, y);
    cursor += glyphWidth * compression + spacing;
  }
}
