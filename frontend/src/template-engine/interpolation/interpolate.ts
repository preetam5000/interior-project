import type { AnimationEasing } from "../types/designTemplate";
import type { AnimationKeyframe, AnimationValues } from "../animation/types";

export function applyEasing(progress: number, easing: AnimationEasing = "linear"): number {
  const t = Math.max(0, Math.min(1, progress));
  switch (easing) {
    case "ease-in": return t * t;
    case "ease-out": return 1 - (1 - t) * (1 - t);
    case "ease-in-out": return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    default: return t;
  }
}

export function interpolateValues(from: AnimationValues, to: AnimationValues, progress: number): AnimationValues {
  const result: AnimationValues = {};
  const keys = new Set([...Object.keys(from), ...Object.keys(to)] as Array<keyof AnimationValues>);
  keys.forEach((key) => {
    const start = from[key] ?? to[key] ?? 0;
    const end = to[key] ?? from[key] ?? 0;
    result[key] = start + (end - start) * progress;
  });
  return result;
}

export function interpolateKeyframes(keyframes: readonly AnimationKeyframe[], progress: number, easing: AnimationEasing = "linear"): AnimationValues {
  if (!keyframes.length) return {};
  const t = Math.max(0, Math.min(1, progress));
  if (t <= keyframes[0].offset) return { ...keyframes[0].values };
  const last = keyframes[keyframes.length - 1];
  if (t >= last.offset) return { ...last.values };
  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const current = keyframes[index];
    const next = keyframes[index + 1];
    if (t < current.offset || t > next.offset) continue;
    const span = next.offset - current.offset;
    const local = span === 0 ? 1 : (t - current.offset) / span;
    return interpolateValues(current.values, next.values, applyEasing(local, easing));
  }
  return { ...last.values };
}
