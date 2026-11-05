import { applyCommand, applyTransaction } from "./commands";
import type { DesignTemplate } from "../types/designTemplate";

const makeDocument = (): DesignTemplate => ({
  schemaVersion: 2, id: "doc", name: "Doc", category: "test", description: "", tags: [], thumbnail: "",
  supportedFormats: ["portrait"], canvas: { width: 1000, height: 1000, unit: "px" }, background: { color: "#fff" },
  branding: {}, animations: [], metadata: {},
  elements: [
    { id: "a", type: "Text", x: 0.1, y: 0.1, width: 0.2, height: 0.1, rotation: 0, opacity: 1, zIndex: 0, visible: true, locked: false, content: "A" },
    { id: "b", type: "Shape", x: 0.4, y: 0.4, width: 0.2, height: 0.2, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false },
  ],
});

describe("document command integrity", () => {
  it("applies edits immutably and updates every supported node property", () => {
    const source = makeDocument();
    const next = applyTransaction(source, [
      { type: "MoveNode", id: "a", x: 0.15, y: 0.2 },
      { type: "ResizeNode", id: "a", x: 0.15, y: 0.2, width: 0.3, height: 0.15 },
      { type: "RotateNode", id: "a", rotation: 30 },
      { type: "ChangeText", id: "a", content: "Edited" },
      { type: "SetElementProperties", id: "a", properties: { opacity: 0.5, color: "#123456" } },
      { type: "RenameLayer", id: "a", name: "Headline" },
      { type: "ReorderNode", id: "a", zIndex: 2 },
      { type: "SetNodeVisibility", id: "a", visible: false },
      { type: "SetNodeLocked", id: "a", locked: true },
    ]);
    expect(next).not.toBe(source);
    expect(next.elements[0]).toMatchObject({ x: 0.15, y: 0.2, width: 0.3, height: 0.15, rotation: 30, content: "Edited", opacity: 0.5, color: "#123456", zIndex: 2, visible: false, locked: true, data: { layerName: "Headline" } });
    expect(source.elements[0]).toMatchObject({ x: 0.1, content: "A", visible: true, locked: false });
  });

  it("guards locked or hidden geometry edits while allowing layer controls", () => {
    const source = makeDocument();
    const locked = applyCommand(source, { type: "SetNodeLocked", id: "a", locked: true });
    expect(applyCommand(locked, { type: "MoveNode", id: "a", x: 0.8, y: 0.8 })).toBe(locked);
    const hidden = applyCommand(source, { type: "SetNodeVisibility", id: "a", visible: false });
    expect(applyCommand(hidden, { type: "ChangeText", id: "a", content: "No" })).toBe(hidden);
    expect(applyCommand(hidden, { type: "SetNodeVisibility", id: "a", visible: true }).elements[0].visible).toBe(true);
  });

  it("returns the original document for no-op updates", () => {
    const source = makeDocument();
    expect(applyCommand(source, { type: "MoveNode", id: "a", x: 0.1, y: 0.1 })).toBe(source);
    expect(applyCommand(source, { type: "SetNodeVisibility", id: "a", visible: true })).toBe(source);
    expect(applyCommand(source, { type: "ReorderNode", id: "a", zIndex: 0 })).toBe(source);
    expect(applyCommand(source, { type: "SetElementProperties", id: "a", properties: { opacity: 1 } })).toBe(source);
  });
});
