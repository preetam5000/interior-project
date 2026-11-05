import type { DesignElement, DesignTemplate } from "../../types/designTemplate";
import type { DesignBlendMode, DesignEffect, DesignEffectType, EffectRenderPlan, ResolvedEffectOperation } from "./types";

export const DESIGN_EFFECT_TYPES: readonly DesignEffectType[] = [
  "drop-shadow", "inner-shadow", "outer-glow", "blur", "glass", "opacity", "blend-mode", "gradient-fill", "gradient-border", "stroke", "rounded-corners", "mask", "clipping", "color-overlay", "image-filters", "brightness", "contrast", "highlights", "temperature", "tint", "vignette", "noise", "film-grain",
];
export const DESIGN_BLEND_MODES: readonly DesignBlendMode[] = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion"];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const n = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value as number : fallback;
const EFFECT_KEYS = new Set(["id", "type", "enabled", "opacity", "color", "blendMode", "blur", "offsetX", "offsetY", "spread", "width", "radius", "amount", "temperature", "tint", "gradient", "shape", "sourceId", "invert", "threshold", "seed"]);
const EFFECT_COLOR = /^(#[\da-f]{3,8}|rgba?\(\s*[\d.%\s,]+\)|hsla?\(\s*[\d.%\s,deg]+\)|transparent|currentColor|\$(?:[\w-]+(?:\.[\w-]+)*|\{[\w.-]+\}))$/i;

export function validateDesignEffects(effects: unknown): string[] {
  if (effects === undefined) return [];
  if (!Array.isArray(effects)) return ["effects must be an array."];
  const errors: string[] = [];
  const ids = new Set<string>();
  effects.forEach((effect, index) => {
    const path = `effects[${index}]`;
    if (!effect || typeof effect !== "object" || Array.isArray(effect)) { errors.push(`${path} must be an object.`); return; }
    const item = effect as Record<string, unknown>;
    for (const key of Object.keys(item)) if (!EFFECT_KEYS.has(key)) errors.push(`${path}.${key} is unsupported.`);
    if (typeof item.id !== "string" || !item.id.trim()) errors.push(`${path}.id must be a non-empty string.`);
    else if (ids.has(item.id)) errors.push(`${path}.id duplicates "${item.id}".`);
    else ids.add(item.id);
    if (!DESIGN_EFFECT_TYPES.includes(item.type as DesignEffectType)) errors.push(`${path}.type is unsupported.`);
    if (item.enabled !== undefined && typeof item.enabled !== "boolean") errors.push(`${path}.enabled must be a boolean.`);
    if (item.opacity !== undefined && (typeof item.opacity !== "number" || !Number.isFinite(item.opacity) || item.opacity < 0 || item.opacity > 1)) errors.push(`${path}.opacity must be between 0 and 1.`);
    for (const key of ["blur", "spread", "width", "radius", "amount"] as const) if (item[key] !== undefined && (typeof item[key] !== "number" || !Number.isFinite(item[key]) || item[key] < 0 || item[key] > 1000)) errors.push(`${path}.${key} must be between 0 and 1000.`);
    for (const key of ["offsetX", "offsetY", "temperature", "tint"] as const) if (item[key] !== undefined && (typeof item[key] !== "number" || !Number.isFinite(item[key]) || item[key] < -1000 || item[key] > 1000)) errors.push(`${path}.${key} must be between -1000 and 1000.`);
    if (item.blendMode !== undefined && !DESIGN_BLEND_MODES.includes(item.blendMode as DesignBlendMode)) errors.push(`${path}.blendMode is unsupported.`);
    if (item.shape !== undefined && !["rect", "rounded", "circle", "ellipse", "diamond"].includes(String(item.shape))) errors.push(`${path}.shape is unsupported.`);
    if (item.invert !== undefined && typeof item.invert !== "boolean") errors.push(`${path}.invert must be a boolean.`);
    if (item.sourceId !== undefined && typeof item.sourceId !== "string") errors.push(`${path}.sourceId must be a string.`);
    if (item.color !== undefined && (typeof item.color !== "string" || !EFFECT_COLOR.test(item.color))) errors.push(`${path}.color must be a valid color.`);
    if (item.threshold !== undefined && (typeof item.threshold !== "number" || !Number.isFinite(item.threshold) || item.threshold < 0 || item.threshold > 1)) errors.push(`${path}.threshold must be between 0 and 1.`);
    if (item.seed !== undefined && (typeof item.seed !== "number" || !Number.isInteger(item.seed))) errors.push(`${path}.seed must be an integer.`);
    if (item.gradient !== undefined) {
      const gradient = item.gradient as Record<string, unknown>;
      if (!gradient || typeof gradient !== "object" || !["linear", "radial"].includes(String(gradient.type)) || !Array.isArray(gradient.stops) || !gradient.stops.length) errors.push(`${path}.gradient must be a valid gradient.`);
      else gradient.stops.forEach((stop, stopIndex) => {
        if (!stop || typeof stop !== "object") { errors.push(`${path}.gradient.stops[${stopIndex}] must be an object.`); return; }
        const candidate = stop as Record<string, unknown>;
        if (typeof candidate.color !== "string" || !EFFECT_COLOR.test(candidate.color)) errors.push(`${path}.gradient.stops[${stopIndex}].color must be a valid color.`);
        if (typeof candidate.position !== "number" || !Number.isFinite(candidate.position) || candidate.position < 0 || candidate.position > 1) errors.push(`${path}.gradient.stops[${stopIndex}].position must be between 0 and 1.`);
        if (candidate.opacity !== undefined && (typeof candidate.opacity !== "number" || !Number.isFinite(candidate.opacity) || candidate.opacity < 0 || candidate.opacity > 1)) errors.push(`${path}.gradient.stops[${stopIndex}].opacity must be between 0 and 1.`);
      });
    }
  });
  return errors;
}

/** Canonical JSON round-trip used by persistence, import, and export boundaries. */
export function serializeDesignEffects(effects: readonly DesignEffect[]): string {
  const errors = validateDesignEffects(effects);
  if (errors.length) throw new TypeError(errors.join(" "));
  return JSON.stringify(effects);
}

export function deserializeDesignEffects(serialized: string): DesignEffect[] {
  let value: unknown;
  try { value = JSON.parse(serialized); } catch { throw new TypeError("Effects must be valid JSON."); }
  const errors = validateDesignEffects(value);
  if (errors.length) throw new TypeError(errors.join(" "));
  return value as DesignEffect[];
}

export function resolveEffectPlan(element: Pick<DesignElement, "effects" | "opacity" | "blur" | "brightness" | "contrast" | "saturation" | "gradient" | "border" | "borderRadius" | "radius" | "shadow">, canvas: { width: number; height: number }, resolveColor: (color: string) => string = (color) => color): EffectRenderPlan {
  const sx = canvas.width / 1080;
  const sy = canvas.height / 1080;
  const authored = (element.effects || []).filter((effect) => effect.enabled !== false);
  const legacyShadow: DesignEffect[] = element.shadow && !authored.some((effect) => ["drop-shadow", "inner-shadow", "outer-glow"].includes(effect.type))
    ? [{ id: "legacy-shadow", type: "drop-shadow", color: element.shadow.color, blur: element.shadow.blur, offsetX: element.shadow.offsetX, offsetY: element.shadow.offsetY }]
    : [];
  const operations: ResolvedEffectOperation[] = [...legacyShadow, ...authored].map((effect) => ({ ...effect, scaleX: sx, scaleY: sy }));
  const plan: EffectRenderPlan = { operations, opacity: clamp(n(element.opacity, 1), 0, 1), blendMode: "normal", blur: n(element.blur, 0), cornerRadius: n(element.borderRadius, n(element.radius, 0)), filters: [], shadows: [], overlays: [] };
  if (element.brightness !== undefined && element.brightness !== 1) plan.filters.push(`brightness(${element.brightness})`);
  if (element.contrast !== undefined && element.contrast !== 1) plan.filters.push(`contrast(${element.contrast})`);
  if (element.saturation !== undefined && element.saturation !== 1) plan.filters.push(`saturate(${element.saturation})`);
  for (const effect of operations) {
    const blur = n(effect.blur, 0), opacity = clamp(n(effect.opacity, 1), 0, 1), color = resolveColor(effect.color || "#000000");
    switch (effect.type) {
      case "drop-shadow": plan.shadows.push(`${n(effect.offsetX, 0) * sx}px ${n(effect.offsetY, 4) * sy}px ${blur * sx}px ${n(effect.spread, 0) * sx}px ${color}`); break;
      case "inner-shadow": plan.shadows.push(`inset ${n(effect.offsetX, 0) * sx}px ${n(effect.offsetY, 2) * sy}px ${blur * sx}px ${n(effect.spread, 0) * sx}px ${color}`); break;
      case "outer-glow": plan.shadows.push(`0 0 ${blur * sx}px ${n(effect.spread, 2) * sx}px ${color}`); break;
      case "blur": plan.blur += blur; break;
      case "glass": plan.shadows.push(`inset 0 1px 0 rgba(255,255,255,${opacity * 0.65})`); plan.overlays.push(`rgba(255,255,255,${opacity * 0.18})`); break;
      case "opacity": plan.opacity *= opacity; break;
      case "blend-mode": plan.blendMode = effect.blendMode || "normal"; break;
      case "gradient-fill": if (effect.gradient) plan.overlays.push(gradientCss(effect.gradient, resolveColor)); break;
      case "gradient-border": if (effect.gradient) plan.overlays.push(`border-gradient(${gradientCss(effect.gradient, resolveColor)})`); break;
      case "stroke": plan.overlays.push(`stroke(${color},${n(effect.width, 1) * sx}px)`); break;
      case "rounded-corners": plan.cornerRadius = n(effect.radius, plan.cornerRadius); break;
      case "clipping": plan.clipPath = clipPath(effect.shape || "rect"); break;
      case "mask": if (effect.sourceId) plan.mask = `url(#mask-${effect.sourceId})`; else plan.clipPath = plan.clipPath || clipPath(effect.shape || "rounded"); break;
      case "color-overlay": plan.overlays.push(`overlay(${color},${opacity},${effect.blendMode || "normal"})`); break;
      case "image-filters": plan.filters.push(`saturate(${clamp(n(effect.amount, 1), 0, 3)})`); break;
      case "brightness": plan.filters.push(`brightness(${clamp(n(effect.amount, 1), 0, 4)})`); break;
      case "contrast": plan.filters.push(`contrast(${clamp(n(effect.amount, 1), 0, 4)})`); break;
      case "highlights": plan.filters.push(`brightness(${1 + clamp(n(effect.amount, 0), -1, 1) * 0.35})`); break;
      case "temperature": plan.filters.push(`sepia(${Math.abs(n(effect.temperature, 0)) / 100})`); break;
      case "tint": plan.filters.push(`hue-rotate(${n(effect.tint, 0)}deg)`); break;
      case "vignette": plan.overlays.push(`radial-gradient(ellipse, transparent 48%, rgba(0,0,0,${clamp(n(effect.amount, 0.45), 0, 1)}) 100%)`); break;
      case "noise": plan.overlays.push(`noise(${clamp(n(effect.amount, 0.15), 0, 1)},${effect.seed || 0})`); break;
      case "film-grain": plan.overlays.push(`grain(${clamp(n(effect.amount, 0.2), 0, 1)},${effect.seed || 0})`); break;
    }
  }
  if (element.gradient && !operations.some((effect) => effect.type === "gradient-fill")) plan.overlays.push(gradientCss(element.gradient, resolveColor));
  if (element.border && !operations.some((effect) => effect.type === "stroke")) plan.overlays.push(`stroke(${resolveColor(element.border.color)},${element.border.width}px)`);
  return plan;
}

function gradientCss(gradient: NonNullable<DesignEffect["gradient"]>, resolveColor: (color: string) => string): string {
  const stops = gradient.stops.map((stop) => `${resolveColor(stop.color)}${stop.opacity === undefined ? "" : ` / ${stop.opacity}`} ${clamp(stop.position, 0, 1) * 100}%`).join(", ");
  return gradient.type === "radial" ? `radial-gradient(circle, ${stops})` : `linear-gradient(${gradient.angle || 0}deg, ${stops})`;
}
function clipPath(shape: string): string { return ({ rect: "inset(0)", rounded: "inset(0 round 8%)", circle: "circle(50% at 50% 50%)", ellipse: "ellipse(50% 50% at 50% 50%)", diamond: "polygon(50% 0,100% 50%,50% 100%,0 50%)" } as Record<string, string>)[shape] || "inset(0)"; }

export function effectPlanToKonva(plan: EffectRenderPlan) {
  const shadow = plan.operations.find((effect) => ["drop-shadow", "outer-glow"].includes(effect.type));
  return { opacity: plan.opacity, globalCompositeOperation: plan.blendMode === "normal" ? "source-over" : plan.blendMode, shadowColor: shadow?.color, shadowBlur: shadow?.blur || 0, shadowOffsetX: shadow?.offsetX || 0, shadowOffsetY: shadow?.offsetY || 0 };
}

export function effectsForElement(element: DesignElement, template: DesignTemplate): EffectRenderPlan {
  return resolveEffectPlan(element, template.canvas);
}
