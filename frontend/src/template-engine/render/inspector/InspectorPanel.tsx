import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Eye, EyeOff, Lock, Unlock } from "lucide-react";
import { getInspectorSection, setElementPropertiesCommand, type InspectorSection } from "../../core/properties";
import { layerOrderCommands } from "../../core/layers";
import type { DesignCommand } from "../../core/commands";
import type { DesignElement, DesignGradient, DesignShadow } from "../../types/designTemplate";

type CanvasSize = { width: number; height: number };
type PropertyPatch = Partial<Omit<DesignElement, "id" | "type" | "zIndex">>;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-1"><span className="text-[11px] text-muted-foreground">{label}</span>{children}</label>;
}

function TextField({ label, value, disabled, onCommit, type = "text" }: { label: string; value: string | number; disabled?: boolean; type?: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const committed = useRef(String(value ?? ""));
  useEffect(() => { setDraft(String(value ?? "")); committed.current = String(value ?? ""); }, [value]);
  const finish = () => {
    if (draft === committed.current) return;
    committed.current = draft;
    onCommit(draft);
  };
  return <Field label={label}><input type={type} value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onBlur={finish} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50" /></Field>;
}

function NumberField({ label, value, disabled, min, max, step = 1, onCommit }: { label: string; value: number; disabled?: boolean; min?: number; max?: number; step?: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(Number.isFinite(value) ? value : 0));
  const committed = useRef(value);
  useEffect(() => { const next = Number.isFinite(value) ? value : 0; setDraft(String(Number(next.toFixed(3)))); committed.current = next; }, [value]);
  const finish = () => {
    if (!draft.trim()) { setDraft(String(committed.current)); return; }
    const raw = Number(draft);
    if (!Number.isFinite(raw)) { setDraft(String(committed.current)); return; }
    const next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, raw));
    setDraft(String(next));
    if (next !== committed.current) { committed.current = next; onCommit(next); }
  };
  return <Field label={label}><input type="number" value={draft} min={min} max={max} step={step} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onBlur={finish} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50" /></Field>;
}

function SelectField({ label, value, options, disabled, onChange }: { label: string; value: string; options: string[]; disabled?: boolean; onChange: (value: string) => void }) {
  return <Field label={label}><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50">{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></Field>;
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex h-8 items-center justify-between gap-2 rounded-md border border-border px-2 text-xs"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function ShadowFields({ value, disabled, onChange }: { value?: DesignShadow; disabled: boolean; onChange: (shadow?: DesignShadow) => void }) {
  const enabled = Boolean(value);
  const shadow: DesignShadow = value || { color: "#000000", blur: 8, offsetX: 0, offsetY: 2 };
  return <div className="space-y-2 rounded-md border border-border p-2">
    <CheckField label="Shadow" checked={enabled} onChange={(checked) => onChange(checked ? shadow : undefined)} />
    {enabled && <div className="grid grid-cols-2 gap-2">
      <TextField label="Shadow color" value={shadow.color} disabled={disabled} onCommit={(color) => onChange({ ...shadow, color })} />
      <NumberField label="Blur" value={shadow.blur} disabled={disabled} min={0} onCommit={(blur) => onChange({ ...shadow, blur })} />
      <NumberField label="Offset X" value={shadow.offsetX} disabled={disabled} onCommit={(offsetX) => onChange({ ...shadow, offsetX })} />
      <NumberField label="Offset Y" value={shadow.offsetY} disabled={disabled} onCommit={(offsetY) => onChange({ ...shadow, offsetY })} />
    </div>}
  </div>;
}

function GradientFields({ value, disabled, onChange }: { value?: DesignGradient; disabled: boolean; onChange: (gradient?: DesignGradient) => void }) {
  const enabled = Boolean(value);
  const gradient: DesignGradient = value || { type: "linear", angle: 0, stops: [{ color: "#4f46e5", position: 0 }, { color: "#ec4899", position: 1 }] };
  return <div className="space-y-2 rounded-md border border-border p-2">
    <CheckField label="Gradient" checked={enabled} onChange={(checked) => onChange(checked ? gradient : undefined)} />
    {enabled && <div className="grid grid-cols-2 gap-2">
      <TextField label="Start color" value={gradient.stops[0]?.color || "#4f46e5"} disabled={disabled} onCommit={(color) => onChange({ ...gradient, stops: [{ color, position: 0 }, { color: gradient.stops[1]?.color || color, position: 1 }] })} />
      <TextField label="End color" value={gradient.stops[1]?.color || "#ec4899"} disabled={disabled} onCommit={(color) => onChange({ ...gradient, stops: [{ color: gradient.stops[0]?.color || color, position: 0 }, { color, position: 1 }] })} />
      <NumberField label="Angle" value={gradient.angle || 0} disabled={disabled} min={0} max={360} onCommit={(angle) => onChange({ ...gradient, angle })} />
    </div>}
  </div>;
}

function formatSection(section: InspectorSection): string { return section; }

