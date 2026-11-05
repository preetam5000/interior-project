import { BrandEngine } from "../brand/BrandEngine";
import { getDesignElementRenderer } from "./designElementRegistry";
import { DESIGN_COMPONENT_CATALOG, adaptComponentInstance, composeTemplateFromComponents, createComponentInstance, deserializeDesignComponents, generateDesignComponentPreview, getComponentRenderability, listDesignComponents, renderDesignComponent, serializeDesignComponents, validateDesignComponent } from "./designComponentLibrary";
import { PROFESSIONAL_TEMPLATE_CATALOG } from "../templates/professionalCatalog";
import { parseDesignTemplate } from "../templates/validateDesignTemplate";

describe("reusable design component library", () => {
  test("catalog covers every requested component category and supplies the complete contract", () => {
    expect(DESIGN_COMPONENT_CATALOG.length).toBeGreaterThanOrEqual(80);
    expect(new Set(DESIGN_COMPONENT_CATALOG.map((item) => item.category))).toEqual(new Set(["layout", "card", "badge", "cta", "footer", "decorative", "information"]));
    for (const item of DESIGN_COMPONENT_CATALOG) {
      expect(item.id).toBeTruthy(); expect(item.type).toBeTruthy();
      expect(item.supportedFormats).toEqual(expect.arrayContaining(["story", "portrait", "square", "landscape", "carousel"]));
      expect(item.defaultDimensions.width).toBeGreaterThan(0); expect(item.padding.top).toMatch(/^\$/);
      expect(item.margin.left).toMatch(/^\$/); expect(item.minimumSize.width).toBeLessThan(item.maximumSize.width);
      expect(item.responsiveBehavior).toBeTruthy(); expect(item.themeTokens.color).toMatch(/^\$/);
      expect(item.brandTokens.length).toBeGreaterThan(0); expect(item.safeZoneRules.length).toBeGreaterThan(0);
      expect(item.editableProperties.length).toBeGreaterThan(0); expect(item.previewGenerator).toBeTruthy();
      expect(item.validationRules.length).toBeGreaterThan(0);
    }
    expect(listDesignComponents("layout").map((item) => item.name)).toEqual(expect.arrayContaining(["Hero Section", "Split Layout", "Magazine Layout", "Luxury Layout"]));
  });

  test.each(["story", "portrait", "square", "landscape", "carousel"] as const)("adapts instances to %s without duplicating components", (format) => {
    const source = createComponentInstance("image-card", { x: 0.1, y: 0.2, width: 0.7, height: 0.4 }, { image: "asset:room" }, "portrait");
    const adapted = adaptComponentInstance(source, format);
    expect(adapted.id).toBe(source.id); expect(adapted.componentId).toBe("image-card"); expect(adapted.format).toBe(format);
    expect(adapted.frame.x).toBeGreaterThanOrEqual(0); expect(adapted.frame.y).toBeGreaterThanOrEqual(0);
    expect(adapted.frame.x + adapted.frame.width).toBeLessThanOrEqual(1); expect(adapted.frame.y + adapted.frame.height).toBeLessThanOrEqual(1);
    expect(source.format).toBe("portrait");
  });

  test("semantic components render as supported editor elements with tokenized styles", () => {
    for (const definition of DESIGN_COMPONENT_CATALOG) {
      const instance = createComponentInstance(definition.id, { x: 0.1, y: 0.1, width: 0.8, height: 0.45 }, { title: definition.name, body: "Component preview", cta: "Learn more", image: "asset:interior" });
      const elements = renderDesignComponent(instance);
      expect(elements.length).toBeGreaterThan(0);
      for (const element of elements) expect(getDesignElementRenderer(element.type)).toBeDefined();
      expect(getComponentRenderability(instance)).toBe(true);
      expect(elements.every((element) => !element.color || element.color.startsWith("$"))).toBe(true);
    }
  });

  test("component previews are generated on demand from brand and typography tokens", () => {
    const instance = createComponentInstance("hero-section", { x: 0, y: 0, width: 1, height: 1 }, { title: "A room in focus", body: "Material, light, proportion" });
    const preview = generateDesignComponentPreview(instance, { width: 400, height: 250 });
    expect(preview).toContain("data-component-id=\"hero-section\"");
    expect(preview).toContain("var(--colors-surface"); expect(preview).toContain("var(--fonts-heading");
    expect(preview).toContain("A room in focus");
  });

  test("validation reports requested quality warnings without throwing", () => {
    const image = createComponentInstance("image-card", { x: 0.8, y: 0.85, width: 0.5, height: 0.3 }, { textSize: 9, brandId: "other", animation: "bounce" });
    expect(() => validateDesignComponent(image, { safeZone: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 }, brandId: "studio", availableBrandTokens: [] })).not.toThrow();
    const warnings = validateDesignComponent(image, { safeZone: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 }, brandId: "studio", availableBrandTokens: [] });
    expect(warnings.map(({ code }) => code)).toEqual(expect.arrayContaining(["overflow", "missing-image", "tiny-text", "unsafe-position", "brand-mismatch"]));
    const staticTexture = createComponentInstance("noise-overlay", { x: 0, y: 0, width: 1, height: 1 }, { animation: "fade" });
    expect(validateDesignComponent(staticTexture).some((warning) => warning.code === "unsupported-animation")).toBe(true);
    const noHeading = createComponentInstance("feature-grid", { x: 0, y: 0, width: 1, height: 1 });
    expect(validateDesignComponent(noHeading).some((warning) => warning.code === "broken-hierarchy")).toBe(true);
  });

  test("component trees serialize, deserialize and compose with existing template documents", () => {
    const instances = [
      createComponentInstance("hero-section", { x: 0, y: 0.1, width: 1, height: 0.7 }, { title: "A considered home", body: "Natural materials and light", image: "asset:hero" }),
      createComponentInstance("book-consultation", { x: 0.1, y: 0.84, width: 0.8, height: 0.1 }, { title: "Book a consultation" }),
    ];
    const serialized = serializeDesignComponents(instances);
    const decoded = deserializeDesignComponents(serialized);
    expect(decoded.instances).toEqual(instances); expect(decoded.warnings).toEqual([]);
    expect(deserializeDesignComponents("invalid json").warnings[0].code).toBe("broken-hierarchy");
    const base = PROFESSIONAL_TEMPLATE_CATALOG[0].document;
    const composed = composeTemplateFromComponents(base, instances);
    expect(composed.metadata.componentInstances).toEqual(instances);
    expect(composed.elements.length).toBeGreaterThan(base.elements.length);
    expect(composed.elements.slice(base.elements.length).every((element) => element.zIndex > Math.max(...base.elements.map((item) => item.zIndex)))).toBe(true);
    expect(parseDesignTemplate(composed).id).toBe(base.id);
  });

  test("brand tokens resolve through composition and no component definition embeds literal colors", () => {
    const brand = { id: "studio", name: "Studio", logo: "asset:logo", colors: { text: "#1c1c1c", surface: "#f5f1e8", primary: "#9a7b4f" }, fonts: { heading: "Studio Serif", body: "Studio Sans" }, spacing: { md: 24 }, radius: { card: 18 }, shadows: { card: "0 8px 24px #0002" } };
    const instance = createComponentInstance("luxury-card", { x: 0.1, y: 0.1, width: 0.8, height: 0.45 }, { title: "The residence", body: "Crafted for everyday rituals" });
    const composed = composeTemplateFromComponents(PROFESSIONAL_TEMPLATE_CATALOG[0].document, [instance], brand);
    const added = composed.elements.slice(PROFESSIONAL_TEMPLATE_CATALOG[0].document.elements.length);
    expect(added.some((element) => element.color === brand.colors.text)).toBe(true);
    expect(added.some((element) => element.fontFamily === brand.fonts.heading)).toBe(true);
    expect(composed.branding.tokens?.["fonts.body"]).toBe(brand.fonts.body);
    const resolved = new BrandEngine().resolve({ color: "$colors.primary", font: "$fonts.heading", gap: "$spacing.md", radius: "$radius.card", shadow: "$shadows.card" }, brand);
    expect(resolved.unresolvedTokens).toEqual([]);
  });

  test("catalog supports rendering and instantiation throughput for 1,000 components", () => {
    const definitions = DESIGN_COMPONENT_CATALOG;
    const started = performance.now();
    const rendered = Array.from({ length: 1000 }, (_, index) => {
      const definition = definitions[index % definitions.length];
      return renderDesignComponent(createComponentInstance(definition.id, { x: 0, y: 0, width: 1, height: 1 }, { title: `Item ${index}`, body: "Studio component", image: "asset:interior" }));
    });
    expect(rendered).toHaveLength(1000);
    expect(performance.now() - started).toBeLessThan(10000);
  });
});
