# Interior Social AI design engine

## JSON-driven design templates

New engine templates use `schemaVersion: 2` and the contract in
`backend/template_engine/schema/design-template-v2.schema.json`. A design is
data: catalog metadata, canvas and safe zones, background and brand tokens,
normalized elements, animations, and extensible metadata. Element positions
and dimensions use normalized 0–1 values; `zIndex` controls stacking.

`DesignTemplateRenderer` reads this JSON, resolves the output format and
bindings, sorts elements by z-index, and creates React elements through
`DESIGN_ELEMENT_REGISTRY`. Each element's styles and transforms are applied
independently of its template identity. Adding another template is data
registration; adding a new visual primitive is a registry component, not a
template layout branch.

The registry supports Image, Text, Heading, Subtitle, Logo, Badge, CTA Button,
Shape, Divider, Gradient, Icon, Progress Bar, QR Code, Social Handle, Sticker,
and Decorative Object. `validateDesignTemplate` checks required metadata,
unique element IDs, positions/bounds, supported types, colors, fonts, and
animation targets before registry insertion or rendering.

`TemplateRegistry` is the loading/catalog boundary. It validates registrations,
rejects duplicate IDs, and provides category/search filtering. The existing
30-template JSON-backed catalog is automatically registered through
`fromLegacyTemplateConfig`; the adapter retains the original v1 configuration
in metadata for round-trip migration and does not change the existing editor or
canvas export path.

### Engine structure

```text
template-engine/
  types/                  v2 schema TypeScript contracts
  templates/              registries, legacy adapter, validation
  components/             reusable element renderers and registry
  renderers/              React design stage and legacy canvas exporter
  layouts/ typography/     existing v1 compatibility utilities
  overlays/ assets/        shared existing assets and drawing helpers
backend/template_engine/schema/
  design-template-v2.schema.json
```

### Class diagram

```text
TemplateRegistry --> DesignTemplateValidator
TemplateRegistry --> LegacyTemplateAdapter --> DesignTemplate
DesignTemplateRenderer --> DesignTemplate
DesignTemplateRenderer --> ElementRendererRegistry
ElementRendererRegistry --> ElementRenderer [Image, Text, Shape, ...]
DesignTemplateRenderer --> RenderContext [assets, content, brand, format]
Legacy TemplateRenderer --> CanvasRenderer [existing v1 API/export]
```

### Loading and render flow

```text
JSON or legacy config
  -> parseDesignTemplate / fromLegacyTemplateConfig
  -> validate schema and element registry references
  -> register by unique template id
  -> resolve asset, content, and brand bindings
  -> sort elements by zIndex
  -> create React elements from the component registry
  -> apply normalized geometry, styles, rotation, opacity, and animation
  -> render a responsive canvas stage
```

The current engine work is architecture-only: it does not add drag/drop,
editing UI, autosave, or a new export pipeline. Existing v1 templates keep using
the current CanvasRenderer and its portrait/story/square export behavior.

### Design Dev Tool

In development builds, `DesignTemplateRenderer` includes a hidden diagnostics
panel, opened with **Alt + Shift + D** and closed with **Escape**. It reports
template validation status, element types/counts, animations, base canvas and
active format dimensions, and the normalized JSON (with a copy action). The
panel is not rendered in production builds and does not change template data.

## Existing v1 canvas renderer

The renderer accepts a JSON string or a `TemplateConfig`, then composes a
source image and reusable canvas components according to the document's
`layout.layer_order`. Template identity is not used to select rendering code.
New templates can be authored with existing layer types and region definitions
without changing the renderer.

## Layout engine

`resolveLayout(layout, variant)` resolves one of the reusable geometry presets:
Hero Bottom, Hero Center, Split Screen, Magazine, Minimal, Editorial, Blueprint,
Timeline, Progress, Comparison, Collage, Full Image, Diagonal, or Luxury.
Each preset defines headline, subtitle, logo, badge, and CTA regions; separate
portrait/story safe zones; portrait/story focal crops; and one or more image
regions. The renderer resolves a preset before drawing, so every preset uses
the same component implementations.

