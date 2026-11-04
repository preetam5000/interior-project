import { defaultAssetResolver } from "../assets/imageAssets";
import { resolveColor } from "../components/canvasHelpers";
import {
  drawBadge,
  drawCTA,
  drawDecoration,
  drawHeadline,
  drawLogo,
  drawSubtitle,
} from "../components/drawBadge";
import { drawImageLayer } from "../components/drawImage";
import { drawOverlay } from "../components/drawOverlay";
import type {
  AssetResolver,
  CanvasSize,
  OutputMimeType,
  OutputVariant,
  RenderContext,
  RenderResult,
  TemplateConfig,
} from "../types";
import { parseTemplateConfig } from "../validate";
import { resolveTemplateLayout } from "../layouts/LayoutEngine";

export const OUTPUT_SIZES: Record<OutputVariant, CanvasSize> = {
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

export interface CanvasRenderOptions {
  template: TemplateConfig | string;
  context: RenderContext;
  variant: OutputVariant;
  canvas?: HTMLCanvasElement;
}

export interface CanvasRendererOptions {
  assetResolver?: AssetResolver;
}

interface LayerEntry {
  key: string;
  draw: () => void | Promise<void>;
}

export class CanvasRenderer {
  private readonly assetResolver: AssetResolver;

  constructor(options: CanvasRendererOptions = {}) {
    this.assetResolver = options.assetResolver || defaultAssetResolver;
  }

  async render(options: CanvasRenderOptions): Promise<HTMLCanvasElement> {
    const parsedTemplate = parseTemplateConfig(options.template);
    const canvas = options.canvas || document.createElement("canvas");
    const size = OUTPUT_SIZES[options.variant];
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser does not support a 2D canvas renderer.");

    const template: TemplateConfig = resolveTemplateLayout(parsedTemplate, options.variant);
    await this.drawTemplate(context, template, options.context);
    return canvas;
  }

  async export(
    options: Omit<CanvasRenderOptions, "canvas">,
    mimeType: OutputMimeType = "image/png",
    quality = 0.92,
  ): Promise<RenderResult> {
    const canvas = await this.render(options);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value
          ? resolve(value)
          : reject(new Error("Canvas export failed to produce an image blob.")),
        mimeType,
        Math.max(0, Math.min(1, quality)),
      );
    });
    const size = OUTPUT_SIZES[options.variant];
    return { ...size, variant: options.variant, mimeType, blob };
  }

  private async drawTemplate(
    context: CanvasRenderingContext2D,
    template: TemplateConfig,
    renderContext: RenderContext,
  ): Promise<void> {
    context.fillStyle = resolveColor("$surface", template.colors);
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);

    const overlays = new Map(template.overlays.map((item) => [item.id, item]));
    const badges = new Map(template.badges.map((item) => [item.id, item]));
    const decorations = new Map(template.decorations.map((item) => [item.id, item]));
    const imageLayers: LayerEntry[] = Object.entries(template.layout.image_regions || {})
      .map(([regionId]) => ({
        key: `image:${regionId}`,
        draw: () => drawImageLayer(
          context,
          template,
          renderContext.images?.[regionId] || renderContext.imageSrc,
          regionId,
        ),
      }));
    const mainImageLayer = imageLayers.find((layer) => layer.key === "image:main");
    const layers: LayerEntry[] = [
      ...imageLayers,
      ...template.overlays.map((item) => ({
        key: `overlay:${item.id}`,
        draw: () => drawOverlay(context, item, template),
      })),
      ...template.decorations.map((item) => ({
        key: `decoration:${item.id}`,
        draw: () => drawDecoration(context, item, template, renderContext, (ref, ctx) => this.assetResolver.resolve(ref, ctx)),
      })),
      {
        key: "logo",
        draw: () => drawLogo(context, template.logo, template, renderContext, (ref, ctx) => this.assetResolver.resolve(ref, ctx)),
      },
      ...template.badges.map((item) => ({
        key: `badge:${item.id}`,
        draw: () => drawBadge(context, item, template, renderContext),
      })),
      { key: "headline", draw: () => drawHeadline(context, template, renderContext) },
      { key: "subtitle", draw: () => drawSubtitle(context, template, renderContext) },
      { key: "cta", draw: () => drawCTA(context, template.cta, template, renderContext) },
    ];
    const byKey = new Map(layers.map((layer) => [layer.key, layer]));
    if (mainImageLayer) byKey.set("image", mainImageLayer);
    const order = template.layout.layer_order.length
      ? [...template.layout.layer_order]
      : layers.map((layer) => layer.key);
    const imageKeys = imageLayers.map((layer) => layer.key);
    if (!order.some((key) => key === "image" || key.startsWith("image:"))) {
      order.unshift(...imageKeys, ...(mainImageLayer ? ["image"] : []));
    }

    for (const key of order) {
      const layer = byKey.get(key);
      if (!layer) {
        const [kind, id] = key.split(":", 2);
        const known = kind === "overlay" ? overlays.has(id)
          : kind === "badge" ? badges.has(id)
            : kind === "decoration" ? decorations.has(id) : false;
        throw new Error(known
          ? `Template layer "${key}" is not registered.`
          : `Template "${template.id}" references unknown layer "${key}".`);
      }
      await layer.draw();
    }
  }
}
