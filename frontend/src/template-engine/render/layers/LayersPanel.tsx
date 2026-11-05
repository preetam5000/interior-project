import { memo, useCallback, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Copy, Eye, EyeOff, Lock, Trash2, Unlock } from "lucide-react";
import type { DesignCommand } from "../../core/commands";
import { layerOrderCommands, reorderLayerCommands } from "../../core/layers";
import type { LayerNode } from "../../core/layers";
import type { DesignElement } from "../../types/designTemplate";

const ROW_HEIGHT = 36;
const VIEWPORT_HEIGHT = 288;

function flatten(nodes: readonly LayerNode[], depth = 0): Array<{ node: LayerNode; depth: number }> {
  return nodes.flatMap((node) => [{ node, depth }, ...(node.expanded ? flatten(node.children, depth + 1) : [])]);
}

function duplicateId(id: string, elements: readonly DesignElement[]): string {
  const candidate = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${id}-copy-${crypto.randomUUID().slice(0, 8)}`
    : `${id}-copy-${Date.now()}`;
  return elements.some((element) => element.id === candidate) ? duplicateId(`${id}-copy`, elements) : candidate;
}

interface LayerRowProps {
  node: LayerNode;
  depth: number;
  top: number;
  selected: boolean;
  onSelect: (id: string, modifiers: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void;
  onCommand: (commands: readonly DesignCommand[]) => void;
  onOrder: (id: string, action: "forward" | "backward") => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, value: string) => void;
  onRemove: (id: string) => void;
  onDropLayer: (sourceId: string, targetId: string) => void;
}

const LayerRowComponent = function LayerRow({ node, depth, top, selected, onSelect, onCommand, onOrder, onDuplicate, onRename, onRemove, onDropLayer }: LayerRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.name);
  const renameFinished = useRef(false);
  const finishRename = () => {
    if (renameFinished.current) return;
    renameFinished.current = true;
    onRename(node.id, draft);
    setEditing(false);
  };
  const click = (event: MouseEvent<HTMLDivElement>) => onSelect(node.id, { ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey });
  const startDrag = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("text/layer-id", node.id);
    event.dataTransfer.effectAllowed = "move";
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/layer-id");
    if (sourceId) onDropLayer(sourceId, node.id);
  };
  return (
    <div
      role="option"
      aria-selected={selected}
      draggable
      onDragStart={startDrag}
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
      onClick={click}
      onDoubleClick={() => { renameFinished.current = false; setDraft(node.name); setEditing(true); }}
      className={`group absolute left-0 flex items-center gap-1 border-b border-border/50 px-1 text-xs ${selected ? "bg-primary/15" : "hover:bg-muted/60"}`}
      style={{ top, height: ROW_HEIGHT, width: "100%", paddingLeft: 8 + depth * 14 }}
      title={`${node.name} · ${node.type}`}
    >
      {editing ? <input
        autoFocus
        value={draft}
        aria-label="Rename layer"
        className="min-w-0 flex-1 rounded border border-input bg-background px-1 py-0.5 outline-none"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finishRename}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); finishRename(); } if (event.key === "Escape") { renameFinished.current = true; setEditing(false); } }}
        onClick={(event) => event.stopPropagation()}
      /> : <span className="min-w-0 flex-1 truncate">{node.name}</span>}
      <span className="max-w-14 truncate text-[10px] text-muted-foreground">{node.type}</span>
      <button type="button" aria-label={node.visible ? "Hide layer" : "Show layer"} title={node.visible ? "Hide" : "Show"} className="p-1" onClick={(event) => { event.stopPropagation(); onCommand([{ type: "SetNodeVisibility", id: node.id, visible: !node.visible }]); }}>
        {node.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
      </button>
      <button type="button" aria-label={node.locked ? "Unlock layer" : "Lock layer"} title={node.locked ? "Unlock" : "Lock"} className="p-1" onClick={(event) => { event.stopPropagation(); onCommand([{ type: "SetNodeLocked", id: node.id, locked: !node.locked }]); }}>
        {node.locked ? <Lock className="h-3 w-3 text-amber-500" /> : <Unlock className="h-3 w-3" />}
      </button>
      <button type="button" aria-label="Move layer forward" title="Bring forward" className="p-1" onClick={(event) => { event.stopPropagation(); onOrder(node.id, "forward"); }}><ArrowUp className="h-3 w-3" /></button>
      <button type="button" aria-label="Move layer backward" title="Send backward" className="p-1" onClick={(event) => { event.stopPropagation(); onOrder(node.id, "backward"); }}><ArrowDown className="h-3 w-3" /></button>
      <button type="button" aria-label="Duplicate layer" title="Duplicate" className="p-1" onClick={(event) => { event.stopPropagation(); onDuplicate(node.id); }}><Copy className="h-3 w-3" /></button>
      <button type="button" aria-label="Delete layer" title="Delete" className="p-1 text-destructive" onClick={(event) => { event.stopPropagation(); onCommand([{ type: "DeleteNode", id: node.id }]); onRemove(node.id); }}><Trash2 className="h-3 w-3" /></button>
    </div>
  );
};

const LayerRow = memo(LayerRowComponent, (previous, next) =>
  previous.node.id === next.node.id
  && previous.node.name === next.node.name
  && previous.node.type === next.node.type
  && previous.node.visible === next.node.visible
  && previous.node.locked === next.node.locked
  && previous.node.expanded === next.node.expanded
  && previous.node.zIndex === next.node.zIndex
  && previous.depth === next.depth
  && previous.top === next.top
  && previous.selected === next.selected
);

export interface LayersPanelProps {
  tree: LayerNode[];
  elements: readonly DesignElement[];
  selectedIds: string[];
  onSelect: (id: string, modifiers: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void;
  onCommands: (commands: readonly DesignCommand[]) => void;
  onRename: (id: string, value: string) => void;
  onRemove: (id: string) => void;
}

export default function LayersPanel({ tree, elements, selectedIds, onSelect, onCommands, onRename, onRemove }: LayersPanelProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const rows = useMemo(() => flatten(tree), [tree]);
  const latest = useRef({ elements, onSelect, onCommands, onRename, onRemove });
  latest.current = { elements, onSelect, onCommands, onRename, onRemove };
  const selectRow = useCallback((id: string, modifiers: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => latest.current.onSelect(id, modifiers), []);
  const commandRow = useCallback((commands: readonly DesignCommand[]) => latest.current.onCommands(commands), []);
  const renameRow = useCallback((id: string, value: string) => latest.current.onRename(id, value), []);
  const removeRow = useCallback((id: string) => latest.current.onRemove(id), []);
  const orderRow = useCallback((id: string, action: "forward" | "backward") => commandRow(layerOrderCommands(latest.current.elements, id, action)), [commandRow]);
  const duplicateRow = useCallback((id: string) => {
    const currentElements = latest.current.elements;
    const original = currentElements.find((element) => element.id === id);
    if (!original || original.locked) return;
    const element = { ...original, id: duplicateId(original.id, currentElements), x: original.x + 0.02, y: original.y + 0.02, zIndex: Math.max(...currentElements.map((item) => item.zIndex), 0) + 1 };
    commandRow([{ type: "DuplicateNode", element }]);
  }, [commandRow]);
  const dropRow = useCallback((sourceId: string, targetId: string) => commandRow(reorderLayerCommands(latest.current.elements, sourceId, targetId, "before")), [commandRow]);
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
  const visible = rows.slice(first, first + Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + 4);
  const primaryId = selectedIds[selectedIds.length - 1];
  return (
    <section id="interactive-layers-panel" data-design-canvas-surface="true" tabIndex={-1} onMouseDown={(event) => event.currentTarget.focus()} aria-label="Layers panel" className="absolute bottom-12 right-2 z-20 w-[min(94vw,620px)] rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur">
      <header className="flex h-9 items-center gap-2 border-b border-border px-2 text-xs font-semibold">
        <span className="flex-1">Layers</span>
        <button type="button" aria-label="Bring selected layer to front" title="Bring to front" disabled={!primaryId} className="p-1 disabled:opacity-40" onClick={() => primaryId && onCommands(layerOrderCommands(elements, primaryId, "front"))}><ChevronsUp className="h-3.5 w-3.5" /></button>
        <button type="button" aria-label="Send selected layer to back" title="Send to back" disabled={!primaryId} className="p-1 disabled:opacity-40" onClick={() => primaryId && onCommands(layerOrderCommands(elements, primaryId, "back"))}><ChevronsDown className="h-3.5 w-3.5" /></button>
      </header>
      <div role="listbox" aria-label="Document layers" className="relative overflow-auto" style={{ height: Math.min(VIEWPORT_HEIGHT, Math.max(ROW_HEIGHT, rows.length * ROW_HEIGHT)) }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        <div className="relative" style={{ height: rows.length * ROW_HEIGHT }}>
          {visible.map(({ node, depth }, index) => <LayerRow
            key={node.id} node={node} depth={depth} top={(first + index) * ROW_HEIGHT} selected={selectedIds.includes(node.id)}
            onSelect={selectRow} onCommand={commandRow} onOrder={orderRow} onDuplicate={duplicateRow} onRename={renameRow} onRemove={removeRow} onDropLayer={dropRow}
          />)}
        </div>
      </div>
      {!rows.length && <p className="p-3 text-xs text-muted-foreground">No layers</p>}
    </section>
  );
}
