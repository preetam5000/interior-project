import type { SnapAxis, SnapGuide, SnapKind, SnapObject, SnapRect, SnapRequest, SnapResult } from "./types";

interface Candidate { delta: number; distance: number; guide: SnapGuide }
type Anchor = "start" | "center" | "end";

function anchors(rect: SnapRect, axis: SnapAxis): Record<Anchor, number> {
  const start = axis === "x" ? rect.x : rect.y;
  const size = axis === "x" ? rect.width : rect.height;
  return { start, center: start + size / 2, end: start + size };
}

function enabled(request: SnapRequest, key: keyof NonNullable<SnapRequest["settings"]>): boolean {
  return request.settings?.[key] !== false;
}

function appendPairCandidates(
  candidates: Candidate[], moving: SnapRect, target: SnapRect, axis: SnapAxis,
  kind: SnapKind, threshold: number, targetId?: string,
  movingAnchors: Anchor[] = ["start", "center", "end"], targetAnchors: Anchor[] = ["start", "center", "end"],
): void {
  const from = anchors(moving, axis);
  const to = anchors(target, axis);
  for (const movingAnchor of movingAnchors) for (const targetAnchor of targetAnchors) {
    const delta = to[targetAnchor] - from[movingAnchor];
    const distance = Math.abs(delta);
    if (distance > threshold) continue;
    candidates.push({ delta, distance, guide: { axis, position: to[targetAnchor], kind, targetId, movingAnchor, targetAnchor } });
  }
}

function bestCandidate(candidates: Candidate[]): Candidate | null {
  return candidates.reduce<Candidate | null>((best, candidate) => !best || candidate.distance < best.distance ? candidate : best, null);
}

function axisCandidates(request: SnapRequest, axis: SnapAxis, threshold: number): Candidate[] {
  const moving = request.moving;
  const originX = request.canvas.x || 0;
  const originY = request.canvas.y || 0;
  const canvasRect = { x: originX, y: originY, width: request.canvas.width, height: request.canvas.height };
  const candidates: Candidate[] = [];

  if (enabled(request, "canvas")) {
    appendPairCandidates(candidates, moving, canvasRect, axis, "canvas", threshold,
      undefined, ["start", "end"], ["start", "end"]);
  }
  if (enabled(request, "center")) {
    appendPairCandidates(candidates, moving, canvasRect, axis, "center", threshold,
      undefined, ["center"], ["center"]);
  }
  if (enabled(request, "edges")) {
    for (const target of [
      { id: undefined, rect: canvasRect, canvas: true },
      ...(request.objects || []).map((object) => ({ id: object.id, rect: object.rect, canvas: false })),
    ]) {
      // Opposing edges align objects side-by-side or against the far canvas edge.
      appendPairCandidates(candidates, moving, target.rect, axis, "edge", threshold, target.id,
        ["start", "end"], ["end", "start"]);
      // Also align matching edges, including the moving edge with the canvas boundary.
      if (target.canvas) {
        appendPairCandidates(candidates, moving, target.rect, axis, "canvas", threshold,
          undefined, ["start", "end"], ["start", "end"]);
      } else {
        appendPairCandidates(candidates, moving, target.rect, axis, "edge", threshold, target.id,
          ["start", "end"], ["start", "end"]);
      }
    }
  }
  if (enabled(request, "objects")) {
    for (const object of request.objects || []) {
      appendPairCandidates(candidates, moving, object.rect, axis, "object", threshold, object.id);
    }
  }
  if (enabled(request, "safeZone")) {
    for (const zone of request.safeZones || []) {
      appendPairCandidates(candidates, moving, zone.rect, axis, "safe-zone", threshold, zone.id,
        ["start", "end"], ["start", "end"]);
    }
  }
  if (enabled(request, "grid") && request.gridSize) {
    const spacing = typeof request.gridSize === "number" ? request.gridSize : request.gridSize[axis];
    if (Number.isFinite(spacing) && spacing > 0) {
      const offset = axis === "x" ? originX : originY;
      const values = anchors(moving, axis);
      for (const movingAnchor of ["start", "center", "end"] as const) {
        const position = offset + Math.round((values[movingAnchor] - offset) / spacing) * spacing;
        const delta = position - values[movingAnchor];
        const distance = Math.abs(delta);
        if (distance <= threshold) candidates.push({ delta, distance, guide: { axis, position, kind: "grid", movingAnchor, targetAnchor: "grid" } });
      }
    }
  }
  return candidates;
}

/** Computes nearest independent x/y snap adjustments without mutating input geometry. */
export function getSnapResult(request: SnapRequest): SnapResult {
  const threshold = Math.max(0, request.threshold ?? 8);
  const x = bestCandidate(axisCandidates(request, "x", threshold));
  const y = bestCandidate(axisCandidates(request, "y", threshold));
  const deltaX = x?.delta || 0;
  const deltaY = y?.delta || 0;
  return { delta: { x: deltaX, y: deltaY }, guides: [x?.guide, y?.guide].filter((guide): guide is SnapGuide => Boolean(guide)), distance: Math.hypot(deltaX, deltaY) };
}

export const snapPosition = getSnapResult;
export type { SnapAxis, SnapGuide, SnapKind, SnapObject, SnapRect, SnapRequest, SnapResult, SnapSettings } from "./types";
