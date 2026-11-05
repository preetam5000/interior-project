import type { ExportDocumentInput, ExportRenderContext } from "../types";

export const exportExtensionPoints = ["animation", "video", "gif", "lottie"] as const;
export type ExportExtensionPoint = typeof exportExtensionPoints[number];

export interface ExportEffectProcessor {
  apply(document: ExportDocumentInput, context: ExportRenderContext): Promise<{ document: ExportDocumentInput; context: ExportRenderContext }> | { document: ExportDocumentInput; context: ExportRenderContext };
}

/** Existing renderers apply document effects during drawing; this stage reserves ordered processors. */
export async function applyExportEffects(document: ExportDocumentInput, context: ExportRenderContext, processors: readonly ExportEffectProcessor[] = []) {
  let currentDocument = document;
  let currentContext = context;
  for (const processor of processors) {
    const next = await processor.apply(currentDocument, currentContext);
    currentDocument = next.document;
    currentContext = next.context;
  }
  return { document: currentDocument, context: currentContext };
}
