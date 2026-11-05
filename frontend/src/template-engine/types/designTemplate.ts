import type { DesignEffect } from "../core/effects/types";

export type DesignFormat = "portrait" | "story" | "square" | "landscape";
export type TemplateOutputFormat = DesignFormat | "carousel" | "tablet" | "desktop";
export type DesignElementType =
  | "Image"
  | "Text"
  | "Heading"
  | "Subtitle"
  | "Body Text"
  | "Logo"
  | "Badge"
  | "CTA Button"
  | "Shape"
  | "Divider"
  | "Gradient"
  | "Icon"
  | "Progress Bar"
  | "QR Code"
  | "Social Handle"
  | "Sticker"
  | "Decorative Object";

export type DesignAlignment = "left" | "center" | "right";
export type AnimationPresetId = "fade" | "slide" | "scale" | "rotate" | "bounce" | "pop" | "zoom" | "blur" | "motion-blur";
export type AnimationEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";
export type AnimationDirection = "normal" | "reverse" | "alternate" | "alternate-reverse";
export interface NodeAnimationValues {
  opacity?: number;
  translateX?: number;
  translateY?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  blur?: number;
}
export interface NodeAnimationMetadata {
  preset: AnimationPresetId;
  durationMs?: number;
  delayMs?: number;
  easing?: AnimationEasing;
  loop?: boolean;
  direction?: AnimationDirection;
  groupId?: string;
  keyframes?: Array<{ offset: number; values: NodeAnimationValues }>;
  from?: NodeAnimationValues;
  to?: NodeAnimationValues;
}

export interface DesignGradient {
  type: "linear" | "radial";
  angle?: number;
  stops: Array<{ color: string; position: number; opacity?: number }>;
}

export interface DesignShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface DesignStroke {
  color: string;
  width: number;
}

export interface DesignBorder {
  color: string;
  width: number;
  style?: "solid" | "dashed" | "dotted";
}

export interface DesignElement {
  id: string;
  type: DesignElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  content?: string;
  source?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  fontSize?: number;
  lineHeight?: number;
  letterSpacing?: number;
  color?: string;
  stroke?: DesignStroke;
  shadow?: DesignShadow;
  gradient?: DesignGradient;
  alignment?: DesignAlignment;
  crop?: "cover" | "contain" | "fill";
  brightness?: number;
  contrast?: number;
  saturation?: number;
  blur?: number;
  borderRadius?: number;
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
  radius?: number;
  border?: DesignBorder;
  icon?: string;
  progress?: number;
  style?: Record<string, string | number | boolean | DesignGradient | DesignShadow | DesignBorder | DesignStroke>;
  data?: Record<string, string | number | boolean>;
  /** Optional editor motion metadata; renderers may ignore it until playback support is added. */
  animations?: NodeAnimationMetadata[];
  /** Serializable, ordered visual effects consumed by renderer adapters. */
  effects?: DesignEffect[];
}

export interface DesignCanvas {
  width: number;
  height: number;
  unit: "px";
  safeZones?: Partial<Record<DesignFormat, { top: number; right: number; bottom: number; left: number }>>;
  grid?: { columns: number; gutter: number; margin: number };
}

export interface DesignBackground {
  color?: string;
  image?: string;
  gradient?: DesignGradient;
}

export interface DesignBranding {
  logo?: string;
  socialHandle?: string;
  palette?: Record<string, string>;
  tokens?: Record<string, string>;
}

export interface DesignAnimation {
  id: string;
  target: string;
  property: "opacity" | "translateX" | "translateY" | "scale" | "rotate";
  from: number;
  to: number;
  startMs: number;
  durationMs: number;
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

export interface DesignTemplate {
  schemaVersion: 2;
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  thumbnail: string;
  supportedFormats: TemplateOutputFormat[];
  canvas: DesignCanvas;
  background: DesignBackground;
  branding: DesignBranding;
  elements: DesignElement[];
  animations: DesignAnimation[];
  metadata: Record<string, unknown>;
}

export interface DesignRenderContext {
  imageSrc?: string;
  assets?: Record<string, string>;
  content?: Record<string, string>;
  brand?: Record<string, string>;
  format?: DesignFormat;
}
