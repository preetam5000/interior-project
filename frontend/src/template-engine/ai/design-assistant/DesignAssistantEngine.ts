import { applyTransaction, type CommandBatch } from "../../core/commands";
import { getAnimationPreset } from "../../presets/animationPresets";
import type { DesignElement, DesignTemplate } from "../../types/designTemplate";
import type { DesignAssistantRequest, DesignSuggestion, DesignSuggestionCategory, DesignSuggestionProvider } from "./types";

const TEXT_TYPES = new Set(["Text", "Heading", "Subtitle", "Body Text", "Social Handle", "CTA Button", "Badge", "Sticker"]);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const label = (element: DesignElement) => String(element.data?.layerName || element.content || element.type);
const name = (category: DesignSuggestionCategory) => ({ layout: "Layout", typography: "Typography", spacing: "Spacing", colors: "Color", cta: "Call to action", template: "Template", animation: "Animation", "logo-placement": "Logo placement", "image-crop": "Image crop", hierarchy: "Hierarchy", "safe-zone": "Safe zone" })[category];

function normalizedColor(input: string | undefined, template: DesignTemplate): string | undefined {
  if (!input) return undefined;
  if (input.startsWith("$")) return template.branding.tokens?.[input.slice(1)] || template.branding.palette?.[input.slice(1).replace(/^colors\./, "")];
  return input;
}
function luminance(input: string | undefined, template: DesignTemplate): number | undefined {
  const color = normalizedColor(input, template);
  const match = color?.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return undefined;
  const raw = match[1].length === 3 ? [...match[1]].map((char) => char + char).join("") : match[1];
  const channels = [0, 2, 4].map((index) => parseInt(raw.slice(index, index + 2), 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function makeSuggestion(request: DesignAssistantRequest, category: DesignSuggestionCategory, title: string, rationale: string, targetIds: string[], commands: CommandBatch, impact: DesignSuggestion["impact"] = "medium"): DesignSuggestion | null {
  if (!commands.length) return null;
  const previewDocument = applyTransaction(request.document, commands);
  if (previewDocument === request.document || JSON.stringify(previewDocument) === JSON.stringify(request.document)) return null;
  const id = `${category}-${targetIds.join("-") || request.document.id}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return { id, category, title, rationale, impact, targetIds, commands, previewDocument, source: "local-rules" };
}

/** Deterministic, offline suggestion provider. It only returns proposed commands and previews. */
export class LocalDesignSuggestionProvider implements DesignSuggestionProvider {
  readonly id = "local-design-rules";

  suggest(request: DesignAssistantRequest): readonly DesignSuggestion[] {
    const document = request.document;
    const all = document.elements.filter((element) => element.visible && !element.locked);
    const selected = request.selection?.length ? all.filter((element) => request.selection?.includes(element.id)) : [];
    const focused = selected.length ? selected : all;
    const suggestions: Array<DesignSuggestion | null> = [];

    // Layout: align a group of text layers to one visual edge when their left margins drift.
    const text = focused.filter((element) => TEXT_TYPES.has(element.type));
    if (text.length > 1) {
      const left = Math.min(...text.map((element) => element.x));
      if (Math.max(...text.map((element) => element.x)) - left > 0.045) {
        const ids = text.map((element) => element.id);
        suggestions.push(makeSuggestion(request, "layout", "Align the text column", "These text layers have noticeably different left edges. Aligning them gives the composition a clearer grid.", ids, text.filter((element) => Math.abs(element.x - left) > 0.002).map((element) => ({ type: "MoveNode", id: element.id, x: left, y: element.y })), "medium"));
      }
    }

    // Typography and hierarchy: preserve the existing family, make display text lead body copy.
    const heading = focused.find((element) => ["Heading", "Subtitle"].includes(element.type));
    const body = focused.find((element) => ["Body Text", "Text"].includes(element.type));
    if (heading && body && (heading.fontSize || 24) < (body.fontSize || 18) * 1.35) {
      const size = Math.max(heading.fontSize || 24, Math.round((body.fontSize || 18) * 1.6));
      suggestions.push(makeSuggestion(request, "typography", "Strengthen the type scale", `Increase “${label(heading)}” to ${size}px so the headline reads before supporting copy.`, [heading.id], [{ type: "SetElementProperties", id: heading.id, properties: { fontSize: size, fontWeight: heading.fontWeight === "regular" ? "700" : heading.fontWeight } }], "high"));
    }

    // Spacing: make gaps between consecutive text layers consistent while respecting canvas bounds.
    const verticalText = [...text].sort((a, b) => a.y - b.y);
    if (verticalText.length > 2) {
      const first = verticalText[0];
      const last = verticalText[verticalText.length - 1];
      const totalHeights = verticalText.reduce((sum, element) => sum + element.height, 0);
      const gap = Math.max(0.012, (last.y + last.height - first.y - totalHeights) / (verticalText.length - 1));
      let cursor = first.y;
      const commands = verticalText.slice(1).map((element) => { cursor += verticalText[verticalText.indexOf(element) - 1].height + gap; const y = clamp(cursor, 0, 1 - element.height); const command = { type: "MoveNode" as const, id: element.id, x: element.x, y }; cursor = y; return command; });
      if (commands.some((command) => Math.abs(command.y - (document.elements.find((element) => element.id === command.id)?.y || 0)) > 0.025)) suggestions.push(makeSuggestion(request, "spacing", "Normalize vertical text spacing", "Use a steady baseline rhythm between text layers to make the layout feel more deliberate.", verticalText.map((element) => element.id), commands, "medium"));
    }

    // Colors: when a text color is too close to the brand surface, offer a high-contrast text token.
    const surface = document.branding.palette?.surface || "#ffffff";
    const surfaceLuma = luminance(surface, document);
    const lowContrast = focused.filter((element) => TEXT_TYPES.has(element.type) && surfaceLuma !== undefined && luminance(element.color, document) !== undefined && Math.abs(surfaceLuma - (luminance(element.color, document) as number)) < 0.24);
    if (lowContrast.length) suggestions.push(makeSuggestion(request, "colors", "Improve text contrast", "A darker text tone improves readability against the current brand surface.", lowContrast.map((element) => element.id), lowContrast.map((element) => ({ type: "SetElementProperties" as const, id: element.id, properties: { color: surfaceLuma! > 0.5 ? (document.branding.palette?.text || "#28251f") : "#f8f5ef" } })), "high"));

    const cta = focused.find((element) => element.type === "CTA Button");
    if (cta) {
      const primary = document.branding.palette?.primary || "#9a784b";
      if (cta.color !== "#ffffff" || cta.style?.background !== primary) suggestions.push(makeSuggestion(request, "cta", "Give the CTA a clear brand treatment", "Use the brand primary color and a readable button label color to make the next step easier to find.", [cta.id], [{ type: "SetElementProperties", id: cta.id, properties: { color: "#ffffff", style: { ...cta.style, background: primary }, radius: cta.radius || 0.035 } }], "medium"));
    }

    const logo = focused.find((element) => element.type === "Logo");
    if (logo) {
      const safe = document.canvas.safeZones?.portrait || document.canvas.safeZones?.story || { top: 0.06, right: 0.06, bottom: 0.07, left: 0.06 };
      const x = safe.left, y = safe.top;
      if (Math.abs(logo.x - x) > 0.025 || Math.abs(logo.y - y) > 0.025) suggestions.push(makeSuggestion(request, "logo-placement", "Move the logo into the safe corner", "Place the logo inside the top-left safe area so it remains clear of platform crops and device controls.", [logo.id], [{ type: "MoveNode", id: logo.id, x: clamp(x, 0, 1 - logo.width), y: clamp(y, 0, 1 - logo.height) }], "medium"));
    }

    const image = focused.find((element) => element.type === "Image" && element.source);
    if (image && image.crop !== "cover") suggestions.push(makeSuggestion(request, "image-crop", "Fill the image frame", "Switch to cover cropping to fill the frame. You can still adjust the crop in the image inspector.", [image.id], [{ type: "SetElementProperties", id: image.id, properties: { crop: "cover" } }], "low"));

    const animate = focused.find((element) => TEXT_TYPES.has(element.type) && !element.animations?.length);
    if (animate) {
      const fade = getAnimationPreset("fade");
      suggestions.push(makeSuggestion(request, "animation", "Add a subtle entrance", "A short fade-in can guide attention to the headline in an animated story preview.", [animate.id], [{ type: "SetElementProperties", id: animate.id, properties: { animations: [{ preset: "fade", durationMs: fade.durationMs, delayMs: 0, easing: fade.easing, keyframes: fade.keyframes.map((frame) => ({ offset: frame.offset, values: { ...frame.values } })) }] } }], "low"));
    }

    if (request.templateCandidates?.length) {
      const candidate = request.templateCandidates.find((item) => item.id !== document.id && item.category.toLowerCase() === document.category.toLowerCase()) || request.templateCandidates.find((item) => item.id !== document.id);
      if (candidate) suggestions.push(makeSuggestion(request, "template", `Explore “${candidate.name}”`, `This local template has a related ${candidate.category.toLowerCase()} direction. Preview it before replacing the current composition.`, [], [{ type: "ApplyTemplate", template: candidate }], "high"));
    }

    // Safe zones and layout hierarchy are evaluated independently so each can be reviewed on its own.
    const safe = document.canvas.safeZones?.story || document.canvas.safeZones?.portrait;
    if (safe) {
      const outside = focused.filter((element) => element.x < safe.left || element.y < safe.top || element.x + element.width > 1 - safe.right || element.y + element.height > 1 - safe.bottom);
      if (outside.length) suggestions.push(makeSuggestion(request, "safe-zone", "Keep content inside the safe area", "Move or resize the affected layers to reduce the chance that story controls or platform crops cover them.", outside.map((element) => element.id), outside.map((element) => {
        const width = Math.min(element.width, 1 - safe.left - safe.right);
        const height = Math.min(element.height, 1 - safe.top - safe.bottom);
        const x = clamp(element.x, safe.left, 1 - safe.right - width);
        const y = clamp(element.y, safe.top, 1 - safe.bottom - height);
        return width !== element.width || height !== element.height
          ? { type: "ResizeNode" as const, id: element.id, x, y, width, height }
          : { type: "MoveNode" as const, id: element.id, x, y };
      }), "high"));
    }

    const allHeadings = focused.filter((element) => element.type === "Heading");
    const bodyText = focused.filter((element) => ["Body Text", "Text"].includes(element.type));
    if (allHeadings.length && bodyText.length && !allHeadings.some((element) => (element.fontSize || 0) >= Math.max(...bodyText.map((item) => item.fontSize || 0)) * 1.35)) {
      const commands = allHeadings.map((element) => ({ type: "SetElementProperties" as const, id: element.id, properties: { fontSize: Math.max(element.fontSize || 28, Math.round(Math.max(...bodyText.map((item) => item.fontSize || 18)) * 1.6)) } }));
      suggestions.push(makeSuggestion(request, "hierarchy", "Make the headline the visual anchor", "Increase the heading scale relative to body copy to clarify what viewers should read first.", allHeadings.map((element) => element.id), commands, "medium"));
    }
    return suggestions.filter((suggestion): suggestion is DesignSuggestion => Boolean(suggestion));
  }
}

/** Provider registry keeps the suggestion contract independent from local or future AI providers. */
export class DesignAssistantRegistry {
  private providers = new Map<string, DesignSuggestionProvider>();
  register(provider: DesignSuggestionProvider) {
    if (!provider.id.trim()) throw new Error("Suggestion provider id is required.");
    if (this.providers.has(provider.id)) throw new Error(`Suggestion provider "${provider.id}" is already registered.`);
    this.providers.set(provider.id, provider);
    return () => { if (this.providers.get(provider.id) === provider) this.providers.delete(provider.id); };
  }
  list(): readonly DesignSuggestionProvider[] { return [...this.providers.values()]; }
  suggest(request: DesignAssistantRequest): DesignSuggestion[] { return this.list().flatMap((provider) => [...provider.suggest(request)]); }
}

export const defaultDesignAssistant = new DesignAssistantRegistry();
defaultDesignAssistant.register(new LocalDesignSuggestionProvider());

/** Preview documents are immutable command projections; this function never applies to editor state. */
export function previewDesignSuggestion(document: DesignTemplate, commands: CommandBatch): DesignTemplate {
  return applyTransaction(document, commands);
}
