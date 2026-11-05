import { useMemo } from "react";
import type { DesignElement, DesignTemplate } from "../../types/designTemplate";

export interface InspectorState {
  element: DesignElement | null;
  selectedId: string | null;
}

export function useInspector(template: DesignTemplate | null, selectedIds: readonly string[]): InspectorState {
  return useMemo(() => {
    if (!template || selectedIds.length !== 1) return { element: null, selectedId: null };
    const element = template.elements.find((candidate) => candidate.id === selectedIds[0]) || null;
    return { element, selectedId: element?.id || null };
  }, [template, selectedIds]);
}
