import { createDesignComponent } from "./designComponents";
import { getDesignElementRenderer } from "./designElementRegistry";
import type { BrandKit } from "../brand/types";
import { defaultBrandEngine } from "../brand/BrandEngine";
import type { DesignElement, DesignElementType, DesignTemplate, TemplateOutputFormat } from "../types/designTemplate";

export type DesignComponentCategory = "layout" | "card" | "badge" | "cta" | "footer" | "decorative" | "information";
export type ComponentResponsiveBehavior = "scale" | "responsive-stack" | "crop-priority" | "preserve-safe-zone" | "hide-secondary";
export interface ComponentDimensions { width: number; height: number }
export interface ComponentInsets { top: string; right: string; bottom: string; left: string }
export interface DesignComponentDefinition {
  id: string;
  name: string;
  type: DesignElementType;
  category: DesignComponentCategory;
  supportedFormats: TemplateOutputFormat[];
  defaultDimensions: ComponentDimensions;
  padding: ComponentInsets;
  margin: ComponentInsets;
  minimumSize: ComponentDimensions;
  maximumSize: ComponentDimensions;
  responsiveBehavior: ComponentResponsiveBehavior;
  themeTokens: Record<string, string>;
  brandTokens: string[];
  animationSupport: boolean;
  safeZoneRules: string[];
  editableProperties: string[];
  previewGenerator: string;
  validationRules: string[];
  roles: Array<"image" | "heading" | "body" | "cta" | "icon" | "decoration">;
  requiresImage?: boolean;
}
export interface ComponentFrame { x: number; y: number; width: number; height: number }
export interface DesignComponentInstance {
  id: string;
  componentId: string;
  frame: ComponentFrame;
  format: TemplateOutputFormat;
  properties: { title?: string; body?: string; cta?: string; image?: string; icon?: string; textSize?: number; animation?: string; brandId?: string; tokens?: Record<string, string | number> };
}
export interface ComponentValidationWarning {
  code: "overflow" | "missing-image" | "tiny-text" | "unsafe-position" | "broken-hierarchy" | "unsupported-animation" | "brand-mismatch";
  message: string;
  componentId: string;
  severity: "warning" | "info";
}

const FORMATS: TemplateOutputFormat[] = ["story", "portrait", "square", "landscape", "carousel"];
const ANIMATION_PRESETS = new Set(["fade", "slide", "scale", "rotate", "bounce", "pop", "zoom", "blur", "motion-blur"]);
const tokenPack = {
  color: "$colors.text", surface: "$colors.surface", accent: "$colors.primary", muted: "$colors.secondary",
  font: "$fonts.body", headingFont: "$fonts.heading", spacing: "$spacing.md", radius: "$radius.card",
  shadow: "$shadows.card", opacity: "$opacity.strong", animation: "$animationPresets.fade.durationMs",
};
const definitions: DesignComponentDefinition[] = [];

