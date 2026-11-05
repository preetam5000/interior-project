import { computeAutoLayout } from "../layouts/AutoLayout";
import { createDesignComponent } from "../components/designComponents";
import { BrandEngine } from "../brand/BrandEngine";
import { PROFESSIONAL_TEMPLATE_CATALOG, TEMPLATE_CATEGORIES, adaptTemplateVariant } from "./professionalCatalog";
import { inspectTemplateQuality } from "./templateQuality";
import { generateTemplatePreviewSet } from "./thumbnailGenerator";
import { getVirtualWindow, searchTemplates, TemplateLibrary } from "./templateLibrary";
import { TEMPLATE_REGISTRY } from "./TemplateRegistry";

describe("professional template ecosystem", () => {
  test("all catalog entries expose complete professional metadata and variants", () => {
    expect(PROFESSIONAL_TEMPLATE_CATALOG.length).toBeGreaterThanOrEqual(25);
    expect(TEMPLATE_CATEGORIES).toHaveLength(25);
    for (const entry of PROFESSIONAL_TEMPLATE_CATALOG) {
      expect(entry.id).toBeTruthy();
      expect(entry.category).toBeTruthy();
      expect(entry.tags.length).toBeGreaterThan(0);
      expect(entry.supportedFormats).toEqual(expect.arrayContaining(["story", "portrait", "square", "landscape", "carousel"]));
      expect(entry.metadata.recommendedIndustry.length).toBeGreaterThan(0);
      expect(entry.metadata.recommendedFontPairings[0]).toHaveProperty("heading");
      expect(entry.previewImage).toBeTruthy();
      expect(entry.safeZones).toBeDefined();
    }
  });

  test("premium catalog documents load through the backwards-compatible registry", () => {
    expect(TEMPLATE_REGISTRY.list()).toHaveLength(PROFESSIONAL_TEMPLATE_CATALOG.length);
    const entry = PROFESSIONAL_TEMPLATE_CATALOG[0];
    expect(TEMPLATE_REGISTRY.get(entry.id).id).toBe(entry.id);
    expect(TEMPLATE_REGISTRY.list({ query: entry.name.slice(0, 5) }).some((template) => template.id === entry.id)).toBe(true);
  });

  test.each(["story", "portrait", "square", "landscape", "carousel"] as const)("adapts to %s without mutating source", (format) => {
    const source = PROFESSIONAL_TEMPLATE_CATALOG[0].document;
    const variant = adaptTemplateVariant(source, format);
    expect(variant.canvas).not.toBe(source.canvas);
    expect(variant.canvas.width / variant.canvas.height).toBeGreaterThan(0);
    expect(source.canvas.width).toBe(1080);
    expect(variant.elements.every((element) => element.x >= 0 && element.y >= 0 && element.x + element.width <= 1.000001 && element.y + element.height <= 1.000001)).toBe(true);
  });

  test("quality inspection returns warnings instead of throwing", () => {
    const document = { ...PROFESSIONAL_TEMPLATE_CATALOG[0].document, elements: [] };
    expect(() => inspectTemplateQuality(document)).not.toThrow();
    expect(inspectTemplateQuality(document).map((warning) => warning.code)).toEqual(expect.arrayContaining(["missing-logo", "missing-cta"]));
    expect(inspectTemplateQuality(PROFESSIONAL_TEMPLATE_CATALOG[0].document, { brandTokens: ["text"] })).toEqual(expect.any(Array));
  });

  test("search filters categories, tags, favorites and sorting, and virtualizes large lists", () => {
    const thousand = Array.from({ length: 1000 }, (_, index) => ({ ...PROFESSIONAL_TEMPLATE_CATALOG[index % PROFESSIONAL_TEMPLATE_CATALOG.length], id: `t-${index}`, name: `Room ${index}` }));
    expect(searchTemplates(thousand, { query: "Room 99", limit: 10 })).toHaveLength(10);
    expect(searchTemplates(thousand, { categories: [thousand[0].category] }).every((entry) => entry.category === thousand[0].category)).toBe(true);
    const window = getVirtualWindow(thousand, 5000, 600, 100, 2);
    expect(window.items.length).toBeLessThan(12);
    expect(window.totalSize).toBe(100000);
  });

  test("favorites, duplicates, recent use and pins persist through injected storage", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const library = new TemplateLibrary(storage);
    library.favorite("a"); library.pin("a"); library.use("a");
    const duplicate = library.duplicate(PROFESSIONAL_TEMPLATE_CATALOG[0]);
    const restored = new TemplateLibrary(storage).snapshot();
    expect(restored.favorites).toContain("a"); expect(restored.pinned).toContain("a"); expect(restored.recent[0]).toBe("a");
    expect(duplicate.id).not.toBe(PROFESSIONAL_TEMPLATE_CATALOG[0].id);
    expect(restored.duplicates).toHaveLength(1);
  });

  test("auto layouts place vertical, grid and masonry content in bounds", () => {
    const items = Array.from({ length: 6 }, (_, index) => ({ id: String(index), width: 120, height: 90 }));
    for (const mode of ["vertical-stack", "grid", "masonry"] as const) {
      const result = computeAutoLayout(items, { mode, width: 600, height: 800, padding: 24, gap: 12, columns: 3 });
      expect(result).toHaveLength(items.length);
      expect(result.every((item) => item.x >= 0 && item.y >= 0 && item.x + item.width <= 600.001 && item.y + item.height <= 800.001)).toBe(true);
    }
  });

  test("component library emits editor-native elements using brand tokens", () => {
    const component = createDesignComponent({ id: "hero", kind: "hero-image", x: 0, y: 0, width: 1, height: 0.6 });
    expect(component.type).toBe("Image"); expect(component.source).toBe("asset:primary");
    expect(component.color).toMatch(/^\$/);
  });

  test("thumbnail generator creates library, hover, large, dark and light previews", () => {
    const previews = generateTemplatePreviewSet(PROFESSIONAL_TEMPLATE_CATALOG[0].document);
    expect(Object.keys(previews)).toEqual(["library", "hover", "large", "dark", "light"]);
    expect(Object.values(previews).every((svg) => svg.startsWith("<svg") && svg.includes("</svg>"))).toBe(true);
    expect(previews.hover.length).toBeGreaterThan(previews.library.length);
  });

  test("brand engine resolves non-color design tokens", () => {
    const engine = new BrandEngine();
    const resolved = engine.resolve({ gap: "$spacing.md", corner: "$radius.card", label: "$typographyScale.body" }, {
      id: "brand", name: "Studio", spacing: { md: 24 }, radius: { card: 16 }, typographyScale: { body: 18 },
    });
    expect(resolved.value).toEqual({ gap: "24", corner: "16", label: "18" });
    expect(resolved.unresolvedTokens).toEqual([]);
  });
});
