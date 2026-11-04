import type { OverlayConfig, TemplateConfig } from "../types";
import { Rect, requireRegion, resolveColor, toRgba } from "./canvasHelpers";

const compositeModes: Record<OverlayConfig["blend_mode"], GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
};

const textureCache = new Map<string, HTMLCanvasElement>();

function overlayRect(
  context: CanvasRenderingContext2D,
  overlay: OverlayConfig,
  template: TemplateConfig,
): Rect {
  if (overlay.region === "canvas") {
    return { x: 0, y: 0, width: context.canvas.width, height: context.canvas.height };
  }
  return requireRegion(template, overlay.region, context.canvas.width, context.canvas.height);
}

function drawGradient(
  context: CanvasRenderingContext2D,
  overlay: OverlayConfig,
  rect: Rect,
  color: string,
  end: string,
  type: "linear" | "radial",
): void {
  if (type === "linear") {
    const angle = ((overlay.angle ?? 90) * Math.PI) / 180;
    const dx = Math.cos(angle) * rect.width / 2;
    const dy = Math.sin(angle) * rect.height / 2;
    const gradient = context.createLinearGradient(
      rect.x + rect.width / 2 - dx,
      rect.y + rect.height / 2 - dy,
      rect.x + rect.width / 2 + dx,
      rect.y + rect.height / 2 + dy,
    );
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, end);
    context.fillStyle = gradient;
  } else {
    const radius = Math.max(rect.width, rect.height) / 2;
    const gradient = context.createRadialGradient(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      0,
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      radius,
    );
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, toRgba(end, 0));
    context.fillStyle = gradient;
  }
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function textureTile(
  type: "noise_texture" | "paper_texture" | "film_grain" | "diagonal_stripe",
  color: string,
  background: string,
  scale: number,
  seed: number,
): HTMLCanvasElement {
  const key = `${type}:${color}:${background}:${scale}:${seed}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const tile = document.createElement("canvas");
  const size = Math.max(16, Math.min(256, Math.round(scale)));
  tile.width = size;
  tile.height = size;
  const context = tile.getContext("2d");
  if (!context) throw new Error("Could not create an overlay texture canvas.");

  if (type === "diagonal_stripe") {
    context.clearRect(0, 0, size, size);
    context.strokeStyle = color;
    context.lineWidth = Math.max(1, size * 0.18);
    context.beginPath();
    context.moveTo(-size / 2, size / 2);
    context.lineTo(size / 2, -size / 2);
    context.moveTo(0, size);
    context.lineTo(size, 0);
    context.moveTo(size / 2, size * 1.5);
    context.lineTo(size * 1.5, size / 2);
    context.stroke();
  } else {
    context.fillStyle = background;
    context.fillRect(0, 0, size, size);
    const random = seededRandom(seed);
    const count = type === "paper_texture" ? size * 2 : size * size;
    for (let index = 0; index < count; index += 1) {
      const x = Math.floor(random() * size);
      const y = Math.floor(random() * size);
      const alpha = type === "paper_texture" ? 0.03 + random() * 0.09 : 0.12 + random() * 0.32;
      context.fillStyle = toRgba(color, alpha);
      if (type === "paper_texture") {
        context.fillRect(x, y, 1 + random() * 4, 1);
      } else {
        context.fillRect(x, y, 1, 1);
      }
    }
  }
  textureCache.set(key, tile);
  if (textureCache.size > 32) {
    const oldestKey = textureCache.keys().next().value;
    if (oldestKey) textureCache.delete(oldestKey);
  }
  return tile;
}

function drawTexture(
  context: CanvasRenderingContext2D,
  overlay: OverlayConfig,
  rect: Rect,
  color: string,
  background: string,
): void {
  const textureType = overlay.type as "noise_texture" | "paper_texture" | "film_grain" | "diagonal_stripe";
  const tile = textureTile(
    textureType,
    color,
    background,
    overlay.scale || (textureType === "paper_texture" ? 128 : 64),
    overlay.seed || 1,
  );
  const pattern = context.createPattern(tile, "repeat");
  if (!pattern) throw new Error(`Could not create the ${overlay.type} overlay pattern.`);
  context.fillStyle = pattern;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function drawGlass(
  context: CanvasRenderingContext2D,
  overlay: OverlayConfig,
  rect: Rect,
  color: string,
  end: string,
): void {
  const canvas = context.canvas;
  const left = Math.max(0, Math.floor(rect.x));
  const top = Math.max(0, Math.floor(rect.y));
  const right = Math.min(canvas.width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(canvas.height, Math.ceil(rect.y + rect.height));
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  if (!width || !height) return;

  const snapshot = document.createElement("canvas");
  snapshot.width = width;
  snapshot.height = height;
  const snapshotContext = snapshot.getContext("2d");
  if (!snapshotContext) throw new Error("Could not create the glass overlay snapshot.");
  snapshotContext.drawImage(canvas, left, top, width, height, 0, 0, width, height);

  context.save();
  const radius = Math.max(0, overlay.radius || 0);
  context.beginPath();
  context.roundRect(left, top, width, height, radius);
  context.clip();
  context.filter = `blur(${Math.max(0, overlay.blur_px ?? 12)}px)`;
  context.drawImage(snapshot, left, top);
  context.filter = "none";
  context.fillStyle = toRgba(color, Math.min(1, overlay.intensity ?? 0.32));
  context.fillRect(left, top, width, height);
  context.strokeStyle = toRgba(end, overlay.intensity ?? 0.32);
  context.lineWidth = Math.max(1, overlay.line_width || 1);
  context.stroke();
  context.restore();
}

function drawFrame(
  context: CanvasRenderingContext2D,
  overlay: OverlayConfig,
  rect: Rect,
  color: string,
): void {
  const inset = Math.max(0, overlay.inset || 0);
  const x = rect.x + inset;
  const y = rect.y + inset;
  const width = Math.max(0, rect.width - inset * 2);
  const height = Math.max(0, rect.height - inset * 2);
  const lineWidth = Math.max(1, overlay.line_width || 3);
  const length = Math.min(width, height) * (overlay.type === "corner_accents" ? 0.12 : 1);

  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.lineJoin = "miter";
  context.beginPath();
  if (overlay.type === "corner_accents") {
    context.moveTo(x, y + length);
    context.lineTo(x, y);
    context.lineTo(x + length, y);
    context.moveTo(x + width - length, y);
    context.lineTo(x + width, y);
    context.lineTo(x + width, y + length);
    context.moveTo(x + width, y + height - length);
    context.lineTo(x + width, y + height);
    context.lineTo(x + width - length, y + height);
    context.moveTo(x + length, y + height);
    context.lineTo(x, y + height);
    context.lineTo(x, y + height - length);
  } else if (overlay.radius) {
    context.roundRect(x, y, width, height, overlay.radius);
  } else {
    context.rect(x, y, width, height);
  }
  context.stroke();
  context.restore();
}

function drawBlueprintGrid(
  context: CanvasRenderingContext2D,
  overlay: OverlayConfig,
  rect: Rect,
  color: string,
): void {
  const spacing = Math.max(4, overlay.spacing || 32);
  const lineWidth = Math.max(0.5, overlay.line_width || 1);
  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.beginPath();
  for (let x = rect.x; x <= rect.x + rect.width; x += spacing) {
    context.moveTo(x, rect.y);
    context.lineTo(x, rect.y + rect.height);
  }
  for (let y = rect.y; y <= rect.y + rect.height; y += spacing) {
    context.moveTo(rect.x, y);
    context.lineTo(rect.x + rect.width, y);
  }
  context.stroke();
  context.restore();
}

function drawProgressRibbon(
  context: CanvasRenderingContext2D,
  overlay: OverlayConfig,
  rect: Rect,
  color: string,
  end: string,
): void {
  const height = Math.min(rect.height, Math.max(12, overlay.font_size || 54));
  const y = rect.y + rect.height - height;
  const angle = Math.max(0, Math.min(80, overlay.angle ?? 12)) * Math.PI / 180;
  const cut = Math.min(rect.width * 0.25, height * Math.tan(angle));
  context.save();
  context.beginPath();
  context.moveTo(rect.x + cut, y);
  context.lineTo(rect.x + rect.width, y);
  context.lineTo(rect.x + rect.width - cut, y + height);
  context.lineTo(rect.x, y + height);
  context.closePath();
  const gradient = context.createLinearGradient(rect.x, y, rect.x + rect.width, y + height);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, end);
  context.fillStyle = gradient;
  context.fill();
  if (overlay.text) {
    context.fillStyle = overlay.end_color ? "#ffffff" : "#101012";
    context.font = `600 ${Math.max(12, overlay.font_size || height * 0.48)}px Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(overlay.text, rect.x + rect.width / 2, y + height / 2, rect.width * 0.8);
  }
  context.restore();
}

