import { loadImage } from "../assets/imageAssets";
import type {
  BadgeConfig,
  CTAConfig,
  DecorationConfig,
  LogoConfig,
  TemplateConfig,
} from "../types";
import {
  anchorPoint,
  applyAlpha,
  insetsToPixels,
  Rect,
  requireRegion,
  resolveColor,
  resolveBinding,
} from "./canvasHelpers";
import { applyTextTransform, drawBoundText } from "./drawText";
import {
  configureTypography,
  drawTrackedText,
  measureTrackedText,
} from "../typography/TypographyEngine";

function roundedRect(
  context: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
): void {
  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  context.beginPath();
  context.roundRect(rect.x, rect.y, rect.width, rect.height, r);
}

export function drawHeadline(
  context: CanvasRenderingContext2D,
  template: TemplateConfig,
  renderContext: { content?: Record<string, string>; brand?: Record<string, string> },
): void {
  drawBoundText(context, template.content_bindings.headline, template.typography, "headline", template, renderContext);
}

export function drawSubtitle(
  context: CanvasRenderingContext2D,
  template: TemplateConfig,
  renderContext: { content?: Record<string, string>; brand?: Record<string, string> },
): void {
  drawBoundText(context, template.content_bindings.subtitle, template.typography, "subtitle", template, renderContext);
}

export function drawBadge(
  context: CanvasRenderingContext2D,
  badge: BadgeConfig,
  template: TemplateConfig,
  renderContext: { content?: Record<string, string>; brand?: Record<string, string> },
): void {
  if (!badge.enabled) return;
  const text = resolveBinding(badge.text_binding, renderContext);
  if (!text) return;
  const region = requireRegion(template, badge.region, context.canvas.width, context.canvas.height);
  const padding = insetsToPixels(badge.padding, context.canvas.width, context.canvas.height);
  const textToRender = applyTextTransform(text, badge.typography.text_transform);
  context.save();
  const metrics = configureTypography(context, badge.typography, context.canvas.width);
  const textWidth = measureTrackedText(context, textToRender, metrics.letterSpacing);
  const height = metrics.lineHeight + padding.top + padding.bottom;
  const width = Math.min(region.width, textWidth + padding.left + padding.right);
  context.shadowColor = "rgba(0, 0, 0, 0)";
  context.shadowBlur = 0;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  const point = anchorPoint(region, badge.anchor);
  const box = {
    x: badge.anchor.endsWith("left") ? point.x
      : badge.anchor.endsWith("right") ? point.x - width : point.x - width / 2,
    y: badge.anchor.startsWith("top") ? point.y
      : badge.anchor.startsWith("bottom") ? point.y - height : point.y - height / 2,
    width,
    height,
  };
  roundedRect(context, box, badge.radius * metrics.scale);
  context.fillStyle = resolveColor(badge.background_color, template.colors);
  context.fill();
  if (badge.border_color) {
    context.strokeStyle = resolveColor(badge.border_color, template.colors);
    context.lineWidth = Math.max(1, metrics.scale);
    context.stroke();
  }
  configureTypography(context, badge.typography, context.canvas.width);
  context.fillStyle = resolveColor(badge.text_color, template.colors);
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawTrackedText(
    context,
    textToRender,
    box.x + box.width / 2,
    box.y + box.height / 2,
    metrics.letterSpacing,
    box.width - padding.left - padding.right,
  );
  context.restore();
}

