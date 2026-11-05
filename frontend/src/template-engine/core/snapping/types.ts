export interface SnapRect { x: number; y: number; width: number; height: number }
export interface SnapObject { id: string; rect: SnapRect }
export type SnapAxis = "x" | "y";
export type SnapKind = "canvas" | "grid" | "center" | "edge" | "object" | "safe-zone";

export interface SnapGuide {
  axis: SnapAxis;
  position: number;
  kind: SnapKind;
  targetId?: string;
  movingAnchor: "start" | "center" | "end";
  targetAnchor: "start" | "center" | "end" | "grid";
}

export interface SnapResult {
  /** Translation to apply to the moving rectangle, in the same units as the input geometry. */
  delta: { x: number; y: number };
  /** Alignment lines to display; the engine does not render these. */
  guides: SnapGuide[];
  /** Euclidean magnitude of delta, or zero when no candidate is within threshold. */
  distance: number;
}

export interface SnapSettings {
  canvas?: boolean;
  grid?: boolean;
  center?: boolean;
  edges?: boolean;
  objects?: boolean;
  safeZone?: boolean;
}

export interface SnapRequest {
  moving: SnapRect;
  canvas: { x?: number; y?: number; width: number; height: number };
  objects?: readonly SnapObject[];
  safeZones?: readonly SnapObject[];
  gridSize?: number | { x: number; y: number };
  threshold?: number;
  settings?: SnapSettings;
}
