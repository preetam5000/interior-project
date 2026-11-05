import type { AnimationPresetDefinition } from "../animation/types";

export const ANIMATION_PRESETS: Record<AnimationPresetDefinition["id"], AnimationPresetDefinition> = {
  fade: { id: "fade", durationMs: 420, easing: "ease-out", keyframes: [{ offset: 0, values: { opacity: 0 } }, { offset: 1, values: { opacity: 1 } }] },
  slide: { id: "slide", durationMs: 520, easing: "ease-out", keyframes: [{ offset: 0, values: { translateY: 32 } }, { offset: 1, values: { translateY: 0 } }] },
  scale: { id: "scale", durationMs: 420, easing: "ease-out", keyframes: [{ offset: 0, values: { scaleX: 0.82, scaleY: 0.82 } }, { offset: 1, values: { scaleX: 1, scaleY: 1 } }] },
  rotate: { id: "rotate", durationMs: 520, easing: "ease-out", keyframes: [{ offset: 0, values: { rotation: -12 } }, { offset: 1, values: { rotation: 0 } }] },
  bounce: { id: "bounce", durationMs: 720, easing: "linear", keyframes: [
    { offset: 0, values: { translateY: 24, scaleY: 0.88 } },
    { offset: 0.42, values: { translateY: -8, scaleY: 1.06 } },
    { offset: 0.68, values: { translateY: 3, scaleY: 0.98 } },
    { offset: 1, values: { translateY: 0, scaleY: 1 } },
  ] },
  pop: { id: "pop", durationMs: 360, easing: "ease-out", keyframes: [{ offset: 0, values: { opacity: 0, scaleX: 0.72, scaleY: 0.72 } }, { offset: 0.72, values: { opacity: 1, scaleX: 1.06, scaleY: 1.06 } }, { offset: 1, values: { opacity: 1, scaleX: 1, scaleY: 1 } }] },
  zoom: { id: "zoom", durationMs: 500, easing: "ease-in-out", keyframes: [{ offset: 0, values: { scaleX: 1.24, scaleY: 1.24 } }, { offset: 1, values: { scaleX: 1, scaleY: 1 } }] },
  blur: { id: "blur", durationMs: 520, easing: "ease-out", keyframes: [{ offset: 0, values: { blur: 14, opacity: 0.35 } }, { offset: 1, values: { blur: 0, opacity: 1 } }] },
  "motion-blur": { id: "motion-blur", durationMs: 620, easing: "ease-out", keyframes: [{ offset: 0, values: { translateX: 72, blur: 16, opacity: 0.2 } }, { offset: 1, values: { translateX: 0, blur: 0, opacity: 1 } }] },
};

export function getAnimationPreset(id: AnimationPresetDefinition["id"]): AnimationPresetDefinition { return ANIMATION_PRESETS[id]; }
