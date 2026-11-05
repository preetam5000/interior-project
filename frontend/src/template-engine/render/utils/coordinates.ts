export interface Point { x: number; y: number }
export interface Viewport { x: number; y: number; scale: number }
export const worldToScreen = (point: Point, viewport: Viewport): Point => ({ x: point.x * viewport.scale + viewport.x, y: point.y * viewport.scale + viewport.y });
export const screenToWorld = (point: Point, viewport: Viewport): Point => ({ x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale });
export const snapPosition = (point: Point, grid = 1): Point => ({ x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid });
export const viewportTransform = (viewport: Viewport) => ({ x: viewport.x, y: viewport.y, scaleX: viewport.scale, scaleY: viewport.scale });
