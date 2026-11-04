import type { TypographyConfig, TemplateConfig } from "../types";
import { requireRegion, resolveBinding, resolveColor } from "./canvasHelpers";
import {
  configureTypography,
  drawTrackedText,
} from "../typography/TypographyEngine";

export function applyTextTransform(value: string, transform: TypographyConfig["text_transform"]): string {
  if (transform === "uppercase") return value.toLocaleUpperCase();
  if (transform === "lowercase") return value.toLocaleLowerCase();
  if (transform === "capitalize") return value.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
  return value;
}

export function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  letterSpacing = 0,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    const candidateWidth = context.measureText(candidate).width
      + Math.max(0, Array.from(candidate).length - 1) * letterSpacing;
    if (line && candidateWidth > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawTextBlock(
  context: CanvasRenderingContext2D,
  text: string,
  typography: TypographyConfig,
  regionId: string,
  template: TemplateConfig,
): void {
  if (!text) return;
  const canvas = context.canvas;
  const rect = requireRegion(template, regionId, canvas.width, canvas.height);
  if (!rect.width || !rect.height) return;
  const transformed = applyTextTransform(text, typography.text_transform);
  const alignment = template.layout.regions?.[regionId]?.align || typography.alignment;

  context.save();
  const metrics = configureTypography(context, typography, canvas.width);
  const lineHeight = metrics.lineHeight;
  const spacing = metrics.letterSpacing;
  context.fillStyle = resolveColor(typography.color, template.colors);
  context.textAlign = alignment;
  context.textBaseline = "top";
  context.direction = "inherit";
  const lines = wrapText(context, transformed, rect.width, spacing);
  const maxLines = Math.max(1, Math.floor(rect.height / Math.max(lineHeight, metrics.size)));
  const visibleLines = lines.slice(0, maxLines);
  const x = alignment === "left" ? rect.x : alignment === "right" ? rect.x + rect.width : rect.x + rect.width / 2;
  visibleLines.forEach((line, index) => {
    drawTrackedText(context, line, x, rect.y + index * lineHeight, spacing, rect.width);
  });
  context.restore();
}

export function drawBoundText(
  context: CanvasRenderingContext2D,
  binding: string,
  typography: TypographyConfig,
  regionId: string,
  template: TemplateConfig,
  renderContext: { content?: Record<string, string>; brand?: Record<string, string> },
): void {
  drawTextBlock(
    context,
    resolveBinding(binding, renderContext),
    typography,
    regionId,
    template,
  );
}
