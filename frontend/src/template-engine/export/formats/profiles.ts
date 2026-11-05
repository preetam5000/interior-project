import type { ExportProfile, ExportProfileId, ExportFormat } from "../types";

export const EXPORT_PROFILES: Record<ExportProfileId, ExportProfile> = {
  "instagram-story": { id: "instagram-story", label: "Instagram Story", width: 1080, height: 1920, legacyVariant: "story", designFormat: "story", safeInsets: { top: 0.12, right: 0.06, bottom: 0.18, left: 0.06 } },
  "instagram-feed": { id: "instagram-feed", label: "Instagram Feed", width: 1080, height: 1350, legacyVariant: "portrait", designFormat: "portrait", safeInsets: { top: 0.04, right: 0.04, bottom: 0.04, left: 0.04 } },
  carousel: { id: "carousel", label: "Carousel", width: 1080, height: 1080, legacyVariant: "square", designFormat: "square", safeInsets: { top: 0.04, right: 0.04, bottom: 0.04, left: 0.04 } },
  "reel-cover": { id: "reel-cover", label: "Reel Cover", width: 1080, height: 1920, legacyVariant: "story", designFormat: "story", safeInsets: { top: 0.14, right: 0.06, bottom: 0.22, left: 0.06 } },
};

export const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

export function getExportProfile(id: ExportProfileId): ExportProfile { return EXPORT_PROFILES[id]; }
export function getExportMimeType(format: ExportFormat): string { return EXPORT_MIME_TYPES[format]; }
