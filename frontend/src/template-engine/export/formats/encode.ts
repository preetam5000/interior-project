import { EXPORT_MIME_TYPES } from "./profiles";
import type { ExportFormat, ExportResult, ExportSurface, ExportProfileId } from "../types";

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function surfaceSvg(surface: ExportSurface): string {
  if (surface.svg) return surface.svg;
  if (!surface.canvas) throw new Error("Export renderer produced neither SVG nor canvas output.");
  const image = surface.canvas.toDataURL("image/png");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${surface.width}" height="${surface.height}" viewBox="0 0 ${surface.width} ${surface.height}"><image width="100%" height="100%" href="${xmlEscape(image)}" /></svg>`;
}

async function rasterCanvas(surface: ExportSurface): Promise<HTMLCanvasElement> {
  if (surface.canvas) return surface.canvas;
  if (!surface.svg) throw new Error("Export renderer produced no drawable surface.");
  const blob = new Blob([surface.svg], { type: "image/svg+xml" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not rasterize SVG export."));
      image.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = surface.width;
    canvas.height = surface.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser does not support a 2D export canvas.");
    context.drawImage(image, 0, 0, surface.width, surface.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error(`Could not encode ${mimeType} output.`));
      if (blob.type && blob.type !== mimeType) return reject(new Error(`This browser does not support ${mimeType} export.`));
      resolve(blob);
    }, mimeType, quality);
  });
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function makePdf(jpegDataUrl: string, width: number, height: number): Blob {
  const imageData = decodeBase64(jpegDataUrl.slice(jpegDataUrl.indexOf(",") + 1));
  const encoder = new TextEncoder();
  const stream = concat([encoder.encode(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`)]);
  const objects = [
    encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"),
    encoder.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`),
    concat([encoder.encode(`<< /Length ${stream.length} >>\nstream\n`), stream, encoder.encode("endstream")]),
    concat([encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageData.length} >>\nstream\n`), imageData, encoder.encode("\nendstream")]),
  ];
  const parts: Uint8Array[] = [encoder.encode("%PDF-1.4\n")];
  const offsets = [0];
  let offset = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const wrapped = concat([encoder.encode(`${index + 1} 0 obj\n`), object, encoder.encode("\nendobj\n")]);
    parts.push(wrapped);
    offset += wrapped.length;
  });
  const xrefOffset = offset;
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((item) => `${String(item).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(encoder.encode(xref));
  const bytes = concat(parts);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([buffer], { type: "application/pdf" });
}

export async function encodeExportSurface(
  surface: ExportSurface,
  format: ExportFormat,
  quality: number,
  profile: ExportProfileId,
): Promise<ExportResult> {
  const q = Math.max(0, Math.min(1, quality));
  let blob: Blob;
  if (format === "svg") {
    blob = new Blob([surfaceSvg(surface)], { type: EXPORT_MIME_TYPES.svg });
  } else {
    const canvas = await rasterCanvas(surface);
    if (format === "pdf") blob = makePdf(canvas.toDataURL("image/jpeg", q), surface.width, surface.height);
    else blob = await canvasBlob(canvas, EXPORT_MIME_TYPES[format], q);
  }
  return { blob, format, mimeType: EXPORT_MIME_TYPES[format], width: surface.width, height: surface.height, profile };
}
