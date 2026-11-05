import type { DesignElement, DesignTemplate } from "../types/designTemplate";
import type { DesignEffect } from "./effects/types";
import { validateDesignEffects } from "./effects/EffectsEngine";

export type DesignCommand =
  | { type: "MoveNode"; id: string; x: number; y: number }
  | { type: "ResizeNode"; id: string; x: number; y: number; width: number; height: number }
  | { type: "RotateNode"; id: string; rotation: number }
  | { type: "ChangeText"; id: string; content: string }
  | { type: "DuplicateNode"; element: DesignElement }
  | { type: "DeleteNode"; id: string }
  | { type: "SetNodeVisibility"; id: string; visible: boolean }
  | { type: "SetNodeLocked"; id: string; locked: boolean }
  | { type: "ReorderNode"; id: string; zIndex: number }
  | { type: "RenameLayer"; id: string; name: string }
  | { type: "SetElementProperties"; id: string; properties: Partial<Omit<DesignElement, "id" | "type" | "zIndex">> }
  | { type: "SetElementEffects"; id: string; effects: readonly DesignEffect[] }
  | { type: "ApplyTemplate"; template: DesignTemplate; preserveSelection?: boolean };

export type CommandBatch = readonly DesignCommand[];

function updateElement(
  document: DesignTemplate,
  id: string,
  update: (element: DesignElement) => DesignElement,
  options: { allowLocked?: boolean; allowHidden?: boolean } = {},
): DesignTemplate {
  const element = document.elements.find((item) => item.id === id);
  if (!element || (!options.allowLocked && element.locked) || (!options.allowHidden && !element.visible)) return document;
  const updated = update(element);
  if (JSON.stringify(element) === JSON.stringify(updated)) return document;
  return { ...document, elements: document.elements.map((item) => item.id === id ? updated : item) };
}

export function applyCommand(document: DesignTemplate, command: DesignCommand): DesignTemplate {
  switch (command.type) {
    case "MoveNode":
      return updateElement(document, command.id, (element) => ({ ...element, x: command.x, y: command.y }));
    case "ResizeNode":
      return updateElement(document, command.id, (element) => ({ ...element, x: command.x, y: command.y, width: command.width, height: command.height }));
    case "RotateNode":
      return updateElement(document, command.id, (element) => ({ ...element, rotation: command.rotation }));
    case "ChangeText":
      return updateElement(document, command.id, (element) => ({ ...element, content: command.content }));
    case "DuplicateNode": {
      if (document.elements.some((element) => element.id === command.element.id)) return document;
      return { ...document, elements: [...document.elements, { ...command.element }] };
    }
    case "DeleteNode": {
      const element = document.elements.find((item) => item.id === command.id);
      if (!element || element.locked) return document;
      return { ...document, elements: document.elements.filter((item) => item.id !== command.id) };
    }
    case "SetNodeVisibility":
      return updateElement(document, command.id, (element) => ({ ...element, visible: command.visible }), { allowLocked: true, allowHidden: true });
    case "SetNodeLocked":
      return updateElement(document, command.id, (element) => ({ ...element, locked: command.locked }), { allowLocked: true, allowHidden: true });
    case "ReorderNode":
      return updateElement(document, command.id, (element) => ({ ...element, zIndex: command.zIndex }), { allowLocked: true, allowHidden: true });
    case "RenameLayer":
      return updateElement(document, command.id, (element) => ({ ...element, data: { ...element.data, layerName: command.name } }), { allowLocked: true, allowHidden: true });
    case "SetElementProperties":
      return updateElement(document, command.id, (element) => ({ ...element, ...command.properties }));
    case "SetElementEffects": {
      if (validateDesignEffects(command.effects).length) return document;
      return updateElement(document, command.id, (element) => ({ ...element, effects: command.effects.map((effect) => ({ ...effect })) }));
    }
    case "ApplyTemplate":
      return JSON.stringify(document) === JSON.stringify(command.template) ? document : command.template;
  }
}

export function setElementEffectsCommand(id: string, effects: readonly DesignEffect[]): DesignCommand | null {
  return validateDesignEffects(effects).length ? null : { type: "SetElementEffects", id, effects: effects.map((effect) => ({ ...effect })) };
}

export function applyTransaction(template: DesignTemplate, commands: CommandBatch): DesignTemplate {
  if (!commands.length) return template;
  return commands.reduce(applyCommand, template);
}
