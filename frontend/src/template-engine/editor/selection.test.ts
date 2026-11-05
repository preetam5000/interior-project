import { marqueeSelection, replaceSelection, selectElement } from "./selection";

describe("editor selection", () => {
  const order = ["a", "b", "c", "d"];
  it("supports single click and shift range selection from the anchor", () => {
    const first = selectElement({ selectedIds: [], anchorId: null }, "b", order);
    expect(first).toEqual({ selectedIds: ["b"], anchorId: "b" });
    expect(selectElement(first, "d", order, { ctrlKey: false, metaKey: false, shiftKey: true })).toEqual({ selectedIds: ["b", "c", "d"], anchorId: "b" });
  });

  it.each(["ctrlKey", "metaKey"] as const)("toggles items with %s", (modifier) => {
    const selected = { selectedIds: ["a", "c"], anchorId: "a" };
    expect(selectElement(selected, "b", order, { ctrlKey: modifier === "ctrlKey", metaKey: modifier === "metaKey", shiftKey: false })).toEqual({ selectedIds: ["a", "c", "b"], anchorId: "b" });
    expect(selectElement({ selectedIds: ["a", "b"], anchorId: "b" }, "b", order, { ctrlKey: modifier === "ctrlKey", metaKey: modifier === "metaKey", shiftKey: false })).toEqual({ selectedIds: ["a"], anchorId: "b" });
  });

  it("clears selection and marquee-selects only visible intersecting elements", () => {
    expect(selectElement({ selectedIds: ["a"], anchorId: "a" }, null, order)).toEqual({ selectedIds: [], anchorId: null });
    const elements = [
      { id: "a", visible: true, x: 0, y: 0, width: 10, height: 10 },
      { id: "b", visible: true, x: 40, y: 30, width: 10, height: 10 },
      { id: "hidden", visible: false, x: 2, y: 2, width: 8, height: 8 },
    ];
    expect(marqueeSelection(elements, { x: 45, y: 40, width: -50, height: -50 }, (element) => element)).toEqual(["a", "b"]);
    expect(elements.map(({ id }) => id)).toEqual(["a", "b", "hidden"]);
  });

  it("replaces the selection with all supplied visible ids for Select All", () => {
    const visibleIds = ["a", "b", "c"];
    expect(replaceSelection(visibleIds)).toEqual({ selectedIds: ["a", "b", "c"], anchorId: "c" });
    expect(visibleIds).toEqual(["a", "b", "c"]);
  });
});
