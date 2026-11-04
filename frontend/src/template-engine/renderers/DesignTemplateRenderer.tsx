import { createElement, useMemo, type CSSProperties, type ReactElement } from "react";
import { getDesignElementRenderer } from "../components/designElementRegistry";
import type {
  DesignAnimation,
  DesignFormat,
  DesignRenderContext,
  DesignTemplate,
} from "../types/designTemplate";
import { parseTemplateDocument } from "../templates/validateDesignTemplate";
import type { TemplateConfig } from "../types";

export interface DesignTemplateRendererProps {
  template: DesignTemplate | TemplateConfig | string;
  context?: DesignRenderContext;
  format?: DesignFormat;
  playAnimations?: boolean;
  className?: string;
}

const FORMAT_DIMENSIONS: Record<DesignFormat, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

function animationCss(template: DesignTemplate, enabled: boolean): string {
  if (!enabled) return "";
  return template.animations.map((animation: DesignAnimation, index: number) => {
    const name = `design_motion_${index}`;
    const property = animation.property === "translateX" || animation.property === "translateY"
      ? "transform"
      : animation.property === "rotate" ? "rotate" : animation.property;
    const unit = animation.property === "rotate" ? "deg"
      : animation.property === "translateX" || animation.property === "translateY" ? "px" : "";
    const from = `${animation.from}${unit}`;
    const to = `${animation.to}${unit}`;
    const value = (amount: string) => animation.property === "translateX"
      ? `translateX(${amount})`
      : animation.property === "translateY"
        ? `translateY(${amount})`
        : amount;
    return `@keyframes ${name}{from{${property}:${value(from)}}to{${property}:${value(to)}}}`;
  }).join("");
}

function backgroundStyle(
  template: DesignTemplate,
  context: DesignRenderContext,
  format: DesignFormat,
): CSSProperties {
  const image = template.background.image
    ? context.assets?.[template.background.image] || template.background.image
    : undefined;
  const gradient = template.background.gradient;
  const resolveColor = (color: string) => color.startsWith("$")
    ? template.branding.palette?.[color.slice(1)] || color
    : color;
  const gradientCss = gradient
    ? gradient.type === "radial"
      ? `radial-gradient(circle, ${gradient.stops.map((stop) => `${resolveColor(stop.color)} ${stop.position * 100}%`).join(", ")})`
      : `linear-gradient(${gradient.angle || 0}deg, ${gradient.stops.map((stop) => `${resolveColor(stop.color)} ${stop.position * 100}%`).join(", ")})`
    : undefined;
  const dimensions = FORMAT_DIMENSIONS[format];
  return {
    position: "relative",
    width: "100%",
    aspectRatio: `${dimensions.width} / ${dimensions.height}`,
    overflow: "hidden",
    backgroundColor: template.background.color || "#ffffff",
    backgroundImage: [gradientCss, image ? `url("${image.replace(/["\\]/g, "")}")` : undefined].filter(Boolean).join(", ") || undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    containerType: "inline-size",
    isolation: "isolate",
  };
}

export function DesignTemplateRenderer({
  template: input,
  context = {},
  format,
  playAnimations = false,
  className,
}: DesignTemplateRendererProps): ReactElement {
  const template = useMemo(() => parseTemplateDocument(input), [input]);
  const selectedFormat = format || context.format || "portrait";
  if (!template.supportedFormats.includes(selectedFormat)) {
    throw new Error(`Template "${template.id}" does not support the "${selectedFormat}" format.`);
  }
  const renderContext = { ...context, format: selectedFormat };
  const elements = [...template.elements].sort((a, b) => a.zIndex - b.zIndex);
  const animationStyles = animationCss(template, playAnimations);
  const animationRules = playAnimations
    ? template.animations.map((animation, index) => {
      return `[data-element-id="${animation.target}"]{animation:design_motion_${index} ${animation.durationMs}ms ${animation.easing} ${animation.startMs}ms both}`;
    }).join("")
    : "";

  return createElement("div", {
    className,
    "data-template-id": template.id,
    "data-template-format": renderContext.format || "portrait",
    style: backgroundStyle(template, renderContext, selectedFormat),
  },
  animationStyles ? createElement("style", { dangerouslySetInnerHTML: { __html: `${animationStyles}${animationRules}` } }) : null,
  ...elements.map((element) => {
    const Renderer = getDesignElementRenderer(element.type);
    if (!Renderer) throw new Error(`No renderer registered for element type "${element.type}".`);
    return createElement(Renderer, { key: element.id, element, template, context: renderContext });
  }));
}

export default DesignTemplateRenderer;
