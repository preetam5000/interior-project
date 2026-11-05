import { applyCommand } from "../commands";
import { HistoryManager } from "../history";
import { getInspectorSection, inspectorExtensionPoints, setElementPropertiesCommand } from "./index";
import type { DesignTemplate } from "../../types/designTemplate";

const template: DesignTemplate = {
  schemaVersion: 2, id: "props", name: "Props", category: "test", description: "", tags: [], thumbnail: "",
  supportedFormats: ["portrait"], canvas: { width: 100, height: 100, unit: "px" }, background: {}, branding: {},
  elements: [{ id: "title", type: "Heading", x: 0.1, y: 0.1, width: 0.5, height: 0.2, rotation: 0, opacity: 1, zIndex: 0, visible: true, locked: false, content: "Title", fontSize: 24 }],
  animations: [], metadata: {},
};

describe("core inspector properties", () => {
  it("maps document node types to inspector sections, including reserved types", () => {
    expect(getInspectorSection({ type: "Heading" })).toBe("Text");
    expect(getInspectorSection({ type: "Image" })).toBe("Image");
    expect(getInspectorSection({ type: "CTA Button" })).toBe("CTA");
    expect(getInspectorSection({ type: "Badge" })).toBe("Badge");
    expect(getInspectorSection({ type: "Logo" })).toBe("Logo");
    expect(getInspectorSection({ type: "Shape" })).toBe("Shape");
    expect(getInspectorSection({ type: "Frame" as never })).toBe("Frame");
    expect(getInspectorSection({ type: "Video" as never })).toBe("Video");
    expect(inspectorExtensionPoints).toEqual(["animation", "effects", "aiSuggestions", "brandTokens"]);
  });

  it("creates property commands and applies them immutably", () => {
    const command = setElementPropertiesCommand("title", { fontSize: 42, color: "#123456", letterSpacing: 1.5 });
    expect(command).toEqual({ type: "SetElementProperties", id: "title", properties: { fontSize: 42, color: "#123456", letterSpacing: 1.5 } });
    const updated = applyCommand(template, command!);
    expect(updated.elements[0]).toMatchObject({ fontSize: 42, color: "#123456", letterSpacing: 1.5 });
    expect(template.elements[0]).toMatchObject({ fontSize: 24 });
    expect(setElementPropertiesCommand("title", {})).toBeNull();
  });

  it("records inspector property updates as undoable transactions", () => {
    const history = new HistoryManager();
    const command = setElementPropertiesCommand("title", { fontSize: 36, opacity: 0.5 })!;
    const changed = history.dispatch(template, [command], ["title"], { source: "template-editor", label: "Edit properties" })!;
    expect(changed.transaction.label).toBe("Edit properties");
    expect(changed.document.elements[0]).toMatchObject({ fontSize: 36, opacity: 0.5 });
    expect(history.undo(changed.document)?.document).toEqual(template);
    expect(history.redo(template)?.document).toEqual(changed.document);
  });
});
