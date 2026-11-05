import { getSnapResult } from "./SnapEngine";
import type { SnapRequest } from "./types";

const base: SnapRequest = {
  moving: { x: 101, y: 95, width: 20, height: 20 },
  canvas: { width: 100, height: 100 },
  settings: { grid: false, center: false, edges: false, objects: false, safeZone: false },
  threshold: 5,
};

describe("renderer-independent SnapEngine", () => {
  it("snaps moving edges to canvas boundaries", () => {
    const result = getSnapResult({ ...base, moving: { ...base.moving, y: 70 }, settings: { ...base.settings, canvas: true } });
    expect(result.delta).toEqual({ x: -1, y: 0 });
    expect(result.guides).toEqual([expect.objectContaining({ axis: "x", position: 100, kind: "canvas" })]);
    expect(result.distance).toBe(1);
  });

  it("snaps matching object edges to canvas boundaries", () => {
    const result = getSnapResult({ ...base, moving: { x: 2, y: 2, width: 20, height: 20 }, settings: { ...base.settings, edges: true } });
    expect(result.delta).toEqual({ x: -2, y: -2 });
    expect(result.guides).toEqual(expect.arrayContaining([
      expect.objectContaining({ axis: "x", kind: "canvas", position: 0 }),
      expect.objectContaining({ axis: "y", kind: "canvas", position: 0 }),
    ]));
  });

  it("snaps to canvas centers and the grid", () => {
    const centered = getSnapResult({ ...base, moving: { x: 45, y: 44, width: 20, height: 20 }, settings: { ...base.settings, center: true } });
    expect(centered.delta).toEqual({ x: -5, y: -4 });
    expect(centered.guides.every((guide) => guide.kind === "center")).toBe(true);

    const grid = getSnapResult({ ...base, moving: { x: 23, y: 36, width: 20, height: 20 }, gridSize: 10, threshold: 5, settings: { ...base.settings, grid: true } });
    expect(grid.delta).toEqual({ x: -3, y: 4 });
    expect(grid.guides.every((guide) => guide.kind === "grid")).toBe(true);
  });

  it("snaps object edges and object alignment anchors", () => {
    const edge = getSnapResult({ ...base, moving: { x: 32, y: 15, width: 10, height: 10 }, objects: [{ id: "card", rect: { x: 10, y: 10, width: 20, height: 20 } }], settings: { ...base.settings, edges: true } });
    expect(edge.delta.x).toBe(-2);
    expect(edge.guides).toContainEqual(expect.objectContaining({ axis: "x", kind: "edge", targetId: "card", position: 30 }));

    const object = getSnapResult({ ...base, moving: { x: 31, y: 31, width: 10, height: 10 }, objects: [{ id: "card", rect: { x: 10, y: 10, width: 20, height: 20 } }], settings: { ...base.settings, objects: true } });
    expect(object.delta).toEqual({ x: -1, y: -1 });
    expect(object.guides.every((guide) => guide.kind === "object" && guide.targetId === "card")).toBe(true);
  });

  it("snaps to safe zone boundaries without changing input geometry", () => {
    const moving = { x: 17, y: 19, width: 10, height: 10 };
    const result = getSnapResult({ ...base, moving, safeZones: [{ id: "instagram-safe", rect: { x: 20, y: 20, width: 60, height: 60 } }], settings: { ...base.settings, safeZone: true } });
    expect(result.delta).toEqual({ x: 3, y: 1 });
    expect(result.guides.every((guide) => guide.kind === "safe-zone")).toBe(true);
    expect(moving).toEqual({ x: 17, y: 19, width: 10, height: 10 });
  });

  it("returns zero delta and distance when every candidate is out of range or disabled", () => {
    expect(getSnapResult({ ...base, moving: { x: 40, y: 40, width: 10, height: 10 } })).toEqual({ delta: { x: 0, y: 0 }, guides: [], distance: 0 });
    expect(getSnapResult({ ...base, settings: { canvas: false, grid: false, center: false, edges: false, objects: false, safeZone: false } })).toEqual({ delta: { x: 0, y: 0 }, guides: [], distance: 0 });
  });
});
