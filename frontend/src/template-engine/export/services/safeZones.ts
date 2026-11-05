import type { DesignTemplate } from "../../types/designTemplate";
import type { TemplateConfig } from "../../types";
import type { ExportProfile, ExportSourceKind } from "../types";

type Insets = { top?: number; right?: number; bottom?: number; left?: number };

function profileInsets(document: DesignTemplate | TemplateConfig, kind: ExportSourceKind, profile: ExportProfile): Insets | undefined {
  if (kind === "design-document") {
    const design = document as DesignTemplate;
    return design.canvas.safeZones?.[profile.designFormat] || profile.safeInsets;
  }
  const legacy = document as TemplateConfig;
  return legacy.layout.safe_zones?.[profile.legacyVariant] || legacy.layout.safe_area || profile.safeInsets;
}

/** Resolves safe-area geometry for renderers without adding guides or modifying the document. */
export function applySafeZones(document: DesignTemplate | TemplateConfig, kind: ExportSourceKind, profile: ExportProfile, enabled: boolean) {
  if (!enabled) return null;
  const insets = profileInsets(document, kind, profile);
  if (!insets) return null;
  const top = insets.top || 0;
  const right = insets.right || 0;
  const bottom = insets.bottom || 0;
  const left = insets.left || 0;
  return { x: left, y: top, width: Math.max(0, 1 - left - right), height: Math.max(0, 1 - top - bottom) };
}
