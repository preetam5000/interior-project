import type { BrandKit } from "../../brand";
import type { DesignTemplate } from "../../types/designTemplate";

export type LayoutAnalysisDimension =
  | "visual-hierarchy" | "balance" | "whitespace" | "golden-ratio" | "alignment"
  | "brand-compliance" | "safe-zone-validation" | "typography-analysis";

export interface LayoutAnalysisRequest {
  document: DesignTemplate;
  dimensions?: readonly LayoutAnalysisDimension[];
  brand?: BrandKit;
  safeZone?: { x: number; y: number; width: number; height: number };
}

export interface LayoutFinding {
  dimension: LayoutAnalysisDimension;
  message: string;
  severity?: "info" | "warning" | "error";
  elementIds?: readonly string[];
  score?: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface LayoutAnalysisResult {
  findings: readonly LayoutFinding[];
  scores?: Partial<Record<LayoutAnalysisDimension, number>>;
  metadata?: Readonly<Record<string, unknown>>;
}

/** Provider contract only; implementations may be local or remote and are intentionally absent. */
export interface LayoutAnalyzer {
  readonly id: string;
  readonly dimensions: readonly LayoutAnalysisDimension[];
  analyze(request: LayoutAnalysisRequest): Promise<LayoutAnalysisResult>;
}
