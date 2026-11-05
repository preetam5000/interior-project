import type { DesignTemplate, NodeAnimationMetadata } from "../types/designTemplate";
import { getAnimationPreset } from "../presets/animationPresets";
import type { AnimationDirection, AnimationTimeline, AnimationTrack, AnimationValues } from "../animation/types";

function nodeTrack(target: string, metadata: NodeAnimationMetadata, index: number): AnimationTrack {
  return { id: `${target}:node-animation:${index}`, target, ...metadata, keyframes: metadata.keyframes };
}

function legacyTrack(animation: DesignTemplate["animations"][number]): AnimationTrack {
  const preset = animation.property === "opacity" ? "fade"
    : animation.property === "translateX" || animation.property === "translateY" ? "slide"
      : animation.property === "scale" ? "scale" : "rotate";
  const values = (value: number): AnimationValues => {
    switch (animation.property) {
      case "opacity": return { opacity: value };
      case "translateX": return { translateX: value };
      case "translateY": return { translateY: value };
      case "scale": return { scaleX: value, scaleY: value };
      case "rotate": return { rotation: value };
    }
  };
  return {
    id: animation.id,
    target: animation.target,
    preset,
    durationMs: animation.durationMs,
    delayMs: animation.startMs,
    easing: animation.easing,
    from: values(animation.from),
    to: values(animation.to),
  };
}

export function createAnimationTimeline(template: DesignTemplate, options: Partial<Pick<AnimationTimeline, "loop" | "direction" | "easing" | "delayMs">> = {}): AnimationTimeline {
  const tracks: AnimationTrack[] = [
    ...template.elements.flatMap((element) => (element.animations || []).map((metadata, index) => nodeTrack(element.id, metadata, index))),
    ...template.animations.map(legacyTrack),
  ];
  const durationMs = tracks.reduce((duration, track) => Math.max(duration, (track.delayMs || 0) + (track.durationMs || getAnimationPreset(track.preset).durationMs)), 0);
  return {
    durationMs,
    delayMs: options.delayMs || 0,
    easing: options.easing,
    loop: options.loop,
    direction: options.direction,
    tracks,
  };
}

export interface TimelineProgress { progress: number; iteration: number }

export function timelineProgress(timeMs: number, startMs: number, durationMs: number, loop: boolean, direction: AnimationDirection): TimelineProgress | null {
  if (!Number.isFinite(timeMs) || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  const elapsed = timeMs - startMs;
  if (elapsed < 0) return null;
  const iteration = loop ? Math.floor(elapsed / durationMs) : 0;
  let progress = loop ? (elapsed % durationMs) / durationMs : Math.min(1, elapsed / durationMs);
  const reverse = direction === "reverse"
    || (direction === "alternate" && iteration % 2 === 1)
    || (direction === "alternate-reverse" && iteration % 2 === 0);
  if (reverse) progress = 1 - progress;
  return { progress, iteration };
}
