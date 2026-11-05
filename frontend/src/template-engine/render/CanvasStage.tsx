import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Stage } from "react-konva";
import type Konva from "konva";
import type { DesignFormat, DesignRenderContext, DesignTemplate } from "../types/designTemplate";
import BackgroundLayer from "./layers/BackgroundLayer";
import ContentLayer from "./layers/ContentLayer";
import DraftLayer from "./layers/DraftLayer";
import GuideLayer, { type GuideLayerHandle } from "./layers/GuideLayer";
import OverlayLayer from "./layers/OverlayLayer";
import SelectionLayer, { type NodeTransform } from "./layers/SelectionLayer";
import SafeZoneOverlay from "./overlays/SafeZoneOverlay";
import type { DesignCommand, CommandBatch } from "../core/commands";
import { useViewport } from "./hooks/useViewport";
import { marqueeSelection } from "../editor/selection";
import { getSnapResult, type SnapObject, type SnapResult } from "../core/snapping";
import { applySnapDeltaToPositions } from "./utils/transforms";

interface DragRecord { primaryId: string; nodes: Array<{ id: string; node: Konva.Node; x: number; y: number }>; snapObjects: SnapObject[]; cancelled: boolean }
interface ClickModifiers { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }

const formatDimensions: Record<DesignFormat, [number, number]> = {
  portrait: [1080, 1350], story: [1080, 1920], square: [1080, 1080], landscape: [1920, 1080],
};

