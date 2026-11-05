import { parseTemplateConfig } from "../../validate";
import { parseDesignTemplate, parseTemplateDocument } from "../../templates/validateDesignTemplate";
import type { DesignTemplate } from "../../types/designTemplate";
import type { TemplateConfig } from "../../types";
import type { ExportDocumentInput, ExportSourceKind } from "../types";

export interface NormalizedExportDocument {
  sourceKind: ExportSourceKind;
  document: DesignTemplate | TemplateConfig;
}

function asRecord(input: ExportDocumentInput): Record<string, unknown> | null {
  if (typeof input === "string") {
    try {
      const parsed: unknown = JSON.parse(input);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch (error) {
      throw new Error(`Export document is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

export function normalizeExportDocument(input: ExportDocumentInput): NormalizedExportDocument {
  const record = asRecord(input);
  if (record?.schema_version === 1) return { sourceKind: "legacy", document: parseTemplateConfig(record as unknown as TemplateConfig) };
  if (record?.schemaVersion === 2) return { sourceKind: "design-document", document: parseDesignTemplate(record) };
  if (record?.design_document && typeof record.design_document === "object") {
    const candidate = record.design_document as Record<string, unknown>;
    if (candidate.schemaVersion === 2) return { sourceKind: "design-document", document: parseDesignTemplate(candidate) };
  }
  const document = parseTemplateDocument(input);
  return { sourceKind: "design-document", document };
}
