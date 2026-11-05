import { validateDesignTemplate } from "./validateDesignTemplate";
import { getStudioCategories, getStudioTemplate, getStudioTemplateVariant, PROFESSIONAL_STUDIO_TEMPLATES, STUDIO_CATEGORIES } from "./professionalStudio";

describe("professional template studio", () => {
  test("ships 100 complete premium templates across every requested category", () => {
    expect(PROFESSIONAL_STUDIO_TEMPLATES).toHaveLength(100);
    expect(getStudioCategories()).toEqual([...STUDIO_CATEGORIES]);
    const categories = new Set(PROFESSIONAL_STUDIO_TEMPLATES.map((template) => template.category));
    expect(categories).toEqual(new Set(STUDIO_CATEGORIES));
    for (const template of PROFESSIONAL_STUDIO_TEMPLATES) {
      expect(template.jsonDefinition.id).toBe(template.id);
      expect(validateDesignTemplate(template.jsonDefinition)).toEqual([]);
      expect(template.difficulty).toBeTruthy(); expect(template.brandCompatibility).toBeTruthy();
      expect(template.animationCompatibility).toBeTruthy(); expect(template.responsiveRules.carousel).toBeTruthy();
      expect(template.qualityScore).toBeGreaterThanOrEqual(90); expect(template.tags.length).toBeGreaterThan(3);
      expect(template.aspectRatio).toBe("4:5"); expect(template.metadata.layoutSignature).toBeTruthy();
      expect(template.jsonDefinition.supportedFormats).toEqual(expect.arrayContaining(["story", "portrait", "square", "landscape", "carousel"]));
    }
  });

  test("every template has hierarchy, image placeholders, CTA, badge, logo, safe zones, gradients and decor", () => {
    for (const template of PROFESSIONAL_STUDIO_TEMPLATES) {
      const doc = template.jsonDefinition, metadata = template.metadata;
      expect(metadata.typographyHierarchy.display).toBeTruthy(); expect(metadata.typographyHierarchy.heading).toBeTruthy();
      expect(metadata.typographyHierarchy.body).toBeTruthy(); expect(metadata.spacingSystem.scale.length).toBeGreaterThan(4);
      expect(metadata.imagePlaceholders.length).toBeGreaterThan(0); expect(doc.canvas.safeZones?.story).toBeDefined();
      expect(doc.elements.some((element) => element.type === "CTA Button")).toBe(true);
      expect(doc.elements.some((element) => element.type === "Badge")).toBe(true);
      expect(doc.elements.some((element) => element.type === "Logo")).toBe(true);
      expect(doc.elements.some((element) => element.type === "Gradient" && element.gradient)).toBe(true);
      expect(doc.elements.filter((element) => element.type === "Gradient").length).toBeGreaterThanOrEqual(2);
      expect(doc.elements.filter((element) => element.type === "Decorative Object").length).toBeGreaterThanOrEqual(2);
      expect(doc.background.gradient).toBeDefined();
      expect(metadata.logoPlacement.frame.x + metadata.logoPlacement.frame.width).toBeLessThanOrEqual(0.925);
      expect(doc.metadata.componentInstances).toBeDefined();
    }
  });

  test("all 100 layout signatures are unique", () => {
    const signatures = new Set(PROFESSIONAL_STUDIO_TEMPLATES.map((template) => template.metadata.layoutSignature));
    expect(signatures.size).toBe(100);
  });

  test.each(["story", "portrait", "square", "landscape", "carousel"] as const)("adapts a shared template definition for %s", (format) => {
    const source = PROFESSIONAL_STUDIO_TEMPLATES[0];
    const variant = getStudioTemplateVariant(source.id, format)!;
    expect(variant.id).toBe(source.id);
    expect(variant.jsonDefinition.canvas.width / variant.jsonDefinition.canvas.height).toBeGreaterThan(0);
    expect(variant.aspectRatio).toBeTruthy();
    expect(variant.jsonDefinition.metadata.componentInstances).toBeDefined();
    expect(validateDesignTemplate(variant.jsonDefinition)).toEqual([]);
  });

  test("each template has generated usable previews and stable JSON lookup", () => {
    for (const template of PROFESSIONAL_STUDIO_TEMPLATES) {
      expect(template.preview.library.startsWith("<svg")).toBe(true);
      expect(template.preview.hover).toContain("<svg"); expect(template.preview.large).toContain("</svg>");
      expect(template.preview.dark).toContain("<svg"); expect(template.preview.light).toContain("<svg");
      expect(getStudioTemplate(template.id)?.jsonDefinition).toBe(template.jsonDefinition);
    }
  });
});
