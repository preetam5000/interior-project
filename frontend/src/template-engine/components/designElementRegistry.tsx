import { createElement, type CSSProperties, type ReactElement } from "react";
import type {
  DesignElement,
  DesignElementType,
  DesignGradient,
  DesignRenderContext,
  DesignTemplate,
} from "../types/designTemplate";
import { resolveEffectPlan } from "../core/effects";
import { effectPlanToCss } from "../render/adapters/cssEffectAdapter";

export interface DesignElementRendererProps {
  element: DesignElement;
  template: DesignTemplate;
  context: DesignRenderContext;
}

export type DesignElementRenderer = (props: DesignElementRendererProps) => ReactElement;

function resolveContent(element: DesignElement, context: DesignRenderContext): string {
  if (!element.content) return "";
  const match = /^(content|brand)\.([\w]+)(?:\|(.*))?$/.exec(element.content);
  if (!match) return element.content;
  const values = match[1] === "content" ? context.content : context.brand;
  return values?.[match[2]] ?? match[3] ?? "";
}

function resolveValue(value: string | undefined, template: DesignTemplate): string | undefined {
  if (!value?.startsWith("$")) return value;
  const token = value.slice(1).replace(/^\{/, "").replace(/\}$/, "");
  return template.branding.tokens?.[token]
    || template.branding.palette?.[token.replace(/^colors\./, "")]
    || template.branding.palette?.[token]
    || value;
}

function gradientCss(gradient: DesignGradient, template: DesignTemplate): string {
  const stops = gradient.stops.map(({ color, position, opacity }) => (
    `${resolveValue(color, template)} ${Math.round(position * 100)}%${opacity === undefined ? "" : ` / ${opacity}`}`
  )).join(", ");
  return gradient.type === "radial"
    ? `radial-gradient(circle, ${stops})`
    : `linear-gradient(${gradient.angle || 0}deg, ${stops})`;
}

function elementStyle(element: DesignElement, template: DesignTemplate): CSSProperties {
  const fontSize = element.fontSize;
  const scale = (value: number) => `${(value / template.canvas.width) * 100}cqw`;
  const style = {
    position: "absolute",
    left: `${element.x * 100}%`,
    top: `${element.y * 100}%`,
    width: `${element.width * 100}%`,
    height: `${element.height * 100}%`,
    zIndex: element.zIndex,
    opacity: element.opacity,
    visibility: element.visible ? "visible" : "hidden",
    pointerEvents: element.locked ? "none" : "auto",
    rotate: `${element.rotation}deg`,
    transformOrigin: "center",
    boxSizing: "border-box",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: element.alignment === "right" ? "flex-end" : element.alignment === "center" ? "center" : "flex-start",
    textAlign: element.alignment || "left",
    color: resolveValue(element.color, template),
    fontFamily: resolveValue(element.fontFamily, template),
    fontWeight: element.fontWeight,
    fontSize: fontSize ? scale(fontSize) : undefined,
    lineHeight: element.lineHeight,
    letterSpacing: element.letterSpacing === undefined ? undefined : scale(element.letterSpacing),
    textShadow: element.shadow
      ? `${scale(element.shadow.offsetX)} ${scale(element.shadow.offsetY)} ${scale(element.shadow.blur)} ${resolveValue(element.shadow.color, template)}`
      : undefined,
    WebkitTextStroke: element.stroke
      ? `${scale(element.stroke.width)} ${resolveValue(element.stroke.color, template)}`
      : undefined,
    background: element.gradient
      ? gradientCss(element.gradient, template)
      : resolveValue(String(element.style?.background || ""), template) || undefined,
    borderRadius: element.borderRadius === undefined && element.radius === undefined
      ? undefined
      : scale(element.borderRadius ?? element.radius ?? 0),
    border: element.border
      ? `${scale(element.border.width)} ${element.border.style || "solid"} ${resolveValue(element.border.color, template)}`
      : undefined,
    padding: typeof element.padding === "number"
      ? scale(element.padding)
      : element.padding
        ? `${scale(element.padding.top || 0)} ${scale(element.padding.right || 0)} ${scale(element.padding.bottom || 0)} ${scale(element.padding.left || 0)}`
        : undefined,
    boxShadow: element.shadow
      ? `${scale(element.shadow.offsetX)} ${scale(element.shadow.offsetY)} ${scale(element.shadow.blur)} ${resolveValue(element.shadow.color, template)}`
      : undefined,
    ...Object.fromEntries(Object.entries(element.style || {}).map(([key, value]) => {
      const resolved = typeof value === "string" ? resolveValue(value, template) : value;
      const isLength = ["padding", "margin", "borderRadius", "borderWidth", "gap", "fontSize", "letterSpacing"].includes(key);
      return [key, isLength && typeof resolved === "string" && /^-?\d+(?:\.\d+)?$/.test(resolved) ? `${resolved}px` : resolved];
    })) as CSSProperties,
  } satisfies CSSProperties;
  const effects = resolveEffectPlan(element, template.canvas, (value) => resolveValue(value, template) || value);
  return { ...style, ...effectPlanToCss(effects, template.canvas.width) };
}

