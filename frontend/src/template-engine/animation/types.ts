import type { AnimationDirection, AnimationEasing, AnimationPresetId, NodeAnimationMetadata, NodeAnimationValues } from "../types/designTemplate";

export type AnimationValues = NodeAnimationValues;
export type { AnimationDirection, AnimationEasing, AnimationPresetId, NodeAnimationMetadata };

export interface AnimationKeyframe { offset: number; values: AnimationValues }

export interface AnimationTrack {
  id: string;
  target: string;
  preset: AnimationPresetId;
  durationMs?: number;
  delayMs?: number;
  easing?: AnimationEasing;
  loop?: boolean;
  direction?: AnimationDirection;
  from?: AnimationValues;
  to?: AnimationValues;
  keyframes?: readonly AnimationKeyframe[];
}

export interface AnimationPresetDefinition {
  id: AnimationPresetId;
  durationMs: number;
  easing: AnimationEasing;
  keyframes: readonly AnimationKeyframe[];
}

export interface AnimationTimeline {
  durationMs: number;
  delayMs: number;
  easing?: AnimationEasing;
  loop?: boolean;
  direction?: AnimationDirection;
  tracks: readonly AnimationTrack[];
}

export interface AnimationTransform extends AnimationValues {}
