import { ExportEngine } from "./ExportEngine";
import { getExportMimeType, getExportProfile } from "./formats/profiles";
import { LegacyCanvasExportRenderer } from "./renderers/LegacyCanvasRenderer";
import { ExportRendererRegistry } from "./renderers/ExportRendererRegistry";
import { prepareExportRequest } from "./services/pipeline";
import { exportExtensionPoints } from "./services/effects";
import type { TemplateConfig } from "../types";
import type { DesignTemplate } from "../types/designTemplate";
import type { PreparedExport } from "./types";
import type { CanvasRenderer } from "../renderers/CanvasRenderer";
import type { BrandKit } from "../brand";

const typography = { family: "Arial", fallback_family: "Arial", size: 40, weight: "regular" as const, line_height: 1.2, letter_spacing: 0, text_transform: "none" as const, alignment: "center" as const, color: "$text" };
const legacy: TemplateConfig = {
  schema_version: 1, id: "legacy", name: "Legacy template",
  layout: { aspect_ratio: "4:5", safe_area: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 }, regions: { headline: { x: 0.1, y: 0.7, width: 0.8, height: 0.2 }, cta: { x: 0.1, y: 0.8, width: 0.8, height: 0.08 } }, layer_order: ["image", "headline", "cta"] },
  typography, colors: { primary: "$brand.primary", secondary: "#222222", accent: "#333333", text: "$brand.text", surface: "#ffffff" }, overlays: [],
  logo: { enabled: false, asset_ref: "", region: "headline", anchor: "top_left", width: 0.2, opacity: 1, treatment: "original" },
  badges: [], cta: { enabled: false, text_binding: "content.cta", region: "cta", anchor: "bottom_left", style: "filled", typography, background_color: "$primary", text_color: "$text", border_color: "$primary", radius: 8, padding: {} },
  decorations: [], image_treatment: { fit: "cover", focal_point: { x: 0.5, y: 0.5 }, brightness: 1, contrast: 1, saturation: 1, blur: 0, grayscale: 0, vignette: 0 },
  animations: { enabled: false, duration_ms: 0, easing: "linear", poster_time_ms: 0, motions: [] },
  content_bindings: { headline: "content.headline", subtitle: "content.subtitle", cta: "content.cta", badge: "content.badge" },
};

const design: DesignTemplate = {
  schemaVersion: 2, id: "design", name: "Design", category: "test", description: "Export test", tags: [], thumbnail: "",
  supportedFormats: ["portrait", "story", "square"], canvas: { width: 1080, height: 1350, unit: "px", safeZones: { portrait: { top: 0.1, right: 0.05, bottom: 0.1, left: 0.05 } } },
  background: { color: "$surface" }, branding: { palette: { surface: "#fefefe", primary: "#123456" } },
  elements: [
    { id: "room", type: "Image", x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, zIndex: 0, visible: true, locked: false, source: "asset:room" },
    { id: "headline", type: "Heading", x: 0.1, y: 0.1, width: 0.8, height: 0.2, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, content: "Hello", fontFamily: "Arial", fontSize: 48, fontWeight: 700, lineHeight: 1.2, letterSpacing: 0, alignment: "center", color: "$primary" },
  ],
  animations: [], metadata: {},
};

