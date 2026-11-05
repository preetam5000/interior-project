import type { DesignCommand } from "../commands";
import type { DesignElement, DesignTemplate } from "../../types/designTemplate";

export type DocumentPatch =
  | { type: "replace-element"; id: string; before: DesignElement; after: DesignElement }
  | { type: "insert-element"; index: number; element: DesignElement }
  | { type: "remove-element"; index: number; element: DesignElement }
  | { type: "replace-document"; before: DesignTemplate; after: DesignTemplate };

export type TransactionSource = "canvas" | "template-editor" | "keyboard" | "system" | (string & {});

export interface CommandTransaction {
  id: string;
  timestamp: number;
  label: string;
  patches: readonly DocumentPatch[];
  inversePatches: readonly DocumentPatch[];
  selectionBefore: readonly string[];
  selectionAfter: readonly string[];
  source: TransactionSource;
  commands: readonly DesignCommand[];
}

export interface TransactionOptions {
  label?: string;
  source?: TransactionSource;
}

export interface HistoryResult {
  document: DesignTemplate;
  selection: string[];
  transaction: CommandTransaction;
}
