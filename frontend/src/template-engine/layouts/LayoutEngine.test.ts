import { getLayoutPresetIds, resolveLayout } from "./LayoutEngine";
import { LAYOUTS } from "./layouts";
import type { LayoutConfig } from "../types";

describe("reusable layout engine", () => {
  test("resolves all requested layouts into reusable content regions and image crops", () => {
    expect(getLayoutPresetIds()).toHaveLength(14);

    for (const id of getLayoutPresetIds()) {
      const definition = LAYOUTS[id];
      const portrait = resolveLayout({ preset: id, aspect_ratio: "4:5", layer_order: [] }, "portrait");
      const story = resolveLayout({ preset: id, aspect_ratio: "9:16", layer_order: [] }, "story");

      for (const role of ["headline", "subtitle", "logo", "badge", "cta"]) {
        expect(portrait.regions[role]).toEqual(expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number),
        }));
      }
      expect(Object.keys(portrait.image_regions).length).toBeGreaterThan(0);
      expect(portrait.crop).toEqual(definition.crops.portrait);
      expect(story.crop).toEqual(definition.crops.story);
      expect(portrait.safe_area).toEqual(definition.safe_zones.portrait);
      expect(story.safe_area).toEqual(definition.safe_zones.story);
    }
  });

  test("custom regions and variant settings override preset defaults", () => {
    const overrides: LayoutConfig = {
      preset: "split-screen",
      aspect_ratio: "4:5",
      layer_order: [],
      regions: {
        headline: { x: 0.1, y: 0.12, width: 0.7, height: 0.2 },
      },
      safe_zones: {
        story: { top: 0.2, bottom: 0.22, left: 0.08, right: 0.08 },
      },
      crops: {
        story: { fit: "contain", focal_point: { x: 0.25, y: 0.75 } },
      },
      image_regions: {
        main: { x: 0.4, y: 0, width: 0.6, height: 1 },
      },
    };
    const resolved = resolveLayout(overrides, "story");

    expect(resolved.regions.headline).toEqual(overrides.regions?.headline);
    expect(resolved.safe_area).toEqual(overrides.safe_zones?.story);
    expect(resolved.crop).toEqual(overrides.crops?.story);
    expect(resolved.image_regions.main).toEqual(overrides.image_regions?.main);
    expect(resolved.image_regions.before).toBeUndefined();
  });

  test("square uses portrait safe area and crop", () => {
    const definition = LAYOUTS["hero-center"];
    const resolved = resolveLayout({ preset: "hero-center", aspect_ratio: "1:1", layer_order: [] }, "square");

    expect(resolved.crop).toEqual(definition.crops.portrait);
    expect(resolved.safe_area).toEqual(definition.safe_zones.portrait);
  });
});
