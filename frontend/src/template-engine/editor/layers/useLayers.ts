import { useCallback, useMemo, useState } from "react";
import { buildLayerTree } from "../../core/layers";
import type { DesignTemplate } from "../../types/designTemplate";

export function useLayers(template: DesignTemplate | null, selectedIds: readonly string[]) {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const tree = useMemo(() => template ? buildLayerTree(template, { selectedIds, expandedIds }) : [], [template, selectedIds, expandedIds]);
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }, []);
  const removeLayer = useCallback((id: string) => {
    setExpandedIds((current) => current.filter((value) => value !== id));
  }, []);
  return { tree, toggleExpanded, removeLayer };
}
