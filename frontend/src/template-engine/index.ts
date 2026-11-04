export { default, TemplateRenderer } from "./TemplateRenderer";
export type { TemplateRendererHandle, TemplateRendererProps } from "./TemplateRenderer";
export { CanvasRenderer, OUTPUT_SIZES } from "./renderers/CanvasRenderer";
export { getLayoutPresetIds, resolveLayout, resolveTemplateLayout } from "./layouts/LayoutEngine";
export { LAYOUTS } from "./layouts/layouts";
export { applyTypographyPreset, typographyMetrics } from "./typography/TypographyEngine";
export { TYPOGRAPHY_PRESETS, TYPOGRAPHY_PRESET_IDS, getTypographyPreset } from "./typography/typographyPresets";
export { createOverlayConfig, OVERLAY_PRESETS } from "./overlays/overlayPresets";
export type { OverlayStyle } from "./overlays/overlayPresets";
export { drawOverlay } from "./components/drawOverlay";
export {
  PREMIUM_TEMPLATES,
  PREMIUM_TEMPLATE_BY_ID,
  getPremiumTemplate,
  serializePremiumTemplate,
} from "./templates/premiumTemplates";
export { loadTemplateConfig, parseTemplateConfig } from "./validate";
export type {
  AssetResolver,
  BadgeConfig,
  CTAConfig,
  ColorConfig,
  DecorationConfig,
  ImageFilterConfig,
  LayoutConfig,
  LayoutPresetId,
  LogoConfig,
  OutputMimeType,
  OutputVariant,
  OverlayConfig,
  RenderContext,
  RenderResult,
  TemplateConfig,
  TypographyPresetId,
  TypographyConfig,
  TextShadowConfig,
  ResponsiveScalingConfig,
  Alignment,
  ResolvedLayoutConfig,
  ImageCropConfig,
} from "./types";
