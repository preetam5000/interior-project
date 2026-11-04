import { getSupportedElementTypes } from "../components/designElementRegistry";
import { parseTemplateConfig } from "../validate";
import { fromLegacyTemplateConfig } from "./legacyTemplateAdapter";
import type { DesignElement, DesignTemplate } from "../types/designTemplate";
import type { TemplateConfig } from "../types";

const COLOR_PATTERN = /^(#[\da-f]{3,8}|rgba?\(\s*[\d.%\s,]+\)|hsla?\(\s*[\d.%\s,deg]+\)|transparent|currentColor|\$[\w-]+)$/i;
const FONT_FAMILY_PATTERN = /^[\w\s,'"-]+$/;
const REQUIRED_TEXT_TYPES = new Set(["Text", "Heading", "Subtitle", "Badge", "CTA Button", "Social Handle", "Sticker"]);
const SUPPORTED_TYPES = new Set<string>(getSupportedElementTypes());

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isColor(value: unknown): value is string {
  return typeof value === "string" && COLOR_PATTERN.test(value.trim());
}

function addColorError(
  errors: string[],
  value: unknown,
  path: string,
): void {
  if (value !== undefined && !isColor(value)) errors.push(`${path} must be a supported CSS color or palette token.`);
}

export function validateDesignTemplate(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["Template must be a JSON object."];

  for (const key of ["id", "name", "category", "description"] as const) {
    if (typeof value[key] !== "string" || !value[key].trim()) errors.push(`${key} is required.`);
  }
  if (typeof value.thumbnail !== "string") errors.push("thumbnail must be a string.");
  if (value.schemaVersion !== 2) errors.push("schemaVersion must be 2.");
  if (!Array.isArray(value.tags) || !value.tags.every((tag) => typeof tag === "string")) {
    errors.push("tags must be an array of strings.");
  }
  if (!Array.isArray(value.supportedFormats)
    || !value.supportedFormats.length
    || !value.supportedFormats.every((format) => ["portrait", "story", "square"].includes(String(format)))) {
    errors.push("supportedFormats must contain supported output formats.");
  }

  if (!isRecord(value.canvas)) {
    errors.push("canvas is required.");
  } else {
    for (const key of ["width", "height"] as const) {
      if (typeof value.canvas[key] !== "number" || !Number.isFinite(value.canvas[key]) || value.canvas[key] <= 0) {
        errors.push(`canvas.${key} must be a positive number.`);
      }
    }
    if (value.canvas.unit !== "px") errors.push('canvas.unit must be "px".');
  }

  if (!isRecord(value.background)) errors.push("background is required.");
  if (!isRecord(value.branding)) errors.push("branding is required.");
  if (!Array.isArray(value.elements)) {
    errors.push("elements must be an array.");
  } else {
    const seenIds = new Set<string>();
    value.elements.forEach((element: unknown, index: number) => {
      const path = `elements[${index}]`;
      if (!isRecord(element)) {
        errors.push(`${path} must be an object.`);
        return;
      }
      if (typeof element.id !== "string" || !element.id.trim()) {
        errors.push(`${path}.id is required.`);
      } else if (!/^[\w.:-]+$/.test(element.id)) {
        errors.push(`${path}.id may contain only letters, numbers, underscores, dots, colons, and hyphens.`);
      } else if (seenIds.has(element.id)) {
        errors.push(`${path}.id duplicates "${element.id}".`);
      } else {
        seenIds.add(element.id);
      }
      if (typeof element.type !== "string" || !SUPPORTED_TYPES.has(element.type)) {
        errors.push(`${path}.type is unsupported.`);
      }
      for (const key of ["x", "y", "width", "height"] as const) {
        const number = element[key];
        if (typeof number !== "number" || !Number.isFinite(number)
          || number < 0 || (key === "x" || key === "y" ? number > 1 : number <= 0)) {
          errors.push(`${path}.${key} must be ${key === "x" || key === "y" ? "between 0 and 1" : "greater than 0"}.`);
        }
      }
      if (typeof element.x === "number" && typeof element.width === "number"
        && element.x + element.width > 1) errors.push(`${path} extends beyond the right edge of the canvas.`);
      if (typeof element.y === "number" && typeof element.height === "number"
        && element.y + element.height > 1) errors.push(`${path} extends beyond the bottom edge of the canvas.`);
      for (const key of ["rotation", "zIndex"] as const) {
        if (typeof element[key] !== "number" || !Number.isFinite(element[key])) {
          errors.push(`${path}.${key} must be a finite number.`);
        }
      }
      if (typeof element.zIndex === "number" && !Number.isInteger(element.zIndex)) {
        errors.push(`${path}.zIndex must be an integer.`);
      }
      if (typeof element.opacity !== "number" || !Number.isFinite(element.opacity) || element.opacity < 0 || element.opacity > 1) {
        errors.push(`${path}.opacity must be between 0 and 1.`);
      }
      for (const key of ["visible", "locked"] as const) {
        if (typeof element[key] !== "boolean") errors.push(`${path}.${key} must be a boolean.`);
      }
      if (REQUIRED_TEXT_TYPES.has(String(element.type))) {
        if (typeof element.fontFamily !== "string" || !element.fontFamily.trim()
          || !FONT_FAMILY_PATTERN.test(element.fontFamily)) {
          errors.push(`${path}.fontFamily must be a valid font family.`);
        }
        if (typeof element.fontSize !== "number" || !Number.isFinite(element.fontSize) || element.fontSize <= 0) {
          errors.push(`${path}.fontSize must be a positive number.`);
        }
        if (typeof element.fontWeight !== "string" && typeof element.fontWeight !== "number") {
          errors.push(`${path}.fontWeight is required.`);
        }
        if (typeof element.lineHeight !== "number" || !Number.isFinite(element.lineHeight) || element.lineHeight <= 0) {
          errors.push(`${path}.lineHeight must be a positive number.`);
        }
        if (typeof element.letterSpacing !== "number" || !Number.isFinite(element.letterSpacing)) {
          errors.push(`${path}.letterSpacing must be a finite number.`);
        }
        if (!["left", "center", "right"].includes(String(element.alignment))) {
          errors.push(`${path}.alignment must be left, center, or right.`);
        }
      } else if (element.fontFamily !== undefined
        && (typeof element.fontFamily !== "string" || !element.fontFamily.trim()
          || !FONT_FAMILY_PATTERN.test(element.fontFamily))) {
        errors.push(`${path}.fontFamily must be a valid font family.`);
      }
      addColorError(errors, element.color, `${path}.color`);
      if (isRecord(element.stroke)) addColorError(errors, element.stroke.color, `${path}.stroke.color`);
      if (isRecord(element.shadow)) addColorError(errors, element.shadow.color, `${path}.shadow.color`);
      if (isRecord(element.border)) addColorError(errors, element.border.color, `${path}.border.color`);
      if (isRecord(element.gradient)) {
        if (!["linear", "radial"].includes(String(element.gradient.type))) {
          errors.push(`${path}.gradient.type must be linear or radial.`);
        }
        if (!Array.isArray(element.gradient.stops) || !element.gradient.stops.length) {
          errors.push(`${path}.gradient.stops must not be empty.`);
        } else {
          element.gradient.stops.forEach((stop: unknown, stopIndex: number) => {
            if (!isRecord(stop) || !isColor(stop.color)) {
              errors.push(`${path}.gradient.stops[${stopIndex}].color must be valid.`);
            }
          });
        }
      }
    });
  }

  addColorError(errors, isRecord(value.background) ? value.background.color : undefined, "background.color");
  if (isRecord(value.background) && isRecord(value.background.gradient)) {
    if (!Array.isArray(value.background.gradient.stops) || !value.background.gradient.stops.length) {
      errors.push("background.gradient.stops must not be empty.");
    } else {
      value.background.gradient.stops.forEach((stop: unknown, index: number) => {
        if (!isRecord(stop) || !isColor(stop.color)) errors.push(`background.gradient.stops[${index}].color must be valid.`);
      });
    }
  }
  if (isRecord(value.branding) && isRecord(value.branding.palette)) {
    Object.entries(value.branding.palette).forEach(([name, color]) => addColorError(errors, color, `branding.palette.${name}`));
  }

  if (!Array.isArray(value.animations)) {
    errors.push("animations must be an array.");
  } else {
    const elementIds = new Set(
      Array.isArray(value.elements)
        ? value.elements.filter(isRecord).map((element) => element.id).filter((id): id is string => typeof id === "string")
        : [],
    );
    const animationIds = new Set<string>();
    value.animations.forEach((animation: unknown, index: number) => {
      const path = `animations[${index}]`;
      if (!isRecord(animation)) {
        errors.push(`${path} must be an object.`);
        return;
      }
      if (typeof animation.id !== "string" || !animation.id.trim()) errors.push(`${path}.id is required.`);
      else if (animationIds.has(animation.id)) errors.push(`${path}.id must be unique.`);
      else animationIds.add(animation.id);
      if (typeof animation.target !== "string" || !elementIds.has(animation.target)) {
        errors.push(`${path}.target must reference an existing element id.`);
      }
      if (!["opacity", "translateX", "translateY", "scale", "rotate"].includes(String(animation.property))) {
        errors.push(`${path}.property is unsupported.`);
      }
      for (const key of ["from", "to"] as const) {
        if (typeof animation[key] !== "number" || !Number.isFinite(animation[key])) errors.push(`${path}.${key} must be a finite number.`);
      }
      for (const key of ["startMs", "durationMs"] as const) {
        if (typeof animation[key] !== "number" || !Number.isInteger(animation[key])
          || animation[key] < (key === "durationMs" ? 1 : 0)) {
          errors.push(`${path}.${key} must be a valid non-negative integer.`);
        }
      }
      if (!["linear", "ease-in", "ease-out", "ease-in-out"].includes(String(animation.easing))) {
        errors.push(`${path}.easing is unsupported.`);
      }
    });
  }
  if (!isRecord(value.metadata)) errors.push("metadata must be an object.");
  return errors;
}

export function parseDesignTemplate(input: DesignTemplate | string): DesignTemplate {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      throw new Error(`Template is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const errors = validateDesignTemplate(value);
  if (errors.length) throw new Error(`Invalid design template: ${errors.join(" ")}`);
  return value as DesignTemplate;
}

export function parseTemplateDocument(
  input: DesignTemplate | TemplateConfig | string,
): DesignTemplate {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      throw new Error(`Template is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (isRecord(value) && value.schemaVersion === 2) {
    return parseDesignTemplate(value as unknown as DesignTemplate);
  }
  return fromLegacyTemplateConfig(parseTemplateConfig(value as TemplateConfig));
}

export async function loadDesignTemplate(source: string | URL): Promise<DesignTemplate> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Could not load template config (${response.status} ${response.statusText}).`);
  }
  return parseTemplateDocument(await response.text());
}

export function duplicateElementIds(elements: readonly DesignElement[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  elements.forEach(({ id }) => {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  });
  return [...duplicates];
}
