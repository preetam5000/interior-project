import { useMemo } from "react";
import { createAnimationTimeline, evaluateAnimationTimeline } from "../timeline";
import type { DesignRenderContext, DesignTemplate } from "../types/designTemplate";
import DesignTemplateRenderer from "../renderers/DesignTemplateRenderer";

export function animateTemplateForPreview(template: DesignTemplate, timeMs: number, options: { loop?: boolean; direction?: "normal" | "reverse" | "alternate" | "alternate-reverse"; easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out"; delayMs?: number } = {}): DesignTemplate {
  const timeline = createAnimationTimeline(template, options);
  const transforms = evaluateAnimationTimeline(timeline, timeMs);
  return {
    ...template,
    supportedFormats: template.supportedFormats.includes("story") ? template.supportedFormats : [...template.supportedFormats, "story"],
    elements: template.elements.map((element) => {
      const motion = transforms.get(element.id);
      if (!motion) return element;
      const scaleX = motion.scaleX ?? 1, scaleY = motion.scaleY ?? 1;
      const width = Math.max(0.001, Math.min(1, element.width * scaleX)), height = Math.max(0.001, Math.min(1, element.height * scaleY));
      return {
        ...element,
        x: Math.max(0, Math.min(1 - width, element.x + (motion.translateX || 0) / template.canvas.width - (width - element.width) / 2)),
        y: Math.max(0, Math.min(1 - height, element.y + (motion.translateY || 0) / template.canvas.height - (height - element.height) / 2)),
        width,
        height,
        rotation: element.rotation + (motion.rotation || 0),
        opacity: element.opacity * (motion.opacity ?? 1),
        blur: (element.blur || 0) + (motion.blur || 0),
      };
    }),
  };
}

export default function AnimatedStoryPreview({ template, context, timeMs, options }: { template: DesignTemplate; context?: DesignRenderContext; timeMs: number; options?: Parameters<typeof animateTemplateForPreview>[2] }) {
  const preview = useMemo(() => animateTemplateForPreview(template, timeMs, options), [template, timeMs, options]);
  return <div className="mx-auto w-full max-w-[200px] overflow-hidden rounded-xl border border-border/70 bg-black shadow-lg"><DesignTemplateRenderer template={preview} context={context} format="story" className="w-full" /></div>;
}
