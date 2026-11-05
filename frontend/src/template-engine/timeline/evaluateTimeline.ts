import { getAnimationPreset } from "../presets/animationPresets";
import { interpolateKeyframes } from "../interpolation/interpolate";
import type { AnimationTimeline, AnimationTrack, AnimationTransform, AnimationValues } from "../animation/types";
import { timelineProgress } from "./timeline";

function keyframesFor(track: AnimationTrack) {
  const preset = getAnimationPreset(track.preset);
  const frames = (track.keyframes || preset.keyframes).map((frame) => ({ offset: frame.offset, values: { ...frame.values } }));
  if (!frames.length) return frames;
  if (track.from) frames[0].values = { ...frames[0].values, ...track.from };
  if (track.to) frames[frames.length - 1].values = { ...frames[frames.length - 1].values, ...track.to };
  return frames;
}

function mergeTransform(current: AnimationTransform | undefined, next: AnimationValues): AnimationTransform {
  const result: AnimationTransform = { ...(current || {}) };
  for (const [rawKey, value] of Object.entries(next)) {
    if (value === undefined) continue;
    const key = rawKey as keyof AnimationValues;
    if (key === "translateX" || key === "translateY" || key === "rotation") result[key] = (result[key] || 0) + value;
    else if (key === "scaleX" || key === "scaleY") result[key] = (result[key] ?? 1) * value;
    else if (key === "opacity") result.opacity = (result.opacity ?? 1) * value;
    else if (key === "blur") result.blur = Math.max(result.blur || 0, value);
  }
  return result;
}

/** Evaluates tracks into visual-only transforms; source nodes and geometry are never mutated. */
export function evaluateAnimationTimeline(timeline: AnimationTimeline, timeMs: number): Map<string, AnimationTransform> {
  const output = new Map<string, AnimationTransform>();
  for (const track of timeline.tracks) {
    const preset = getAnimationPreset(track.preset);
    const duration = track.durationMs ?? preset.durationMs;
    const loop = track.loop ?? timeline.loop ?? false;
    const direction = track.direction ?? timeline.direction ?? "normal";
    const startMs = timeline.delayMs + (track.delayMs || 0);
    const frames = keyframesFor(track);
    const progress = timelineProgress(timeMs, startMs, duration, loop, direction);
    if (!progress && timeMs >= startMs) continue;
    const reverseBeforeStart = direction === "reverse" || direction === "alternate-reverse";
    const values = progress
      ? interpolateKeyframes(frames, progress.progress, track.easing || timeline.easing || preset.easing)
      : { ...(reverseBeforeStart ? frames[frames.length - 1]?.values : frames[0]?.values) };
    output.set(track.target, mergeTransform(output.get(track.target), values));
  }
  return output;
}
