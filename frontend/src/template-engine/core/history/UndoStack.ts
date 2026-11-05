import type { CommandTransaction } from "./types";

export class UndoStack {
  private readonly entries: CommandTransaction[] = [];
  constructor(private readonly limit = 200) {}
  push(transaction: CommandTransaction): void {
    this.entries.push(transaction);
    if (this.entries.length > this.limit) this.entries.shift();
  }
  pop(): CommandTransaction | undefined { return this.entries.pop(); }
  clear(): void { this.entries.length = 0; }
  get length(): number { return this.entries.length; }
}
