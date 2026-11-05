import type { DesignTemplate } from "../../types/designTemplate";
import type { TemplateConfig } from "../../types";
import { getExportProfile } from "../formats/profiles";
import type { ExportAssetResolver } from "./assets";
import { resolveAssets, defaultExportAssetResolver } from "./assets";
import { resolveBrandTokens } from "./brandTokens";
import { normalizeExportDocument } from "./document";
import { applyExportEffects, type ExportEffectProcessor } from "./effects";
import { applySafeZones } from "./safeZones";
import { defaultBrandEngine } from "../../brand";
import type { ExportRequest, PreparedExport } from "../types";

export interface ExportPipelineOptions {
  assetResolver?: ExportAssetResolver;
  effectProcessors?: readonly ExportEffectProcessor[];
}

/** Runs the deterministic preparation stages without mutating the source document. */
export async function prepareExportRequest(request: ExportRequest, options: ExportPipelineOptions = {}): Promise<PreparedExport> {
  let inputDocument: unknown = request.document;
  if (typeof inputDocument === "string") {
    try { inputDocument = JSON.parse(inputDocument) as unknown; }
    catch { /* Keep parsing errors and their established message in normalizeExportDocument. */ }
  }
  if (request.brandKit && inputDocument && typeof inputDocument === "object") {
    inputDocument = defaultBrandEngine.resolveTokens(inputDocument, request.brandKit);
  }
  const normalized = normalizeExportDocument(inputDocument as ExportRequest["document"]);
  const baseProfile = getExportProfile(request.profile);
  const scale = Math.max(1, Math.min(4, Math.floor(request.scale || 1))) as 1 | 2 | 3 | 4;
  const profile = scale === 1 ? baseProfile : { ...baseProfile, width: baseProfile.width * scale, height: baseProfile.height * scale };
  let context = { ...(request.context || {}) };
  let document = normalized.document;
  if (request.brandKit) {
    const brandTokens = Object.fromEntries(Object.entries(defaultBrandEngine.renderTokens(request.brandKit)).filter(([, value]) => typeof value === "string")) as Record<string, string>;
    context = { ...context, brand: { ...brandTokens, ...context.brand } };
  }
  document = resolveBrandTokens(document, context);
  if (normalized.sourceKind === "design-document") {
    context = resolveAssets(document as DesignTemplate, context, options.assetResolver || defaultExportAssetResolver);
  }
  const effects = await applyExportEffects(document, context, options.effectProcessors);
  document = effects.document as DesignTemplate | TemplateConfig;
  context = effects.context;
  const safeZone = applySafeZones(document, normalized.sourceKind, profile, request.safeZones !== false);
  return {
    sourceKind: normalized.sourceKind,
    document,
    context,
    profile,
    format: request.format,
    quality: request.quality ?? 0.92,
    safeZone,
    transparentBackground: Boolean(request.transparentBackground),
  };
}
