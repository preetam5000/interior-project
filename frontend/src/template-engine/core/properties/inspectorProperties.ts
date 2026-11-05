import type { DesignCommand } from "../commands";
import type { DesignElement } from "../../types/designTemplate";

export type InspectorSection = "Text" | "Image" | "Shape" | "CTA" | "Badge" | "Logo" | "Frame" | "Video";
export const inspectorExtensionPoints = ["animation", "effects", "aiSuggestions", "brandTokens"] as const;
export type InspectorExtensionPoint = typeof inspectorExtensionPoints[number];

export function getInspectorSection(element: Pick<DesignElement, "type">): InspectorSection {
  switch (element.type as string) {
    case "Image": return "Image";
    case "Logo": return "Logo";
    case "Badge": return "Badge";
    case "CTA Button": return "CTA";
    case "Shape":
    case "Gradient":
    case "Divider":
    case "Decorative Object": return "Shape";
    case "Frame": return "Frame";
    case "Video": return "Video";
    default: return "Text";
  }
}

export function setElementPropertiesCommand(
  id: string,
  properties: Partial<Omit<DesignElement, "id" | "type" | "zIndex">>,
): DesignCommand | null {
  if (!id || !Object.keys(properties).length) return null;
  return { type: "SetElementProperties", id, properties };
}
