import { loadImage } from "../assets/imageAssets";
import type { ImageFilterConfig, TemplateConfig } from "../types";
import { applyAlpha, Rect, regionRect } from "./canvasHelpers";

function drawFittedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: Rect,
  treatment: ImageFilterConfig,
): void {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (!sourceWidth || !sourceHeight || !rect.width || !rect.height) return;

  const contain = treatment.fit === "contain";
  const scale = contain
    ? Math.min(rect.width / sourceWidth, rect.height / sourceHeight)
    : Math.max(rect.width / sourceWidth, rect.height / sourceHeight);
  const cropWidth = contain ? sourceWidth : rect.width / scale;
  const cropHeight = contain ? sourceHeight : rect.height / scale;
  const focal = treatment.focal_point || { x: 0.5, y: 0.5 };
  const sourceX = contain
    ? 0
    : Math.min(sourceWidth - cropWidth, Math.max(0, sourceWidth * focal.x - cropWidth / 2));
  const sourceY = contain
    ? 0
    : Math.min(sourceHeight - cropHeight, Math.max(0, sourceHeight * focal.y - cropHeight / 2));
  const outputWidth = contain ? sourceWidth * scale : rect.width;
  const outputHeight = contain ? sourceHeight * scale : rect.height;
  const outputX = contain ? rect.x + (rect.width - outputWidth) / 2 : rect.x;
  const outputY = contain ? rect.y + (rect.height - outputHeight) / 2 : rect.y;
  const treatmentFilter = [
    `brightness(${treatment.brightness})`,
    `contrast(${treatment.contrast})`,
    `saturate(${treatment.saturation})`,
    `grayscale(${treatment.grayscale})`,
    treatment.blur ? `blur(${treatment.blur}px)` : "",
  ].filter(Boolean).join(" ");

  context.save();
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
  context.filter = treatmentFilter;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    outputX,
    outputY,
    outputWidth,
    outputHeight,
  );
  context.restore();
}

export async function drawImageLayer(
  context: CanvasRenderingContext2D,
  template: TemplateConfig,
  imageSrc: string,
  regionId = "main",
): Promise<void> {
  const image = await loadImage(imageSrc);
  const canvas = context.canvas;
  const imageRegion = template.layout.image_regions?.[regionId];
  if (!imageRegion) {
    throw new Error(`Template "${template.id}" references missing image region "${regionId}".`);
  }
  const rect = regionRect(imageRegion, canvas.width, canvas.height);
  const treatment = template.image_treatment;
  context.save();
  context.beginPath();
  if (imageRegion.clip === "diagonal") {
    context.moveTo(rect.x + rect.width * 0.18, rect.y);
    context.lineTo(rect.x + rect.width, rect.y);
    context.lineTo(rect.x + rect.width, rect.y + rect.height);
    context.lineTo(rect.x, rect.y + rect.height);
  } else if (imageRegion.clip === "circle") {
    context.ellipse(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      rect.width / 2,
      rect.height / 2,
      0,
      0,
      Math.PI * 2,
    );
  } else {
    context.rect(rect.x, rect.y, rect.width, rect.height);
  }
  context.closePath();
  context.clip();
  drawFittedImage(context, image, rect, treatment);
  context.restore();

  if (treatment.vignette > 0 && regionId === "main") {
    const gradient = context.createRadialGradient(
      rect.x + rect.width / 2, rect.y + rect.height / 2, Math.min(rect.width, rect.height) * 0.2,
      rect.x + rect.width / 2, rect.y + rect.height / 2, Math.max(rect.width, rect.height) * 0.72,
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, treatment.vignette)})`);
    applyAlpha(context, 1, () => {
      context.fillStyle = gradient;
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
    });
  }
}
