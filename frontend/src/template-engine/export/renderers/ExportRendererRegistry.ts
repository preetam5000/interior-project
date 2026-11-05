import type { ExportSourceKind } from "../types";
import type { ExportRenderer } from "./types";

export class ExportRendererRegistry {
  private readonly renderers = new Map<ExportSourceKind, ExportRenderer>();
  register(renderer: ExportRenderer): () => void {
    const previous = this.renderers.get(renderer.sourceKind);
    this.renderers.set(renderer.sourceKind, renderer);
    return () => {
      if (this.renderers.get(renderer.sourceKind) !== renderer) return;
      if (previous) this.renderers.set(renderer.sourceKind, previous);
      else this.renderers.delete(renderer.sourceKind);
    };
  }
  get(sourceKind: ExportSourceKind): ExportRenderer {
    const renderer = this.renderers.get(sourceKind);
    if (!renderer) throw new Error(`No export renderer registered for "${sourceKind}" documents.`);
    return renderer;
  }
}
