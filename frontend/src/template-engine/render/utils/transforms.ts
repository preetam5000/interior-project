import type { DesignElement } from "../../types/designTemplate";
import type { DesignCommand } from "../../core/commands";

export type CanvasCommand = DesignCommand;
export type CanvasTransaction = readonly CanvasCommand[];
export interface DraftPosition { x: number; y: number }

/** Applies renderer-independent snap translation to transient draft positions. */
export function applySnapDeltaToPositions<T extends DraftPosition>(positions: readonly T[], delta: DraftPosition): T[] {
  if (!delta.x && !delta.y) return positions as T[];
  return positions.map((position) => ({ ...position, x: position.x + delta.x, y: position.y + delta.y }));
}

export const applyCanvasCommand = (elements: DesignElement[], command: CanvasCommand): DesignElement[] => {
  switch (command.type) {
    case "MoveNode": return elements.map((element) => element.id === command.id ? { ...element, x: command.x, y: command.y } : element);
    case "ResizeNode": return elements.map((element) => element.id === command.id ? { ...element, x: command.x, y: command.y, width: command.width, height: command.height } : element);
    case "RotateNode": return elements.map((element) => element.id === command.id ? { ...element, rotation: command.rotation } : element);
    case "ChangeText": return elements.map((element) => element.id === command.id ? { ...element, content: command.content } : element);
    case "SetNodeVisibility": return elements.map((element) => element.id === command.id ? { ...element, visible: command.visible } : element);
    case "SetNodeLocked": return elements.map((element) => element.id === command.id ? { ...element, locked: command.locked } : element);
    case "ReorderNode": return elements.map((element) => element.id === command.id ? { ...element, zIndex: command.zIndex } : element);
    case "RenameLayer": return elements.map((element) => element.id === command.id ? { ...element, data: { ...element.data, layerName: command.name } } : element);
    case "SetElementProperties": return elements.map((element) => element.id === command.id ? { ...element, ...command.properties } : element);
    case "SetElementEffects": return elements.map((element) => element.id === command.id ? { ...element, effects: command.effects.map((effect) => ({ ...effect })) } : element);
    case "DuplicateNode": return elements.some((element) => element.id === command.element.id) ? elements : [...elements, command.element];
    case "DeleteNode": return elements.filter((element) => element.id !== command.id);
    case "ApplyTemplate": return command.template.elements;
  }
};
