import { applyTransaction, type DesignCommand } from "../commands";
import { buildLayerTree, layerOrderCommands, nestLayerNodes, reorderLayerCommands } from "./index";
import { HistoryManager } from "../history";
import type { DesignTemplate } from "../../types/designTemplate";
import type { LayerNode } from "./types";

const template: DesignTemplate = {
  schemaVersion: 2,
  id: "layers-test",
  name: "Layers test",
  category: "test",
  description: "",
  tags: [],
  thumbnail: "",
  supportedFormats: ["portrait"],
  canvas: { width: 100, height: 100, unit: "px" },
  background: {},
  branding: {},
  elements: [
    { id: "back", type: "Shape", x: 0, y: 0, width: 0.5, height: 0.5, rotation: 0, opacity: 1, zIndex: 0, visible: true, locked: false },
    { id: "front", type: "Heading", x: 0.1, y: 0.1, width: 0.4, height: 0.2, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, content: "Title", data: { layerName: "Hero headline" } },
    { id: "hidden", type: "Image", x: 0.2, y: 0.2, width: 0.2, height: 0.2, rotation: 0, opacity: 1, zIndex: 2, visible: false, locked: true },
  ],
  animations: [],
  metadata: {},
};

describe("core layer tree", () => {
  it("builds a top-first editor representation without mutating the document", () => {
    const tree = buildLayerTree(template, { selectedIds: ["front"], expandedIds: ["front"] });
    expect(tree.map((node) => node.id)).toEqual(["hidden", "front", "back"]);
    expect(tree[1]).toMatchObject({ name: "Hero headline", parentId: null, selected: true, expanded: true, children: [] });
    expect(tree[0]).toMatchObject({ visible: false, locked: true });
    expect(template.elements).toHaveLength(3);
    expect(template.elements[1].zIndex).toBe(1);
  });

  it("supports nested groups and frames in the editor tree architecture", () => {
    const node = (id: string, parentId: string | null, type: LayerNode["type"]): LayerNode => ({ id, parentId, type, name: id, visible: true, locked: false, expanded: true, selected: false, zIndex: 0, children: [] });
    const tree = nestLayerNodes([node("group", null, "Group"), node("frame", "group", "Frame"), node("child", "frame", "Text")]);
    expect(tree[0].children[0].children[0].id).toBe("child");
    expect(tree[0].children[0].parentId).toBe("group");
  });

  it("returns reorder commands and applies them without mutating the source", () => {
    const commands = reorderLayerCommands(template.elements, "back", "front", "before");
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((command) => command.type === "ReorderNode")).toBe(true);
    const reordered = applyTransaction(template, commands);
    expect([...reordered.elements].sort((a, b) => b.zIndex - a.zIndex).map((element) => element.id)).toEqual(["hidden", "back", "front"]);
    expect(template.elements.map((element) => element.zIndex)).toEqual([0, 1, 2]);
  });

  it("supports forward, backward, front and back ordering commands", () => {
    const assertFrontOrder = (commands: DesignCommand[], expected: string[]) => {
      const result = applyTransaction(template, commands);
      expect([...result.elements].sort((a, b) => b.zIndex - a.zIndex).map((element) => element.id)).toEqual(expected);
    };
    assertFrontOrder(layerOrderCommands(template.elements, "back", "forward"), ["hidden", "back", "front"]);
    assertFrontOrder(layerOrderCommands(template.elements, "front", "backward"), ["hidden", "back", "front"]);
    assertFrontOrder(layerOrderCommands(template.elements, "back", "front"), ["back", "hidden", "front"]);
    assertFrontOrder(layerOrderCommands(template.elements, "hidden", "back"), ["front", "back", "hidden"]);
  });

  it("routes rename, visibility and lock operations through undoable commands", () => {
    const manager = new HistoryManager();
    const result = manager.dispatch(template, [
      { type: "RenameLayer", id: "back", name: "Background shape" },
      { type: "SetNodeVisibility", id: "back", visible: false },
      { type: "SetNodeLocked", id: "back", locked: true },
    ], ["back"], { source: "template-editor" });
    expect(result?.document.elements[0]).toMatchObject({ visible: false, locked: true, data: { layerName: "Background shape" } });
    expect(manager.undo(result!.document)?.document).toEqual(template);
    expect(manager.redo(template)?.document).toEqual(result?.document);
  });
});
