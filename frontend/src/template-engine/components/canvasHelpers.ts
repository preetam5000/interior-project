import type {
  Anchor,
  ColorConfig,
  ColorValue,
  InsetsConfig,
  RegionConfig,
  TemplateConfig,
} from "../types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function resolveColor(value: ColorValue, colors: ColorConfig): string {
  if (!value.startsWith("$")) return value;
  const token = value.slice(1) as keyof ColorConfig;
  const resolved = colors[token];
  if (!resolved) throw new Error(`Unknown template color token: ${value}`);
  return resolved;
}

export function regionRect(
  region: RegionConfig,
  width: number,
  height: number,
  safeArea: InsetsConfig = {},
): Rect {
  const safeLeft = (safeArea.left || 0) * width;
  const safeRight = (safeArea.right || 0) * width;
  const safeTop = (safeArea.top || 0) * height;
  const safeBottom = (safeArea.bottom || 0) * height;
  const safeWidth = width - safeLeft - safeRight;
  const safeHeight = height - safeTop - safeBottom;
  const padding = region.padding || {};
  const left = (padding.left || 0) * width;
  const right = (padding.right || 0) * width;
  const top = (padding.top || 0) * height;
  const bottom = (padding.bottom || 0) * height;
  return {
    x: safeLeft + region.x * safeWidth + left,
    y: safeTop + region.y * safeHeight + top,
    width: Math.max(0, region.width * safeWidth - left - right),
    height: Math.max(0, region.height * safeHeight - top - bottom),
  };
}

export function requireRegion(
  template: TemplateConfig,
  regionId: string,
  width: number,
  height: number,
): Rect {
  const region = template.layout.regions?.[regionId];
  if (!region) throw new Error(`Template "${template.id}" references missing region "${regionId}".`);
  return regionRect(region, width, height, template.layout.safe_area);
}

export function anchorPoint(rect: Rect, anchor: Anchor): { x: number; y: number } {
  const horizontal = anchor.endsWith("left") ? 0 : anchor.endsWith("right") ? 1 : 0.5;
  const vertical = anchor.startsWith("top") ? 0 : anchor.startsWith("bottom") ? 1 : 0.5;
  return { x: rect.x + rect.width * horizontal, y: rect.y + rect.height * vertical };
}

export function applyAlpha(
  context: CanvasRenderingContext2D,
  opacity: number,
  draw: () => void,
): void {
  context.save();
  context.globalAlpha *= Math.max(0, Math.min(1, opacity));
  draw();
  context.restore();
}

export function toRgba(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const value = Number.parseInt(match[1], 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

export function insetsToPixels(
  insets: InsetsConfig,
  width: number,
  height: number,
): { top: number; right: number; bottom: number; left: number } {
  return {
    top: (insets.top || 0) * height,
    right: (insets.right || 0) * width,
    bottom: (insets.bottom || 0) * height,
    left: (insets.left || 0) * width,
  };
}

export function resolveBinding(binding: string, context: {
  content?: Record<string, string>;
  brand?: Record<string, string>;
}): string {
  const match = /^(content|brand)\.([a-zA-Z0-9_]+)(?:\|(.*))?$/.exec(binding);
  if (!match) return binding;
  const values = match[1] === "content" ? context.content : context.brand;
  return values?.[match[2]] ?? match[3] ?? "";
}
