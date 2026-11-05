import type { DesignElement, DesignTemplate } from "../../types/designTemplate";
import { resolveEffectPlan } from "../../core/effects";

const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const safeId = (value: string) => value.replace(/[^\w-]/g, "-");

export interface SvgEffectAdapterResult { definitions: string; attributes: string; fill?: string; stroke?: string; strokeWidth?: number; overlays: string }

/** SVG renderer adapter. The source effect list remains unchanged and JSON-serializable. */
export function effectPlanToSvg(element: DesignElement, template: DesignTemplate): SvgEffectAdapterResult {
  const plan = resolveEffectPlan(element, template.canvas, (color) => color.startsWith("$") ? template.branding.palette?.[color.slice(1)] || color : color);
  const id = safeId(element.id), filterId = `effects-${id}`;
  const x = element.x * template.canvas.width, y = element.y * template.canvas.height;
  const width = element.width * template.canvas.width, height = element.height * template.canvas.height;
  const definitions: string[] = [], filter: string[] = [];
  let result = "SourceGraphic";
  let fill: string | undefined;
  let stroke: string | undefined;
  let strokeWidth: number | undefined;
  const overlays: string[] = [];
  for (const [index, effect] of plan.operations.entries()) {
    const color = esc(effect.color || "#000000"), blur = Math.max(0, effect.blur || 0), next = `effect-${index}`;
    if (effect.gradient && ["gradient-fill", "gradient-border"].includes(effect.type)) {
      const gradientId = `${effect.type}-${id}-${index}`;
      const stops = effect.gradient.stops.map((stop) => `<stop offset="${Math.max(0, Math.min(1, stop.position)) * 100}%" stop-color="${esc(stop.color)}"${stop.opacity === undefined ? "" : ` stop-opacity="${stop.opacity}"`}/>`).join("");
      definitions.push(effect.gradient.type === "radial" ? `<radialGradient id="${gradientId}">${stops}</radialGradient>` : `<linearGradient id="${gradientId}" gradientTransform="rotate(${effect.gradient.angle || 0} .5 .5)">${stops}</linearGradient>`);
      if (effect.type === "gradient-fill") fill = `url(#${gradientId})`;
      else { stroke = `url(#${gradientId})`; strokeWidth = effect.width || 1; }
      continue;
    }
    if (effect.type === "stroke") { stroke = esc(effect.color || "#000000"); strokeWidth = effect.width || 1; continue; }
    if (effect.type === "drop-shadow" || effect.type === "outer-glow") {
      filter.push(`<feDropShadow in="${result}" dx="${effect.offsetX || 0}" dy="${effect.offsetY || 0}" stdDeviation="${blur / 2}" flood-color="${color}" flood-opacity="${effect.opacity ?? 1}" result="${next}"/>`);
      result = next;
    } else if (effect.type === "inner-shadow") {
      filter.push(`<feGaussianBlur in="SourceAlpha" stdDeviation="${blur / 2}" result="blur-${index}"/><feOffset in="blur-${index}" dx="${effect.offsetX || 0}" dy="${effect.offsetY || 0}" result="offset-${index}"/><feComposite in="offset-${index}" in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="inner-${index}"/><feFlood flood-color="${color}" flood-opacity="${effect.opacity ?? 1}" result="flood-${index}"/><feComposite in="flood-${index}" in2="inner-${index}" operator="in" result="shadow-${index}"/><feComposite in="${result}" in2="shadow-${index}" operator="over" result="${next}"/>`);
      result = next;
    } else if (effect.type === "blur" || effect.type === "glass") {
      filter.push(`<feGaussianBlur in="${result}" stdDeviation="${blur || (effect.type === "glass" ? 6 : 0)}" result="${next}"/>`);
      result = next;
      if (effect.type === "glass") overlays.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff" fill-opacity="${(effect.opacity ?? 0.18)}"/>`);
    } else if (effect.type === "color-overlay") {
      filter.push(`<feFlood flood-color="${color}" flood-opacity="${effect.opacity ?? 1}" result="overlay-${index}"/><feBlend in="${result}" in2="overlay-${index}" mode="${esc(effect.blendMode || "normal")}" result="${next}"/>`);
      result = next;
    } else if (["brightness", "highlights", "contrast"].includes(effect.type)) {
      const amount = effect.amount ?? 1;
      const slope = effect.type === "contrast" ? amount : effect.type === "highlights" ? 1 + amount * 0.25 : amount;
      filter.push(`<feComponentTransfer in="${result}" result="${next}"><feFuncR type="linear" slope="${slope}"/><feFuncG type="linear" slope="${slope}"/><feFuncB type="linear" slope="${slope}"/></feComponentTransfer>`);
      result = next;
    } else if (effect.type === "temperature" || effect.type === "tint") {
      const hue = effect.type === "temperature" ? (effect.temperature || 0) * 0.12 : effect.tint || 0;
      filter.push(`<feColorMatrix in="${result}" type="hueRotate" values="${hue}" result="${next}"/>`);
      result = next;
    } else if (effect.type === "noise" || effect.type === "film-grain") {
      filter.push(`<feTurbulence type="fractalNoise" baseFrequency="${effect.type === "noise" ? 0.75 : 0.9}" numOctaves="2" seed="${effect.seed || 0}" result="noise-${index}"/><feColorMatrix in="noise-${index}" type="saturate" values="0" result="mono-${index}"/><feBlend in="${result}" in2="mono-${index}" mode="${effect.type === "noise" ? "soft-light" : "overlay"}" result="${next}"/>`);
      result = next;
    } else if (effect.type === "vignette") {
      const vignetteId = `vignette-${id}-${index}`;
      definitions.push(`<radialGradient id="${vignetteId}"><stop offset="45%" stop-color="transparent"/><stop offset="100%" stop-color="#000000" stop-opacity="${effect.amount ?? 0.45}"/></radialGradient>`);
      overlays.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#${vignetteId})"/>`);
    }
  }
  const rounded = plan.operations.find((effect) => effect.type === "rounded-corners");
  const clipping = plan.operations.find((effect) => effect.type === "clipping" || effect.type === "mask");
  let clip = "";
  if (clipping?.type === "mask" && clipping.sourceId) {
    const maskId = `mask-${id}`;
    definitions.push(`<mask id="${maskId}" maskUnits="userSpaceOnUse"><use href="#element-${safeId(clipping.sourceId)}" fill="white"/></mask>`);
    clip = ` mask="url(#${maskId})"`;
  } else if (clipping || rounded) {
    const clipId = `clip-${id}`;
    const shape = clipping?.shape || "rounded";
    const geometry = shape === "circle" ? `<ellipse cx=".5" cy=".5" rx=".5" ry=".5"/>` : shape === "ellipse" ? `<ellipse cx=".5" cy=".5" rx=".5" ry=".38"/>` : shape === "diamond" ? `<polygon points=".5,0 1,.5 .5,1 0,.5"/>` : `<rect x="0" y="0" width="1" height="1" rx="${shape === "rounded" ? ((clipping?.radius || rounded?.radius || 12) / template.canvas.width) : 0}"/>`;
    definitions.push(`<clipPath id="${clipId}" clipPathUnits="objectBoundingBox">${geometry}</clipPath>`);
    clip = ` clip-path="url(#${clipId})"`;
  }
  if (filter.length) definitions.push(`<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">${filter.join("")}</filter>`);
  const blend = plan.blendMode === "normal" ? "" : ` style="mix-blend-mode:${esc(plan.blendMode)}"`;
  const attributes = `${filter.length ? ` filter="url(#${filterId})"` : ""} opacity="${plan.opacity}"${blend}${clip}`;
  return { definitions: definitions.join(""), attributes, fill, stroke, strokeWidth, overlays: overlays.join("") };
}
