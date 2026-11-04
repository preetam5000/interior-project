import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DESIGN_ELEMENT_REGISTRY, getSupportedElementTypes } from "../components/designElementRegistry";
import { DesignTemplateRenderer } from "../renderers/DesignTemplateRenderer";
import { TEMPLATE_REGISTRY } from "./TemplateRegistry";
import { fromLegacyTemplateConfig } from "./legacyTemplateAdapter";
import { validateDesignTemplate } from "./validateDesignTemplate";
import { getPremiumTemplate, PREMIUM_TEMPLATES } from "./premiumTemplates";
import type { DesignTemplate } from "../types/designTemplate";

function sampleTemplate(): DesignTemplate {
  return {
    schemaVersion: 2,
    id: "design-test",
    name: "Design Test",
    category: "editorial",
    description: "Test composition",
    tags: ["test"],
    thumbnail: "",
    supportedFormats: ["portrait", "story", "square"],
    canvas: { width: 1080, height: 1350, unit: "px" },
    background: { color: "#ffffff" },
    branding: { palette: { accent: "#bb9966" } },
    elements: [{
      id: "headline",
      type: "Heading",
      x: 0.1,
      y: 0.7,
      width: 0.8,
      height: 0.15,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      visible: true,
      locked: false,
      content: "A thoughtful interior",
      fontFamily: "Georgia, serif",
      fontWeight: 600,
      fontSize: 64,
      lineHeight: 1.1,
      letterSpacing: 0,
      color: "$accent",
      alignment: "left",
    }],
    animations: [],
    metadata: {},
  };
}

describe("JSON design template architecture", () => {
  test("registers the full reusable element component registry", () => {
    const types = getSupportedElementTypes();
    expect(types).toHaveLength(16);
    types.forEach((type) => expect(DESIGN_ELEMENT_REGISTRY[type]).toBeDefined());
  });

  test("automatically registers legacy premium templates through the adapter", () => {
    expect(PREMIUM_TEMPLATES).toHaveLength(30);
    expect(TEMPLATE_REGISTRY.list()).toHaveLength(30);
    expect(TEMPLATE_REGISTRY.get("luxury-showcase").schemaVersion).toBe(2);
    expect(TEMPLATE_REGISTRY.getCategories()).toEqual(expect.arrayContaining([
      "Luxury", "Construction", "Story", "Before After", "Magazine", "Editorial", "Modern", "Minimal",
    ]));
    expect(TEMPLATE_REGISTRY.list({ query: "construction" }).map(({ id }) => id))
      .toContain("construction-update");
    const migrated = fromLegacyTemplateConfig(getPremiumTemplate("luxury-showcase"));
    expect(migrated.metadata.legacyTemplateConfig).toEqual(getPremiumTemplate("luxury-showcase"));
    expect(migrated.elements.map(({ type }) => type)).toContain("Heading");
  });

  test("validates the complete normalized template contract", () => {
    expect(validateDesignTemplate(sampleTemplate())).toEqual([]);
    const template = sampleTemplate();
    template.elements.push({ ...template.elements[0], id: "headline" });
    expect(validateDesignTemplate(template).join(" ")).toContain('duplicates "headline"');
  });

  test("reports unsupported elements, invalid bounds, fonts, and colors", () => {
    const template = sampleTemplate();
    template.elements[0] = {
      ...template.elements[0],
      type: "Unknown" as DesignTemplate["elements"][number]["type"],
      x: 0.9,
      width: 0.5,
      fontFamily: "url(https://invalid.example/font)",
      color: "not-a-color",
    };
    const errors = validateDesignTemplate(template).join(" ");
    expect(errors).toContain("type is unsupported");
    expect(errors).toContain("right edge");
    expect(errors).toContain("fontFamily");
    expect(errors).toContain("color");
  });

  test("renders registered React elements as a format-aware canvas stage", () => {
    const markup = renderToStaticMarkup(createElement(DesignTemplateRenderer, {
      template: sampleTemplate(),
      context: { content: { headline: "A calm home" } },
      format: "story",
    }));
    expect(markup).toContain('data-template-format="story"');
    expect(markup).toContain('data-element-id="headline"');
    expect(markup).toContain("A thoughtful interior");
    expect(markup).toContain("aspect-ratio:1080 / 1920");
  });
});
