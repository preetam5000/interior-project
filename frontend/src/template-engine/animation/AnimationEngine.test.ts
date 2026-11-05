import { AnimationEngine } from "./AnimationEngine";
import { createAnimationTimeline, timelineProgress } from "../timeline";
import { ANIMATION_PRESETS } from "../presets";
import { applyEasing, interpolateKeyframes } from "../interpolation";
import type { DesignTemplate } from "../types/designTemplate";
import { parseDesignTemplate } from "../templates/validateDesignTemplate";

const template: DesignTemplate = {
  schemaVersion: 2, id: "motion", name: "Motion", category: "test", description: "Motion test", tags: [], thumbnail: "",
  supportedFormats: ["portrait"], canvas: { width: 100, height: 100, unit: "px" }, background: {}, branding: {},
  elements: [{
    id: "node-a", type: "Shape", x: 0.2, y: 0.3, width: 0.4, height: 0.2, rotation: 5, opacity: 0.8, zIndex: 1, visible: true, locked: false,
    animations: [{ preset: "slide", durationMs: 100, delayMs: 50, easing: "linear", from: { translateX: 20 }, to: { translateX: 0 } }],
  }],
  animations: [{ id: "legacy-fade", target: "node-a", property: "opacity", from: 0, to: 1, startMs: 10, durationMs: 100, easing: "linear" }],
  metadata: {},
};

describe("renderer-independent AnimationEngine", () => {
  it("exposes all requested animation presets", () => {
    expect(Object.keys(ANIMATION_PRESETS).sort()).toEqual(["bounce", "blur", "fade", "motion-blur", "pop", "rotate", "scale", "slide", "zoom"]);
  });

  it("validates optional node animation metadata while keeping it backward compatible", () => {
    expect(parseDesignTemplate(template).elements[0].animations?.[0].preset).toBe("slide");
    expect(() => parseDesignTemplate({ ...template, elements: [{ ...template.elements[0], animations: [{ preset: "unknown-motion" }] }] })).toThrow("preset is unsupported");
  });

  it("honors duration, delay, easing and applies visual transforms without changing document geometry", () => {
    const engine = new AnimationEngine();
    const before = JSON.parse(JSON.stringify(template));
    expect(engine.evaluate(template, 49).get("node-a")).not.toHaveProperty("translateX");
    const midway = engine.evaluate(template, 100).get("node-a");
    expect(midway?.translateX).toBe(10);
    expect(midway?.opacity).toBeCloseTo(0.9);
    const finished = engine.evaluate(template, 200).get("node-a");
    expect(finished?.translateX).toBe(0);
    expect(finished?.opacity).toBe(1);
    expect(finished).not.toHaveProperty("x");
    expect(finished).not.toHaveProperty("y");
    expect(finished).not.toHaveProperty("width");
    expect(template).toEqual(before);
  });

  it("adapts existing document-level animation entries into timeline tracks", () => {
    const timeline = createAnimationTimeline(template);
    expect(timeline.durationMs).toBe(150);
    expect(timeline.tracks.map((track) => track.id)).toEqual(["node-a:node-animation:0", "legacy-fade"]);
    const legacy = new AnimationEngine().evaluate(template, 60).get("node-a");
    expect(legacy?.opacity).toBeCloseTo(0.5);
  });

  it("supports loop and direction timing and keyframe interpolation", () => {
    expect(timelineProgress(125, 0, 100, true, "alternate")).toEqual({ progress: 0.75, iteration: 1 });
    expect(timelineProgress(0, 0, 100, false, "reverse")?.progress).toBe(1);
    expect(timelineProgress(200, 0, 100, false, "normal")?.progress).toBe(1);
    expect(applyEasing(0.5, "ease-in-out")).toBe(0.5);
    expect(interpolateKeyframes([{ offset: 0, values: { rotation: 0 } }, { offset: 1, values: { rotation: 90 } }], 0.5)).toEqual({ rotation: 45 });
  });
});
