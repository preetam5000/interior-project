import type { Keybinding, KeyboardInput, ShortcutAction } from "./types";

const DEFAULT_BINDINGS: Keybinding[] = [
  { action: "undo", key: "z", primary: true },
  { action: "redo", key: "z", primary: true, shift: true },
  { action: "redo", key: "y", primary: true },
  { action: "copy", key: "c", primary: true },
  { action: "paste", key: "v", primary: true },
  { action: "duplicate", key: "d", primary: true },
  { action: "delete", key: "delete" },
  { action: "delete", key: "backspace" },
  { action: "move-left", key: "arrowleft" },
  { action: "move-left", key: "arrowleft", shift: true },
  { action: "move-right", key: "arrowright" },
  { action: "move-right", key: "arrowright", shift: true },
  { action: "move-up", key: "arrowup" },
  { action: "move-up", key: "arrowup", shift: true },
  { action: "move-down", key: "arrowdown" },
  { action: "move-down", key: "arrowdown", shift: true },
  { action: "select-all", key: "a", primary: true },
  { action: "clear-selection", key: "escape" },
  { action: "bring-forward", key: "]", code: "BracketRight", primary: true },
  { action: "send-backward", key: "[", code: "BracketLeft", primary: true },
  { action: "bring-to-front", key: "]", code: "BracketRight", primary: true, shift: true },
  { action: "send-to-back", key: "[", code: "BracketLeft", primary: true, shift: true },
];

function matches(binding: Keybinding, input: KeyboardInput): boolean {
  const primary = Boolean(input.ctrlKey || input.metaKey);
  const keyMatches = (binding.code && input.code) ? binding.code === input.code : binding.key.toLowerCase() === input.key.toLowerCase();
  return keyMatches
    && primary === Boolean(binding.primary)
    && Boolean(input.shiftKey) === Boolean(binding.shift)
    && Boolean(input.altKey) === Boolean(binding.alt);
}

export class KeybindingRegistry {
  private bindings: Array<{ id: number; binding: Keybinding }> = [];
  private nextId = 0;

  constructor(includeDefaults = true) {
    if (includeDefaults) for (const binding of DEFAULT_BINDINGS) this.register(binding);
  }

  register(binding: Keybinding): () => void {
    const entry = { id: ++this.nextId, binding: { ...binding } };
    this.bindings.push(entry);
    return () => { this.bindings = this.bindings.filter((candidate) => candidate.id !== entry.id); };
  }

  resolve(input: KeyboardInput): ShortcutAction | null {
    if (input.editableTarget) return null;
    for (let index = this.bindings.length - 1; index >= 0; index -= 1) {
      if (matches(this.bindings[index].binding, input)) return this.bindings[index].binding.action;
    }
    return null;
  }

  getRegisteredBindings(): readonly Keybinding[] { return this.bindings.map(({ binding }) => ({ ...binding })); }
}

export function createKeybindingRegistry(): KeybindingRegistry { return new KeybindingRegistry(); }
