import { encodeExportSurface } from "./formats/encode";
import { ExportRendererRegistry } from "./renderers/ExportRendererRegistry";
import { DesignTemplateSvgRenderer } from "./renderers/DesignTemplateSvgRenderer";
import { LegacyCanvasExportRenderer } from "./renderers/LegacyCanvasRenderer";
import { prepareExportRequest, type ExportPipelineOptions } from "./services/pipeline";
import type { ExportRequest, ExportResult } from "./types";

export interface ExportEngineOptions extends ExportPipelineOptions {
  renderers?: ExportRendererRegistry;
}

export class ExportEngine {
  readonly renderers: ExportRendererRegistry;

  constructor(private readonly options: ExportEngineOptions = {}) {
    this.renderers = options.renderers || new ExportRendererRegistry();
    if (!options.renderers) {
      this.renderers.register(new LegacyCanvasExportRenderer());
      this.renderers.register(new DesignTemplateSvgRenderer());
    }
  }

  async export(request: ExportRequest): Promise<ExportResult> {
    const checkCancelled = () => { if (request.signal?.aborted) throw new DOMException("Export cancelled.", "AbortError"); };
    checkCancelled();
    request.onProgress?.({ stage: "preparing", progress: 0.1 });
    const prepared = await prepareExportRequest(request, this.options);
    checkCancelled();
    request.onProgress?.({ stage: "rendering", progress: 0.35 });
    const surface = await this.renderers.get(prepared.sourceKind).render(prepared);
    checkCancelled();
    request.onProgress?.({ stage: "encoding", progress: 0.75 });
    const result = await encodeExportSurface(surface, prepared.format, prepared.quality, prepared.profile.id);
    checkCancelled();
    const normalized = prepared.document as { animations?: unknown[] };
    return { ...result, animationMetadata: Array.isArray(normalized.animations) ? normalized.animations : undefined };
  }
}

export const defaultExportEngine = new ExportEngine();
