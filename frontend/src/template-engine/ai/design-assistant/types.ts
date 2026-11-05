import type { CommandBatch } from "../../core/commands";
import type { DesignTemplate } from "../../types/designTemplate";

export type DesignSuggestionCategory = "layout" | "typography" | "spacing" | "colors" | "cta" | "template" | "animation" | "logo-placement" | "image-crop" | "hierarchy" | "safe-zone";
export interface DesignSuggestion {
  id: string;
  category: DesignSuggestionCategory;
  title: string;
  rationale: string;
  impact: "low" | "medium" | "high";
  targetIds: readonly string[];
  commands: CommandBatch;
  previewDocument: DesignTemplate;
  source: string;
}
export interface DesignAssistantRequest {
  document: DesignTemplate;
  selection?: readonly string[];
  templateCandidates?: readonly DesignTemplate[];
}
export interface DesignSuggestionProvider {
  readonly id: string;
  suggest(request: DesignAssistantRequest): readonly DesignSuggestion[];
}
