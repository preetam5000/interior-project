# Template engine architecture

This package defines a reusable, JSON-driven design system. It contains the
contract and extension points only; it does not contain template instances or
replace the current production renderer.

## Package map

| Path | Responsibility |
| --- | --- |
| `schema/template-config.schema.json` | Authoritative, versioned JSON contract and validation constraints. |
| `interfaces.py` | Python TypedDicts for configs and render input/output. |
| `templates/` | Future JSON template instances; intentionally empty for now. |
| `renderers/` | Output adapters implementing the shared `Renderer` protocol. |
| `components/` | Reusable visual primitives, independent of template identity. |
| `assets/` | Logical asset resolution (logos, textures, fonts) without filesystem paths in configs. |
| `styles/` | Shared tokens and reusable typography/color/shape treatments. |

## Contract objects

`TemplateConfig` composes `LayoutConfig`, `TypographyConfig`, `ColorConfig`,
`OverlayConfig`, `LogoConfig`, `BadgeConfig`, `CTAConfig`, `DecorationConfig`,
`ImageFilterConfig`, `AnimationConfig`, and content bindings. Repeated visual
objects refer to regions and assets by logical IDs rather than duplicating
layout or asset-specific code.

Geometry uses normalized 0–1 coordinates, allowing layout to adapt to a target
canvas. The schema disallows unknown keys and validates ranges and enumerations.
`schema_version` is required so future migrations can preserve saved template
documents.

## Rendering pipeline

1. Load a template JSON document and validate it against the schema.
2. Migrate older schema versions and normalize brand/style tokens.
3. Resolve content bindings and logical assets.
4. Select output variant and compute canvas, regions, anchors and safe areas.
5. Apply image treatment, then compose reusable components in configured layer
   order.
6. Pass the composed scene to a format-specific `Renderer`.
7. Return output path and dimensions through `RenderResult`.

The same validated config and render context are intended for preview and
export. Animation properties are part of the portable contract, but animated
exports require an animation-capable renderer; still-image adapters can render
the configured poster frame.

## Extension boundaries

- Adding a new design means adding data, not a template-specific rendering
  function.
- Adding a visual primitive means implementing a reusable `Component`.
- Adding an output format means implementing `Renderer` without changing
  template JSON.
- `AssetResolver` owns safe lookup, caching and format normalization for
  logical asset references.
- The frontend editor should consume the same schema and backend preview
  endpoint; it should not implement a separate final renderer.

## Existing implementation

The production upload pipeline currently uses `services.template_service` and
the Pillow renderer. Its AI recommendation generates template-matched headline,
subtitle, CTA, badge, story sticker, location label, progress percentage, and
completion stage content. These fields are retained under
`analysis.template_content`; the story sticker is also used as the post's
`story_text`. Estimated progress is marked with `progress_is_estimate`, and
unknown locations are left blank rather than invented.

The versioned JSON contract in this package remains an architecture extension
point; preview/export migration can later route the existing production path
through a schema adapter while preserving saved templates.
