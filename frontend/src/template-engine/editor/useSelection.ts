import { useCallback, useState } from "react";
import { replaceSelection, selectElement, type SelectionModifiers } from "./selection";
export type { SelectionModifiers } from "./selection";

export function useSelection() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const select = useCallback((id: string | null, order: readonly string[], modifiers?: SelectionModifiers) => {
    const next = selectElement({ selectedIds, anchorId }, id, order, modifiers);
    setSelectedIds(next.selectedIds);
    setAnchorId(next.anchorId);
  }, [selectedIds, anchorId]);
  const restore = useCallback((ids: readonly string[]) => {
    const next = replaceSelection(ids);
    setSelectedIds(next.selectedIds);
    setAnchorId(next.anchorId);
  }, []);
  const addOrRemove = useCallback((ids: readonly string[], additive: boolean) => {
    if (!additive) {
      const next = replaceSelection(ids);
      setSelectedIds(next.selectedIds);
      setAnchorId(next.anchorId);
      return;
    }
    setSelectedIds((current) => [...new Set([...current, ...ids])]);
    setAnchorId(ids.length ? ids[0] : null);
  }, []);
  return { selectedIds, select, restore, addOrRemove, clear: () => select(null, []) };
}
