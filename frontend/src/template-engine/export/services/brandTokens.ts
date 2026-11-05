import type { DesignTemplate } from "../../types/designTemplate";
import type { TemplateConfig } from "../../types";
import type { ExportRenderContext } from "../types";

type TokenDocument = DesignTemplate | TemplateConfig;

function resolveToken(value: string, tokens: Record<string, string>): string {
  if (!value.startsWith("$")) return value;
  const key = value.slice(1).replace(/^brand\./, "");
  return tokens[key] || value;
}

function resolveDeep(value: unknown, tokens: Record<string, string>): unknown {
  if (typeof value === "string") return resolveToken(value, tokens);
  if (Array.isArray(value)) return value.map((item) => resolveDeep(item, tokens));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveDeep(item, tokens)]));
}

export function resolveBrandTokens<T extends TokenDocument>(document: T, context: ExportRenderContext): T {
  const palette = "schemaVersion" in document ? document.branding.palette || {} : document.colors;
  const tokens = { ...palette, ...context.brand };
  return resolveDeep(document, tokens) as T;
}
