export { default, TemplateRenderer } from "./TemplateRenderer";
export type { TemplateRendererHandle, TemplateRendererProps } from "./TemplateRenderer";
export { DesignTemplateRenderer } from "./renderers/DesignTemplateRenderer";
export type { DesignTemplateRendererProps } from "./renderers/DesignTemplateRenderer";
export { default as InteractiveCanvas, useInteractiveCanvas } from "./render/InteractiveCanvas";
export type { InteractiveCanvasProps } from "./render/InteractiveCanvas";
export { applyCommand, applyTransaction, setElementEffectsCommand } from "./core/commands";
export type { CommandBatch, DesignCommand } from "./core/commands";
export { HistoryManager } from "./core/history";
export type { CommandTransaction } from "./core/history";
export { DESIGN_BLEND_MODES, DESIGN_EFFECT_TYPES, deserializeDesignEffects, resolveEffectPlan, serializeDesignEffects, validateDesignEffects } from "./core/effects";
export type { DesignBlendMode, DesignEffect, DesignEffectType, EffectRenderPlan } from "./core/effects";
export { effectPlanToCss } from "./render/adapters/cssEffectAdapter";
export { effectPlanToSvg } from "./export/renderers/svgEffects";
export { getSnapResult, snapPosition } from "./core/snapping";
export type { SnapAxis, SnapGuide, SnapKind, SnapObject, SnapRect, SnapRequest, SnapResult, SnapSettings } from "./core/snapping";
export { buildLayerTree, layerOrderCommands, nestLayerNodes, reorderLayerCommands } from "./core/layers";
export type { LayerElement, LayerNode, LayerOrderAction, LayerPlacement, LayerTreeState } from "./core/layers";
export { getInspectorSection, inspectorExtensionPoints, setElementPropertiesCommand } from "./core/properties";
export type { InspectorExtensionPoint, InspectorSection } from "./core/properties";
export { createKeybindingRegistry, KeybindingRegistry } from "./core/keybindings";
export type { Keybinding, KeyboardInput, ShortcutAction } from "./core/keybindings";
export * from "./export";
export * from "./brand";
export * from "./plugins";
export * from "./ai";
export * from "./automation";
export { AnimationEngine, defaultAnimationEngine } from "./animation";
export type { AnimationDirection, AnimationEasing, AnimationKeyframe, AnimationPresetDefinition, AnimationPresetId, AnimationTimeline, AnimationTrack, AnimationTransform, AnimationValues, NodeAnimationMetadata } from "./animation";
export { ANIMATION_PRESETS, getAnimationPreset } from "./presets";
export { createAnimationTimeline, evaluateAnimationTimeline, timelineProgress } from "./timeline";
export { applyEasing, interpolateKeyframes, interpolateValues } from "./interpolation";
export { DesignDevTool } from "./components/DesignDevTool";
export type { DesignDevToolProps } from "./components/DesignDevTool";
export {
  DESIGN_ELEMENT_REGISTRY,
  getDesignElementRenderer,
  getSupportedElementTypes,
  registerDesignElementRenderer,
} from "./components/designElementRegistry";
export type { DesignElementRenderer, DesignElementRendererProps } from "./components/designElementRegistry";
export { TemplateRegistry, TEMPLATE_REGISTRY, registerTemplates } from "./templates/TemplateRegistry";
export { TEMPLATE_CATEGORIES, PROFESSIONAL_TEMPLATE_CATALOG, adaptTemplateVariant } from "./templates/professionalCatalog";
export type { TemplateCatalogEntry, TemplateCategory, TemplateDifficulty, TemplateMetadata, VariantSize } from "./templates/professionalCatalog";
export { STUDIO_CATEGORIES, PROFESSIONAL_STUDIO_TEMPLATES, PROFESSIONAL_STUDIO_BY_ID, getStudioTemplate, getStudioTemplateVariant, getStudioCategories, serializeStudioTemplate } from "./templates/professionalStudio";
export type { StudioCategory, StudioDifficulty, StudioResponsiveRules, StudioTypographyHierarchy, ProfessionalStudioMetadata, ProfessionalStudioTemplate } from "./templates/professionalStudio";
export type { TemplateRecommendationContext, TemplateRecommendation, TemplateRecommendationProvider } from "./ai/templateRecommendations";
export { inspectTemplateQuality } from "./templates/templateQuality";
export type { TemplateWarning, TemplateWarningCode } from "./templates/templateQuality";
export { searchTemplates, TemplateLibrary, getVirtualWindow } from "./templates/templateLibrary";
export type { TemplateSearchOptions, TemplateSort, TemplateLibraryState, KeyValueStorage } from "./templates/templateLibrary";
export { generateTemplateThumbnail, generateTemplatePreviewSet } from "./templates/thumbnailGenerator";
export type { PreviewTheme } from "./templates/thumbnailGenerator";
export { createDesignComponent } from "./components/designComponents";
export type { ComponentKind, DesignComponentSpec } from "./components/designComponents";
export {
  DESIGN_COMPONENT_CATALOG,
  getDesignComponentDefinition,
  listDesignComponents,
  createComponentInstance,
  adaptComponentInstance,
  renderDesignComponent,
  validateDesignComponent,
  composeTemplateFromComponents,
  serializeDesignComponents,
  deserializeDesignComponents,
  getComponentRenderability,
  generateDesignComponentPreview,
} from "./components/designComponentLibrary";
export type {
  ComponentDimensions,
  ComponentFrame,
  ComponentInsets,
  ComponentResponsiveBehavior,
  ComponentValidationWarning,
  DesignComponentCategory,
  DesignComponentDefinition,
  DesignComponentInstance,
} from "./components/designComponentLibrary";
export { fromLegacyTemplateConfig } from "./templates/legacyTemplateAdapter";
export {
  loadDesignTemplate,
  parseDesignTemplate,
  parseTemplateDocument,
  validateDesignTemplate,
} from "./templates/validateDesignTemplate";
export type {
  DesignAnimation,
  DesignBackground,
  DesignBorder,
  DesignBranding,
  DesignCanvas,
  DesignElement,
  DesignElementType,
  DesignFormat,
  DesignGradient,
  DesignRenderContext,
  DesignShadow,
  DesignStroke,
  DesignTemplate,
  TemplateOutputFormat,
} from "./types/designTemplate";
export { CanvasRenderer, OUTPUT_SIZES } from "./renderers/CanvasRenderer";
export { getLayoutPresetIds, resolveLayout, resolveTemplateLayout } from "./layouts/LayoutEngine";
export { computeAutoLayout } from "./layouts/AutoLayout";
export type { AutoLayoutItem, AutoLayoutMode, AutoLayoutOptions, AutoLayoutPlacement } from "./layouts/AutoLayout";
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
