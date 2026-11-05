import type { TemplateCatalogEntry } from "../templates/professionalCatalog";
export interface TemplateRecommendationContext { sceneAnalysis?: unknown; roomType?: string; luxuryScore?: number; constructionStage?: string; brightness?: number; orientation?: string; brand?: unknown; targetPlatform?: string }
export interface TemplateRecommendation { templateId: string; score: number; reasons: string[] }
/** Future recommendation-provider seam. This phase deliberately supplies interfaces only. */
export interface TemplateRecommendationProvider { recommend(context: TemplateRecommendationContext, catalog: readonly TemplateCatalogEntry[]): Promise<TemplateRecommendation[]> }
