import { applyTransaction } from "../core/commands";
import { parseTemplateDocument } from "./validateDesignTemplate";
import { mergeLegacyConfigWithDocument, toTemplateEditorConfig } from "./templateEditorConfig";

const config = {
  template_type: "LUXURY_SHOWCASE",
  headline: "A considered interior",
  subtitle: "Thoughtful details, made to last",
  cta: "Discover more",
  logo_url: "",
  primary_color: "",
  secondary_color: "",
  font: "serif",
  text_align: "left",
  overlay_opacity: 0.6,
  show_badge: true,
  show_logo: true,
  cta_position: "stack",
  logo_position: "top_left",
  button_style: "rounded",
};

describe("Template Editor document/config synchronization", () => {
  test("canvas commands survive save, refresh, and reopening through the legacy config payload", () => {
    const initial = parseTemplateDocument(config);
    const headline = initial.elements.find((element) => element.id === "headline");
    expect(headline).toBeDefined();

    const edited = applyTransaction(initial, [
      { type: "MoveNode", id: "headline", x: 0.19, y: 0.31 },
      { type: "ResizeNode", id: "headline", x: 0.19, y: 0.31, width: 0.62, height: 0.18 },
      { type: "RotateNode", id: "headline", rotation: 15 },
      { type: "ChangeText", id: "headline", content: "Made for living" },
    ]);

    // TemplateEditor Save/Apply/Preview all receive this serialized config.
    const savePayload = toTemplateEditorConfig(edited, config);
    expect(savePayload.headline).toBe("Made for living");
    expect(savePayload.design_document).toBeDefined();

    // The backend's returned library config is the refresh response reopened by the editor.
    const refreshedConfig = JSON.parse(JSON.stringify(savePayload));
    const reopened = parseTemplateDocument(refreshedConfig);
    const reopenedHeadline = reopened.elements.find((element) => element.id === "headline");
    expect(reopenedHeadline).toMatchObject({
      x: 0.19,
      y: 0.31,
      width: 0.62,
      height: 0.18,
      rotation: 15,
      content: "Made for living",
    });
    expect(refreshedConfig).toMatchObject({
      template_type: config.template_type,
      headline: "Made for living",
      subtitle: config.subtitle,
      cta: config.cta,
    });
  });

  test("legacy form edits update their document fields without losing canvas transforms", () => {
    const previous = parseTemplateDocument(config);
    const moved = applyTransaction(previous, [{ type: "MoveNode", id: "headline", x: 0.2, y: 0.25 }]);
    const changedLegacyConfig = { ...config, headline: "A new headline" };
    const withoutDocument = { ...changedLegacyConfig };
    const adapted = parseTemplateDocument(withoutDocument);
    const merged = mergeLegacyConfigWithDocument(adapted, moved, changedLegacyConfig, "headline");
    const saved = toTemplateEditorConfig(merged, changedLegacyConfig);
    const reopened = parseTemplateDocument(JSON.parse(JSON.stringify(saved)));
    expect(reopened.elements.find((element) => element.id === "headline")).toMatchObject({
      x: 0.2,
      y: 0.25,
      content: "A new headline",
    });
  });

  test("old flat configs still adapt without gaining a document extension", () => {
    const oldDocument = parseTemplateDocument(config);
    expect(oldDocument.elements.find((element) => element.id === "headline")?.content).toBe(config.headline);
    expect(config).not.toHaveProperty("design_document");
  });
});
