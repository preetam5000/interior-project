import type { DesignGradient } from "../../types/designTemplate";

export type DesignEffectType =
  | "drop-shadow" | "inner-shadow" | "outer-glow" | "blur" | "glass" | "opacity" | "blend-mode"
  | "gradient-fill" | "gradient-border" | "stroke" | "rounded-corners" | "mask" | "clipping"
  | "color-overlay" | "image-filters" | "brightness" | "contrast" | "highlights" | "temperature"
  | "tint" | "vignette" | "noise" | "film-grain";

export type DesignBlendMode = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference" | "exclusion";
export type DesignClipShape = "rect" | "rounded" | "circle" | "ellipse" | "diamond";

/** JSON-safe, renderer-neutral effect data. Values use canvas pixels unless documented as normalized. */
export interface DesignEffect {
  id: string;
  type: DesignEffectType;
  enabled?: boolean;
  opacity?: number;
  color?: string;
  blendMode?: DesignBlendMode;
  blur?: number;
  offsetX?: number;
  offsetY?: number;
  spread?: number;
  width?: number;
  radius?: number;
  amount?: number;
  temperature?: number;
  tint?: number;
  gradient?: DesignGradient;
  shape?: DesignClipShape;
  sourceId?: string;
  invert?: boolean;
  threshold?: number;
  seed?: number;
}

/** Renderer-independent resolved operations, scaled to the target canvas. */
export interface ResolvedEffectOperation extends DesignEffect {
  scaleX: number;
  scaleY: number;
}

export interface EffectRenderPlan {
  operations: ResolvedEffectOperation[];
  opacity: number;
  blendMode: DesignBlendMode;
  blur: number;
  cornerRadius: number;
  clipPath?: string;
  mask?: string;
  filters: string[];
  shadows: string[];
  overlays: string[];
}
