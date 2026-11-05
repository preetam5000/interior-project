import type { LayoutAnalysisDimension, LayoutAnalysisRequest, LayoutAnalysisResult, LayoutAnalyzer } from "./types";

/** Registry for optional analysis providers. It performs no analysis itself. */
export class LayoutAnalyzerRegistry {
  private readonly analyzers = new Map<string, LayoutAnalyzer>();

  register(analyzer: LayoutAnalyzer): () => void {
    if (!analyzer.id.trim()) throw new Error("Analyzer id is required.");
    if (this.analyzers.has(analyzer.id)) throw new Error(`Analyzer "${analyzer.id}" is already registered.`);
    this.analyzers.set(analyzer.id, analyzer);
    return () => { if (this.analyzers.get(analyzer.id) === analyzer) this.analyzers.delete(analyzer.id); };
  }

  list(): readonly LayoutAnalyzer[] { return [...this.analyzers.values()]; }

  async analyze(request: LayoutAnalysisRequest, dimensions?: readonly LayoutAnalysisDimension[]): Promise<LayoutAnalysisResult> {
    const selected = dimensions ? new Set(dimensions) : undefined;
    const providers = this.list().filter((provider) => !selected || provider.dimensions.some((dimension) => selected.has(dimension)));
    const results = await Promise.all(providers.map((provider) => provider.analyze(request)));
    return {
      findings: results.flatMap((result) => [...result.findings]),
      scores: Object.assign({}, ...results.map((result) => result.scores || {})),
      metadata: Object.assign({}, ...results.map((result) => result.metadata || {})),
    };
  }
}

export const defaultLayoutAnalyzerRegistry = new LayoutAnalyzerRegistry();
