import { fromLegacyTemplateConfig } from "./legacyTemplateAdapter";
import { PREMIUM_TEMPLATES } from "./premiumTemplates";
import { generateTemplateThumbnail } from "./thumbnailGenerator";
import type { DesignFormat, DesignTemplate, TemplateOutputFormat } from "../types/designTemplate";

export const TEMPLATE_CATEGORIES = [
  "Instagram Story", "Instagram Feed", "Carousel", "Before / After", "Luxury Interior", "Modern Interior",
  "Scandinavian", "Minimal", "Commercial", "Kitchen", "Living Room", "Bedroom", "Bathroom", "Villa",
  "Apartment", "Office", "Project Update", "Construction Progress", "Testimonial", "Offer", "Festival",
  "Quote", "Tips", "FAQ", "Reel Cover",
] as const;
export type TemplateCategory = typeof TEMPLATE_CATEGORIES[number];
export type TemplateDifficulty = "beginner" | "intermediate" | "advanced";

export interface TemplateMetadata {
  description: string;
  recommendedIndustry: string[];
  mood: string[];
  suitablePlatforms: string[];
  recommendedColors: string[];
  recommendedFontPairings: Array<{ heading: string; body: string }>;
  animationPresets: string[];
  suitableImageTypes: string[];
  recommendedAiPrompt: string;
  ctaPosition: string;
  logoPosition: string;
  luxury: number;
  minimal: number;
  warm: number;
  elegant: number;
  premium: number;
  construction: number;
  modern: number;
}

export interface TemplateCatalogEntry {
  id: string;
  name: string;
  category: TemplateCategory;
  tags: string[];
  difficulty: TemplateDifficulty;
  supportedFormats: TemplateOutputFormat[];
  brandCompatibility: "any" | "palette-required" | "logo-recommended";
  animationSupport: boolean;
  thumbnail: string;
  previewImage: string;
  safeZones: NonNullable<DesignTemplate["canvas"]["safeZones"]>;
  recommendedAspectRatio: string;
  metadata: TemplateMetadata;
  document: DesignTemplate;
  usageCount: number;
  createdAt: string;
}

const FORMATS: TemplateOutputFormat[] = ["story", "portrait", "square", "landscape", "carousel"];
const CATEGORY_BY_ID: Record<string, TemplateCategory> = {
  "luxury-showcase": "Luxury Interior", "construction-update": "Construction Progress", "story-update": "Instagram Story",
  "reel-cover": "Reel Cover", "before-after": "Before / After", "architecture-notes": "Tips", "site-visit": "Project Update",
  "modern-living": "Living Room", "minimal-interior": "Minimal", "luxury-bedroom": "Bedroom", "client-review": "Testimonial",
  "designer-choice": "Instagram Feed", "limited-offer": "Offer", "project-timeline": "Project Update", "kitchen-showcase": "Kitchen",
};
const categoryFor = (id: string): TemplateCategory => CATEGORY_BY_ID[id] ||
  (id.includes("bath") ? "Bathroom" : id.includes("kitchen") ? "Kitchen" : id.includes("villa") ? "Villa" :
    id.includes("office") ? "Office" : id.includes("apartment") ? "Apartment" : id.includes("quote") ? "Quote" :
      id.includes("faq") ? "FAQ" : id.includes("festival") ? "Festival" : id.includes("commercial") ? "Commercial" : "Modern Interior");

