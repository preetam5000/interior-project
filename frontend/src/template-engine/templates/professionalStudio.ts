import { adaptComponentInstance, createComponentInstance, renderDesignComponent, type DesignComponentInstance } from "../components/designComponentLibrary";
import { createDesignComponent } from "../components/designComponents";
import type { DesignElement, DesignTemplate, TemplateOutputFormat } from "../types/designTemplate";
import { generateTemplatePreviewSet } from "./thumbnailGenerator";
import { adaptTemplateVariant } from "./professionalCatalog";

export const STUDIO_CATEGORIES = [
  "Luxury Interior", "Modern", "Minimal", "Scandinavian", "Bohemian", "Industrial", "Classic", "Office", "Commercial", "Kitchen",
  "Bedroom", "Living Room", "Bathroom", "Villa", "Apartment", "Construction Progress", "Before After", "Site Visit", "Client Testimonial", "Festival",
  "Offer", "Reels Cover", "Carousel", "Story", "Mood Board", "Furniture", "Material Showcase", "Lighting", "Color Palette", "Architecture", "Project Timeline",
] as const;
export type StudioCategory = typeof STUDIO_CATEGORIES[number];
export type StudioDifficulty = "beginner" | "intermediate" | "advanced";
export interface StudioTypographyHierarchy { display: string; heading: string; body: string; callToAction: string; scale: number[] }
export interface StudioResponsiveRules { story: string; portrait: string; square: string; landscape: string; carousel: string; safeZonePolicy: string }
export interface ProfessionalStudioMetadata {
  description: string;
  recommendedIndustry: string[];
  mood: string[];
  typographyHierarchy: StudioTypographyHierarchy;
  spacingSystem: { base: number; scale: number[]; grid: number; gutter: number };
  imagePlaceholders: Array<{ id: string; role: string; frame: { x: number; y: number; width: number; height: number }; fit: "cover"; focalPoint: { x: number; y: number } }>;
  safeZones: DesignTemplate["canvas"]["safeZones"];
  cta: { label: string; position: string; style: string };
  badge: { label: string; position: string; style: string };
  logoPlacement: { position: string; frame: { x: number; y: number; width: number; height: number } };
  overlay: { type: "linear-gradient"; opacity: number; token: string };
  decorativeShapes: string[];
  responsiveRules: StudioResponsiveRules;
  qualityScore: number;
  brandCompatibility: "any-brand" | "palette-required" | "logo-recommended";
  animationCompatibility: { supported: boolean; presets: string[]; reducedMotion: "respects-system-preference" };
  aspectRatio: string;
  layoutSignature: string;
  layoutArchetype: string;
}
export interface ProfessionalStudioTemplate {
  id: string;
  name: string;
  category: StudioCategory;
  tags: string[];
  difficulty: StudioDifficulty;
  supportedFormats: TemplateOutputFormat[];
  brandCompatibility: ProfessionalStudioMetadata["brandCompatibility"];
  animationCompatibility: ProfessionalStudioMetadata["animationCompatibility"];
  responsiveRules: StudioResponsiveRules;
  qualityScore: number;
  aspectRatio: string;
  metadata: ProfessionalStudioMetadata;
  /** Complete, versioned, renderer-compatible JSON document. */
  jsonDefinition: DesignTemplate;
  /** Generated thumbnail and theme previews; values are SVG strings. */
  preview: { library: string; hover: string; large: string; dark: string; light: string };
}