export default function CanvasStage({ template, context, format, selectedIds, onSelect, onSelectMany, onTransaction, onEdit, safeZoneFormat }: {
  template: DesignTemplate;
  context: DesignRenderContext;
  format: DesignFormat;
  selectedIds: string[];
  onSelect: (id: string | null, modifiers?: ClickModifiers) => void;
  onSelectMany: (ids: string[], additive: boolean) => void;
  onTransaction: (transaction: CommandBatch) => void;
  onEdit: (node: DesignTemplate["elements"][number], rect: { left: number; top: number; width: number; height: number; rotation: number; fontScale: number }) => void;
  safeZoneFormat: DesignFormat | null;
}) {
  const dimensions = formatDimensions[format];
  const renderTemplate = useMemo(() => ({ ...template, canvas: { ...template.canvas, width: dimensions[0], height: dimensions[1] } }), [template, dimensions]);
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const guideLayer = useRef<GuideLayerHandle>(null);
  const activeDrag = useRef<DragRecord | null>(null);
  const cancelledDrags = useRef(new Set<string>());
  const panningGesture = useRef(false);
  const spaceHeld = useRef(false);
  const panStart = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null);
  const panFrame = useRef<number | null>(null);
  const marqueeStart = useRef<{ x: number; y: number; additive: boolean } | null>(null);
  const skipEmptyClick = useRef(false);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [hostNode, setHostNode] = useState<HTMLDivElement | null>(null);
  const { viewport, setViewport, zoom, fit } = useViewport(renderTemplate.canvas.width, renderTemplate.canvas.height, hostNode);

  useEffect(() => setHostNode(host.current), []);

  const finishPan = useCallback(() => {
    if (!panStart.current) return;
    const current = stage.current?.position();
    if (current) setViewport((value) => ({ ...value, x: current.x, y: current.y }));
    if (host.current) host.current.style.cursor = spaceHeld.current ? "grab" : "default";
    if (stage.current) stage.current.container().style.cursor = spaceHeld.current ? "grab" : "default";
    panStart.current = null;
    panningGesture.current = true;
    requestAnimationFrame(() => { panningGesture.current = false; });
  }, [setViewport]);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTyping(event.target)) {
        spaceHeld.current = true;
        if (host.current) host.current.style.cursor = "grab";
        if (stage.current) stage.current.container().style.cursor = "grab";
        event.preventDefault();
      }
      if (event.key !== "Escape") return;
      if (isTyping(event.target)) return;
      if (marqueeStart.current) {
        marqueeStart.current = null;
        setMarquee(null);
      }
      const drag = activeDrag.current;
      if (!drag) return;
      drag.cancelled = true;
      cancelledDrags.current.add(drag.primaryId);
      drag.nodes.forEach(({ node, x, y }) => node.position({ x, y }));
      const primary = drag.nodes.find(({ id }) => id === drag.primaryId)?.node;
      primary?.stopDrag();
      primary?.getLayer()?.batchDraw();
      guideLayer.current?.showSnapResult(null, renderTemplate.canvas.width, renderTemplate.canvas.height);
      activeDrag.current = null;
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spaceHeld.current = false;
        if (host.current) host.current.style.cursor = "default";
        if (stage.current) stage.current.container().style.cursor = "default";
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", finishPan);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", finishPan);
    };
  }, [finishPan, renderTemplate.canvas.height, renderTemplate.canvas.width]);

  const worldPointer = () => {
    const pointer = stage.current?.getPointerPosition();
    if (!pointer) return null;
    return { x: (pointer.x - viewport.x) / viewport.scale, y: (pointer.y - viewport.y) / viewport.scale };
  };
  const startMarquee = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (event.target !== stage.current || spaceHeld.current || panStart.current) return;
    if ("button" in event.evt && event.evt.button !== 0) return;
    const point = worldPointer();
    if (!point) return;
    const native = event.evt;
    marqueeStart.current = { ...point, additive: "shiftKey" in native && (native.shiftKey || native.ctrlKey || native.metaKey) };
    setMarquee({ x: point.x, y: point.y, width: 0, height: 0 });
  };
  const moveMarquee = () => {
    const start = marqueeStart.current;
    const point = worldPointer();
    if (!start || !point) return;
    setMarquee({ x: start.x, y: start.y, width: point.x - start.x, height: point.y - start.y });
  };
  const finishMarquee = () => {
    const start = marqueeStart.current;
    const end = worldPointer();
    if (!start || !end) return;
    const rect = { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y };
    marqueeStart.current = null;
    setMarquee(null);
    if (Math.abs(rect.width) < 3 && Math.abs(rect.height) < 3) return;
    skipEmptyClick.current = true;
    requestAnimationFrame(() => { skipEmptyClick.current = false; });
    const ids = marqueeSelection(template.elements, rect, (element) => {
      const node = stage.current?.findOne(`#node-${element.id}`);
      if (!node) return { x: element.x * renderTemplate.canvas.width, y: element.y * renderTemplate.canvas.height, width: element.width * renderTemplate.canvas.width, height: element.height * renderTemplate.canvas.height };
      const box = node.getClientRect({ relativeTo: stage.current || undefined, skipShadow: true });
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    onSelectMany(ids, start.additive);
  };

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      const isPinch = event.ctrlKey || event.metaKey;
      const isWheel = event.deltaMode === WheelEvent.DOM_DELTA_LINE || (event.deltaX === 0 && Math.abs(event.deltaY) >= 40);
      if (isPinch || isWheel) {
        event.preventDefault();
        const rect = element.getBoundingClientRect();
        const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 40 : event.deltaY;
        zoom({ x: event.clientX - rect.left, y: event.clientY - rect.top }, viewport.scale * Math.exp(-delta * 0.002));
      } else {
        const current = stage.current?.position();
        if (current) {
          stage.current?.position({ x: current.x - event.deltaX, y: current.y - event.deltaY });
          stage.current?.batchDraw();
          if (panFrame.current === null) {
            panFrame.current = requestAnimationFrame(() => {
              const position = stage.current?.position();
              if (position) setViewport((value) => ({ ...value, x: position.x, y: position.y }));
              panFrame.current = null;
            });
          }
        }
      }
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [viewport.scale, zoom, setViewport]);

  const beginPan = (event: ReactMouseEvent) => {
    if (event.button !== 1 && !spaceHeld.current) return;
    event.preventDefault();
    event.stopPropagation();
    const current = stage.current?.position();
    if (!current) return;
    panStart.current = { clientX: event.clientX, clientY: event.clientY, x: current.x, y: current.y };
    panningGesture.current = true;
    if (host.current) host.current.style.cursor = "grabbing";
    if (stage.current) stage.current.container().style.cursor = "grabbing";
  };
  const movePan = (event: ReactMouseEvent) => {
    const start = panStart.current;
    if (!start || !stage.current) return;
    stage.current.position({ x: start.x + event.clientX - start.clientX, y: start.y + event.clientY - start.clientY });
    stage.current.batchDraw();
  };

  const startDrag = (id: string, node: Konva.Node) => {
    if (spaceHeld.current || panStart.current) { node.stopDrag(); return; }
    cancelledDrags.current.delete(id);
    const effectiveSelection = selectedIds.includes(id) ? selectedIds : [id];
    if (!selectedIds.includes(id)) onSelect(id);
    const stageNode = stage.current;
    const nodeById = new Map<string, Konva.Node>();
    stageNode?.find((candidate: Konva.Node) => candidate.id().startsWith("node-")).forEach((candidate) => nodeById.set(candidate.id().slice(5), candidate));
    const nodes = effectiveSelection.flatMap((selectedId) => {
      const element = template.elements.find((item) => item.id === selectedId);
      if (!element || !element.visible || element.locked) return [];
      const selectedNode = selectedId === id ? node : nodeById.get(selectedId);
      return selectedNode ? [{ id: selectedId, node: selectedNode, x: selectedNode.x(), y: selectedNode.y() }] : [];
    });
    const movingIds = new Set(nodes.map((item) => item.id));
    const snapObjects: SnapObject[] = template.elements.flatMap((element) => {
      if (movingIds.has(element.id) || !element.visible) return [];
      const target = nodeById.get(element.id);
      const box = target && stageNode ? target.getClientRect({ relativeTo: stageNode, skipShadow: true }) : null;
      return [{ id: element.id, rect: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : { x: element.x * renderTemplate.canvas.width, y: element.y * renderTemplate.canvas.height, width: element.width * renderTemplate.canvas.width, height: element.height * renderTemplate.canvas.height } }];
    });
    activeDrag.current = { primaryId: id, nodes, snapObjects, cancelled: false };
    guideLayer.current?.showSnapResult(null, renderTemplate.canvas.width, renderTemplate.canvas.height);
  };

  const updateSnapGuides = (drag: DragRecord): SnapResult | null => {
    const stageNode = stage.current;
    if (!stageNode) return null;
    const boxes = drag.nodes.map(({ node }) => node.getClientRect({ relativeTo: stageNode, skipShadow: true }));
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    const insets = renderTemplate.canvas.safeZones?.[safeZoneFormat || format];
    const safeZones = insets ? [{ id: `safe-zone-${safeZoneFormat}`, rect: {
      x: insets.left * renderTemplate.canvas.width,
      y: insets.top * renderTemplate.canvas.height,
      width: renderTemplate.canvas.width * (1 - insets.left - insets.right),
      height: renderTemplate.canvas.height * (1 - insets.top - insets.bottom),
    } }] : [];
    const result: SnapResult = getSnapResult({
      moving: { x: left, y: top, width: right - left, height: bottom - top },
      canvas: { width: renderTemplate.canvas.width, height: renderTemplate.canvas.height },
      objects: drag.snapObjects,
      safeZones,
      threshold: 8 / viewport.scale,
      gridSize: typeof template.metadata.snapGridSize === "number" ? template.metadata.snapGridSize : undefined,
      settings: { canvas: true, center: true, edges: true, objects: true, safeZone: Boolean(insets), grid: typeof template.metadata.snapGridSize === "number" },
    });
    guideLayer.current?.showSnapResult(result.guides.length ? result : null, renderTemplate.canvas.width, renderTemplate.canvas.height);
    return result;
  };

  const moveDrag = (id: string, x: number, y: number) => {
    const drag = activeDrag.current;
    if (!drag || drag.cancelled || drag.primaryId !== id) return;
    const primary = drag.nodes.find((item) => item.id === id);
    if (!primary) return;
    const deltaX = x - primary.x;
    const deltaY = y - primary.y;
    // Rebuild the draft from its immutable drag-start positions so snap offsets
    // never accumulate as the pointer continues moving.
    drag.nodes.forEach((item) => item.node.position({ x: item.x + deltaX, y: item.y + deltaY }));
    const snap = updateSnapGuides(drag);
    if (snap && (snap.delta.x || snap.delta.y)) {
      const snapped = applySnapDeltaToPositions(drag.nodes.map(({ node }) => node.position()), snap.delta);
      drag.nodes.forEach((item, index) => item.node.position(snapped[index]));
    }
    drag.nodes[0]?.node.getLayer()?.batchDraw();
  };

  const endDrag = (id: string, x: number, y: number) => {
    if (cancelledDrags.current.delete(id)) return;
    const drag = activeDrag.current;
    if (!drag || drag.primaryId !== id || drag.cancelled) return;
    moveDrag(id, x, y);
    const commands: DesignCommand[] = drag.nodes.flatMap((item) => {
      const position = item.node.position();
      const element = template.elements.find((node) => node.id === item.id);
      if (!element) return [];
      const nextX = position.x / renderTemplate.canvas.width;
      const nextY = position.y / renderTemplate.canvas.height;
      return nextX === element.x && nextY === element.y ? [] : [{ type: "MoveNode", id: item.id, x: nextX, y: nextY }];
    });
    activeDrag.current = null;
    guideLayer.current?.showSnapResult(null, renderTemplate.canvas.width, renderTemplate.canvas.height);
    if (commands.length) onTransaction(commands);
  };

  const commitTransforms = (transforms: NodeTransform[]) => {
    const commands: DesignCommand[] = transforms.flatMap((transform) => {
      const current = template.elements.find((element) => element.id === transform.id);
      if (!current || current.locked || !current.visible) return [];
      const x = transform.x / renderTemplate.canvas.width;
      const y = transform.y / renderTemplate.canvas.height;
      const width = transform.width / renderTemplate.canvas.width;
      const height = transform.height / renderTemplate.canvas.height;
      const output: DesignCommand[] = [];
      const resized = width !== current.width || height !== current.height;
      if (resized) output.push({ type: "ResizeNode", id: transform.id, x, y, width, height });
      if (transform.rotation !== current.rotation) output.push({ type: "RotateNode", id: transform.id, rotation: transform.rotation });
      if (!resized && (x !== current.x || y !== current.y)) output.push({ type: "MoveNode", id: transform.id, x, y });
      return output;
    });
    if (commands.length) onTransaction(commands);
  };

  const editNode = (node: DesignTemplate["elements"][number]) => {
    const rect = host.current?.getBoundingClientRect();
    if (!rect) return;
    onEdit(node, {
      left: viewport.x + node.x * renderTemplate.canvas.width * viewport.scale,
      top: viewport.y + node.y * renderTemplate.canvas.height * viewport.scale,
      width: node.width * renderTemplate.canvas.width * viewport.scale,
      height: node.height * renderTemplate.canvas.height * viewport.scale,
      rotation: node.rotation,
      fontScale: viewport.scale,
    });
  };

  return (
    <div ref={host} role="region" aria-label="Interactive design canvas" tabIndex={0} data-design-canvas-surface="true" className="relative h-full w-full overflow-hidden bg-neutral-900 outline-none" onMouseDown={(event) => { event.currentTarget.focus({ preventScroll: true }); beginPan(event); }} onMouseMove={movePan} onMouseUp={finishPan} onMouseLeave={finishPan}>
      <Stage
        ref={stage}
        width={hostNode?.clientWidth || 640}
        height={hostNode?.clientHeight || 500}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        onMouseDown={startMarquee}
        onMouseMove={moveMarquee}
        onMouseUp={finishMarquee}
        onTouchStart={(event) => startMarquee(event as unknown as Konva.KonvaEventObject<MouseEvent | TouchEvent>)}
        onTouchMove={moveMarquee}
        onTouchEnd={finishMarquee}
        onClick={(event) => { if (panningGesture.current || skipEmptyClick.current) return; if (event.target === event.target.getStage()) onSelect(null); }}
        onTap={(event) => { if (!skipEmptyClick.current && event.target === event.target.getStage()) onSelect(null); }}
      >
        <BackgroundLayer template={renderTemplate} context={context} />
        <ContentLayer
          template={renderTemplate}
          context={context}
          onSelect={onSelect}
          onEdit={editNode}
          onDragStart={startDrag}
          onDragMove={moveDrag}
          onDragEnd={endDrag}
        />
        <DraftLayer />
        <GuideLayer ref={guideLayer} />
        <OverlayLayer />
        <SelectionLayer selectedIds={selectedIds} template={renderTemplate} stageRef={stage} onCommit={commitTransforms} marquee={marquee} />
        {safeZoneFormat && <GuideLayer><SafeZoneOverlay canvas={renderTemplate.canvas} format={safeZoneFormat} /></GuideLayer>}
      </Stage>
      <div className="absolute bottom-2 left-2 z-10 flex gap-1 rounded-lg bg-black/70 p-1 text-xs text-white">
        <button aria-label="Zoom out" onClick={() => zoom({ x: (hostNode?.clientWidth || 0) / 2, y: (hostNode?.clientHeight || 0) / 2 }, viewport.scale / 1.2)}>−</button>
        <span className="px-2">{Math.round(viewport.scale * 100)}%</span>
        <button aria-label="Zoom in" onClick={() => zoom({ x: (hostNode?.clientWidth || 0) / 2, y: (hostNode?.clientHeight || 0) / 2 }, viewport.scale * 1.2)}>+</button>
        <button className="px-2" onClick={fit}>Fit</button>
        {[0.25, 0.5, 0.75, 1, 2, 4].map((scale) => <button key={scale} className="px-1" onClick={() => zoom({ x: (hostNode?.clientWidth || 0) / 2, y: (hostNode?.clientHeight || 0) / 2 }, scale)}>{scale * 100}%</button>)}
      </div>
    </div>
  );
}
