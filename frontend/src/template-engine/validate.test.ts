import { OUTPUT_SIZES } from "./renderers/CanvasRenderer";
import { parseTemplateConfig } from "./validate";
import { resolveTemplateLayout } from "./layouts/LayoutEngine";
import { createOverlayConfig, OVERLAY_PRESETS } from "./overlays/overlayPresets";
import type { TemplateConfig } from "./types";

const typography = {
  family: "serif",
  fallback_family: "serif",
  size: 64,
  weight: "regular" as const,
  line_height: 1.2,
  letter_spacing: 0,
  text_transform: "none" as const,
  alignment: "left" as const,
  color: "$text",
};

const config: TemplateConfig = {
  schema_version: 1,
  id: "test",
  name: "Test",
  layout: {
    aspect_ratio: "4:5",
    safe_area: {},
    regions: {
      headline: { x: 0.1, y: 0.7, width: 0.8, height: 0.2 },
      subtitle: { x: 0.1, y: 0.9, width: 0.8, height: 0.08 },
      cta: { x: 0.1, y: 0.8, width: 0.8, height: 0.08 },
    },
    layer_order: ["image", "headline", "subtitle", "cta"],
  },
  typography,
  colors: {
    primary: "#112233",
    secondary: "#223344",
    accent: "#334455",
    text: "#FFFFFF",
    surface: "#000000",
  },
  overlays: [],
  logo: {
    enabled: false,
    asset_ref: "",
    region: "headline",
    anchor: "top_left",
    width: 0.2,
    opacity: 1,
    treatment: "original",
  },
  badges: [],
  cta: {
    enabled: false,
    text_binding: "content.cta",
    region: "cta",
    anchor: "bottom_left",
    style: "filled",
    typography,
    background_color: "$primary",
    text_color: "$text",
    border_color: "$primary",
    radius: 8,
    padding: {},
  },
  decorations: [],
  image_treatment: {
    fit: "cover",
    focal_point: { x: 0.5, y: 0.5 },
    brightness: 1,
    contrast: 1,
    saturation: 1,
    blur: 0,
    grayscale: 0,
    vignette: 0,
  },
  animations: {
    enabled: false,
    duration_ms: 0,
    easing: "linear",
    poster_time_ms: 0,
    motions: [],
  },
  content_bindings: {
    headline: "content.headline",
    subtitle: "content.subtitle",
    cta: "content.cta",
    badge: "content.badge",
  },
};

describe("template renderer contract", () => {
  test("reads a serialized JSON configuration", () => {
    expect(parseTemplateConfig(JSON.stringify(config))).toEqual(config);
  });

  test("rejects malformed JSON and unsupported schema versions", () => {
    expect(() => parseTemplateConfig("{")).toThrow("not valid JSON");
    expect(() => parseTemplateConfig({ ...config, schema_version: 2 } as unknown as TemplateConfig))
      .toThrow("Unsupported template schema_version");
    expect(() => parseTemplateConfig({
      ...config,
      typography: { ...typography, preset: "not-a-preset" },
    } as unknown as TemplateConfig)).toThrow("typography.preset");
    expect(() => parseTemplateConfig({
      ...config,
      typography: {
        ...typography,
        responsive_scaling: {
          enabled: true,
          reference_width: 1080,
          min_scale: 1.5,
          max_scale: 1,
        },
      },
    })).toThrow("min_scale");
  });

  test("accepts a preset layout without inline regions", () => {
    const presetConfig: TemplateConfig = {
      ...config,
      layout: { preset: "magazine", aspect_ratio: "4:5", regions: {}, layer_order: [] },
    };
    expect(parseTemplateConfig(presetConfig).layout.preset).toBe("magazine");
  });

  test("binds preset geometry to logo, badge, CTA, and image crop", () => {
    const presetConfig: TemplateConfig = {
      ...config,
      layout: { preset: "split-screen", aspect_ratio: "4:5", regions: {}, layer_order: [] },
      logo: { ...config.logo, region: "unused" },
      badges: [{
        id: "status",
        enabled: true,
        text_binding: "content.badge",
        region: "unused",
        anchor: "top_left",
        typography,
        background_color: "$primary",
        text_color: "$text",
        border_color: "$primary",
        radius: 8,
        padding: {},
      }],
      cta: { ...config.cta, enabled: true, region: "unused" },
    };
    const resolved = resolveTemplateLayout(presetConfig, "portrait");

    expect(resolved.logo.region).toBe("logo");
    expect(resolved.badges[0].region).toBe("badge");
    expect(resolved.cta.region).toBe("cta");
    expect(resolved.image_treatment.focal_point).toEqual({ x: 0.62, y: 0.5 });
  });

  test("provides all required social export dimensions", () => {
    expect(OUTPUT_SIZES).toEqual({
      portrait: { width: 1080, height: 1350 },
      story: { width: 1080, height: 1920 },
      square: { width: 1080, height: 1080 },
    });
  });

  test("provides configurable JSON definitions for every reusable overlay", () => {
    for (const [type, defaults] of Object.entries(OVERLAY_PRESETS)) {
      const overlay = createOverlayConfig(type as keyof typeof OVERLAY_PRESETS, {
        id: `test-${type}`,
        overrides: { opacity: 0.6, line_width: 2 },
      });
      expect(overlay).toMatchObject({
        type,
        region: "canvas",
        opacity: 0.6,
        line_width: 2,
      });
      expect(overlay.color).toBeTruthy();
      expect(defaults.opacity).toBeGreaterThan(0);
      expect(parseTemplateConfig({
        ...config,
        overlays: [overlay],
      })).toMatchObject({ overlays: [overlay] });
    }
  });

  test("rejects out-of-range overlay settings", () => {
    const overlay = createOverlayConfig("glass", {
      id: "invalid-blur",
      overrides: { blur_px: 101 },
    });
    expect(() => parseTemplateConfig({ ...config, overlays: [overlay] }))
      .toThrow("overlays.0.blur_px");
  });
});
