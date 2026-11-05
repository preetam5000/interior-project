import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { DESIGN_ELEMENT_REGISTRY, getSupportedElementTypes } from "../components/designElementRegistry";
import { DesignTemplateRenderer } from "../renderers/DesignTemplateRenderer";
import { TEMPLATE_REGISTRY } from "./TemplateRegistry";
import { fromLegacyTemplateConfig } from "./legacyTemplateAdapter";
import { parseTemplateDocument, validateDesignTemplate } from "./validateDesignTemplate";
import { getPremiumTemplate, PREMIUM_TEMPLATES } from "./premiumTemplates";
import type { DesignTemplate } from "../types/designTemplate";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

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

const backendPresetTypes = [
  "LUXURY_SHOWCASE",
  "WORK_IN_PROGRESS",
  "BEFORE_AFTER",
  "PROJECT_UPDATE",
  "PROMOTION",
  "QUOTE",
  "TIP",
  "COMPLETED_PROJECT",
] as const;

function backendPresetConfig(template_type: typeof backendPresetTypes[number]) {
  return {
    template_type,
    headline: "A considered interior",
    subtitle: "Thoughtful details, made to last",
    cta: "Discover more",
    logo_url: "",
    primary_color: "",
    secondary_color: "",
    font: template_type === "QUOTE" ? "classic" : "serif",
    text_align: template_type === "PROMOTION" || template_type === "QUOTE" ? "center" : "left",
    overlay_opacity: 0.6,
    show_badge: true,
    show_logo: true,
    cta_position: "stack",
    logo_position: "top_left",
    button_style: "rounded",
  };
}

describe("JSON design template architecture", () => {
  test("registers the full reusable element component registry", () => {
    const types = getSupportedElementTypes();
    expect(types).toHaveLength(17);
    expect(types).toContain("Body Text");
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
    expect(parseTemplateDocument(getPremiumTemplate("luxury-showcase")).schemaVersion).toBe(2);
  });

  test.each(backendPresetTypes)("converts and validates the backend %s preset", (templateType) => {
    const template = parseTemplateDocument(backendPresetConfig(templateType));
    expect(template.schemaVersion).toBe(2);
    expect(template.metadata.backendTemplateType).toBe(templateType);
    expect(template.elements.length).toBeGreaterThan(0);
    expect(template.elements.map(({ type }) => type)).toContain("Heading");
    expect(validateDesignTemplate(template)).toEqual([]);
  });

  test("rejects unknown legacy backend preset types with a visible parse reason", () => {
    expect(() => parseTemplateDocument({
      ...backendPresetConfig("LUXURY_SHOWCASE"),
      template_type: "UNKNOWN_PRESET",
    })).toThrow('Backend template config "template_type" is invalid.');
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

  test("opens hidden diagnostics from the keyboard shortcut and closes on Escape", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(createElement(DesignTemplateRenderer, {
          template: sampleTemplate(),
          format: "portrait",
        }));
      });
      expect(document.querySelector('[data-testid="design-dev-tool"]')).toBeNull();

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", {
          key: "d",
          altKey: true,
          shiftKey: true,
          bubbles: true,
        }));
      });
      const panel = document.querySelector('[data-testid="design-dev-tool"]');
      expect(panel?.textContent).toContain("Design Dev Tool");
      expect(panel?.textContent).toContain("✓ Valid");
      expect(panel?.textContent).toContain("Heading");
      expect(panel?.textContent).toContain('"schemaVersion": 2');

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(document.querySelector('[data-testid="design-dev-tool"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
