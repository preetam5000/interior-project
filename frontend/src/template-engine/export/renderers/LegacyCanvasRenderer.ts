import { CanvasRenderer } from "../../renderers/CanvasRenderer";
import type { TemplateConfig } from "../../types";
import type { ExportRenderer } from "./types";
import type { PreparedExport } from "../types";

export class LegacyCanvasExportRenderer implements ExportRenderer {
  readonly sourceKind = "legacy" as const;
  constructor(private readonly renderer: Pick<CanvasRenderer, "render"> = new CanvasRenderer()) {}

  async render(prepared: PreparedExport) {
    const template = prepared.document as TemplateConfig;
    const canvas = await this.renderer.render({
      template,
      context: {
        imageSrc: prepared.context.imageSrc || prepared.context.images?.main || "",
        images: prepared.context.images,
        content: prepared.context.content,
        brand: prepared.context.brand,
      },
      variant: prepared.profile.legacyVariant,
      transparentBackground: prepared.transparentBackground,
    });
    if (canvas.width !== prepared.profile.width || canvas.height !== prepared.profile.height) {
      const scaled = document.createElement("canvas");
      scaled.width = prepared.profile.width;
      scaled.height = prepared.profile.height;
      const context = scaled.getContext("2d");
      if (!context) throw new Error("This browser does not support a 2D export canvas.");
      context.drawImage(canvas, 0, 0, scaled.width, scaled.height);
      return { canvas: scaled, width: scaled.width, height: scaled.height };
    }
    return { canvas, width: prepared.profile.width, height: prepared.profile.height };
  }
}
