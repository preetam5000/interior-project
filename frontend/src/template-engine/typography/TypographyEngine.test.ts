import { applyTypographyPreset, typographyMetrics } from "./TypographyEngine";
import { TYPOGRAPHY_PRESET_IDS, TYPOGRAPHY_PRESETS } from "./typographyPresets";
import type { TypographyConfig } from "../types";

const base: TypographyConfig = {
  family: "Default",
  fallback_family: "sans-serif",
  size: 60,
  weight: "regular",
  line_height: 1.2,
  letter_spacing: 0,
  text_transform: "none",
  alignment: "left",
  color: "#FFFFFF",
};

describe("reusable typography presets", () => {
  test("provides all ten requested presets with complete reusable style settings", () => {
    expect(TYPOGRAPHY_PRESET_IDS).toHaveLength(10);
    for (const preset of Object.values(TYPOGRAPHY_PRESETS)) {
      expect(preset.family).toBeTruthy();
      expect(preset.fallback_family).toBeTruthy();
      expect(["regular", "medium", "semibold", "bold"]).toContain(preset.weight);
      expect(typeof preset.letter_spacing).toBe("number");
      expect(preset.shadow).toEqual(expect.objectContaining({
        enabled: expect.any(Boolean),
        color: expect.any(String),
        blur: expect.any(Number),
        offset_x: expect.any(Number),
        offset_y: expect.any(Number),
      }));
      expect(preset.line_height).toBeGreaterThan(0);
      expect(["left", "center", "right"]).toContain(preset.alignment);
      expect(preset.responsive_scaling.enabled).toBe(true);
    }
  });

  test("applies a preset while retaining content-specific size and color", () => {
    const applied = applyTypographyPreset(base, "luxury");
    expect(applied).toMatchObject({
      preset: "luxury",
      family: "Playfair Display",
      weight: "regular",
      letter_spacing: 2.4,
      line_height: 1.22,
      alignment: "center",
      size: base.size,
      color: base.color,
    });
    expect(applied.shadow?.enabled).toBe(true);
    expect(applied.responsive_scaling?.enabled).toBe(true);
  });

  test("supports explicit overrides on top of a preset", () => {
    const applied = applyTypographyPreset(base, "bold", { alignment: "right", letter_spacing: 2 });
    expect(applied.alignment).toBe("right");
    expect(applied.letter_spacing).toBe(2);
    expect(applied.weight).toBe("bold");
  });

  test("clamps responsive font scaling to configured bounds", () => {
    const typography = applyTypographyPreset(base, "modern");
    expect(typographyMetrics(typography, 270).scale).toBe(0.72);
    expect(typographyMetrics(typography, 2160).scale).toBe(1.25);
    expect(typographyMetrics(typography, 1080).scale).toBe(1);
  });
});
