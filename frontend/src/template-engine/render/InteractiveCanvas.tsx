import { useMemo, useState } from "react";
import type { DesignElement, DesignFormat, DesignRenderContext, DesignTemplate } from "../types/designTemplate";
import { parseTemplateDocument } from "../templates/validateDesignTemplate";
import CanvasStage from "./CanvasStage";
import TextEditorOverlay from "./overlays/TextEditorOverlay";
import { useCanvas } from "./hooks/useCanvas";
import type { CommandBatch } from "../core/commands";
import type { LayerNode } from "../core/layers";
import LayersPanel from "./layers/LayersPanel";
import InspectorPanel from "./inspector/InspectorPanel";
import KeyboardEventBridge from "./events/KeyboardEventBridge";
import type { KeyboardInput } from "../core/keybindings";

export const useInteractiveCanvas = true;
export interface InteractiveCanvasProps {
  template: DesignTemplate | string;
  context?: DesignRenderContext;
  format?: DesignFormat;
  selectedIds: string[];
  onSelectionChange: (id: string | null, modifiers?: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void;
  onSelectionReplace: (ids: string[], additive?: boolean) => void;
  onTransaction: (transaction: CommandBatch) => void;
  layers: LayerNode[];
  onLayerRename: (id: string, name: string) => void;
  onLayerRemoved: (id: string) => void;
  inspectedElement: DesignElement | null;
  onKeyboardInput: (input: KeyboardInput) => boolean;
  className?: string;
}

export default function InteractiveCanvas({ template: input, context = {}, format: initialFormat = "portrait", selectedIds, onSelectionChange, onSelectionReplace, onTransaction, layers, onLayerRename, onLayerRemoved, inspectedElement, onKeyboardInput, className = "" }: InteractiveCanvasProps) {
  const template = useMemo(() => parseTemplateDocument(input), [input]);
  const [format, setFormat] = useState<DesignFormat>(initialFormat);
  const [safeZoneFormat, setSafeZoneFormat] = useState<DesignFormat | null>(null);
  const [activePanel, setActivePanel] = useState<"layers" | "inspector" | null>(null);
  const [editing, setEditing] = useState<{ node: DesignElement; rect: { left: number; top: number; width: number; height: number; rotation: number; fontScale: number } } | null>(null);
  const { commit, commitTransaction } = useCanvas(onTransaction);

  const changeText = (text: string) => {
    if (editing) commit({ type: "ChangeText", id: editing.node.id, content: text });
    setEditing(null);
  };
  const cancelText = () => setEditing(null);

  return (
    <div className={`relative flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-border ${className}`}>
      <KeyboardEventBridge onInput={onKeyboardInput} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <span className="text-xs font-medium">Interactive Canvas</span>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-2">Format
            <select className="rounded-md border border-input bg-background px-2 py-1" value={format} onChange={(event) => setFormat(event.target.value as DesignFormat)}>
              {(["story", "portrait", "square", "landscape"] as DesignFormat[]).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">Safe zone
            <select className="rounded-md border border-input bg-background px-2 py-1" value={safeZoneFormat || "off"} onChange={(event) => setSafeZoneFormat(event.target.value === "off" ? null : event.target.value as DesignFormat)}>
              <option value="off">Off</option><option value="story">Instagram Story</option><option value="portrait">Instagram Feed</option><option value="square">Carousel</option>
            </select>
          </label>
          <button type="button" aria-expanded={activePanel === "layers"} aria-controls="interactive-layers-panel" className="rounded-md border border-input px-2 py-1" onClick={() => setActivePanel((value) => value === "layers" ? null : "layers")}>Layers</button>
          <button type="button" aria-expanded={activePanel === "inspector"} aria-controls="interactive-inspector-panel" className="rounded-md border border-input px-2 py-1" onClick={() => setActivePanel((value) => value === "inspector" ? null : "inspector")}>Inspector</button>
        </div>
      </div>
      <div className="relative min-h-[380px] flex-1">
        <CanvasStage
          template={template}
          context={context}
          format={format}
          selectedIds={selectedIds}
          onSelectMany={(ids, additive) => onSelectionReplace(ids, additive)}
          safeZoneFormat={safeZoneFormat}
          onSelect={onSelectionChange}
          onTransaction={commitTransaction}
          onEdit={(node, rect) => {
            if (["Text", "Heading", "Subtitle", "Body Text", "CTA Button"].includes(node.type)) setEditing({ node, rect });
          }}
        />
        {activePanel === "layers" && <LayersPanel
          tree={layers}
          elements={template.elements}
          selectedIds={selectedIds}
          onSelect={onSelectionChange}
          onCommands={commitTransaction}
          onRename={onLayerRename}
          onRemove={onLayerRemoved}
        />}
        {activePanel === "inspector" && <InspectorPanel
          key={inspectedElement?.id || "empty-inspector"}
          element={inspectedElement}
          elements={template.elements}
          canvas={format === "story" ? { width: 1080, height: 1920 } : format === "square" ? { width: 1080, height: 1080 } : format === "landscape" ? { width: 1920, height: 1080 } : { width: 1080, height: 1350 }}
          onCommands={commitTransaction}
        />}
        <TextEditorOverlay node={editing?.node || null} rect={editing?.rect || null} onCommit={changeText} onCancel={cancelText} />
      </div>
    </div>
  );
}
