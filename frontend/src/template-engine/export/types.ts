import type { DesignTemplate } from "../types/designTemplate";
import type { RenderContext, TemplateConfig } from "../types";
import type { BrandKit } from "../brand";

export type ExportFormat = "png" | "jpeg" | "webp" | "svg" | "pdf";
export type ExportProfileId = "instagram-story" | "instagram-feed" | "carousel" | "reel-cover";
export type ExportSourceKind = "legacy" | "design-document";
export type ExportDocumentInput = DesignTemplate | TemplateConfig | string | Record<string, unknown>;

export interface ExportRenderContext extends Partial<RenderContext> {
  assets?: Record<string, string>;
  brand?: Record<string, string>;
}

export interface ExportRequest {
  document: ExportDocumentInput;
  context?: ExportRenderContext;
  brandKit?: BrandKit;
  format: ExportFormat;
  profile: ExportProfileId;
  quality?: number;
  safeZones?: boolean;
  scale?: 1 | 2 | 3 | 4;
  transparentBackground?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: { stage: "preparing" | "rendering" | "encoding"; progress: number }) => void;
}

export interface ExportProfile {
  id: ExportProfileId;
  label: string;
  width: number;
  height: number;
  legacyVariant: "portrait" | "story" | "square";
  safeInsets: { top: number; right: number; bottom: number; left: number };
  designFormat: "portrait" | "story" | "square" | "landscape";
}

export interface PreparedExport {
  sourceKind: ExportSourceKind;
  document: DesignTemplate | TemplateConfig;
  context: ExportRenderContext;
  profile: ExportProfile;
  format: ExportFormat;
  quality: number;
  safeZone: { x: number; y: number; width: number; height: number } | null;
  transparentBackground: boolean;
}

export interface ExportSurface {
  width: number;
  height: number;
  canvas?: HTMLCanvasElement;
  svg?: string;
}

export interface ExportResult {
  blob: Blob;
  format: ExportFormat;
  mimeType: string;
  width: number;
  height: number;
  profile: ExportProfileId;
  animationMetadata?: unknown[];
}

export interface ExportPipelineService {
  prepare(request: ExportRequest): Promise<PreparedExport>;
}
