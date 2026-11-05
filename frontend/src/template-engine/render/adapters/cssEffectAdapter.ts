import type { CSSProperties } from "react";
import type { EffectRenderPlan } from "../../core/effects/types";

function noiseTexture(seed: number, opacity: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="${seed}"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity="${opacity}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Converts the canonical effect plan to CSS without changing the serialized effect model. */
export function effectPlanToCss(plan: EffectRenderPlan, canvasWidth = 1080): CSSProperties {
  const unit = (value: number) => `${(value / canvasWidth) * 100}cqw`;
  const toContainerUnits = (value: string) => value.replace(/(-?\d+(?:\.\d+)?)px/g, (_match, amount: string) => unit(Number(amount)));
  const filters = toContainerUnits([...plan.filters, ...(plan.blur ? [`blur(${plan.blur}px)`] : [])].join(" "));
  const style: CSSProperties = {
    opacity: plan.opacity,
    mixBlendMode: plan.blendMode === "normal" ? undefined : plan.blendMode,
    filter: filters || undefined,
    boxShadow: plan.shadows.length ? toContainerUnits(plan.shadows.join(", ")) : undefined,
    borderRadius: plan.cornerRadius ? unit(plan.cornerRadius) : undefined,
    clipPath: plan.clipPath,
    maskImage: plan.mask,
  };
  const gradients = plan.overlays.filter((item) => item.startsWith("linear-gradient") || item.startsWith("radial-gradient"));
  const gradientBorder = plan.overlays.find((item) => item.startsWith("border-gradient("));
  const vignette = plan.overlays.filter((item) => item.startsWith("radial-gradient(ellipse"));
  const layers = [...vignette, ...gradients.filter((item) => !vignette.includes(item))];
  const overlay = plan.overlays.map((item) => /^overlay\((.*),([\d.]+),([\w-]+)\)$/.exec(item)).filter(Boolean).at(-1);
  if (overlay) {
    const alpha = Math.max(0, Math.min(1, Number(overlay[2])));
    style.boxShadow = [...(plan.shadows.length ? plan.shadows : []), `inset 0 0 0 100vmax color-mix(in srgb, ${overlay[1]} ${alpha * 100}%, transparent)`].join(", ");
    style.mixBlendMode = overlay[3] as CSSProperties["mixBlendMode"];
  }
  const stroke = plan.overlays.map((item) => /^stroke\((.*),([\d.]+)px\)$/.exec(item)).find(Boolean);
  if (stroke) { style.border = `${unit(Number(stroke[2]))} solid ${stroke[1]}`; style.boxSizing = "border-box"; }
  if (gradientBorder) {
    const gradient = gradientBorder.slice("border-gradient(".length, -1);
    style.border = "1px solid transparent";
    style.backgroundOrigin = "border-box";
    style.backgroundClip = "padding-box, border-box";
    style.backgroundImage = [style.backgroundImage, gradient].filter(Boolean).join(", ");
  }
  const noise = plan.overlays.map((item) => /^(?:noise|grain)\(([\d.]+),(-?\d+)\)$/.exec(item)).filter((match): match is RegExpExecArray => match !== null);
  if (noise.length) layers.push(...noise.map((match) => noiseTexture(Number(match[2]), Number(match[1]))));
  if (layers.length) style.backgroundImage = layers.join(", ");
  const glass = plan.overlays.find((item) => item.startsWith("rgba(255,255,255,"));
  if (glass) { style.backdropFilter = `blur(${unit(12)})`; style.backgroundColor = glass; }
  return style;
}
