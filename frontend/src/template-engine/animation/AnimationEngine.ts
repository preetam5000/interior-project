import type { DesignTemplate } from "../types/designTemplate";
import { createAnimationTimeline, evaluateAnimationTimeline } from "../timeline";
import type { AnimationTransform } from "./types";

/** Renderer-independent motion evaluator. It returns visual transforms and never rewrites the design document. */
export class AnimationEngine {
  evaluate(template: DesignTemplate, timeMs: number): Map<string, AnimationTransform> {
    return evaluateAnimationTimeline(createAnimationTimeline(template), timeMs);
  }
}

export const defaultAnimationEngine = new AnimationEngine();
