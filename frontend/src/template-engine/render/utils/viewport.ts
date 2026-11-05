import type { Viewport } from "./coordinates";
export function zoomAt(viewport: Viewport, pointer: { x: number; y: number }, scale: number): Viewport {
  const worldX = (pointer.x - viewport.x) / viewport.scale;
  const worldY = (pointer.y - viewport.y) / viewport.scale;
  return { scale, x: pointer.x - worldX * scale, y: pointer.y - worldY * scale };
}
export function fitViewport(width: number, height: number, viewWidth: number, viewHeight: number, padding = 32): Viewport {
  const scale = Math.min((viewWidth - padding * 2) / width, (viewHeight - padding * 2) / height);
  return { scale, x: (viewWidth - width * scale) / 2, y: (viewHeight - height * scale) / 2 };
}