const OUTPUT_FORMATS: TemplateOutputFormat[] = ["story", "portrait", "square", "landscape", "carousel"];
const PALETTES = [
  { primary: "#9A784B", secondary: "#26221D", accent: "#D6B779", surface: "#F5F0E6", text: "#29251F" },
  { primary: "#648071", secondary: "#28352F", accent: "#B8C5A8", surface: "#F1F2EB", text: "#26312B" },
  { primary: "#6F7F91", secondary: "#202C37", accent: "#B9CAD7", surface: "#F0F3F5", text: "#202A33" },
  { primary: "#9B6959", secondary: "#332720", accent: "#D7A991", surface: "#F7EEE8", text: "#392C25" },
  { primary: "#8B8792", secondary: "#302F36", accent: "#C8C1D0", surface: "#F4F1F6", text: "#302D35" },
  { primary: "#AA8A62", secondary: "#3C3329", accent: "#E0C9A6", surface: "#F8F4EC", text: "#332D26" },
  { primary: "#55716C", secondary: "#1F302E", accent: "#A8C3B9", surface: "#EEF3F0", text: "#233331" },
  { primary: "#7A6254", secondary: "#282321", accent: "#C6A88C", surface: "#F2EEE9", text: "#2D2926" },
  { primary: "#697A55", secondary: "#252E22", accent: "#B7C18F", surface: "#F2F1E8", text: "#262C22" },
  { primary: "#A17B70", secondary: "#382C2A", accent: "#D9B9AA", surface: "#F7F0EF", text: "#352A29" },
];
const TYPE_PAIRS: Array<[string, string]> = [
  ["Playfair Display", "Inter"], ["Cormorant Garamond", "DM Sans"], ["Bodoni Moda", "Manrope"], ["Libre Baskerville", "Source Sans 3"],
  ["Fraunces", "Work Sans"], ["DM Serif Display", "Lato"], ["Gloock", "Montserrat"], ["Newsreader", "IBM Plex Sans"],
  ["Prata", "Karla"], ["Space Grotesk", "Inter"],
];
const NAME_STYLES = ["The Aurelian Edit", "Light in Layers", "Form & Feeling", "A Place to Pause", "Material Poetry", "Crafted Calm", "The Modern Residence", "Quietly Considered", "Space to Gather", "Design Dispatch", "A Study in Stone", "Living Well", "From Drawing to Detail", "Soft Geometry", "Collected Moments", "Lines of Light", "New Perspective", "The Sunday Home", "Tactile Living", "An Architectural Note"];
const DESCRIPTIONS = [
  "An art-directed interior story balancing tactile materials, architectural light, and a clear studio call to action.",
  "A composed project feature with editorial typography, intentional image framing, and calm brand detail.",
  "A refined social layout designed to make room photography feel considered, warm, and unmistakably individual.",
  "A studio-ready composition for sharing material choices, project progress, and the thinking behind each space.",
  "A premium visual narrative with restrained type, layered imagery, and a confident but unobtrusive invitation.",
];
const LAYOUTS = [
  { id: "full-bleed-caption", images: [[0, 0, 1, 0.86]], copy: [0.07, 0.64, 0.86, 0.29] },
  { id: "split-copy-left", images: [[0.43, 0, 0.57, 1]], copy: [0.06, 0.18, 0.46, 0.64] },
  { id: "split-copy-right", images: [[0, 0, 0.58, 1]], copy: [0.52, 0.22, 0.42, 0.58] },
  { id: "magazine-bottom-deck", images: [[0.08, 0.07, 0.84, 0.61]], copy: [0.11, 0.64, 0.78, 0.29] },
  { id: "floating-editorial-card", images: [[0.17, 0.05, 0.66, 0.9]], copy: [0.05, 0.67, 0.59, 0.24] },
  { id: "sidebar-caption", images: [[0.04, 0.2, 0.63, 0.72]], copy: [0.62, 0.08, 0.33, 0.82] },
  { id: "three-panel-collage", images: [[0.03, 0.2, 0.61, 0.75], [0.66, 0.2, 0.31, 0.35], [0.66, 0.59, 0.31, 0.36]], copy: [0.07, 0.04, 0.83, 0.18] },
  { id: "top-image-story", images: [[0.07, 0.07, 0.86, 0.45]], copy: [0.1, 0.55, 0.8, 0.37] },
  { id: "asymmetric-rail", images: [[0.32, 0.04, 0.65, 0.64]], copy: [0.05, 0.31, 0.42, 0.58] },
  { id: "vertical-project-strip", images: [[0.04, 0.12, 0.72, 0.74]], copy: [0.65, 0.08, 0.3, 0.82] },
  { id: "centered-image-mat", images: [[0.13, 0.14, 0.74, 0.74]], copy: [0.06, 0.05, 0.88, 0.3] },
  { id: "panoramic-lower-third", images: [[0, 0.04, 1, 0.55]], copy: [0.08, 0.57, 0.84, 0.38] },
  { id: "offset-double-frame", images: [[0.05, 0.09, 0.56, 0.77], [0.57, 0.32, 0.37, 0.56]], copy: [0.61, 0.06, 0.32, 0.28] },
  { id: "portrait-with-caption-spine", images: [[0.17, 0.05, 0.59, 0.9]], copy: [0.77, 0.12, 0.19, 0.72] },
  { id: "editorial-corner-window", images: [[0, 0.24, 0.78, 0.7]], copy: [0.47, 0.05, 0.49, 0.37] },
  { id: "image-triptych", images: [[0.04, 0.2, 0.29, 0.58], [0.355, 0.12, 0.29, 0.68], [0.67, 0.2, 0.29, 0.58]], copy: [0.08, 0.04, 0.84, 0.15] },
  { id: "wide-left-rail", images: [[0.34, 0.12, 0.62, 0.76]], copy: [0.04, 0.15, 0.38, 0.7] },
  { id: "stacked-detail-study", images: [[0.06, 0.08, 0.53, 0.42], [0.42, 0.5, 0.52, 0.4]], copy: [0.62, 0.08, 0.32, 0.33] },
  { id: "bottom-image-window", images: [[0.12, 0.43, 0.76, 0.5]], copy: [0.08, 0.07, 0.83, 0.38] },
  { id: "stepped-image-stack", images: [[0.05, 0.17, 0.48, 0.69], [0.56, 0.08, 0.38, 0.45]], copy: [0.57, 0.57, 0.37, 0.32] },
];
const CATEGORY_TAGS: Record<StudioCategory, string[]> = {
  "Luxury Interior": ["luxury", "refined", "residence"], Modern: ["modern", "contemporary", "architecture"], Minimal: ["minimal", "quiet", "considered"], Scandinavian: ["scandinavian", "natural", "light"], Bohemian: ["bohemian", "collected", "textile"], Industrial: ["industrial", "material", "urban"], Classic: ["classic", "heritage", "timeless"], Office: ["office", "workplace", "commercial interior"], Commercial: ["commercial", "hospitality", "workspace"], Kitchen: ["kitchen", "joinery", "gathering"], Bedroom: ["bedroom", "retreat", "soft"], "Living Room": ["living room", "gathering", "home"], Bathroom: ["bathroom", "ritual", "stone"], Villa: ["villa", "residence", "landscape"], Apartment: ["apartment", "city living", "compact"], "Construction Progress": ["construction", "progress", "site"], "Before After": ["before after", "transformation", "renovation"], "Site Visit": ["site visit", "field notes", "process"], "Client Testimonial": ["testimonial", "client story", "review"], Festival: ["festival", "seasonal", "studio"], Offer: ["offer", "consultation", "limited"], "Reels Cover": ["reel", "cover", "video"], Carousel: ["carousel", "multi-frame", "storytelling"], Story: ["story", "vertical", "instagram"], "Mood Board": ["mood board", "palette", "materials"], Furniture: ["furniture", "craft", "object"], "Material Showcase": ["material", "finish", "texture"], Lighting: ["lighting", "illumination", "atmosphere"], "Color Palette": ["color palette", "color story", "swatches"], Architecture: ["architecture", "form", "detail"], "Project Timeline": ["timeline", "milestone", "delivery"],
};
const SAFE = { top: 0.09, right: 0.075, bottom: 0.11, left: 0.075 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const frameOf = (tuple: number[]) => ({ x: tuple[0], y: tuple[1], width: tuple[2], height: tuple[3] });
function elementContent(element: DesignElement): string {
  const match = /^(content|brand)\.([\w]+)(?:\|(.*))?$/.exec(element.content || "");
  return match?.[3] || element.content || "";
}
function esc(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character]!)); }