describe("export architecture", () => {
  it("provides output profiles and format architecture", () => {
    expect(getExportProfile("instagram-story")).toMatchObject({ width: 1080, height: 1920, legacyVariant: "story" });
    expect(getExportProfile("instagram-feed")).toMatchObject({ width: 1080, height: 1350, legacyVariant: "portrait" });
    expect(getExportProfile("carousel")).toMatchObject({ width: 1080, height: 1080, legacyVariant: "square" });
    expect(getExportProfile("reel-cover")).toMatchObject({ width: 1080, height: 1920 });
    expect(["png", "jpeg", "webp", "svg", "pdf"].map((format) => getExportMimeType(format as "png"))).toEqual(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "application/pdf"]);
    expect(exportExtensionPoints).toEqual(["animation", "video", "gif", "lottie"]);
  });

  it("prepares legacy templates through token and safe-zone stages without mutating source", async () => {
    const prepared = await prepareExportRequest({ document: legacy, format: "png", profile: "instagram-feed", context: { brand: { primary: "#aa0000", text: "#ffffff" } } });
    expect(prepared.sourceKind).toBe("legacy");
    expect((prepared.document as TemplateConfig).colors.primary).toBe("#aa0000");
    expect(prepared.safeZone).toEqual({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
    expect(legacy.colors.primary).toBe("$brand.primary");
  });

  it("resolves design tokens and assets before rendering, preserving document data", async () => {
    const prepared = await prepareExportRequest({ document: design, format: "svg", profile: "instagram-story", context: { assets: { room: "https://assets.example/room.jpg" } } });
    expect(prepared.sourceKind).toBe("design-document");
    expect((prepared.document as DesignTemplate).background.color).toBe("#fefefe");
    expect(prepared.context.assets?.room).toBe("https://assets.example/room.jpg");
    expect(prepared.context.assets?.["asset:room"]).toBe("https://assets.example/room.jpg");
    expect(prepared.safeZone).toBeTruthy();
    expect(design.background.color).toBe("$surface");
  });

  it("resolves standalone Brand Kit tokens in design documents and export context", async () => {
    const brandKit: BrandKit = { id: "kit", name: "Studio", colors: { primary: "#aabbcc" }, fonts: { heading: "Studio Serif" }, logo: "brand-logo.png" };
    const branded = { ...design, elements: design.elements.map((element) => element.id === "headline" ? { ...element, color: "$brand.colors.primary", fontFamily: "$brand.fonts.heading" } : element) };
    const prepared = await prepareExportRequest({ document: branded, format: "svg", profile: "instagram-feed", brandKit });
    const heading = (prepared.document as DesignTemplate).elements.find((element) => element.id === "headline");
    expect(heading).toMatchObject({ color: "#aabbcc", fontFamily: "Studio Serif" });
    expect(prepared.context.brand).toMatchObject({ primary: "#aabbcc", "font.heading": "Studio Serif", logo: "brand-logo.png" });
    expect((branded.elements.find((element) => element.id === "headline"))).toMatchObject({ color: "$brand.colors.primary", fontFamily: "$brand.fonts.heading" });
  });

  it("keeps legacy rendering delegated to the existing CanvasRenderer adapter", async () => {
    const canvas = { width: 1080, height: 1350 } as HTMLCanvasElement;
    const render = jest.fn(async () => canvas);
    const renderer = new LegacyCanvasExportRenderer({ render } as unknown as Pick<CanvasRenderer, "render">);
    const prepared = await prepareExportRequest({ document: legacy, format: "jpeg", profile: "instagram-story", context: { imageSrc: "photo.jpg" } });
    const surface = await renderer.render(prepared);
    expect(surface.canvas).toBe(canvas);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ variant: "story", context: expect.objectContaining({ imageSrc: "photo.jpg" }) }));
  });

  it("keeps legacy documents exportable through the engine renderer registry", async () => {
    const canvas = { width: 1080, height: 1350, toDataURL: () => "data:image/png;base64,cG5n" } as unknown as HTMLCanvasElement;
    const legacyRenderer = new LegacyCanvasExportRenderer({ render: async () => canvas } as unknown as Pick<CanvasRenderer, "render">);
    const registry = new ExportRendererRegistry();
    registry.register(legacyRenderer);
    const result = await new ExportEngine({ renderers: registry }).export({ document: legacy, format: "svg", profile: "instagram-feed" });
    expect(result).toMatchObject({ format: "svg", mimeType: "image/svg+xml", width: 1080, height: 1350 });
  });

  it("exports DesignTemplate documents to SVG while leaving animation rendering disabled", async () => {
    const result = await new ExportEngine().export({ document: design, format: "svg", profile: "instagram-feed", context: { assets: { room: "https://assets.example/room.jpg" } } });
    const svg = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(result.blob);
    });
    expect(result).toMatchObject({ format: "svg", mimeType: "image/svg+xml", width: 1080, height: 1350, profile: "instagram-feed" });
    expect(svg).toContain("#123456");
    expect(svg).toContain("Hello");
    expect(svg).toContain("https://assets.example/room.jpg");
    expect(svg).not.toContain("<animate");
  });
});
