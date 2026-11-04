export type OutputVariant = "portrait" | "story" | "square";
export type OutputMimeType = "image/png" | "image/jpeg" | "image/webp";
export type TypographyPresetId =
  | "luxury"
  | "modern"
  | "minimal"
  | "construction"
  | "editorial"
  | "architectural"
  | "magazine"
  | "elegant"
  | "bold"
  | "instagram";
export type Alignment = "left" | "center" | "right";
export type LayoutPresetId =
  | "hero-bottom"
  | "hero-center"
  | "split-screen"
  | "magazine"
  | "minimal"
  | "editorial"
  | "blueprint"
  | "timeline"
  | "progress"
  | "comparison"
  | "collage"
  | "full-image"
  | "diagonal"
  | "luxury";
export type Anchor =
  | "top_left" | "top_center" | "top_right"
  | "center_left" | "center" | "center_right"
  | "bottom_left" | "bottom_center" | "bottom_right";
export type ColorValue = string;

export interface InsetsConfig {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface PointConfig {
  x: number;
  y: number;
}

export interface RegionConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor?: Anchor;
  align?: "left" | "center" | "right";
  padding?: InsetsConfig;
  clip?: "none" | "diagonal" | "circle";
}

export interface LayoutConfig {
  aspect_ratio: string;
  safe_area?: InsetsConfig;
  preset?: LayoutPresetId;
  regions?: Record<string, RegionConfig>;
  image_regions?: Record<string, RegionConfig>;
  safe_zones?: Partial<Record<OutputVariant, InsetsConfig>>;
  crops?: Partial<Record<"portrait" | "story", ImageCropConfig>>;
  layer_order: string[];
}

export interface TypographyConfig {
  preset?: TypographyPresetId;
  family: string;
  fallback_family: string;
  size: number;
  weight: "regular" | "medium" | "semibold" | "bold";
  line_height: number;
  letter_spacing: number;
  text_transform: "none" | "uppercase" | "lowercase" | "capitalize";
  alignment: "left" | "center" | "right";
  color: ColorValue;
  shadow?: TextShadowConfig;
  responsive_scaling?: ResponsiveScalingConfig;
}

export interface TextShadowConfig {
  enabled: boolean;
  color: string;
  blur: number;
  offset_x: number;
  offset_y: number;
}

export interface ResponsiveScalingConfig {
  enabled: boolean;
  reference_width: number;
  min_scale: number;
  max_scale: number;
}

export interface ColorConfig {
  primary: ColorValue;
  secondary: ColorValue;
  accent: ColorValue;
  text: ColorValue;
  surface: ColorValue;
}

export interface OverlayConfig {
  id: string;
  type:
    | "scrim"
    | "linear_gradient"
    | "radial_gradient"
    | "color_wash"
    | "luxury_gradient"
    | "dark_gradient"
    | "glass"
    | "blur"
    | "blueprint_grid"
    | "golden_frame"
    | "corner_accents"
    | "progress_ribbon"
    | "diagonal_stripe"
    | "noise_texture"
    | "paper_texture"
    | "film_grain";
  region: string;
  color: ColorValue;
  end_color?: ColorValue;
  opacity: number;
  angle?: number;
  blend_mode: "normal" | "multiply" | "screen" | "overlay";
  blur_px?: number;
  spacing?: number;
  line_width?: number;
  inset?: number;
  radius?: number;
  intensity?: number;
  text?: string;
  font_size?: number;
  seed?: number;
  scale?: number;
}

export interface LogoConfig {
  enabled: boolean;
  asset_ref: string;
  region: string;
  anchor: Anchor;
  width: number;
  opacity: number;
  treatment: "original" | "monochrome" | "light" | "dark";
}

export interface BadgeConfig {
  id: string;
  enabled: boolean;
  text_binding: string;
  region: string;
  anchor: Anchor;
  typography: TypographyConfig;
  background_color: ColorValue;
  text_color: ColorValue;
  border_color: ColorValue;
  radius: number;
  padding: InsetsConfig;
}

export interface CTAConfig {
  enabled: boolean;
  text_binding: string;
  region: string;
  anchor: Anchor;
  style: "filled" | "outline" | "text" | "pill";
  typography: TypographyConfig;
  background_color: ColorValue;
  text_color: ColorValue;
  border_color: ColorValue;
  radius: number;
  padding: InsetsConfig;
}

export interface DecorationConfig {
  id: string;
  type: "line" | "frame" | "shape" | "texture";
  region: string;
  color: ColorValue;
  opacity: number;
  thickness?: number;
  radius?: number;
  asset_ref?: string;
}

export interface ImageFilterConfig {
  fit: "cover" | "contain";
  focal_point: PointConfig;
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  grayscale: number;
  vignette: number;
}

export interface ImageCropConfig {
  fit: "cover" | "contain";
  focal_point: PointConfig;
}

export interface ResolvedLayoutConfig extends LayoutConfig {
  regions: Record<string, RegionConfig>;
  image_regions: Record<string, RegionConfig>;
  crop: ImageCropConfig;
}

export interface AnimationConfig {
  enabled: boolean;
  duration_ms: number;
  easing: "linear" | "ease_in" | "ease_out" | "ease_in_out";
  poster_time_ms: number;
  motions: Array<{
    target: string;
    property: "opacity" | "translate_x" | "translate_y" | "scale" | "rotate";
    from: number;
    to: number;
    start_ms: number;
    duration_ms: number;
  }>;
}

export interface ContentBindingsConfig {
  headline: string;
  subtitle: string;
  cta: string;
  badge: string;
}

export interface TemplateConfig {
  schema_version: 1;
  id: string;
  name: string;
  layout: LayoutConfig;
  typography: TypographyConfig;
  colors: ColorConfig;
  overlays: OverlayConfig[];
  logo: LogoConfig;
  badges: BadgeConfig[];
  cta: CTAConfig;
  decorations: DecorationConfig[];
  image_treatment: ImageFilterConfig;
  animations: AnimationConfig;
  content_bindings: ContentBindingsConfig;
}

export interface RenderContext {
  imageSrc: string;
  images?: Record<string, string>;
  content?: Record<string, string>;
  brand?: Record<string, string>;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface RenderResult extends CanvasSize {
  variant: OutputVariant;
  mimeType: OutputMimeType;
  blob: Blob;
}

export interface AssetResolver {
  resolve(assetRef: string, context: RenderContext): string;
}

export interface ComponentRenderer<TConfig = unknown> {
  draw(
    context: CanvasRenderingContext2D,
    config: TConfig,
    template: TemplateConfig,
    renderContext: RenderContext,
  ): void | Promise<void>;
}
