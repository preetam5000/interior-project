export type AutomationStageId =
  | "google-drive" | "ai-analysis" | "image-enhancement" | "template-selection" | "brand-kit"
  | "caption-generation" | "approval" | "instagram-publish" | "analytics";

export interface AutomationStageDefinition { id: AutomationStageId; label: string }

/** Describes a future workflow. No integrations or execution are included. */
export const DEFAULT_AUTOMATION_STAGES: readonly AutomationStageDefinition[] = [
  { id: "google-drive", label: "Google Drive" },
  { id: "ai-analysis", label: "AI Analysis" },
  { id: "image-enhancement", label: "Image Enhancement" },
  { id: "template-selection", label: "Template Selection" },
  { id: "brand-kit", label: "Brand Kit" },
  { id: "caption-generation", label: "Caption Generation" },
  { id: "approval", label: "Approval" },
  { id: "instagram-publish", label: "Instagram Publish" },
  { id: "analytics", label: "Analytics" },
];

export interface AutomationContext { workflowId: string; data: Readonly<Record<string, unknown>>; metadata?: Readonly<Record<string, unknown>> }
export interface AutomationStageResult { context: AutomationContext; status: "completed" | "skipped" | "awaiting-approval"; output?: unknown }
/** Contract for a future stage implementation. This package does not execute workflows. */
export interface AutomationStageHandler { readonly id: AutomationStageId; run(context: AutomationContext): Promise<AutomationStageResult> }
