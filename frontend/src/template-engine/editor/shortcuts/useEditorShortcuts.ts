import { useCallback, useRef } from "react";
import { createKeybindingRegistry, type KeyboardInput, type KeybindingRegistry, type ShortcutAction } from "../../core/keybindings";
import { layerOrderCommands } from "../../core/layers";
import type { DesignCommand } from "../../core/commands";
import type { DesignElement, DesignTemplate } from "../../types/designTemplate";

interface ShortcutOptions {
  template: DesignTemplate | null;
  selectedIds: readonly string[];
  dispatch: (commands: readonly DesignCommand[]) => void;
  replaceSelection: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
}

function newElementId(sourceId: string, elements: readonly DesignElement[]): string {
  const token = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  const id = `${sourceId}-copy-${token}`;
  return elements.some((element) => element.id === id) ? newElementId(sourceId, elements) : id;
}

function duplicateCommands(template: DesignTemplate, originals: readonly DesignElement[]): DesignCommand[] {
  const occupied: DesignElement[] = [...template.elements];
  let zIndex = Math.max(-1, ...occupied.map((element) => element.zIndex));
  return originals.filter((element) => !element.locked).map((element) => {
    const duplicate: DesignElement = {
      ...element,
      id: newElementId(element.id, occupied),
      x: Math.min(1 - element.width, element.x + 0.02),
      y: Math.min(1 - element.height, element.y + 0.02),
      zIndex: ++zIndex,
      locked: false,
    };
    occupied.push(duplicate);
    return { type: "DuplicateNode", element: duplicate };
  });
}

export function useEditorShortcuts(options: ShortcutOptions): {
  handleInput: (input: KeyboardInput) => boolean;
  registry: KeybindingRegistry;
  registerAction: (action: string, handler: (input: KeyboardInput) => boolean) => () => void;
} {
  const latest = useRef(options);
  latest.current = options;
  const registryRef = useRef<KeybindingRegistry | null>(null);
  if (!registryRef.current) registryRef.current = createKeybindingRegistry();
  const clipboard = useRef<DesignElement[]>([]);
  const actionHandlers = useRef(new Map<string, (input: KeyboardInput) => boolean>());

  const registerAction = useCallback((action: string, handler: (input: KeyboardInput) => boolean) => {
    actionHandlers.current.set(action, handler);
    return () => { if (actionHandlers.current.get(action) === handler) actionHandlers.current.delete(action); };
  }, []);

  const handleInput = useCallback((input: KeyboardInput) => {
    const state = latest.current;
    const action = registryRef.current?.resolve(input) as ShortcutAction | null;
    if (!action) return false;
    const extensionHandler = actionHandlers.current.get(action);
    if (extensionHandler) return extensionHandler(input);
    const template = state.template;
    const selected = template ? state.selectedIds.flatMap((id) => template.elements.filter((element) => element.id === id)) : [];

    if (action === "undo") { state.undo(); return true; }
    if (action === "redo") { state.redo(); return true; }
    if (action === "select-all") {
      state.replaceSelection(template?.elements.filter((element) => element.visible).map((element) => element.id) || []);
      return true;
    }
    if (action === "clear-selection") { state.replaceSelection([]); return true; }
    if (action === "copy") {
      clipboard.current = selected.map((element) => ({ ...element }));
      return true;
    }
    if (action === "paste") {
      if (!template || !clipboard.current.length) return true;
      state.dispatch(duplicateCommands(template, clipboard.current));
      return true;
    }
    if (action === "duplicate") {
      if (!template || !selected.length) return true;
      state.dispatch(duplicateCommands(template, selected));
      return true;
    }
    if (action === "delete") {
      state.dispatch(selected.filter((element) => !element.locked).map((element) => ({ type: "DeleteNode" as const, id: element.id })));
      return true;
    }
    if (action.startsWith("move-") && template) {
      const step = input.shiftKey ? 10 : 1;
      const dx = action === "move-left" ? -step : action === "move-right" ? step : 0;
      const dy = action === "move-up" ? -step : action === "move-down" ? step : 0;
      state.dispatch(selected.filter((element) => element.visible && !element.locked).map((element) => ({
        type: "MoveNode" as const,
        id: element.id,
        x: Math.max(0, Math.min(1 - element.width, element.x + dx / template.canvas.width)),
        y: Math.max(0, Math.min(1 - element.height, element.y + dy / template.canvas.height)),
      })));
      return true;
    }
    if ((action === "bring-forward" || action === "send-backward" || action === "bring-to-front" || action === "send-to-back") && template) {
      const id = state.selectedIds[state.selectedIds.length - 1];
      if (!id) return true;
      const orderAction = action === "bring-forward" ? "forward" : action === "send-backward" ? "backward" : action === "bring-to-front" ? "front" : "back";
      state.dispatch(layerOrderCommands(template.elements, id, orderAction));
      return true;
    }
    return false;
  }, []);

  return { handleInput, registry: registryRef.current, registerAction };
}
