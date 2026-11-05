import { HistoryManager } from "./HistoryManager";
import type { DesignTemplate } from "../../types/designTemplate";

const makeTemplate = (id = "design", text = "Hello"): DesignTemplate => ({
  schemaVersion: 2,
  id,
  name: id,
  category: "test",
  description: "",
  tags: [],
  thumbnail: "",
  supportedFormats: ["portrait"],
  canvas: { width: 1080, height: 1350, unit: "px" },
  background: { color: "#fff" },
  branding: {},
  elements: [{ id: "headline", type: "Heading", x: 10, y: 20, width: 100, height: 30, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, content: text }],
  animations: [],
  metadata: {},
});

describe("HistoryManager", () => {
  it("records a transaction with patches and restores document plus selection", () => {
    const manager = new HistoryManager(20, () => 1234);
    const before = makeTemplate();
    const result = manager.dispatch(before, [
      { type: "MoveNode", id: "headline", x: 40, y: 50 },
      { type: "ResizeNode", id: "headline", x: 40, y: 50, width: 180, height: 60 },
      { type: "RotateNode", id: "headline", rotation: 15 },
      { type: "ChangeText", id: "headline", content: "Updated" },
    ], ["headline"], { source: "canvas", label: "Edit headline" });

    expect(result).not.toBeNull();
    expect(result?.transaction).toMatchObject({ id: "txn-1234-1", timestamp: 1234, label: "Edit headline", source: "canvas" });
    expect(result?.transaction.patches).toHaveLength(4);
    expect(result?.transaction.inversePatches).toHaveLength(4);
    expect(result?.document.elements[0]).toMatchObject({ x: 40, y: 50, width: 180, height: 60, rotation: 15, content: "Updated" });
    expect(before.elements[0]).toMatchObject({ x: 10, y: 20, width: 100, content: "Hello" });
    const undone = manager.undo(result!.document)!;
    expect(undone.document).toEqual(before);
    expect(undone.selection).toEqual(["headline"]);
    const redone = manager.redo(undone.document)!;
    expect(redone.document).toEqual(result!.document);
    expect(redone.selection).toEqual(["headline"]);
  });

  it("undoes and redoes duplicate, delete and apply-template commands", () => {
    const manager = new HistoryManager();
    const initial = makeTemplate();
    const duplicate = { ...initial.elements[0], id: "copy", x: 25 };
    const copied = manager.dispatch(initial, [{ type: "DuplicateNode", element: duplicate }], ["headline"])!;
    expect(copied.document.elements.map((node) => node.id)).toEqual(["headline", "copy"]);
    expect(copied.selection).toEqual(["copy"]);
    const copyUndo = manager.undo(copied.document)!;
    expect(copyUndo.document).toEqual(initial);
    expect(copyUndo.selection).toEqual(["headline"]);
    expect(manager.redo(copyUndo.document)?.document).toEqual(copied.document);

    const deleted = manager.dispatch(copied.document, [{ type: "DeleteNode", id: "headline" }], ["headline", "copy"])!;
    expect(deleted.document.elements.map((node) => node.id)).toEqual(["copy"]);
    expect(deleted.selection).toEqual(["copy"]);
    expect(manager.undo(deleted.document)?.document).toEqual(copied.document);

    const replacement = makeTemplate("replacement", "New");
    const applied = manager.dispatch(initial, [{ type: "ApplyTemplate", template: replacement }], ["headline"])!;
    expect(applied.document).toEqual(replacement);
    expect(applied.selection).toEqual([]);
    expect(manager.undo(applied.document)?.document).toEqual(initial);
    expect(manager.redo(initial)?.document).toEqual(replacement);
  });

  it("clears redo history after a new edit and ignores no-op commands", () => {
    const manager = new HistoryManager();
    const initial = makeTemplate();
    expect(manager.dispatch(initial, [{ type: "MoveNode", id: "missing", x: 1, y: 1 }])).toBeNull();
    const moved = manager.dispatch(initial, [{ type: "MoveNode", id: "headline", x: 15, y: 25 }])!;
    const undone = manager.undo(moved.document)!;
    expect(manager.canRedo).toBe(true);
    manager.dispatch(undone.document, [{ type: "ChangeText", id: "headline", content: "Another" }]);
    expect(manager.canRedo).toBe(false);
  });

  it("restores style, layer order, visibility, lock state, and selection as one transaction", () => {
    const manager = new HistoryManager();
    const original = makeTemplate();
    const second = { ...original.elements[0], id: "second", zIndex: 2 };
    const document = { ...original, elements: [...original.elements, second] };
    const result = manager.dispatch(document, [
      { type: "SetElementProperties", id: "headline", properties: { opacity: 0.4 } },
      { type: "ReorderNode", id: "headline", zIndex: 4 },
      { type: "SetNodeVisibility", id: "headline", visible: false },
      { type: "SetNodeLocked", id: "headline", locked: true },
    ], ["headline", "second"])!;
    expect(result.document.elements[0]).toMatchObject({ opacity: 0.4, zIndex: 4, visible: false, locked: true });
    const undone = manager.undo(result.document)!;
    expect(undone.document).toEqual(document);
    expect(undone.selection).toEqual(["headline", "second"]);
  });

  it("does not select a duplicate whose ID already exists in a mixed transaction", () => {
    const manager = new HistoryManager();
    const original = makeTemplate();
    const result = manager.dispatch(original, [
      { type: "DuplicateNode", element: original.elements[0] },
      { type: "ChangeText", id: "headline", content: "Changed" },
    ], ["headline"])!;
    expect(result.selection).toEqual(["headline"]);
    expect(result.document.elements).toHaveLength(1);
  });

  it("preserves selection for command-based legacy config updates", () => {
    const manager = new HistoryManager();
    const original = makeTemplate();
    const changed = { ...original, name: "Changed preset" };
    const result = manager.dispatch(original, [{ type: "ApplyTemplate", template: changed, preserveSelection: true }], ["headline"])!;
    expect(result.selection).toEqual(["headline"]);
    expect(manager.undo(result.document)?.selection).toEqual(["headline"]);
  });

  it("does not record net-zero command batches or identical template replacements", () => {
    const manager = new HistoryManager();
    const original = makeTemplate();
    expect(manager.dispatch(original, [
      { type: "MoveNode", id: "headline", x: 20, y: 20 },
      { type: "MoveNode", id: "headline", x: original.elements[0].x, y: original.elements[0].y },
    ])).toBeNull();
    expect(manager.dispatch(original, [{ type: "ApplyTemplate", template: JSON.parse(JSON.stringify(original)) }])).toBeNull();
    expect(manager.canUndo).toBe(false);
  });
});
