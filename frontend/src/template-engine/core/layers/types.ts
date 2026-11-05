import type { DesignElement, DesignElementType } from "../../types/designTemplate";

export interface LayerNode {
  id: string;
  parentId: string | null;
  name: string;
  type: DesignElementType | "Group" | "Frame";
  visible: boolean;
  locked: boolean;
  expanded: boolean;
  selected: boolean;
  zIndex: number;
  children: LayerNode[];
}

export interface LayerTreeState {
  selectedIds?: readonly string[];
  expandedIds?: readonly string[];
  names?: Readonly<Record<string, string>>;
}

export type LayerOrderAction = "forward" | "backward" | "front" | "back";
export type LayerPlacement = "before" | "after";

export interface LayerElement extends DesignElement {
  /** Reserved for future document tree support; current template format remains flat. */
  parentId?: string | null;
}