Preset JSON can specify `"layout": { "preset": "split-screen", "layer_order": [] }`
without embedding regions. Optional `regions`, `image_regions`, `safe_zones`,
and `crops` override the generated defaults. Use `RenderContext.images` keyed
by image-region ID to provide different images for comparison or collage
regions; absent a region-specific image, the source image is reused.

## Typography presets

`TYPOGRAPHY_PRESETS` provides Luxury, Modern, Minimal, Construction, Editorial,
Architectural, Magazine, Elegant, Bold, and Instagram styles. Each preset
includes a primary and fallback font family, weight, tracking, text shadow,
line height, alignment, and clamped responsive scaling.
`applyTypographyPreset(config, "editorial")` materializes the selected style
into a reusable `TypographyConfig` while retaining its size, color, and text
transform; optional overrides can customize the preset values. The shared text,
badge, and CTA renderers apply the resulting tracking, shadow, line-height, and
responsive size consistently. Shadow and responsive-scaling settings are
optional so existing configurations retain their current appearance.

## Reusable overlays

`OVERLAY_PRESETS` and `createOverlayConfig(style, { id, region, overrides })`
provide reusable JSON configurations for luxury gradient, dark gradient,
glass, blur, blueprint grid, golden frame, corner accents, progress ribbon,
diagonal stripe, noise texture, paper texture, and film grain. Every overlay
supports opacity, blend mode, color, and region; style-specific fields include
gradient angle/colors, blur radius, grid spacing, frame inset/line width,
stripe or texture scale/seed, ribbon text/size, and glass intensity/radius.
Use `"canvas"` as the region to cover the full output, or reference a named
layout region. `drawOverlay` is shared and the same JSON settings are used by
the canvas renderer. Texture tiles are generated deterministically and cached.

## Premium template catalog

`templates/premium-template-specs.json` and
`templates/premium-template-copy.json` define 30 data-driven premium designs.
`PREMIUM_TEMPLATES` materializes each spec into a full `TemplateConfig` using
one shared builder; the renderer has no template-name branches.
`getPremiumTemplate(id)` retrieves a config and
`serializePremiumTemplate(id)` exports it as standalone JSON. The catalog
includes unique layout geometry, typography, color palette, overlay layers,
badge, and CTA for every template. `content.headline`, `content.subtitle`,
`content.badge`, and `content.cta` can override each template's included
default copy at render time.

## Usage

```tsx
import { useRef } from "react";
import TemplateRenderer, {
  type TemplateRendererHandle,
  type TemplateConfig,
} from "@/template-engine";

function Preview({ config, imageUrl }: { config: TemplateConfig; imageUrl: string }) {
  const renderer = useRef<TemplateRendererHandle>(null);

  return (
    <>
      <TemplateRenderer
        ref={renderer}
        config={config}
        imageSrc={imageUrl}
        variant="portrait"
        content={{ headline: "A considered space", subtitle: "Designed around you", cta: "Enquire" }}
      />
      <button onClick={() => renderer.current?.exportImage("story", "image/png")}>
        Export story
      </button>
    </>
  );
}
```

`loadTemplateConfig(url)` fetches and parses a JSON document. `parseTemplateConfig`
accepts JSON text or an already-parsed object. The renderer exposes portrait
(1080×1350), story (1080×1920), and square (1080×1080) output variants; exports
can be PNG, JPEG, or WebP.

## Layer order

`layout.layer_order` accepts `image`, `overlay:<id>`, `decoration:<id>`,
`logo`, `badge:<id>`, `headline`, `subtitle`, and `cta`. Each visual object
references a named region. Region positions and sizes are normalized inside
the configured safe area. If the order is empty, the engine uses a standard sequence;
if image is omitted from a custom order, it is placed first. Invalid layer and
region references produce an explicit render error.

The engine currently renders still images. Animation fields are retained in
the config contract for future output adapters; this canvas renderer renders a
poster/still and does not encode animation.
