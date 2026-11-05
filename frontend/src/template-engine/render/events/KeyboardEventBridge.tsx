import { useEffect, useRef } from "react";
import type { KeyboardInput } from "../../core/keybindings";

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function toKeyboardInput(event: KeyboardEvent): KeyboardInput {
  return {
    key: event.key,
    code: event.code,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    editableTarget: isEditableTarget(event.target),
    repeat: event.repeat,
  };
}

/** DOM-only adapter. Key matching and action resolution stay renderer independent. */
export default function KeyboardEventBridge({ onInput }: { onInput: (input: KeyboardInput) => boolean }) {
  const latest = useRef(onInput);
  latest.current = onInput;
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const active = document.activeElement instanceof Element ? document.activeElement : null;
      if (!target?.closest("[data-design-canvas-surface]") && !active?.closest("[data-design-canvas-surface]")) return;
      if (latest.current(toKeyboardInput(event))) event.preventDefault();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  return null;
}
