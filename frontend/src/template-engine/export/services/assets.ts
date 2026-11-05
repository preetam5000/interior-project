import type { DesignTemplate } from "../../types/designTemplate";
import type { ExportRenderContext } from "../types";

export type ExportAssetResolver = (reference: string, context: ExportRenderContext) => string | undefined;

export const defaultExportAssetResolver: ExportAssetResolver = (reference, context) => {
  if (reference === "brand.logo") return context.brand?.logo || context.brand?.logoUrl || undefined;
  return context.assets?.[reference]
    || context.assets?.[reference.replace(/^asset:/, "")]
    || (reference.startsWith("brand.") ? context.brand?.[reference.slice(6)] : undefined)
    || reference;
};

export function resolveAssets(document: DesignTemplate, context: ExportRenderContext, resolver: ExportAssetResolver = defaultExportAssetResolver): ExportRenderContext {
  const assets = { ...(context.assets || {}) };
  const references = [document.background.image, document.branding.logo, ...document.elements.map((element) => element.source)].filter((value): value is string => Boolean(value));
  for (const reference of references) {
    const resolved = resolver(reference, context);
    if (resolved) {
      assets[reference] = resolved;
      assets[reference.replace(/^asset:/, "")] = resolved;
    }
  }
  const logo = context.brand?.logo || (document.branding.logo ? resolver(document.branding.logo, context) : undefined);
  return { ...context, assets, brand: { ...context.brand, ...(logo ? { logo, logoUrl: context.brand?.logoUrl || logo } : {}) } };
}
