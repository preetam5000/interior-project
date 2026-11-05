import type { DesignTemplate } from "../types/designTemplate";
const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]!));
export type PreviewTheme = "light" | "dark";
const thumbnailCache = new WeakMap<DesignTemplate, Map<string, string>>();
/** Generates a deterministic SVG preview from document elements; no screenshots or browser canvas required. */
export function generateTemplateThumbnail(template: DesignTemplate, options: { width?: number; height?: number; theme?: PreviewTheme; hover?: boolean } = {}): string {
  const width = options.width || 240, height = options.height || Math.round(width * template.canvas.height / template.canvas.width);
  const key = `${width}:${height}:${options.theme || "light"}:${Boolean(options.hover)}`;
  const cached = thumbnailCache.get(template)?.get(key);
  if (cached) return cached;
  const bg = options.theme === "dark" ? "#171717" : template.background.color || "#f3f0e9";
  const rects = template.elements.filter((element) => element.visible).sort((a, b) => a.zIndex - b.zIndex).map((element) => {
    const x = element.x * width, y = element.y * height, w = element.width * width, h = element.height * height;
    if (element.type === "Image" || element.type === "Logo") return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#b9b3a8"/>`;
    const color = esc(element.color || template.branding.palette?.primary || "#827b70");
    if (["Text", "Heading", "Subtitle", "Body Text", "CTA Button"].includes(element.type)) return `<rect x="${x}" y="${y + h * .36}" width="${w * .82}" height="${Math.max(2, Math.min(h * .3, 10))}" rx="2" fill="${color}" opacity=".85"/>`;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${element.radius || 2}" fill="${color}" opacity="${element.opacity}"/>`;
  }).join("");
  const hover = options.hover ? `<rect width="${width}" height="${height}" fill="#000" opacity=".08"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${esc(bg)}"/>${rects}${hover}</svg>`;
  const cache = thumbnailCache.get(template) || new Map<string, string>();
  cache.set(key, svg);
  thumbnailCache.set(template, cache);
  return svg;
}
export function generateTemplatePreviewSet(template: DesignTemplate, width = 240) {
  return { library: generateTemplateThumbnail(template, { width }), hover: generateTemplateThumbnail(template, { width: width * 2, hover: true }), large: generateTemplateThumbnail(template, { width: width * 4 }), dark: generateTemplateThumbnail(template, { width, theme: "dark" }), light: generateTemplateThumbnail(template, { width, theme: "light" }) };
}
