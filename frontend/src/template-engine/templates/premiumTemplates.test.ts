import { parseTemplateConfig } from "../validate";
import {
  getPremiumTemplate,
  PREMIUM_TEMPLATES,
  serializePremiumTemplate,
} from "./premiumTemplates";

describe("premium template catalog", () => {
  test("contains all 30 named templates as valid engine configurations", () => {
    expect(PREMIUM_TEMPLATES).toHaveLength(30);
    for (const template of PREMIUM_TEMPLATES) {
      expect(parseTemplateConfig(template)).toEqual(template);
      expect(template.badges).toHaveLength(1);
      expect(template.overlays.length).toBeGreaterThan(0);
      expect(template.cta.enabled).toBe(true);
    }
  });

  test.each([
    ["layout", (template: typeof PREMIUM_TEMPLATES[number]) => ({
      preset: template.layout.preset,
      regions: template.layout.regions,
      images: template.layout.image_regions,
      safe: template.layout.safe_zones,
      crops: template.layout.crops,
    })],
    ["typography", (template: typeof PREMIUM_TEMPLATES[number]) => template.typography],
    ["colors", (template: typeof PREMIUM_TEMPLATES[number]) => template.colors],
    ["overlays", (template: typeof PREMIUM_TEMPLATES[number]) => template.overlays],
    ["CTA", (template: typeof PREMIUM_TEMPLATES[number]) => template.cta],
    ["badges", (template: typeof PREMIUM_TEMPLATES[number]) => template.badges],
  ])("gives every template unique %s configuration", (_label, pick) => {
    const signatures = new Set(PREMIUM_TEMPLATES.map((template) => JSON.stringify(pick(template))));
    expect(signatures.size).toBe(PREMIUM_TEMPLATES.length);
  });

  test("exports each template as JSON and rejects unknown IDs", () => {
    const source = serializePremiumTemplate("luxury-showcase");
    expect(JSON.parse(source)).toEqual(getPremiumTemplate("luxury-showcase"));
    expect(() => getPremiumTemplate("missing-template")).toThrow("Unknown premium template");
  });
});
