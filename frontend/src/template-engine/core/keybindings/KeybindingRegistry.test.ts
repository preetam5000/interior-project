import { createKeybindingRegistry, KeybindingRegistry } from "./KeybindingRegistry";
import type { KeyboardInput } from "./types";

const input = (key: string, extras: Partial<KeyboardInput> = {}): KeyboardInput => ({ key, ...extras });

describe("renderer-independent keybindings", () => {
  it.each([
    [input("z", { ctrlKey: true }), "undo"],
    [input("z", { metaKey: true, shiftKey: true }), "redo"],
    [input("y", { ctrlKey: true }), "redo"],
    [input("c", { metaKey: true }), "copy"],
    [input("v", { ctrlKey: true }), "paste"],
    [input("d", { ctrlKey: true }), "duplicate"],
    [input("Delete"), "delete"],
    [input("Backspace"), "delete"],
    [input("ArrowLeft"), "move-left"],
    [input("ArrowRight", { shiftKey: true }), "move-right"],
    [input("ArrowUp"), "move-up"],
    [input("ArrowDown", { shiftKey: true }), "move-down"],
    [input("a", { ctrlKey: true }), "select-all"],
    [input("Escape"), "clear-selection"],
    [input("]", { ctrlKey: true, code: "BracketRight" }), "bring-forward"],
    [input("[", { ctrlKey: true, code: "BracketLeft" }), "send-backward"],
    [input("}", { ctrlKey: true, shiftKey: true, code: "BracketRight" }), "bring-to-front"],
    [input("{", { ctrlKey: true, shiftKey: true, code: "BracketLeft" }), "send-to-back"],
  ] as const)("resolves %s", (keyInput, action) => {
    expect(createKeybindingRegistry().resolve(keyInput)).toBe(action);
  });

  it("does not resolve shortcuts in editable targets or for unrelated modifiers", () => {
    const registry = createKeybindingRegistry();
    expect(registry.resolve(input("z", { ctrlKey: true, editableTarget: true }))).toBeNull();
    expect(registry.resolve(input("z", { ctrlKey: true, altKey: true }))).toBeNull();
    expect(registry.resolve(input("ArrowLeft", { ctrlKey: true }))).toBeNull();
  });

  it("allows later shortcut registration and unregistering without renderer dependencies", () => {
    const registry = new KeybindingRegistry(false);
    const unregister = registry.register({ action: "plugin:open-library", key: "q", primary: true });
    expect(registry.resolve(input("q", { metaKey: true }))).toBe("plugin:open-library");
    expect(registry.getRegisteredBindings()).toHaveLength(1);
    unregister();
    expect(registry.resolve(input("q", { metaKey: true }))).toBeNull();
  });
});
