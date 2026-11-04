import type { TemplateConfig } from "./types";
import { isLayoutPresetId } from "./layouts/layouts";
import { TYPOGRAPHY_PRESETS } from "./typography/typographyPresets";
import { OVERLAY_PRESETS } from "./overlays/overlayPresets";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Template config "${path}" must be an object.`);
  return value;
}

function requireString(value: unknown, path: string): void {
  if (typeof value !== "string") throw new Error(`Template config "${path}" must be a string.`);
}

function requireNumber(value: unknown, path: string, min: number, max: number): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Template config "${path}" must be a number from ${min} to ${max}.`);
  }
}

export function parseTemplateConfig(input: TemplateConfig | string): TemplateConfig {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      throw new Error(`Template config is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const root = requireRecord(value, "root");
  if (root.schema_version !== 1) {
    throw new Error(`Unsupported template schema_version: ${String(root.schema_version)}.`);
  }
  requireString(root.id, "id");
  requireString(root.name, "name");

  const layout = requireRecord(root.layout, "layout");
  if (!Array.isArray(layout.layer_order) || !layout.layer_order.every((item) => typeof item === "string")) {
    throw new Error('Template config "layout.layer_order" must be an array of layer IDs.');
  }
  if (layout.preset !== undefined && !isLayoutPresetId(layout.preset)) {
    throw new Error(`Template config "layout.preset" is not a supported layout.`);
  }
  if (layout.regions !== undefined) {
    const regions = requireRecord(layout.regions, "layout.regions");
    if (Object.keys(regions).length === 0 && !layout.preset) {
      throw new Error('Template config "layout.regions" cannot be empty without a preset.');
    }
    for (const [regionId, rawRegion] of Object.entries(regions)) {
      const region = requireRecord(rawRegion, `layout.regions.${regionId}`);
      for (const key of ["x", "y", "width", "height"]) {
        requireNumber(region[key], `layout.regions.${regionId}.${key}`, 0, 1);
      }
      if ((region.width as number) === 0 || (region.height as number) === 0) {
        throw new Error(`Template region "${regionId}" must have a positive width and height.`);
      }
    }
  } else if (!layout.preset) {
    throw new Error('Template config "layout" needs a preset or named regions.');
  }
  if (layout.image_regions !== undefined) {
    const imageRegions = requireRecord(layout.image_regions, "layout.image_regions");
    for (const [regionId, rawRegion] of Object.entries(imageRegions)) {
      const region = requireRecord(rawRegion, `layout.image_regions.${regionId}`);
      for (const key of ["x", "y", "width", "height"]) {
        requireNumber(region[key], `layout.image_regions.${regionId}.${key}`, 0, 1);
      }
    }
  }

  const typography = requireRecord(root.typography, "typography");
  if (typography.preset !== undefined
    && (typeof typography.preset !== "string"
      || !Object.prototype.hasOwnProperty.call(TYPOGRAPHY_PRESETS, typography.preset))) {
    throw new Error(`Template config "typography.preset" is not a supported preset.`);
  }
  requireString(typography.family, "typography.family");
  requireString(typography.fallback_family, "typography.fallback_family");
  requireNumber(typography.size, "typography.size", Number.MIN_VALUE, Number.MAX_VALUE);
  requireString(typography.color, "typography.color");
  if (typography.shadow !== undefined) {
    const shadow = requireRecord(typography.shadow, "typography.shadow");
    if (typeof shadow.enabled !== "boolean") {
      throw new Error('Template config "typography.shadow.enabled" must be a boolean.');
    }
    requireString(shadow.color, "typography.shadow.color");
    requireNumber(shadow.blur, "typography.shadow.blur", 0, 100);
    requireNumber(shadow.offset_x, "typography.shadow.offset_x", -100, 100);
    requireNumber(shadow.offset_y, "typography.shadow.offset_y", -100, 100);
  }
  if (typography.responsive_scaling !== undefined) {
    const scaling = requireRecord(typography.responsive_scaling, "typography.responsive_scaling");
    if (typeof scaling.enabled !== "boolean") {
      throw new Error('Template config "typography.responsive_scaling.enabled" must be a boolean.');
    }
    requireNumber(scaling.reference_width, "typography.responsive_scaling.reference_width", Number.MIN_VALUE, Number.MAX_VALUE);
    requireNumber(scaling.min_scale, "typography.responsive_scaling.min_scale", Number.MIN_VALUE, 4);
    requireNumber(scaling.max_scale, "typography.responsive_scaling.max_scale", Number.MIN_VALUE, 4);
    if ((scaling.min_scale as number) > (scaling.max_scale as number)) {
      throw new Error('Template config "typography.responsive_scaling.min_scale" cannot exceed max_scale.');
    }
  }

  const colors = requireRecord(root.colors, "colors");
  for (const key of ["primary", "secondary", "accent", "text", "surface"]) {
    requireString(colors[key], `colors.${key}`);
  }

  for (const key of ["overlays", "badges", "decorations"]) {
    if (!Array.isArray(root[key])) throw new Error(`Template config "${key}" must be an array.`);
  }
  const overlays = root.overlays as unknown[];
  for (let index = 0; index < overlays.length; index += 1) {
    const overlay = requireRecord(overlays[index], `overlays.${index}`);
    requireString(overlay.id, `overlays.${index}.id`);
    requireString(overlay.region, `overlays.${index}.region`);
    requireNumber(overlay.opacity, `overlays.${index}.opacity`, 0, 1);
    requireString(overlay.type, `overlays.${index}.type`);
    const overlayType = String(overlay.type);
    if (![
      "scrim",
      "linear_gradient",
      "radial_gradient",
      "color_wash",
      ...Object.keys(OVERLAY_PRESETS),
    ].includes(overlayType)) {
      throw new Error(`Template config "overlays.${index}.type" is not supported.`);
    }
    if (overlay.angle !== undefined) requireNumber(overlay.angle, `overlays.${index}.angle`, 0, 360);
    if (overlay.blur_px !== undefined) requireNumber(overlay.blur_px, `overlays.${index}.blur_px`, 0, 100);
    if (overlay.spacing !== undefined) requireNumber(overlay.spacing, `overlays.${index}.spacing`, Number.MIN_VALUE, 512);
    if (overlay.line_width !== undefined) requireNumber(overlay.line_width, `overlays.${index}.line_width`, 0, 100);
    if (overlay.inset !== undefined) requireNumber(overlay.inset, `overlays.${index}.inset`, 0, Number.MAX_VALUE);
    if (overlay.radius !== undefined) requireNumber(overlay.radius, `overlays.${index}.radius`, 0, Number.MAX_VALUE);
    if (overlay.intensity !== undefined) requireNumber(overlay.intensity, `overlays.${index}.intensity`, 0, 1);
    if (overlay.font_size !== undefined) requireNumber(overlay.font_size, `overlays.${index}.font_size`, Number.MIN_VALUE, Number.MAX_VALUE);
    if (overlay.scale !== undefined) requireNumber(overlay.scale, `overlays.${index}.scale`, Number.MIN_VALUE, 256);
    if (overlay.seed !== undefined && (!Number.isInteger(overlay.seed) || (overlay.seed as number) < 0)) {
      throw new Error(`Template config "overlays.${index}.seed" must be a non-negative integer.`);
    }
    if (overlay.text !== undefined) requireString(overlay.text, `overlays.${index}.text`);
  }
  const badges = root.badges as unknown[];
  for (let index = 0; index < badges.length; index += 1) {
    const badge = requireRecord(badges[index], `badges.${index}`);
    requireString(badge.id, `badges.${index}.id`);
    requireString(badge.region, `badges.${index}.region`);
  }
  const decorations = root.decorations as unknown[];
  for (let index = 0; index < decorations.length; index += 1) {
    const decoration = requireRecord(decorations[index], `decorations.${index}`);
    requireString(decoration.id, `decorations.${index}.id`);
    requireString(decoration.region, `decorations.${index}.region`);
  }
  const imageTreatment = requireRecord(root.image_treatment, "image_treatment");
  const focal = requireRecord(imageTreatment.focal_point, "image_treatment.focal_point");
  requireNumber(focal.x, "image_treatment.focal_point.x", 0, 1);
  requireNumber(focal.y, "image_treatment.focal_point.y", 0, 1);
  const bindings = requireRecord(root.content_bindings, "content_bindings");
  for (const key of ["headline", "subtitle", "cta", "badge"]) {
    requireString(bindings[key], `content_bindings.${key}`);
  }

  return root as unknown as TemplateConfig;
}

export async function loadTemplateConfig(source: string | URL): Promise<TemplateConfig> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Could not load template config (${response.status} ${response.statusText}).`);
  }
  return parseTemplateConfig(await response.text());
}
