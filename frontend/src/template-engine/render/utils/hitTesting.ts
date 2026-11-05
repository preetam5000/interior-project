import type { DesignElement } from "../../types/designTemplate";
export function hitTest(elements: DesignElement[], x: number, y: number): DesignElement | undefined {
  return [...elements].filter((node) => node.visible && !node.locked && x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height).sort((a, b) => b.zIndex - a.zIndex)[0];
}
