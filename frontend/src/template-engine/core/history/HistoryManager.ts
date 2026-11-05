import { applyCommand, type CommandBatch, type DesignCommand } from "../commands";
import type { DesignTemplate } from "../../types/designTemplate";
import { RedoStack } from "./RedoStack";
import type { CommandTransaction, DocumentPatch, HistoryResult, TransactionOptions } from "./types";
import { UndoStack } from "./UndoStack";

function invertPatch(patch: DocumentPatch): DocumentPatch {
  switch (patch.type) {
    case "replace-element": return { ...patch, before: patch.after, after: patch.before };
    case "insert-element": return { type: "remove-element", index: patch.index, element: patch.element };
    case "remove-element": return { type: "insert-element", index: patch.index, element: patch.element };
    case "replace-document": return { type: "replace-document", before: patch.after, after: patch.before };
  }
}

function elementPatch(before: DesignTemplate, after: DesignTemplate, id: string): DocumentPatch | null {
  const previous = before.elements.find((element) => element.id === id);
  const next = after.elements.find((element) => element.id === id);
  if (!previous || !next || previous === next) return null;
  return { type: "replace-element", id, before: previous, after: next };
}

function commandPatch(before: DesignTemplate, after: DesignTemplate, command: DesignCommand): DocumentPatch | null {
  switch (command.type) {
    case "MoveNode":
    case "ResizeNode":
    case "RotateNode":
    case "ChangeText":
    case "SetNodeVisibility":
    case "SetNodeLocked":
    case "ReorderNode":
    case "RenameLayer":
    case "SetElementProperties":
    case "SetElementEffects":
      return elementPatch(before, after, command.id);
    case "DuplicateNode": {
      const index = after.elements.findIndex((element) => element.id === command.element.id);
      return index < 0 || before.elements.some((element) => element.id === command.element.id)
        ? null
        : { type: "insert-element", index, element: after.elements[index] };
    }
    case "DeleteNode": {
      const index = before.elements.findIndex((element) => element.id === command.id);
      return index < 0 || after.elements.some((element) => element.id === command.id)
        ? null
        : { type: "remove-element", index, element: before.elements[index] };
    }
    case "ApplyTemplate":
      return before === after ? null : { type: "replace-document", before, after };
  }
}

export function applyPatches(document: DesignTemplate, patches: readonly DocumentPatch[]): DesignTemplate {
  return patches.reduce((current, patch) => {
    switch (patch.type) {
      case "replace-element":
        return { ...current, elements: current.elements.map((element) => element.id === patch.id ? patch.after : element) };
      case "insert-element": {
        const elements = [...current.elements];
        elements.splice(Math.max(0, Math.min(patch.index, elements.length)), 0, patch.element);
        return { ...current, elements };
      }
      case "remove-element":
        return { ...current, elements: current.elements.filter((element) => element.id !== patch.element.id) };
      case "replace-document":
        return patch.after;
    }
  }, document);
}

function selectionAfter(commands: CommandBatch, before: readonly string[], after: DesignTemplate, patches: readonly DocumentPatch[]): string[] {
  const duplicated = patches.filter((patch) => patch.type === "insert-element").map((patch) => patch.element.id);
  if (duplicated.length) return duplicated;
  let selection = [...before];
  for (const command of commands) {
    if (command.type === "DeleteNode") selection = selection.filter((id) => id !== command.id);
    else if (command.type === "ApplyTemplate" && !command.preserveSelection) selection = [];
  }
  const existing = new Set(after.elements.map((element) => element.id));
  return selection.filter((id) => existing.has(id));
}

function defaultLabel(commands: CommandBatch): string {
  const types = [...new Set(commands.map((command) => command.type))];
  if (types.length === 1) {
    switch (types[0]) {
      case "MoveNode": return "Move node";
      case "ResizeNode": return "Resize node";
      case "RotateNode": return "Rotate node";
      case "ChangeText": return "Edit text";
      case "SetNodeVisibility": return "Change layer visibility";
      case "SetNodeLocked": return "Change layer lock";
      case "ReorderNode": return "Reorder layer";
      case "RenameLayer": return "Rename layer";
      case "SetElementProperties": return "Edit properties";
      case "SetElementEffects": return "Apply effects";
      case "DuplicateNode": return "Duplicate node";
      case "DeleteNode": return "Delete node";
      case "ApplyTemplate": return "Apply template";
    }
  }
  return "Edit design";
}

export class HistoryManager {
  readonly undoStack: UndoStack;
  readonly redoStack: RedoStack;
  private sequence = 0;

  constructor(limit = 200, private readonly now: () => number = Date.now) {
    this.undoStack = new UndoStack(limit);
    this.redoStack = new RedoStack(limit);
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  dispatch(
    document: DesignTemplate,
    commands: CommandBatch,
    selection: readonly string[] = [],
    options: TransactionOptions = {},
  ): HistoryResult | null {
    if (!commands.length) return null;
    let current = document;
    const patches: DocumentPatch[] = [];
    for (const command of commands) {
      const next = applyCommand(current, command);
      const patch = commandPatch(current, next, command);
      if (patch) patches.push(patch);
      current = next;
    }
    if (!patches.length) return null;
    // Normal canvas commands touch only a few elements. Comparing full documents
    // here makes every small edit scale with the entire canvas size.
    const hasChanges = patches.some((patch) => {
      if (patch.type === "replace-element") return JSON.stringify(patch.before) !== JSON.stringify(patch.after);
      if (patch.type === "replace-document") return JSON.stringify(patch.before) !== JSON.stringify(patch.after);
      return true;
    });
    if (!hasChanges) return null;
    const timestamp = this.now();
    const transaction: CommandTransaction = {
      id: `txn-${timestamp}-${++this.sequence}`,
      timestamp,
      label: options.label || defaultLabel(commands),
      patches,
      inversePatches: [...patches].reverse().map(invertPatch),
      selectionBefore: [...selection],
      selectionAfter: selectionAfter(commands, selection, current, patches),
      source: options.source || "canvas",
      commands: [...commands],
    };
    this.undoStack.push(transaction);
    this.redoStack.clear();
    return { document: current, selection: [...transaction.selectionAfter], transaction };
  }

  undo(document: DesignTemplate): HistoryResult | null {
    const transaction = this.undoStack.pop();
    if (!transaction) return null;
    this.redoStack.push(transaction);
    return { document: applyPatches(document, transaction.inversePatches), selection: [...transaction.selectionBefore], transaction };
  }

  redo(document: DesignTemplate): HistoryResult | null {
    const transaction = this.redoStack.pop();
    if (!transaction) return null;
    this.undoStack.push(transaction);
    return { document: applyPatches(document, transaction.patches), selection: [...transaction.selectionAfter], transaction };
  }

  clear(): void {
    this.undoStack.clear();
    this.redoStack.clear();
    this.sequence = 0;
  }
}
