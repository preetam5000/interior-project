import type { DesignElement, DesignTemplate } from "../../types/designTemplate";
import type { LayerNode, LayerTreeState } from "./types";

function defaultLayerName(element: DesignElement): string {
  const customName = element.data?.layerName;
  if (typeof customName === "string" && customName.trim()) return customName.trim();
  const content = element.content?.trim();
  if (content) return content.replace(/\s+/g, " ").slice(0, 48);
  return element.type;
}

/** Builds the editor tree from the current flat document without changing its schema. */
export function buildLayerTree(template: DesignTemplate, state: LayerTreeState = {}): LayerNode[] {
  const selected = new Set(state.selectedIds || []);
  const expanded = new Set(state.expandedIds || []);
  return [...template.elements]
    .sort((a, b) => b.zIndex - a.zIndex || a.id.localeCompare(b.id))
    .map((element) => ({
      id: element.id,
      parentId: null,
      name: state.names?.[element.id] || defaultLayerName(element),
      type: element.type,
      visible: element.visible,
      locked: element.locked,
      expanded: expanded.has(element.id),
      selected: selected.has(element.id),
      zIndex: element.zIndex,
      children: [],
    }));
}

/** Generic parent/child builder reserved for group and frame nodes in a later schema revision. */
export function nestLayerNodes(nodes: readonly LayerNode[]): LayerNode[] {
  const copies = new Map(nodes.map((node) => [node.id, { ...node, children: [] as LayerNode[] }]));
  const roots: LayerNode[] = [];
  for (const node of nodes) {
    const copy = copies.get(node.id)!;
    const parent = node.parentId ? copies.get(node.parentId) : undefined;
    if (parent) parent.children.push(copy);
    else roots.push(copy);
  }
  return roots;
}
