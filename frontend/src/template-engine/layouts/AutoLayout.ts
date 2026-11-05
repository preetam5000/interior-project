export type AutoLayoutMode = "vertical-stack" | "horizontal-stack" | "grid" | "masonry" | "responsive-stack" | "content-flow";
export interface AutoLayoutItem { id: string; width: number; height: number; priority?: number; kind?: "image" | "text" | "other" }
export interface AutoLayoutOptions {
  mode: AutoLayoutMode; width: number; height: number; gap?: number; padding?: number; columns?: number;
  alignment?: "start" | "center" | "end" | "stretch"; imagePriority?: number; textPriority?: number; breakpoint?: number;
}
export interface AutoLayoutPlacement { id: string; x: number; y: number; width: number; height: number }

/** Renderer-independent normalized layout calculator. Input and output dimensions use the same units. */
export function computeAutoLayout(items: readonly AutoLayoutItem[], options: AutoLayoutOptions): AutoLayoutPlacement[] {
  const pad = Math.max(0, options.padding ?? 0), gap = Math.max(0, options.gap ?? 0);
  const availableW = Math.max(0, options.width - pad * 2), availableH = Math.max(0, options.height - pad * 2);
  if (!items.length) return [];
  let mode = options.mode;
  if (mode === "responsive-stack") mode = options.width <= (options.breakpoint ?? 640) ? "vertical-stack" : "horizontal-stack";
  if (mode === "content-flow") mode = "vertical-stack";
  if (mode === "vertical-stack" || mode === "horizontal-stack") {
    const vertical = mode === "vertical-stack", count = items.length;
    const total = (vertical ? availableH : availableW) - gap * Math.max(0, count - 1);
    const weights = items.map((item) => Math.max(0.1, item.priority ?? (item.kind === "image" ? options.imagePriority ?? 1 : item.kind === "text" ? options.textPriority ?? 1 : 1)));
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = pad;
    return items.map((item, index) => {
      const unit = Math.max(0, total * weights[index] / weightTotal);
      const preferred = vertical ? item.height : item.width;
      const size = Math.max(0, Math.min(unit, preferred > 0 ? Math.max(preferred, unit) : unit));
      const placement = vertical
        ? { id: item.id, x: options.alignment === "center" ? pad + (availableW - Math.min(availableW, item.width)) / 2 : options.alignment === "end" ? pad + availableW - Math.min(availableW, item.width) : pad, y: cursor, width: options.alignment === "stretch" ? availableW : Math.min(availableW, item.width), height: size }
        : { id: item.id, x: cursor, y: options.alignment === "center" ? pad + (availableH - Math.min(availableH, item.height)) / 2 : options.alignment === "end" ? pad + availableH - Math.min(availableH, item.height) : pad, width: size, height: options.alignment === "stretch" ? availableH : Math.min(availableH, item.height) };
      cursor += unit + gap;
      return placement;
    });
  }
  const columns = Math.max(1, Math.min(items.length, options.columns ?? Math.ceil(Math.sqrt(items.length))));
  if (mode === "grid") {
    const cellW = (availableW - gap * (columns - 1)) / columns, rows = Math.ceil(items.length / columns);
    const cellH = (availableH - gap * Math.max(0, rows - 1)) / rows;
    return items.map((item, index) => ({ id: item.id, x: pad + (index % columns) * (cellW + gap), y: pad + Math.floor(index / columns) * (cellH + gap), width: cellW, height: cellH }));
  }
  const heights = Array(columns).fill(0) as number[];
  return items.map((item) => {
    const column = heights.indexOf(Math.min(...heights));
    const aspect = item.width > 0 && item.height > 0 ? item.width / item.height : 1;
    const width = (availableW - gap * (columns - 1)) / columns;
    const height = Math.min(availableH, width / aspect);
    const placement = { id: item.id, x: pad + column * (width + gap), y: pad + heights[column], width, height };
    heights[column] += height + gap;
    return placement;
  });
}
