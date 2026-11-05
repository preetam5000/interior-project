import { useCallback } from "react";
import type { DesignCommand, CommandBatch } from "../../core/commands";
export function useCanvas(onTransaction?: (transaction: CommandBatch) => void) {
 return {
  commit: useCallback((command: DesignCommand) => onTransaction?.([command]), [onTransaction]),
  commitTransaction: useCallback((transaction: CommandBatch) => { if (transaction.length) onTransaction?.(transaction); }, [onTransaction]),
 };
}
