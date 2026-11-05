import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { Label, Layer, Rect, Tag, Text, Transformer } from "react-konva";
import type Konva from "konva";
import type { DesignTemplate } from "../../types/designTemplate";

export interface NodeTransform { id: string; x: number; y: number; width: number; height: number; rotation: number }

function SelectionLayer({ selectedIds, template, stageRef, onCommit, marquee }: {
  selectedIds: string[];
  template: DesignTemplate;
  stageRef: RefObject<Konva.Stage | null>;
  onCommit: (transforms: NodeTransform[]) => void;
  marquee: { x: number; y: number; width: number; height: number } | null;
}) {
  const transformer = useRef<Konva.Transformer>(null);
  const angleLabel = useRef<Konva.Label>(null);
  const angleText = useRef<Konva.Text>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const lockedSelections = selectedIds.flatMap((id) => {
    const element = template.elements.find((node) => node.id === id && node.visible && node.locked);
    return element ? [{ id, x: element.x * template.canvas.width, y: element.y * template.canvas.height, width: element.width * template.canvas.width, height: element.height * template.canvas.height, rotation: element.rotation }] : [];
  });

  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.key === "Shift") setShiftHeld(true); };
    const up = (event: KeyboardEvent) => { if (event.key === "Shift") setShiftHeld(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const nodes = selectedIds
      .map((id) => ({ id, element: template.elements.find((node) => node.id === id) }))
      .filter(({ element }) => element?.visible && !element.locked)
      .map(({ id }) => stage?.findOne((candidate: Konva.Node) => candidate.id() === `node-${id}`))
      .filter((node): node is Konva.Node => Boolean(node));
    transformer.current?.nodes(nodes);
    transformer.current?.getLayer()?.batchDraw();
  }, [selectedIds, stageRef, template.elements]);

  const collectTransforms = () => {
    const nodes = transformer.current?.nodes() || [];
    const transforms = nodes.map((node) => {
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const transform = {
        id: node.id().replace(/^node-/, ""),
        x: node.x(),
        y: node.y(),
        width: Math.max(8, node.width() * scaleX),
        height: Math.max(8, node.height() * scaleY),
        rotation: node.rotation(),
      };
      node.scaleX(1);
      node.scaleY(1);
      return transform;
    });
    return transforms;
  };

  return (
    <Layer>
      {lockedSelections.map((item) => <Rect key={item.id} {...item} stroke="#6d5dfc" dash={[4, 3]} strokeWidth={2} listening={false} />)}
      {marquee && <Rect {...marquee} fill="rgba(109, 93, 252, 0.12)" stroke="#8b80ff" strokeWidth={1} listening={false} />}
      <Transformer
        ref={transformer}
        rotateEnabled
        rotateAnchorCursor="crosshair"
        enabledAnchors={["top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"]}
        anchorSize={8}
        anchorCornerRadius={4}
        anchorFill="#fff"
        anchorStroke="#6d5dfc"
        borderStroke="#6d5dfc"
        borderDash={[4, 3]}
        rotateAnchorOffset={28}
        keepRatio={false}
        shiftBehavior="inverted"
        flipEnabled={false}
        boundBoxFunc={(oldBox, newBox) => Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8 ? oldBox : newBox}
        rotationSnaps={shiftHeld ? [0, 15, 30, 45, 60, 90, 180] : []}
        rotationSnapTolerance={4}
        onTransformStart={(event) => {
          const isRotation = transformer.current?.getActiveAnchor() === "rotater";
          if (isRotation) angleLabel.current?.visible(true);
          event.target.getLayer()?.batchDraw();
        }}
        onTransform={() => {
          if (transformer.current?.getActiveAnchor() !== "rotater") return;
          const node = transformer.current.nodes()[0];
          if (!node) return;
          const angle = ((node.rotation() % 360) + 360) % 360;
          angleText.current?.text(`${Math.round(angle)}°`);
          angleLabel.current?.position({ x: node.x() + node.width() / 2, y: node.y() - 42 });
          angleLabel.current?.visible(true);
          angleLabel.current?.getLayer()?.batchDraw();
        }}
        onTransformEnd={() => {
          angleLabel.current?.visible(false);
          const transforms = collectTransforms();
          if (transforms.length) onCommit(transforms);
        }}
      />
      <Label ref={angleLabel} visible={false} listening={false}>
        <Tag fill="#171717" cornerRadius={6} />
        <Text ref={angleText} text="0°" fontFamily="Arial" fontSize={14} padding={6} fill="#fff" />
      </Label>
    </Layer>
  );
}

export default memo(SelectionLayer);
