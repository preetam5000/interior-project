import type { DesignTemplate } from "../types/designTemplate";
export type TemplateWarningCode = "missing-logo" | "missing-cta" | "outside-safe-zone" | "tiny-font" | "missing-image" | "invalid-animation" | "brand-token" | "overflowing-text";
export interface TemplateWarning { code: TemplateWarningCode; message: string; elementId?: string; severity: "warning" | "info" }
const TOKEN = /\$\{?([\w.-]+)\}?/g;

/** Non-throwing quality checks intended for catalog review and template authoring hints. */
export function inspectTemplateQuality(template: DesignTemplate, options: { safeZone?: { top: number; right: number; bottom: number; left: number }; hasLogo?: boolean; brandTokens?: string[] } = {}): TemplateWarning[] {
  const warnings: TemplateWarning[] = [];
  const hasLogo = options.hasLogo ?? Boolean(template.branding.logo || template.elements.some((element) => element.type === "Logo"));
  if (!hasLogo) warnings.push({ code: "missing-logo", message: "Add a studio logo or confirm that this layout is intentionally unbranded.", severity: "info" });
  if (!template.elements.some((element) => element.type === "CTA Button")) warnings.push({ code: "missing-cta", message: "This template has no call to action.", severity: "info" });
  const safe = options.safeZone || template.canvas.safeZones?.["story"] || { top: 0, right: 0, bottom: 0, left: 0 };
  const known = new Set(options.brandTokens || Object.keys(template.branding.palette || {}));
  for (const element of template.elements) {
    if (element.x < safe.left || element.y < safe.top || element.x + element.width > 1 - safe.right || element.y + element.height > 1 - safe.bottom) {
      warnings.push({ code: "outside-safe-zone", message: `Element "${element.id}" extends into a reserved safe zone.`, elementId: element.id, severity: "warning" });
    }
    if (element.fontSize !== undefined && element.fontSize < 14) warnings.push({ code: "tiny-font", message: `Element "${element.id}" uses a font smaller than 14 px.`, elementId: element.id, severity: "warning" });
    if (element.type === "Image" && !element.source) warnings.push({ code: "missing-image", message: `Image element "${element.id}" has no source.`, elementId: element.id, severity: "warning" });
    if (element.animations?.some((animation) => !["fade", "slide", "scale", "rotate", "bounce", "pop", "zoom", "blur", "motion-blur"].includes(animation.preset))) warnings.push({ code: "invalid-animation", message: `Element "${element.id}" has an unsupported animation preset.`, elementId: element.id, severity: "warning" });
    if (element.content && element.fontSize && element.width < 0.12 && element.content.length > 36) warnings.push({ code: "overflowing-text", message: `Text in "${element.id}" may not fit its narrow text box.`, elementId: element.id, severity: "warning" });
    const values = [element.color, element.source, element.fontFamily, ...Object.values(element.style || {}).filter((value): value is string => typeof value === "string")];
    for (const value of values) if (typeof value === "string") {
      for (const match of value.matchAll(TOKEN)) if (options.brandTokens && !known.has(match[1])) warnings.push({ code: "brand-token", message: `Brand token "${match[1]}" is not defined.`, elementId: element.id, severity: "warning" });
    }
  }
  return warnings;
}
