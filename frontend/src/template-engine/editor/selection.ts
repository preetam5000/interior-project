export interface SelectionModifiers { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }
export interface SelectionState { selectedIds: string[]; anchorId: string | null }

export function replaceSelection(ids: readonly string[]): SelectionState {
  const selectedIds = [...new Set(ids)];
  return { selectedIds, anchorId: selectedIds.length ? selectedIds[selectedIds.length - 1] : null };
}

export function selectElement(state: SelectionState, id: string | null, order: readonly string[], modifiers: SelectionModifiers = { ctrlKey: false, metaKey: false, shiftKey: false }): SelectionState {
  if (!id) return { selectedIds: [], anchorId: null };
  if (modifiers.shiftKey && state.anchorId) {
    const start = order.indexOf(state.anchorId);
    const end = order.indexOf(id);
    if (start >= 0 && end >= 0) return { selectedIds: order.slice(Math.min(start, end), Math.max(start, end) + 1), anchorId: state.anchorId };
  }
  if (modifiers.ctrlKey || modifiers.metaKey) {
    const selectedIds = state.selectedIds.includes(id) ? state.selectedIds.filter((value) => value !== id) : [...state.selectedIds, id];
    return { selectedIds, anchorId: id };
  }
  return { selectedIds: [id], anchorId: id };
}

export function marqueeSelection<T extends { id: string; visible: boolean }>(
  elements: readonly T[],
  rect: { x: number; y: number; width: number; height: number },
  bounds: (element: T) => { x: number; y: number; width: number; height: number },
): string[] {
  const left = Math.min(rect.x, rect.x + rect.width);
  const right = Math.max(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const bottom = Math.max(rect.y, rect.y + rect.height);
  return elements.filter((element) => {
    if (!element.visible) return false;
    const box = bounds(element);
    return box.x <= right && box.x + box.width >= left && box.y <= bottom && box.y + box.height >= top;
  }).map((element) => element.id);
}