export interface InspectorPanelProps {
  element: DesignElement | null;
  elements: readonly DesignElement[];
  canvas: CanvasSize;
  onCommands: (commands: readonly DesignCommand[]) => void;
}

export default function InspectorPanel({ element, elements, canvas, onCommands }: InspectorPanelProps) {
  if (!element) return <aside id="interactive-inspector-panel" data-design-canvas-surface="true" tabIndex={-1} onMouseDown={(event) => event.currentTarget.focus()} aria-label="Inspector panel" className="absolute bottom-12 right-2 z-20 w-[min(94vw,320px)] rounded-xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur"><div className="text-xs font-semibold">Inspector</div><p className="py-8 text-center text-xs text-muted-foreground">Select one object to inspect its properties.</p></aside>;

  const section = getInspectorSection(element);
  const disabled = element.locked;
  const send = (properties: PropertyPatch) => {
    const command = setElementPropertiesCommand(element.id, properties);
    if (command) onCommands([command]);
  };
  const rotation = (value: number) => onCommands([{ type: "RotateNode", id: element.id, rotation: value }]);
  const updateMove = (axis: "x" | "y", pixels: number) => onCommands([{ type: "MoveNode", id: element.id, x: axis === "x" ? pixels / canvas.width : element.x, y: axis === "y" ? pixels / canvas.height : element.y }]);
  const updateSize = (axis: "width" | "height", pixels: number) => onCommands([{ type: "ResizeNode", id: element.id, x: element.x, y: element.y, width: axis === "width" ? pixels / canvas.width : element.width, height: axis === "height" ? pixels / canvas.height : element.height }]);
  const general = <section className="space-y-2 border-t border-border pt-3">
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Position & layout</h3>
    <div className="grid grid-cols-2 gap-2">
      <NumberField label="X" value={element.x * canvas.width} disabled={disabled} min={0} max={(1 - element.width) * canvas.width} onCommit={(value) => updateMove("x", value)} />
      <NumberField label="Y" value={element.y * canvas.height} disabled={disabled} min={0} max={(1 - element.height) * canvas.height} onCommit={(value) => updateMove("y", value)} />
      <NumberField label="Width" value={element.width * canvas.width} disabled={disabled} min={1} max={(1 - element.x) * canvas.width} onCommit={(value) => updateSize("width", value)} />
      <NumberField label="Height" value={element.height * canvas.height} disabled={disabled} min={1} max={(1 - element.y) * canvas.height} onCommit={(value) => updateSize("height", value)} />
      <NumberField label="Rotation" value={element.rotation} disabled={disabled} step={1} onCommit={rotation} />
    </div>
    <div className="grid grid-cols-2 gap-2">
      <CheckField label="Visible" checked={element.visible} onChange={(visible) => onCommands([{ type: "SetNodeVisibility", id: element.id, visible }])} />
      <CheckField label="Locked" checked={element.locked} onChange={(locked) => onCommands([{ type: "SetNodeLocked", id: element.id, locked }])} />
    </div>
    <div className="flex items-center gap-1">
      {[["forward", ArrowUp, "Bring forward"], ["backward", ArrowDown, "Send backward"], ["front", ChevronsUp, "Bring to front"], ["back", ChevronsDown, "Send to back"]].map(([action, Icon, label]) => <button key={action as string} type="button" title={label as string} aria-label={label as string} className="flex h-8 flex-1 items-center justify-center rounded-md border border-border hover:bg-muted" onClick={() => onCommands(layerOrderCommands(elements, element.id, action as "forward" | "backward" | "front" | "back"))}><Icon className="h-4 w-4" /></button>)}
    </div>
  </section>;

  return <aside id="interactive-inspector-panel" data-design-canvas-surface="true" tabIndex={-1} onMouseDown={(event) => event.currentTarget.focus()} aria-label="Inspector panel" className="absolute bottom-12 right-2 z-20 max-h-[min(72vh,640px)] w-[min(94vw,320px)] overflow-y-auto rounded-xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur">
    <header className="mb-3 flex items-center justify-between border-b border-border pb-2">
      <div className="min-w-0"><h2 className="text-xs font-semibold">{formatSection(section)}</h2><p className="truncate text-[10px] text-muted-foreground">{element.data?.layerName || element.content || element.id}</p></div>
      <div className="flex items-center gap-1 text-muted-foreground" title={element.locked ? "Locked" : "Unlocked"}>{element.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{element.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}</div>
    </header>
    {section === "Text" && <section className="space-y-2 pb-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Text</h3>
      <TextField label="Font" value={element.fontFamily || "Arial"} disabled={disabled} onCommit={(fontFamily) => send({ fontFamily })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Font size" value={element.fontSize || 24} disabled={disabled} min={1} onCommit={(fontSize) => send({ fontSize })} />
        <TextField label="Weight" value={element.fontWeight || "normal"} disabled={disabled} onCommit={(value) => send({ fontWeight: /^\d+$/.test(value) ? Number(value) : value })} />
      </div>
      <TextField label="Color" value={element.color || "#222222"} disabled={disabled} onCommit={(color) => send({ color })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Opacity %" value={(element.opacity ?? 1) * 100} disabled={disabled} min={0} max={100} onCommit={(opacity) => send({ opacity: opacity / 100 })} />
        <SelectField label="Alignment" value={element.alignment || "left"} options={["left", "center", "right"]} disabled={disabled} onChange={(alignment) => send({ alignment: alignment as DesignElement["alignment"] })} />
        <NumberField label="Letter spacing" value={element.letterSpacing || 0} disabled={disabled} step={0.1} onCommit={(letterSpacing) => send({ letterSpacing })} />
        <NumberField label="Line height" value={element.lineHeight || 1.2} disabled={disabled} min={0.1} step={0.1} onCommit={(lineHeight) => send({ lineHeight })} />
      </div>
      <ShadowFields value={element.shadow} disabled={disabled} onChange={(shadow) => send({ shadow })} />
      <GradientFields value={element.gradient} disabled={disabled} onChange={(gradient) => send({ gradient })} />
    </section>}
    {section === "Image" && <section className="space-y-2 pb-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Image</h3>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Opacity %" value={(element.opacity ?? 1) * 100} disabled={disabled} min={0} max={100} onCommit={(opacity) => send({ opacity: opacity / 100 })} />
        <SelectField label="Crop" value={element.crop || "cover"} options={["cover", "contain", "fill"]} disabled={disabled} onChange={(crop) => send({ crop: crop as DesignElement["crop"] })} />
        <NumberField label="Brightness" value={element.brightness ?? 0} disabled={disabled} min={-100} max={100} onCommit={(brightness) => send({ brightness })} />
        <NumberField label="Contrast" value={element.contrast ?? 0} disabled={disabled} min={-100} max={100} onCommit={(contrast) => send({ contrast })} />
        <NumberField label="Blur" value={element.blur ?? 0} disabled={disabled} min={0} onCommit={(blur) => send({ blur })} />
        <NumberField label="Corner radius" value={element.borderRadius ?? 0} disabled={disabled} min={0} onCommit={(borderRadius) => send({ borderRadius })} />
      </div>
      <ShadowFields value={element.shadow} disabled={disabled} onChange={(shadow) => send({ shadow })} />
    </section>}
    {section === "Shape" && <section className="space-y-2 pb-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Shape</h3>
      <TextField label="Fill color" value={element.color || "#222222"} disabled={disabled} onCommit={(color) => send({ color })} />
      <div className="grid grid-cols-2 gap-2"><NumberField label="Opacity %" value={(element.opacity ?? 1) * 100} disabled={disabled} min={0} max={100} onCommit={(opacity) => send({ opacity: opacity / 100 })} /><NumberField label="Corner radius" value={element.borderRadius ?? element.radius ?? 0} disabled={disabled} min={0} onCommit={(borderRadius) => send({ borderRadius })} /></div>
      <GradientFields value={element.gradient} disabled={disabled} onChange={(gradient) => send({ gradient })} />
      <ShadowFields value={element.shadow} disabled={disabled} onChange={(shadow) => send({ shadow })} />
    </section>}
    {(section === "CTA" || section === "Badge") && <section className="space-y-2 pb-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section}</h3>
      <TextField label="Text" value={element.content || ""} disabled={disabled} onCommit={(content) => send({ content })} />
      <TextField label="Text color" value={element.color || "#222222"} disabled={disabled} onCommit={(color) => send({ color })} />
      <div className="grid grid-cols-2 gap-2"><NumberField label="Font size" value={element.fontSize || 24} disabled={disabled} min={1} onCommit={(fontSize) => send({ fontSize })} /><NumberField label="Opacity %" value={(element.opacity ?? 1) * 100} disabled={disabled} min={0} max={100} onCommit={(opacity) => send({ opacity: opacity / 100 })} /></div>
      <TextField label="Background" value={String(element.style?.background || "#ffffff")} disabled={disabled} onCommit={(background) => send({ style: { ...element.style, background } })} />
      <NumberField label="Corner radius" value={element.borderRadius ?? element.radius ?? 0} disabled={disabled} min={0} onCommit={(borderRadius) => send({ borderRadius })} />
    </section>}
    {section === "Logo" && <section className="space-y-2 pb-3"><h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Logo</h3><div className="grid grid-cols-2 gap-2"><NumberField label="Opacity %" value={(element.opacity ?? 1) * 100} disabled={disabled} min={0} max={100} onCommit={(opacity) => send({ opacity: opacity / 100 })} /><NumberField label="Corner radius" value={element.borderRadius || 0} disabled={disabled} min={0} onCommit={(borderRadius) => send({ borderRadius })} /></div><ShadowFields value={element.shadow} disabled={disabled} onChange={(shadow) => send({ shadow })} /></section>}
    {(section === "Frame" || section === "Video") && <section className="space-y-2 pb-3"><h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section}</h3><p className="text-[10px] text-muted-foreground">General layout properties are available below.</p></section>}
    {general}
  </aside>;
}