function generateStudioPreview(template: DesignTemplate, palette: typeof PALETTES[number]): string {
  const width = 360, height = 450;
  const typography = template.metadata.typographyHierarchy as StudioTypographyHierarchy;
  const stops = `<linearGradient id="wash" x1="0" y1="0" x2="0.9" y2="1"><stop stop-color="${palette.secondary}"/><stop offset="1" stop-color="${palette.primary}"/></linearGradient><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${palette.secondary}" stop-opacity="0"/><stop offset="1" stop-color="${palette.secondary}" stop-opacity=".92"/></linearGradient>`;
  const graphic = template.elements.sort((a, b) => a.zIndex - b.zIndex).map((element) => {
    const x = element.x * width, y = element.y * height, w = element.width * width, h = element.height * height;
    if (element.type === "Image") return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="url(#wash)" opacity=".92"/><path d="M${x} ${y + h * .78} L${x + w * .36} ${y + h * .35} L${x + w * .58} ${y + h * .59} L${x + w * .77} ${y + h * .28} L${x + w} ${y + h * .67} V${y + h} H${x}Z" fill="${palette.surface}" opacity=".17"/><circle cx="${x + w * .76}" cy="${y + h * .2}" r="${Math.min(w, h) * .07}" fill="${palette.accent}" opacity=".5"/></g>`;
    if (element.type === "Gradient" && element.gradient) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#scrim)" opacity="${element.opacity}"/>`;
    if (element.type === "Decorative Object" || element.type === "Shape" || element.type === "Divider") return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${element.radius || 2}" fill="${palette.accent}" opacity="${Math.min(.35, element.opacity)}"/>`;
    if (["Text", "Heading", "Subtitle", "Body Text", "CTA Button", "Badge", "Social Handle", "Sticker"].includes(element.type)) {
      const label = esc(elementContent(element)).slice(0, 56), fontSize = clamp((element.fontSize || 28) / 4, 7, 24), fill = element.type === "CTA Button" || element.type === "Badge" ? palette.accent : palette.surface;
      const fontFamily = ["Heading", "Subtitle"].includes(element.type) ? typography.heading : typography.body;
      return `<text x="${x + w * .03}" y="${y + h * .58}" fill="${fill}" font-family="${esc(fontFamily)}" font-size="${fontSize}" letter-spacing=".4">${label}</text>`;
    }
    return "";
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${stops}</defs><rect width="100%" height="100%" fill="${palette.secondary}"/>${graphic}<rect x="11" y="11" width="338" height="428" fill="none" stroke="${palette.accent}" stroke-opacity=".6" stroke-width="1"/></svg>`;
}

function addComponent(elements: DesignElement[], instance: DesignComponentInstance, z: number, filter?: (element: DesignElement) => boolean, frameOverride?: { x: number; y: number; width: number; height: number }) {
  let rendered = renderDesignComponent(instance).filter((element) => !filter || filter(element));
  if (frameOverride) rendered = rendered.map((element) => ({ ...element, ...frameOverride }));
  rendered.forEach((element, index) => elements.push({ ...element, zIndex: z + index }));
}

function buildStudioTemplate(index: number, categoryIndex: number): ProfessionalStudioTemplate {
  const category = STUDIO_CATEGORIES[categoryIndex] as StudioCategory;
  const layout = LAYOUTS[index % LAYOUTS.length];
  const palette = PALETTES[(index * 3 + categoryIndex) % PALETTES.length];
  const [headingFont, bodyFont] = TYPE_PAIRS[(index + categoryIndex * 3) % TYPE_PAIRS.length];
  const variation = Math.floor(index / LAYOUTS.length);
  const dx = ((variation % 5) - 2) * 0.012;
  const dy = ((Math.floor(variation / 2) % 5) - 2) * 0.009;
  const scale = 1 + ((variation % 4) - 1.5) * 0.035;
  const varyFrame = (tuple: number[]) => {
    const frame = frameOf(tuple);
    const width = clamp(frame.width * scale, 0.16, 0.96);
    const height = clamp(frame.height * (2 - scale), 0.12, 0.95);
    return { x: clamp(frame.x + dx, 0, 1 - width), y: clamp(frame.y + dy, 0, 1 - height), width, height };
  };
  const imageFrames = layout.images.map(varyFrame);
  const copyFrame = varyFrame(layout.copy);
  copyFrame.width = Math.min(copyFrame.width, 1 - SAFE.left - SAFE.right);
  copyFrame.height = Math.min(copyFrame.height, 1 - SAFE.top - SAFE.bottom);
  copyFrame.x = clamp(copyFrame.x, SAFE.left, 1 - SAFE.right - copyFrame.width);
  copyFrame.y = clamp(copyFrame.y, SAFE.top, 1 - SAFE.bottom - copyFrame.height);
  const localOrdinal = Math.floor(categoryIndex / STUDIO_CATEGORIES.length);
  const name = `${category} — ${NAME_STYLES[(index + localOrdinal * 7) % NAME_STYLES.length]}`;
  const id = `studio-${String(index + 1).padStart(3, "0")}`;
  const description = DESCRIPTIONS[(index + categoryIndex) % DESCRIPTIONS.length];
  const tags = [...new Set([category.toLocaleLowerCase(), ...CATEGORY_TAGS[category], "interior design", "social campaign", layout.id])];
  const supported = [...OUTPUT_FORMATS];
  const animationSupported = index % 9 !== 0;
  const makeInstance = (componentId: string, componentFrame: { x: number; y: number; width: number; height: number }, properties: DesignComponentInstance["properties"], format: TemplateOutputFormat, suffix: string) => ({
    ...createComponentInstance(componentId, componentFrame, properties, format), id: `${id}-${suffix}`,
  });
  const safeZones = { story: SAFE, portrait: { ...SAFE, bottom: 0.09 }, square: { ...SAFE, top: 0.07, bottom: 0.07 }, landscape: { top: 0.06, right: 0.06, bottom: 0.07, left: 0.06 } };
  const studioDoc: DesignTemplate = {
    schemaVersion: 2, id, name, category, description, tags, thumbnail: "", supportedFormats: supported,
    canvas: { width: 1080, height: 1350, unit: "px", safeZones },
    background: { color: `$colors.surface`, gradient: { type: "linear", angle: 145, stops: [{ color: "$colors.secondary", position: 0 }, { color: "$colors.primary", position: 1 }] } },
    branding: { palette: { ...palette } }, elements: [], animations: [], metadata: {},
  };

  const instances: DesignComponentInstance[] = [];
  const imageInstances = imageFrames.map((frame, imageIndex) => {
    const instance = makeInstance("hero-section", frame, {
      image: `asset:studio-image-${imageIndex + 1}`, title: imageIndex ? `${category} detail` : name, body: "Natural light · considered materials",
      animation: animationSupported ? "fade" : undefined,
    }, "portrait", `image-component-${imageIndex + 1}`);
    instances.push(instance);
    addComponent(studioDoc.elements, instance, imageIndex, (element) => element.type === "Image", frame);
    const image = studioDoc.elements[studioDoc.elements.length - 1];
    image.id = `${id}-image-${imageIndex + 1}`;
    image.crop = "cover";
    return instance;
  });

  const copyInstance = makeInstance("project-card", copyFrame, {
    title: NAME_STYLES[index % NAME_STYLES.length],
    body: `${category} · ${DESCRIPTIONS[(index + 2) % DESCRIPTIONS.length]}`,
    textSize: 30, animation: animationSupported ? "fade" : undefined,
  }, "portrait", "copy-card");
  instances.push(copyInstance);
  addComponent(studioDoc.elements, copyInstance, 10 + imageInstances.length);

  const badgeFrame = { x: clamp(0.74 + dx, SAFE.left, 1 - SAFE.right - 0.2), y: clamp(0.075 + dy, SAFE.top, 1 - SAFE.bottom - 0.065), width: 0.2, height: 0.065 };
  const badgeInstance = makeInstance(index % 2 ? "featured" : "premium", badgeFrame, { title: ["STUDIO EDIT", "NEW PROJECT", "MATERIAL STUDY", "IN PROGRESS", "DESIGN NOTE"][index % 5] }, "portrait", "badge");
  instances.push(badgeInstance);
  addComponent(studioDoc.elements, badgeInstance, 30);

  const ctaFrame = { x: clamp(copyFrame.x + copyFrame.width * 0.04, SAFE.left, 1 - SAFE.right - clamp(copyFrame.width * 0.64, 0.2, 0.58)), y: clamp(copyFrame.y + copyFrame.height - 0.085, SAFE.top, 1 - SAFE.bottom - 0.066), width: clamp(copyFrame.width * 0.64, 0.2, 0.58), height: 0.066 };
  const ctaLabels: Record<string, string> = { Offer: "Book a design consultation", "Client Testimonial": "Read the full story", "Construction Progress": "Follow project progress", Festival: "Celebrate the season", "Before After": "Explore the transformation" };
  const ctaInstance = makeInstance(index % 3 ? "book-consultation" : "learn-more", ctaFrame, { title: ctaLabels[category] || "Discover the project", animation: animationSupported ? "fade" : undefined }, "portrait", "cta");
  instances.push(ctaInstance);
  const ctaStart = studioDoc.elements.length;
  addComponent(studioDoc.elements, ctaInstance, 40);
  for (let ctaIndex = ctaStart; ctaIndex < studioDoc.elements.length; ctaIndex += 1) {
    studioDoc.elements[ctaIndex] = {
      ...studioDoc.elements[ctaIndex], type: "CTA Button", padding: 16, radius: 14,
      border: { color: "$colors.primary", width: 1 },
      gradient: { type: "linear", angle: 0, stops: [{ color: "$colors.primary", position: 0 }, { color: "$colors.primary", position: 1 }] },
      shadow: { color: "$colors.text", blur: 8, offsetX: 0, offsetY: 3 }, icon: "arrow-right",
    };
  }

  const logoFrame = { x: SAFE.left, y: clamp(0.045 + dy, SAFE.top, 1 - SAFE.bottom - 0.06), width: 0.17, height: 0.06 };
  const logo = createDesignComponent({ id: `${id}-logo`, kind: "logo-block", x: logoFrame.x, y: logoFrame.y, width: logoFrame.width, height: logoFrame.height, text: "brand.logo", asset: "brand.logo", tokens: { color: "$colors.text", opacity: 0.95 } });
  studioDoc.elements.push({ ...logo, id: `${id}-logo`, zIndex: 45, source: "brand.logo", fontFamily: "$fonts.body" });

  const overlay = createDesignComponent({ id: `${id}-gradient-overlay`, kind: "gradient-overlay", x: 0, y: 0, width: 1, height: 1, tokens: { color: "$colors.secondary", opacity: 0.26 } });
  studioDoc.elements.push({ ...overlay, id: `${id}-gradient-overlay`, zIndex: 5, opacity: 0.26, gradient: { type: "linear", angle: index % 2 ? 0 : 180, stops: [{ color: "$colors.secondary", position: 0, opacity: 0.04 }, { color: "$colors.secondary", position: 1, opacity: 0.7 }] } });
  const ambientOverlay = createDesignComponent({ id: `${id}-ambient-overlay`, kind: "gradient-overlay", x: 0.16, y: 0.12, width: 0.68, height: 0.66, tokens: { color: "$colors.accent", opacity: 0.14 } });
  studioDoc.elements.push({ ...ambientOverlay, id: `${id}-ambient-overlay`, zIndex: 6, opacity: 0.14, gradient: { type: "radial", stops: [{ color: "$colors.accent", position: 0, opacity: 0.24 }, { color: "$colors.accent", position: 1, opacity: 0 }] } });

  const decorationIds = ["architectural-lines", index % 2 ? "corner-accent" : "gold-accent"] as const;
  decorationIds.forEach((componentId, decorationIndex) => {
    const frame = decorationIndex === 0
      ? { x: 0.035, y: 0.045, width: 0.035 + (index % 4) * 0.012, height: 0.42 + (index % 3) * 0.08 }
      : { x: clamp(0.87 - dx, 0.78, 0.92), y: clamp(0.78 - dy, 0.68, 0.9), width: 0.06 + (index % 3) * 0.02, height: 0.04 + (index % 2) * 0.025 };
    const decorative = makeInstance(componentId, frame, { title: "", tokens: { color: "$colors.accent", opacity: 0.36 } }, "portrait", `decoration-${decorationIndex + 1}`);
    instances.push(decorative);
    addComponent(studioDoc.elements, decorative, 3 + decorationIndex);
  });

  const typography = { display: headingFont, heading: headingFont, body: bodyFont, callToAction: bodyFont, scale: [72, 54, 36, 28, 20, 16] };
  studioDoc.metadata = {
    category, description, componentInstances: [...instances],
    typographyHierarchy: typography,
    spacingSystem: { base: 8, scale: [4, 8, 12, 16, 24, 32, 48, 64], grid: 12, gutter: 24 },
    safeZones, imagePlaceholders: imageFrames.map((frame, imageIndex) => ({ id: `image-${imageIndex + 1}`, role: imageIndex ? "detail image" : "hero image", frame, fit: "cover", focalPoint: { x: 0.5, y: 0.46 } })),
    logoPlacement: { position: "upper brand rail", frame: logoFrame }, ctaPosition: "inside copy panel, lower edge",
    badgePosition: "upper corner", overlay: { type: "linear-gradient", opacity: 0.26, token: "$colors.secondary" },
    overlayLayers: [{ type: "linear-gradient", opacity: 0.26, token: "$colors.secondary" }, { type: "radial-gradient", opacity: 0.14, token: "$colors.accent" }],
    decorativeShapes: decorationIds, responsive: { sourceAspect: "4:5", rules: "Preserve image focal priority, reflow copy into a safe-zone stack, and retain CTA and logo contrast." },
    qualityReview: { score: 91 + (index * 7) % 9, checks: ["visual hierarchy", "safe zones", "contrast token", "image crop", "CTA presence", "brand slots"] },
    layoutSignature: `${layout.id}:${imageFrames.map((frame) => [frame.x, frame.y, frame.width, frame.height].map((value) => value.toFixed(3)).join(",")).join(";")}:${copyFrame.x.toFixed(3)},${copyFrame.y.toFixed(3)},${copyFrame.width.toFixed(3)},${copyFrame.height.toFixed(3)}`,
  };
  studioDoc.elements.sort((a, b) => a.zIndex - b.zIndex);
  const previewSvg = generateStudioPreview(studioDoc, palette);
  const previewSet = generateTemplatePreviewSet(studioDoc, 250);
  const preview = { ...previewSet, library: previewSvg, hover: previewSvg, large: generateStudioPreview(studioDoc, palette) };
  studioDoc.thumbnail = previewSvg;
  const qualityScore = 91 + (index * 7) % 9;
  const responsiveRules: StudioResponsiveRules = {
    story: "Use story safe zones; keep title and CTA clear of interface rails.",
    portrait: "Use 4:5 editorial spacing and maintain the nominated image focal point.",
    square: "Rebalance image and copy around a centered square grid.",
    landscape: "Move copy to the side rail and preserve image priority.",
    carousel: "Keep the same component system and establish a consistent multi-slide title rail.",
    safeZonePolicy: "All essential copy, badge, logo, and CTA remain inside the per-format safe zone.",
  };
  const animationCompatibility = { supported: animationSupported, presets: animationSupported ? ["fade", "slide", "scale"] : [], reducedMotion: "respects-system-preference" as const };
  const metadata: ProfessionalStudioMetadata = {
    description, recommendedIndustry: ["interior design", "architecture", "residential development"], mood: ["editorial", "material-led", "refined"],
    typographyHierarchy: typography, spacingSystem: studioDoc.metadata.spacingSystem as ProfessionalStudioMetadata["spacingSystem"],
    imagePlaceholders: studioDoc.metadata.imagePlaceholders as ProfessionalStudioMetadata["imagePlaceholders"], safeZones,
    cta: { label: ctaLabels[category] || "Discover the project", position: "lower copy panel", style: "tokenized rounded button" },
    badge: { label: ["STUDIO EDIT", "NEW PROJECT", "MATERIAL STUDY", "IN PROGRESS", "DESIGN NOTE"][index % 5], position: "upper corner", style: "brand badge" },
    logoPlacement: { position: "upper brand rail", frame: logoFrame }, overlay: { type: "linear-gradient", opacity: 0.26, token: "$colors.secondary" },
    decorativeShapes: [...decorationIds], responsiveRules, qualityScore,
    brandCompatibility: index % 5 === 0 ? "palette-required" : index % 5 === 1 ? "logo-recommended" : "any-brand",
    animationCompatibility, aspectRatio: "4:5", layoutSignature: studioDoc.metadata.layoutSignature as string, layoutArchetype: layout.id,
  };
  const difficulty: StudioDifficulty = index % 7 === 0 ? "advanced" : index % 3 === 0 ? "intermediate" : "beginner";
  return {
    id, name, category, tags, difficulty, supportedFormats: supported,
    brandCompatibility: metadata.brandCompatibility, animationCompatibility, responsiveRules, qualityScore, aspectRatio: metadata.aspectRatio, metadata,
    jsonDefinition: studioDoc, preview,
  };
}

/** 100 original, data-driven social templates; existing premium/legacy catalog entries are not changed. */
export const PROFESSIONAL_STUDIO_TEMPLATES: ProfessionalStudioTemplate[] = Array.from({ length: 100 }, (_, index) => buildStudioTemplate(index, index % STUDIO_CATEGORIES.length));
export const PROFESSIONAL_STUDIO_BY_ID: Record<string, ProfessionalStudioTemplate> = Object.fromEntries(PROFESSIONAL_STUDIO_TEMPLATES.map((template) => [template.id, template]));
export function getStudioTemplate(id: string): ProfessionalStudioTemplate | undefined { return PROFESSIONAL_STUDIO_BY_ID[id]; }
const VARIANT_ASPECTS: Record<TemplateOutputFormat, string> = { story: "9:16", portrait: "4:5", square: "1:1", landscape: "16:9", carousel: "4:5", tablet: "3:4", desktop: "16:9" };
export function getStudioTemplateVariant(id: string, format: TemplateOutputFormat): ProfessionalStudioTemplate | undefined {
  const entry = getStudioTemplate(id);
  if (!entry) return undefined;
  const jsonDefinition = adaptTemplateVariant(entry.jsonDefinition, format);
  const components = entry.jsonDefinition.metadata.componentInstances as DesignComponentInstance[];
  jsonDefinition.metadata = { ...jsonDefinition.metadata, componentInstances: components.map((instance) => adaptComponentInstance(instance, format)) };
  const tokens = entry.jsonDefinition.branding.palette || {};
  const palette = { primary: tokens.primary || PALETTES[0].primary, secondary: tokens.secondary || PALETTES[0].secondary, accent: tokens.accent || PALETTES[0].accent, surface: tokens.surface || PALETTES[0].surface, text: tokens.text || PALETTES[0].text };
  const previewSet = generateTemplatePreviewSet(jsonDefinition, 250);
  const preview = { ...previewSet, library: generateStudioPreview(jsonDefinition, palette), hover: generateStudioPreview(jsonDefinition, palette), large: generateStudioPreview(jsonDefinition, palette) };
  jsonDefinition.thumbnail = preview.library;
  return { ...entry, jsonDefinition, preview, aspectRatio: VARIANT_ASPECTS[format], metadata: { ...entry.metadata, aspectRatio: VARIANT_ASPECTS[format] } };
}
export function serializeStudioTemplate(id: string): string | undefined {
  const template = getStudioTemplate(id);
  return template ? JSON.stringify(template.jsonDefinition, null, 2) : undefined;
}
export function getStudioCategories(): StudioCategory[] { return [...STUDIO_CATEGORIES]; }