function metadataFor(document: DesignTemplate, category: TemplateCategory): TemplateMetadata {
  const colors = Object.values(document.branding.palette || {}).filter((v) => typeof v === "string").slice(0, 5);
  const text = `${document.name} ${category} ${document.description}`.toLowerCase();
  const score = (terms: string[]) => terms.some((term) => text.includes(term)) ? 0.92 : 0.55;
  const heading = document.elements.find((element) => element.fontFamily)?.fontFamily || "Playfair Display";
  const body = document.elements.find((element) => element.fontFamily && element.fontFamily !== heading)?.fontFamily || "Inter";
  const cta = document.elements.find((element) => element.type === "CTA Button");
  const logo = document.elements.find((element) => element.type === "Logo");
  return {
    description: document.description || `A considered ${category.toLowerCase()} layout for interior design studios.`,
    recommendedIndustry: ["Interior design", "Architecture", "Property development"],
    mood: ["editorial", "refined", "welcoming"],
    suitablePlatforms: ["Instagram Story", "Instagram Feed", "Facebook", "LinkedIn", "Pinterest"],
    recommendedColors: colors.length ? colors : ["$primary", "$surface", "$text"],
    recommendedFontPairings: [{ heading, body }],
    animationPresets: document.animations.map((animation) => animation.property).slice(0, 4),
    suitableImageTypes: ["interior photography", "architecture", "project detail", "material close-up"],
    recommendedAiPrompt: `Create an editorial interior design image for ${document.name}; natural architectural light, realistic materials, clean composition, no text or logos.`,
    ctaPosition: cta ? `${Math.round((cta.x + cta.width / 2) * 100)}% × ${Math.round((cta.y + cta.height / 2) * 100)}%` : "lower third",
    logoPosition: logo ? `${Math.round((logo.x + logo.width / 2) * 100)}% × ${Math.round((logo.y + logo.height / 2) * 100)}%` : "top corner",
    luxury: score(["luxury", "villa", "premium"]), minimal: score(["minimal", "scandinavian"]), warm: score(["warm", "living", "wood"]),
    elegant: score(["elegant", "editorial", "luxury"]), premium: score(["luxury", "showcase", "signature"]),
    construction: score(["construction", "progress", "site"]), modern: score(["modern", "contemporary", "architecture"]),
  };
}

export const PROFESSIONAL_TEMPLATE_CATALOG: TemplateCatalogEntry[] = PREMIUM_TEMPLATES.map((legacy) => {
  const document = fromLegacyTemplateConfig(legacy);
  const category = categoryFor(document.id);
  return {
    id: document.id, name: document.name, category, tags: [...new Set([category.toLowerCase(), ...document.tags, "interior design", "premium"])],
    difficulty: document.elements.length > 12 ? "advanced" : document.elements.length > 7 ? "intermediate" : "beginner",
    supportedFormats: [...FORMATS], brandCompatibility: document.branding.logo ? "logo-recommended" : "any",
    animationSupport: document.animations.length > 0 || document.elements.some((element) => Boolean(element.animations?.length)),
    thumbnail: document.thumbnail || generateTemplateThumbnail(document, { width: 240 }),
    previewImage: document.thumbnail || generateTemplateThumbnail(document, { width: 960 }),
    safeZones: document.canvas.safeZones || {}, recommendedAspectRatio: "4:5",
    metadata: metadataFor(document, category), document, usageCount: 0, createdAt: "2026-01-01T00:00:00.000Z",
  };
});

export interface VariantSize { width: number; height: number; safeZone: { top: number; right: number; bottom: number; left: number } }
const VARIANT_SIZES: Record<TemplateOutputFormat, [number, number]> = {
  story: [1080, 1920], portrait: [1080, 1350], square: [1080, 1080], landscape: [1920, 1080],
  carousel: [1080, 1350], tablet: [1536, 2048], desktop: [1920, 1080],
};

/** Adapt normalized layout geometry to a target format without changing the source template. */
export function adaptTemplateVariant<T extends DesignTemplate>(template: T, format: TemplateOutputFormat): T {
  const [width, height] = VARIANT_SIZES[format];
  const sourceRatio = template.canvas.width / template.canvas.height;
  const targetRatio = width / height;
  const imagePriority = template.elements.filter((element) => element.type === "Image" || element.type === "Logo");
  const textPriority = template.elements.filter((element) => ["Heading", "Text", "Subtitle", "Body Text", "CTA Button"].includes(element.type));
  const anchor = (element: DesignTemplate["elements"][number]) => imagePriority.includes(element) ? 0.52 : textPriority.includes(element) ? 0.35 : 0.5;
  const elements = template.elements.map((element) => {
    const weight = anchor(element);
    const sx = Math.min(1.35, Math.max(0.74, targetRatio / sourceRatio));
    const sy = Math.min(1.35, Math.max(0.74, sourceRatio / targetRatio));
    const w = Math.min(1, element.width * (1 + (sx - 1) * weight));
    const h = Math.min(1, element.height * (1 + (sy - 1) * weight));
    return { ...element, width: w, height: h, x: Math.max(0, Math.min(1 - w, element.x + element.width / 2 - w / 2)), y: Math.max(0, Math.min(1 - h, element.y + element.height / 2 - h / 2)) };
  });
  const { supportedFormats: _supportedFormats, ...rest } = template;
  return { ...rest, supportedFormats: [...new Set([...template.supportedFormats, format])], canvas: { ...template.canvas, width, height }, elements } as T;
}