function ContentElement({ element, template, context }: DesignElementRendererProps): ReactElement {
  const content = resolveContent(element, context);
  const common = { style: elementStyle(element, template), "data-element-id": element.id };

  if (element.type === "Image" || element.type === "Logo") {
    const assetKey = element.source?.startsWith("asset:") ? element.source.slice(6) : element.source;
    const src = element.type === "Logo"
      ? context.brand?.logo
        || context.assets?.[element.source || ""]
        || (template.branding.logo?.startsWith("brand.") ? undefined : template.branding.logo)
        || (element.source?.startsWith("brand.") ? undefined : element.source)
      : element.source
        ? context.assets?.[element.source]
          || context.assets?.[assetKey || ""]
          || (element.source.startsWith("asset:") ? context.imageSrc : element.source)
        : context.imageSrc;
    return createElement("img", {
      ...common,
      src,
      alt: content || element.type,
      draggable: false,
      style: {
        ...common.style,
        objectFit: element.crop === "contain" ? "contain" : element.crop === "fill" ? "fill" : "cover",
      },
    });
  }

  if (element.type === "Progress Bar") {
    return createElement("div", {
      ...common,
      role: "progressbar",
      "aria-valuenow": element.progress ?? 0,
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      style: { ...common.style, background: "rgba(127,127,127,.3)" },
    }, createElement("span", {
      style: {
        display: "block",
        width: `${Math.min(100, Math.max(0, element.progress || 0))}%`,
        height: "100%",
        background: resolveValue(element.color, template) || "currentColor",
      },
    }));
  }

  if (element.type === "Divider") {
    return createElement("div", {
      ...common,
      role: "separator",
      style: { ...common.style, height: element.height ? `${element.height * 100}%` : undefined, background: resolveValue(element.color, template) },
    });
  }

  if (element.type === "Shape" || element.type === "Gradient" || element.type === "Decorative Object") {
    return createElement("div", {
      ...common,
      "aria-hidden": true,
      style: {
        ...common.style,
        background: element.gradient ? gradientCss(element.gradient, template) : resolveValue(element.color, template) || common.style.background,
      },
    }, content || undefined);
  }

  if (element.type === "QR Code") {
    return createElement("div", {
      ...common,
      role: "img",
      "aria-label": `QR code: ${content}`,
      style: { ...common.style, justifyContent: "center", background: "#fff", color: "#111", fontSize: "10px" },
    }, content || "QR");
  }

  if (element.type === "Icon") {
    return createElement("span", { ...common, role: "img", "aria-label": element.icon || content }, element.icon || content);
  }

  const tag = element.type === "Heading" ? "h1"
    : element.type === "Subtitle" ? "h2"
      : element.type === "CTA Button" ? "button"
        : element.type === "Badge" || element.type === "Sticker" ? "span"
          : "div";
  return createElement(tag, {
    ...common,
    ...(element.type === "CTA Button" ? { type: "button" } : {}),
  }, content);
}

const registeredTypes: DesignElementType[] = [
  "Image",
  "Text",
  "Heading",
  "Subtitle",
  "Body Text",
  "Logo",
  "Badge",
  "CTA Button",
  "Shape",
  "Divider",
  "Gradient",
  "Icon",
  "Progress Bar",
  "QR Code",
  "Social Handle",
  "Sticker",
  "Decorative Object",
];

const elementRegistry = Object.fromEntries(registeredTypes.map((type) => [
    type,
    (props: DesignElementRendererProps) => createElement(ContentElement, props),
  ])) as Record<DesignElementType, DesignElementRenderer>;

export const DESIGN_ELEMENT_REGISTRY: Readonly<Record<DesignElementType, DesignElementRenderer>> = elementRegistry;

export function getDesignElementRenderer(type: string): DesignElementRenderer | undefined {
  return DESIGN_ELEMENT_REGISTRY[type as DesignElementType];
}

export function getSupportedElementTypes(): readonly DesignElementType[] {
  return Object.keys(DESIGN_ELEMENT_REGISTRY) as DesignElementType[];
}

export function registerDesignElementRenderer(
  type: DesignElementType,
  renderer: DesignElementRenderer,
): void {
  elementRegistry[type] = renderer;
}