function slug(label: string) { return label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function addGroup(category: DesignComponentCategory, labels: string[], type: DesignElementType, roles: DesignComponentDefinition["roles"], options: Partial<DesignComponentDefinition> = {}) {
  for (const name of labels) {
    const id = slug(name);
    definitions.push({
      id, name, type, category, supportedFormats: [...FORMATS], defaultDimensions: { width: category === "layout" ? 1080 : 560, height: category === "layout" ? 1350 : 320 },
      padding: { top: "$spacing.md", right: "$spacing.md", bottom: "$spacing.md", left: "$spacing.md" },
      margin: { top: "$spacing.sm", right: "$spacing.sm", bottom: "$spacing.sm", left: "$spacing.sm" },
      minimumSize: { width: 80, height: 40 }, maximumSize: { width: 1920, height: 1920 },
      responsiveBehavior: category === "layout" ? "responsive-stack" : roles.includes("image") ? "crop-priority" : "preserve-safe-zone",
      themeTokens: { ...tokenPack }, brandTokens: ["colors.text", "colors.surface", "colors.primary", "fonts.body", "fonts.heading", "spacing.md", "radius.card", "shadows.card", "animationPresets.fade"],
      animationSupport: category !== "decorative" || !["noise-overlay", "paper-texture", "marble-texture"].includes(id),
      safeZoneRules: ["keep-within-format-safe-zone", "preserve-minimum-readable-text"],
      editableProperties: ["title", "body", "cta", "image", "icon", "textSize", "tokens", "frame"],
      previewGenerator: category === "layout" ? "layout-swatch" : roles.includes("image") ? "image-card" : "token-component",
      validationRules: ["overflow", "missing-image", "tiny-text", "unsafe-position", "broken-hierarchy", "unsupported-animation", "brand-mismatch"],
      roles: [...roles], ...(roles.includes("image") ? { requiresImage: true } : {}), ...options,
    });
  }
}

addGroup("layout", ["Hero Section", "Split Layout", "Magazine Layout", "Editorial Layout", "Card Layout", "Sidebar Layout", "Timeline Layout", "Feature Grid", "Stats Grid", "Pricing Layout", "Contact Layout", "Project Layout", "Image Focus Layout", "Quote Layout", "Centered Layout", "Minimal Layout", "Luxury Layout"], "Shape", ["image", "heading", "body", "cta"]);
addGroup("card", ["Glass Card", "Luxury Card", "Shadow Card", "Gradient Card", "Border Card", "Image Card", "Project Card", "Statistic Card", "Review Card", "CTA Card", "Information Card", "Profile Card", "Feature Card", "Material Card", "Floor Plan Card"], "Shape", ["image", "heading", "body"]);
addGroup("badge", ["New", "Trending", "Luxury", "Premium", "Offer", "Completed", "In Progress", "Before", "After", "Featured", "Limited", "Discount", "Verified", "Award", "Best Seller"], "Badge", ["icon", "heading"]);
addGroup("cta", ["Rounded Button", "Outline Button", "Luxury Button", "Glass Button", "Gradient Button", "Arrow CTA", "Book Consultation", "Call Now", "Visit Website", "Learn More"], "CTA Button", ["heading", "icon"]);
addGroup("footer", ["Contact Footer", "Luxury Footer", "Social Footer", "Minimal Footer", "Company Footer", "Location Footer", "QR Footer"], "Text", ["body", "icon"]);
addGroup("decorative", ["Gradient Blob", "Luxury Border", "Corner Accent", "Architectural Lines", "Floating Shapes", "Blur Circle", "Soft Glow", "Diagonal Accent", "Pattern Overlay", "Noise Overlay", "Paper Texture", "Marble Texture", "Gold Accent", "Shadow Decoration", "Light Reflection"], "Decorative Object", ["decoration"]);
addGroup("information", ["Project Details", "Timeline", "Price Card", "Materials", "Designer Profile", "Project Statistics", "Completion Status", "Client Review", "Achievements", "Awards"], "Text", ["heading", "body"]);

export const DESIGN_COMPONENT_CATALOG: readonly DesignComponentDefinition[] = Object.freeze(definitions.map((definition) => Object.freeze(definition)));
const DEFINITION_BY_ID = new Map(DESIGN_COMPONENT_CATALOG.map((definition) => [definition.id, definition]));
export function getDesignComponentDefinition(id: string): DesignComponentDefinition | undefined { return DEFINITION_BY_ID.get(id); }
export function listDesignComponents(category?: DesignComponentCategory): DesignComponentDefinition[] {
  return category ? DESIGN_COMPONENT_CATALOG.filter((definition) => definition.category === category) : [...DESIGN_COMPONENT_CATALOG];
}

export function createComponentInstance(componentId: string, frame: ComponentFrame, properties: DesignComponentInstance["properties"] = {}, format: TemplateOutputFormat = "portrait"): DesignComponentInstance {
  const definition = DEFINITION_BY_ID.get(componentId);
  if (!definition) throw new Error(`Unknown design component: ${componentId}`);
  return { id: `${componentId}-${Math.random().toString(36).slice(2, 9)}`, componentId, frame: { ...frame }, format, properties: { ...properties } };
}

const SIZE: Record<TemplateOutputFormat, [number, number]> = { story: [1080, 1920], portrait: [1080, 1350], square: [1080, 1080], landscape: [1920, 1080], carousel: [1080, 1350], tablet: [1536, 2048], desktop: [1920, 1080] };
export function adaptComponentInstance(instance: DesignComponentInstance, format: TemplateOutputFormat): DesignComponentInstance {
  const from = SIZE[instance.format], to = SIZE[format], sx = Math.max(0.7, Math.min(1.3, (to[0] / to[1]) / (from[0] / from[1]))), sy = 1 / sx;
  const weight = getDesignComponentDefinition(instance.componentId)?.responsiveBehavior === "responsive-stack" ? 0.5 : 0.28;
  const width = Math.min(1, instance.frame.width * (1 + (sx - 1) * weight)), height = Math.min(1, instance.frame.height * (1 + (sy - 1) * weight));
  return { ...instance, format, frame: { x: Math.max(0, Math.min(1 - width, instance.frame.x + instance.frame.width / 2 - width / 2)), y: Math.max(0, Math.min(1 - height, instance.frame.y + instance.frame.height / 2 - height / 2)), width, height } };
}

function childElement(instance: DesignComponentInstance, type: DesignElementType, role: string, content: string | undefined, frame: ComponentFrame, zIndex: number, token: string): DesignElement {
  const made = createDesignComponent({ id: `${instance.id}-${role}`, kind: type === "Image" ? "hero-image" : type === "CTA Button" ? "cta-button" : type === "Badge" ? "rounded-badge" : "project-info-card", x: frame.x, y: frame.y, width: frame.width, height: frame.height, text: content, asset: type === "Image" ? instance.properties.image : undefined, tokens: { color: token, background: token, radius: "$radius.card", shadow: "$shadows.card", fontSize: instance.properties.textSize || 24 } });
  return {
    ...made, id: `${instance.id}-${role}`, type, zIndex, content: content || made.content,
    source: type === "Image" ? instance.properties.image : made.source,
    fontFamily: role === "heading" ? "$fonts.heading" : "$fonts.body", color: token,
    style: { ...made.style, padding: "$spacing.md", borderRadius: "$radius.card" },
    ...(type === "Image" ? { crop: "cover" as const, brightness: 1, contrast: 1, saturation: 1, blur: 0, borderRadius: 0, shadow: { color: "$colors.text", blur: 0, offsetX: 0, offsetY: 0 } } : {}),
    ...(type === "CTA Button" ? {
      padding: 16, radius: 16, border: { color: "$colors.primary", width: 1 },
      gradient: { type: "linear" as const, angle: 0, stops: [{ color: "$colors.primary", position: 0 }, { color: "$colors.primary", position: 1 }] },
      shadow: { color: "$colors.text", blur: 8, offsetX: 0, offsetY: 3 }, icon: instance.properties.icon || "arrow-right",
    } : {}),
  };
}

/** Render one semantic instance to legacy DesignElements for existing renderers and exports. */
export function renderDesignComponent(instance: DesignComponentInstance, brand?: BrandKit): DesignElement[] {
  const definition = DEFINITION_BY_ID.get(instance.componentId);
  if (!definition) return [];
  const { frame, properties } = instance, elements: DesignElement[] = [];
  const full = (role: string, type: DesignElementType, content: string | undefined, color: string, y: number, height: number) => elements.push(childElement(instance, type, role, content, { x: frame.x, y, width: frame.width, height }, elements.length, color));
  if (definition.roles.includes("decoration")) {
    full("decoration", "Decorative Object", undefined, "$colors.accent", frame.y, frame.height);
  } else {
    const hasCard = definition.category === "card" || definition.category === "information" || definition.category === "footer";
    if (hasCard) full("surface", "Shape", undefined, "$colors.surface", frame.y, frame.height);
    const roles = definition.roles.filter((role) => role !== "image" && role !== "icon");
    const band = frame.height / Math.max(1, roles.length + (definition.roles.includes("image") ? 1 : 0));
    let y = frame.y;
    if (definition.roles.includes("image")) {
      full("image", "Image", properties.image ? "content.image" : undefined, "$colors.surface", y, band * 1.35);
      y += band * 1.35;
    }
    for (const role of roles) {
      const type: DesignElementType = role === "heading" ? (definition.category === "badge" ? "Badge" : "Heading") : role === "cta" ? "CTA Button" : "Body Text";
      const content = role === "heading" ? properties.title || definition.name : role === "body" ? properties.body : role === "cta" ? properties.cta || properties.title || definition.name : properties.icon;
      full(role, type, content, role === "cta" ? "$colors.primary" : "$colors.text", y, band);
      y += band;
    }
  }
  if (properties.animation && definition.animationSupport && ANIMATION_PRESETS.has(properties.animation)) {
    const duration = brand?.animationPresets?.[properties.animation]?.durationMs;
    elements.forEach((element) => { element.animations = [{ preset: properties.animation as NonNullable<DesignElement["animations"]>[number]["preset"], durationMs: typeof duration === "number" ? duration : 350, delayMs: 0 }]; });
  }
  return brand ? defaultBrandEngine.resolveTokens(elements, brand) : elements;
}

export function validateDesignComponent(instance: DesignComponentInstance, options: { safeZone?: { top: number; right: number; bottom: number; left: number }; brandId?: string; availableBrandTokens?: readonly string[] } = {}): ComponentValidationWarning[] {
  const warnings: ComponentValidationWarning[] = [], definition = DEFINITION_BY_ID.get(instance?.componentId || ""), id = instance?.id || "unknown";
  const warn = (code: ComponentValidationWarning["code"], message: string, severity: ComponentValidationWarning["severity"] = "warning") => warnings.push({ code, message, componentId: id, severity });
  if (!definition) { warn("broken-hierarchy", `Unknown component type "${String(instance?.componentId)}".`); return warnings; }
  const frame = instance.frame || { x: 0, y: 0, width: 0, height: 0 };
  if (![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) || frame.width <= 0 || frame.height <= 0 || frame.x < 0 || frame.y < 0 || frame.x + frame.width > 1 || frame.y + frame.height > 1) warn("overflow", "Component frame extends outside the canvas.");
  if (definition.requiresImage && !instance.properties?.image) warn("missing-image", "This component needs an image asset.");
  if (instance.properties?.textSize !== undefined && instance.properties.textSize < 14) warn("tiny-text", "Text size is below 14 px and may be difficult to read.");
  const safe = options.safeZone;
  if (safe && (frame.x < safe.left || frame.y < safe.top || frame.x + frame.width > 1 - safe.right || frame.y + frame.height > 1 - safe.bottom)) warn("unsafe-position", "Component overlaps a reserved safe zone.");
  if (definition.roles.includes("heading") && !instance.properties?.title && !instance.properties?.body) warn("broken-hierarchy", "This component requires a heading or body label.");
  if (instance.properties?.animation && (!definition.animationSupport || !ANIMATION_PRESETS.has(instance.properties.animation))) warn("unsupported-animation", "This component does not support the selected animation.");
  if (options.brandId && instance.properties?.brandId && instance.properties.brandId !== options.brandId) warn("brand-mismatch", "Component brand does not match the active brand.");
  const tokens = options.availableBrandTokens;
  if (tokens && definition.brandTokens.some((token) => !tokens.includes(token))) warn("brand-mismatch", "The active brand is missing one or more tokens required by this component.", "info");
  return warnings;
}

export function composeTemplateFromComponents<T extends DesignTemplate>(base: T, instances: readonly DesignComponentInstance[], brand?: BrandKit): T {
  const serialized = JSON.parse(JSON.stringify(base)) as T;
  const nextZ = base.elements.reduce((maximum, element) => Math.max(maximum, element.zIndex), -1) + 1;
  const added = instances.flatMap((instance) => renderDesignComponent(instance, brand));
  serialized.elements = [...base.elements, ...added.map((element, index) => ({ ...element, zIndex: nextZ + index }))];
  serialized.metadata = { ...base.metadata, componentInstances: [...instances] };
  serialized.supportedFormats = [...new Set([...base.supportedFormats, ...instances.flatMap((instance) => getDesignComponentDefinition(instance.componentId)?.supportedFormats || [])])];
  if (brand) {
    const brandTokens = Object.fromEntries(Object.entries(defaultBrandEngine.renderTokens(brand)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    serialized.branding = { ...base.branding, logo: brand.logo || base.branding.logo, palette: { ...base.branding.palette, ...brand.colors }, tokens: { ...(base.branding as typeof base.branding & { tokens?: Record<string, string> }).tokens, ...brandTokens } };
  }
  return serialized;
}

export function serializeDesignComponents(instances: readonly DesignComponentInstance[]): string { return JSON.stringify(instances); }
export function deserializeDesignComponents(serialized: string): { instances: DesignComponentInstance[]; warnings: ComponentValidationWarning[] } {
  try {
    const input: unknown = JSON.parse(serialized);
    if (!Array.isArray(input)) return { instances: [], warnings: [{ componentId: "unknown", code: "broken-hierarchy", severity: "warning", message: "Component document must be an array." }] };
    const instances = input.filter((item): item is DesignComponentInstance => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.componentId === "string" && item.frame && typeof item.frame === "object" && item.properties && typeof item.properties === "object"));
    const warnings = input.length === instances.length ? [] : [{ componentId: "unknown", code: "broken-hierarchy" as const, severity: "warning" as const, message: "One or more component records were invalid and skipped." }];
    return { instances, warnings: [...warnings, ...instances.flatMap((instance) => validateDesignComponent(instance))] };
  } catch { return { instances: [], warnings: [{ componentId: "unknown", code: "broken-hierarchy", severity: "warning", message: "Component document is not valid JSON." }] }; }
}

export function getComponentRenderability(instance: DesignComponentInstance): boolean {
  const elements = renderDesignComponent(instance);
  return elements.length > 0 && elements.every((element) => Boolean(getDesignElementRenderer(element.type)));
}

/** Lightweight on-demand SVG swatch driven by component tokens. */
export function generateDesignComponentPreview(instance: DesignComponentInstance, options: { width?: number; height?: number; brand?: BrandKit } = {}): string {
  const definition = DEFINITION_BY_ID.get(instance.componentId);
  const width = Math.max(1, options.width || 320), height = Math.max(1, options.height || 180);
  const esc = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character]!));
  const surface = options.brand?.colors?.surface || "var(--colors-surface, currentColor)";
  const ink = options.brand?.colors?.text || "var(--colors-text, currentColor)";
  const accent = options.brand?.colors?.primary || "var(--colors-primary, currentColor)";
  const radius = options.brand?.radius?.card ?? "var(--radius-card, 12px)";
  const title = esc(instance.properties.title || definition?.name || "Unknown component");
  const secondary = esc(instance.properties.body || "");
  const backdrop = definition?.roles.includes("image") ? `<rect x="0" y="0" width="${width}" height="${height * 0.58}" rx="${radius}" fill="${surface}" opacity=".58"/>` : "";
  const labelY = backdrop ? height * 0.76 : height * 0.56;
  const cta = definition?.roles.includes("cta") ? `<rect x="${width * 0.7}" y="${height * 0.76}" width="${width * 0.24}" height="${height * 0.13}" rx="${radius}" fill="${accent}" opacity=".75"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-component-id="${esc(instance.componentId)}"><rect width="100%" height="100%" rx="${radius}" fill="${surface}"/>${backdrop}<text x="${width * 0.06}" y="${labelY}" fill="${ink}" font-family="var(--fonts-heading, inherit)" font-size="${Math.max(12, Math.min(28, instance.properties.textSize || 20))}">${title}</text>${secondary ? `<text x="${width * 0.06}" y="${labelY + 22}" fill="${ink}" opacity=".76" font-family="var(--fonts-body, inherit)" font-size="14">${secondary}</text>` : ""}${cta}</svg>`;
}
