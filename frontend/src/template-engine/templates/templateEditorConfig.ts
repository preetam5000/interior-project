import type { DesignElement, DesignTemplate } from "../types/designTemplate";

type EditorConfig = Record<string, unknown>;

const TEXT_FIELDS: Record<string, string> = { headline: "headline", subtitle: "subtitle", cta: "cta" };

function cleanMetadata(metadata: DesignTemplate["metadata"]): DesignTemplate["metadata"] {
  const { backendTemplateConfig: _backend, legacyTemplateConfig: _legacy, ...publicMetadata } = metadata;
  return publicMetadata;
}

function textElement(elements: readonly DesignElement[], id: string): DesignElement | undefined {
  return elements.find((element) => element.id === id);
}

/** Serialize the current document beside the legacy fields understood by existing APIs. */
export function toTemplateEditorConfig(document: DesignTemplate, currentConfig: EditorConfig): EditorConfig {
  const designDocument: DesignTemplate = { ...document, metadata: cleanMetadata(document.metadata) };
  const config: EditorConfig = { ...currentConfig, design_document: designDocument };
  for (const [nodeId, configField] of Object.entries(TEXT_FIELDS)) {
    const element = textElement(document.elements, nodeId);
    if (element?.content !== undefined) config[configField] = element.content;
  }
  return config;
}

/** Apply a legacy form change while retaining canvas geometry and text edits. */
export function mergeLegacyConfigWithDocument(
  adaptedDocument: DesignTemplate,
  previousDocument: DesignTemplate,
  config: EditorConfig,
  changedField?: string,
): DesignTemplate {
  const oldById = new Map(previousDocument.elements.map((element) => [element.id, element]));
  const updatedContent = new Set(
    Object.entries(TEXT_FIELDS)
      .filter(([nodeId, field]) => {
        const oldContent = oldById.get(nodeId)?.content;
        return typeof config[field] === "string" && config[field] !== oldContent;
      })
      .map(([nodeId]) => nodeId),
  );
  return {
    ...adaptedDocument,
    elements: adaptedDocument.elements.map((element) => {
      const old = oldById.get(element.id);
      if (!old) return element;
      const positionFieldChanged = (changedField === "cta_position" && element.id === "cta")
        || (changedField === "logo_position" && element.id === "logo");
      return {
        ...element,
        x: positionFieldChanged ? element.x : old.x,
        y: positionFieldChanged ? element.y : old.y,
        width: positionFieldChanged ? element.width : old.width,
        height: positionFieldChanged ? element.height : old.height,
        rotation: old.rotation,
        visible: old.visible,
        locked: old.locked,
        content: updatedContent.has(element.id) ? element.content : old.content ?? element.content,
      };
    }),
  };
}
