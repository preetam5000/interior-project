import type { DesignCommand } from "../commands";
import type { DesignElement } from "../../types/designTemplate";
import type { LayerOrderAction, LayerPlacement } from "./types";

function topFirst(elements: readonly DesignElement[]): DesignElement[] {
  return [...elements].sort((a, b) => b.zIndex - a.zIndex || a.id.localeCompare(b.id));
}

function toCommands(ordered: readonly DesignElement[]): DesignCommand[] {
  return ordered.flatMap((element, index) => {
    const zIndex = ordered.length - index - 1;
    return element.zIndex === zIndex ? [] : [{ type: "ReorderNode", id: element.id, zIndex }];
  });
}

export function reorderLayerCommands(elements: readonly DesignElement[], id: string, targetId: string, placement: LayerPlacement): DesignCommand[] {
  if (id === targetId) return [];
  const ordered = topFirst(elements);
  const from = ordered.findIndex((element) => element.id === id);
  const target = ordered.findIndex((element) => element.id === targetId);
  if (from < 0 || target < 0) return [];
  const [moved] = ordered.splice(from, 1);
  const targetAfterRemoval = ordered.findIndex((element) => element.id === targetId);
  ordered.splice(targetAfterRemoval + (placement === "after" ? 1 : 0), 0, moved);
  return toCommands(ordered);
}

export function layerOrderCommands(elements: readonly DesignElement[], id: string, action: LayerOrderAction): DesignCommand[] {
  const ordered = topFirst(elements);
  const index = ordered.findIndex((element) => element.id === id);
  if (index < 0) return [];
  const [moved] = ordered.splice(index, 1);
  switch (action) {
    case "front": ordered.unshift(moved); break;
    case "back": ordered.push(moved); break;
    case "forward": ordered.splice(Math.max(0, index - 1), 0, moved); break;
    case "backward": ordered.splice(Math.min(ordered.length, index + 1), 0, moved); break;
  }
  return toCommands(ordered);
}