export function drawOverlay(
  context: CanvasRenderingContext2D,
  overlay: OverlayConfig,
  template: TemplateConfig,
): void {
  const rect = overlayRect(context, overlay, template);
  if (!rect.width || !rect.height) return;
  const color = resolveColor(overlay.color, template.colors);
  const end = overlay.end_color ? resolveColor(overlay.end_color, template.colors) : color;

  context.save();
  context.globalCompositeOperation = compositeModes[overlay.blend_mode];
  context.globalAlpha *= overlay.opacity;

  switch (overlay.type) {
    case "linear_gradient":
      drawGradient(context, overlay, rect, color, end, "linear");
      break;
    case "radial_gradient":
      drawGradient(context, overlay, rect, color, end, "radial");
      break;
    case "luxury_gradient":
      drawGradient(context, overlay, rect, toRgba(color, 0), toRgba(end, 0.78), "linear");
      break;
    case "dark_gradient":
      drawGradient(context, overlay, rect, toRgba(color, 0), toRgba(end, 0.9), "linear");
      break;
    case "glass":
      drawGlass(context, overlay, rect, color, end);
      break;
    case "blur": {
      const snapshot = document.createElement("canvas");
      snapshot.width = context.canvas.width;
      snapshot.height = context.canvas.height;
      const snapshotContext = snapshot.getContext("2d");
      if (!snapshotContext) throw new Error("Could not create the blur overlay snapshot.");
      snapshotContext.drawImage(context.canvas, 0, 0);
      context.beginPath();
      context.rect(rect.x, rect.y, rect.width, rect.height);
      context.clip();
      context.filter = `blur(${Math.max(0, overlay.blur_px ?? 8)}px)`;
      context.drawImage(snapshot, rect.x, rect.y, rect.width, rect.height, rect.x, rect.y, rect.width, rect.height);
      context.filter = "none";
      if (overlay.intensity) {
        context.fillStyle = toRgba(color, overlay.intensity);
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
      break;
    }
    case "blueprint_grid":
      drawBlueprintGrid(context, overlay, rect, color);
      break;
    case "golden_frame":
    case "corner_accents":
      drawFrame(context, overlay, rect, color);
      break;
    case "progress_ribbon":
      drawProgressRibbon(context, overlay, rect, color, end);
      break;
    case "diagonal_stripe":
      drawTexture(context, overlay, rect, color, "rgba(0,0,0,0)");
      break;
    case "noise_texture":
    case "film_grain":
      drawTexture(context, overlay, rect, color, "rgba(0,0,0,0)");
      break;
    case "paper_texture":
      drawTexture(context, overlay, rect, color, end);
      break;
    case "scrim":
    case "color_wash":
    default:
      context.fillStyle = color;
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  context.restore();
}
