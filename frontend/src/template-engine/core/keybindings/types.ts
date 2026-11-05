export type ShortcutAction =
  | "undo" | "redo" | "copy" | "paste" | "duplicate" | "delete"
  | "move-up" | "move-down" | "move-left" | "move-right"
  | "select-all" | "clear-selection"
  | "bring-forward" | "send-backward" | "bring-to-front" | "send-to-back"
  | (string & {});

export interface KeyboardInput {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  editableTarget?: boolean;
  repeat?: boolean;
}

export interface Keybinding {
  action: ShortcutAction;
  key: string;
  code?: string;
  primary?: boolean;
  shift?: boolean;
  alt?: boolean;
}
