import type { DesignElement, DesignGradient, DesignTemplate } from "../../types/designTemplate";
import type { ExportRenderer } from "./types";
import type { PreparedExport } from "../types";
import { effectPlanToSvg, type SvgEffectAdapterResult } from "./svgEffects";

function esc(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function resolveContent(element: DesignElement, prepared: PreparedExport): string {
  const value = element.content || "";
  const binding = /^(content|brand)\.([\w]+)(?:\|(.*))?$/.exec(value);
  if (!binding) return value;
  const resolved = (binding[1] === "content" ? prepared.context.content : prepared.context.brand)?.[binding[2]];
  return resolved || binding[3] || "";
}

function gradientDefinition(id: string, gradient: DesignGradient): string {
  const stops = gradient.stops.map((stop) => `<stop offset="${Math.max(0, Math.min(1, stop.position)) * 100}%" stop-color="${esc(stop.color)}"${stop.opacity === undefined ? "" : ` stop-opacity="${stop.opacity}"`}/>`).join("");
  if (gradient.type === "radial") return `<radialGradient id="${id}">${stops}</radialGradient>`;
  return `<linearGradient id="${id}" gradientTransform="rotate(${gradient.angle || 0} .5 .5)">${stops}</linearGradient>`;
}

function elementImageSource(element: DesignElement, template: DesignTemplate, prepared: PreparedExport): string | undefined {
  if (element.type === "Logo") return prepared.context.brand?.logo || prepared.context.brand?.logoUrl || template.branding.logo || element.source;
  const source = element.source || prepared.context.imageSrc;
  if (!source) return undefined;
  return prepared.context.assets?.[source] || prepared.context.assets?.[source.replace(/^asset:/, "")] || source;
}

function elementSvg(element: DesignElement, template: DesignTemplate, prepared: PreparedExport, width: number, height: number, effects: SvgEffectAdapterResult): string {
  if (!element.visible || (element.type as string) === "Video") return "";
  const x = element.x * width;
  const y = element.y * height;
  const w = element.width * width;
  const h = element.height * height;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rotate = element.rotation ? ` transform="rotate(${element.rotation} ${cx} ${cy})"` : "";
  const gradientId = `gradient-${element.id.replace(/[^\w-]/g, "-")}`;
  const fill = effects.fill || (element.gradient ? `url(#${gradientId})` : String(element.style?.background || element.color || "#222222"));
  const content = resolveContent(element, prepared);
  const fontSize = (element.fontSize || 24) * width / template.canvas.width;
  const textAnchor = element.alignment === "center" ? "middle" : element.alignment === "right" ? "end" : "start";
  const textX = element.alignment === "center" ? x + w / 2 : element.alignment === "right" ? x + w - 4 : x + 4;
  const textStroke = effects.stroke ? ` stroke="${esc(effects.stroke)}" stroke-width="${effects.strokeWidth || 1}" paint-order="stroke fill"` : "";
  const text = content ? `<text x="${textX}" y="${y + h / 2}" dominant-baseline="middle" text-anchor="${textAnchor}" font-family="${esc(element.fontFamily || "Arial")}" font-size="${fontSize}" font-weight="${esc(element.fontWeight || "normal")}" fill="${esc(effects.fill || element.color || "#222222")}"${textStroke} letter-spacing="${element.letterSpacing || 0}">${content.split("\n").map((line, index) => `<tspan x="${textX}" dy="${index === 0 ? 0 : fontSize * (element.lineHeight || 1.2)}">${esc(line)}</tspan>`).join("")}</text>` : "";
  const wrapEffects = (svg: string) => `${effects.definitions ? `<defs>${effects.definitions}</defs>` : ""}<g id="element-${esc(element.id)}"${effects.attributes}>${svg}${effects.overlays}</g>`;

  if (element.type === "Image" || element.type === "Logo") {
    const src = elementImageSource(element, template, prepared);
    if (!src) return "";
    const preserve = element.crop === "contain" ? "xMidYMid meet" : element.crop === "fill" ? "none" : "xMidYMid slice";
    const fillOverlay = effects.fill ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${esc(effects.fill)}"/>` : "";
    const borderOverlay = effects.stroke ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${esc(effects.stroke)}" stroke-width="${effects.strokeWidth || 1}"/>` : "";
    return wrapEffects(`<image x="${x}" y="${y}" width="${w}" height="${h}" href="${esc(src)}" preserveAspectRatio="${preserve}"${rotate}/>${fillOverlay}${borderOverlay}`);
  }
  if (["Shape", "Gradient", "Decorative Object", "Divider"].includes(element.type)) {
    const rx = Number(element.borderRadius ?? element.radius ?? 0) * width / template.canvas.width;
    const stroke = effects.stroke ? ` stroke="${esc(effects.stroke)}" stroke-width="${effects.strokeWidth || 1}"` : element.border ? ` stroke="${esc(element.border.color)}" stroke-width="${element.border.width}"` : "";
    const rect = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${effects.stroke ? effects.strokeWidth || 1 : rx}" fill="${esc(fill)}"${stroke}/>`;
    return wrapEffects(`<g${rotate}>${rect}${text}</g>`);
  }
  if (element.type === "CTA Button" || element.type === "Badge") {
    const radius = Number(element.borderRadius ?? element.radius ?? 12) * width / template.canvas.width;
    const buttonFill = String(element.style?.background || template.branding.palette?.primary || "#111827");
    const stroke = effects.stroke ? ` stroke="${esc(effects.stroke)}" stroke-width="${effects.strokeWidth || 1}"` : "";
    return wrapEffects(`<g${rotate}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${effects.stroke ? effects.strokeWidth || 1 : radius}" fill="${esc(effects.fill || buttonFill)}"${stroke}/>${text}</g>`);
  }
  return wrapEffects(`<g${rotate}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="transparent"/>${text}</g>`);
}

export class DesignTemplateSvgRenderer implements ExportRenderer {
  readonly sourceKind = "design-document" as const;

  async render(prepared: PreparedExport) {
    const template = prepared.document as DesignTemplate;
    const { width, height } = prepared.profile;
    const backgroundGradientId = "document-background-gradient";
    const effects = template.elements.map((element) => effectPlanToSvg(element, template));
    const gradients = template.elements.flatMap((element) => element.gradient ? [gradientDefinition(`gradient-${element.id.replace(/[^\w-]/g, "-")}`, element.gradient)] : []);
    if (template.background.gradient) gradients.push(gradientDefinition(backgroundGradientId, template.background.gradient));
    const backgroundImage = template.background.image
      ? prepared.context.assets?.[template.background.image] || template.background.image
      : undefined;
    const background = template.background.gradient
      ? `url(#${backgroundGradientId})`
      : esc(template.background.color || "#ffffff");
    const image = backgroundImage ? `<image x="0" y="0" width="${width}" height="${height}" href="${esc(backgroundImage)}" preserveAspectRatio="xMidYMid slice"/>` : "";
    const nodes = [...template.elements].sort((a, b) => a.zIndex - b.zIndex).map((element) => { const index = template.elements.indexOf(element); return elementSvg(element, template, prepared, width, height, effects[index]); }).join("");
    const animationMetadata = esc(JSON.stringify(template.animations || []));
    const backgroundNode = prepared.transparentBackground ? "" : `<rect width="100%" height="100%" fill="${background}"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><metadata id="design-animation-metadata">${animationMetadata}</metadata><defs>${gradients.join("")}</defs>${backgroundNode}${image}${nodes}</svg>`;
    return { width, height, svg };
  }
}