export function drawCTA(
  context: CanvasRenderingContext2D,
  cta: CTAConfig,
  template: TemplateConfig,
  renderContext: { content?: Record<string, string>; brand?: Record<string, string> },
): void {
  if (!cta.enabled) return;
  const text = resolveBinding(cta.text_binding, renderContext);
  if (!text) return;
  const region = requireRegion(template, cta.region, context.canvas.width, context.canvas.height);
  const padding = insetsToPixels(cta.padding, context.canvas.width, context.canvas.height);
  const textToRender = applyTextTransform(text, cta.typography.text_transform);
  context.save();
  const metrics = configureTypography(context, cta.typography, context.canvas.width);
  const width = Math.min(
    region.width,
    measureTrackedText(context, textToRender, metrics.letterSpacing) + padding.left + padding.right,
  );
  const height = Math.min(
    region.height,
    metrics.lineHeight + padding.top + padding.bottom,
  );
  context.shadowColor = "rgba(0, 0, 0, 0)";
  context.shadowBlur = 0;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  const point = anchorPoint(region, cta.anchor);
  const box = {
    x: cta.anchor.endsWith("left") ? point.x
      : cta.anchor.endsWith("right") ? point.x - width : point.x - width / 2,
    y: cta.anchor.startsWith("top") ? point.y
      : cta.anchor.startsWith("bottom") ? point.y - height : point.y - height / 2,
    width,
    height,
  };
  if (cta.style !== "text") {
    roundedRect(context, box, cta.style === "pill" ? height / 2 : cta.radius * metrics.scale);
    if (cta.style === "filled" || cta.style === "pill") {
      context.fillStyle = resolveColor(cta.background_color, template.colors);
      context.fill();
    }
    if (cta.style === "outline" || cta.border_color) {
      context.strokeStyle = resolveColor(cta.border_color, template.colors);
      context.lineWidth = Math.max(1, metrics.scale);
      context.stroke();
    }
  }
  configureTypography(context, cta.typography, context.canvas.width);
  context.fillStyle = resolveColor(cta.text_color, template.colors);
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawTrackedText(
    context,
    textToRender,
    box.x + box.width / 2,
    box.y + box.height / 2,
    metrics.letterSpacing,
    Math.max(1, box.width - padding.left - padding.right),
  );
  context.restore();
}

export async function drawLogo(
  context: CanvasRenderingContext2D,
  logo: LogoConfig,
  template: TemplateConfig,
  renderContext: { imageSrc: string; content?: Record<string, string>; brand?: Record<string, string> },
  resolveAsset: (ref: string, context: { imageSrc: string; content?: Record<string, string>; brand?: Record<string, string> }) => string,
): Promise<void> {
  if (!logo.enabled) return;
  const assetRef = logo.asset_ref || "brand.logo";
  const image = await loadImage(resolveAsset(assetRef, renderContext));
  const region = requireRegion(template, logo.region, context.canvas.width, context.canvas.height);
  const width = Math.min(region.width, logo.width * region.width);
  const height = width * image.naturalHeight / image.naturalWidth;
  const point = anchorPoint(region, logo.anchor);
  const x = logo.anchor.endsWith("left") ? point.x
    : logo.anchor.endsWith("right") ? point.x - width : point.x - width / 2;
  const y = logo.anchor.startsWith("top") ? point.y
    : logo.anchor.startsWith("bottom") ? point.y - height : point.y - height / 2;
  const filter = logo.treatment === "monochrome" ? "grayscale(1)"
    : logo.treatment === "light" ? "grayscale(1) brightness(0) invert(1)"
      : logo.treatment === "dark" ? "grayscale(1) brightness(0)" : "none";
  context.save();
  context.filter = filter;
  applyAlpha(context, logo.opacity, () => context.drawImage(image, x, y, width, height));
  context.restore();
}

export async function drawDecoration(
  context: CanvasRenderingContext2D,
  decoration: DecorationConfig,
  template: TemplateConfig,
  renderContext: { imageSrc: string; content?: Record<string, string>; brand?: Record<string, string> },
  resolveAsset: (ref: string, context: { imageSrc: string; content?: Record<string, string>; brand?: Record<string, string> }) => string,
): Promise<void> {
  const rect = requireRegion(template, decoration.region, context.canvas.width, context.canvas.height);
  const scale = context.canvas.width / 1080;
  applyAlpha(context, decoration.opacity, () => {
    context.strokeStyle = resolveColor(decoration.color, template.colors);
    context.fillStyle = resolveColor(decoration.color, template.colors);
    context.lineWidth = (decoration.thickness || 1) * scale;
    if (decoration.type === "line") {
      context.beginPath();
      context.moveTo(rect.x, rect.y + rect.height / 2);
      context.lineTo(rect.x + rect.width, rect.y + rect.height / 2);
      context.stroke();
    } else if (decoration.type === "frame") {
      roundedRect(context, rect, (decoration.radius || 0) * scale);
      context.stroke();
    } else if (decoration.type === "shape") {
      roundedRect(context, rect, (decoration.radius || 0) * scale);
      context.fill();
    }
  });
  if (decoration.type === "texture" && decoration.asset_ref) {
    const image = await loadImage(resolveAsset(decoration.asset_ref, renderContext));
    applyAlpha(context, decoration.opacity, () => context.drawImage(image, rect.x, rect.y, rect.width, rect.height));
  }
}
