import { forwardRef, useImperativeHandle, useRef, type ReactNode } from "react";
import { Layer, Line } from "react-konva";
import type Konva from "konva";
import type { SnapResult } from "../../core/snapping";

export interface GuideLayerHandle {
  showSnapResult: (result: SnapResult | null, width: number, height: number) => void;
}

const GuideLayer = forwardRef<GuideLayerHandle, { children?: ReactNode }>(function GuideLayer({ children }, ref) {
  const layer = useRef<Konva.Layer>(null);
  const vertical = useRef<Konva.Line>(null);
  const horizontal = useRef<Konva.Line>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<{ result: SnapResult | null; width: number; height: number } | null>(null);

  useImperativeHandle(ref, () => ({
    showSnapResult(result, width, height) {
      pending.current = { result, width, height };
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const update = pending.current;
        pending.current = null;
        const xGuide = update?.result?.guides.find((guide) => guide.axis === "x");
        const yGuide = update?.result?.guides.find((guide) => guide.axis === "y");
        vertical.current?.visible(Boolean(xGuide));
        horizontal.current?.visible(Boolean(yGuide));
        if (xGuide) vertical.current?.points([xGuide.position, 0, xGuide.position, update?.height || 0]);
        if (yGuide) horizontal.current?.points([0, yGuide.position, update?.width || 0, yGuide.position]);
        layer.current?.batchDraw();
      });
    },
  }), []);

  return (
    <Layer ref={layer} listening={false}>
      <Line ref={vertical} points={[0, 0, 0, 0]} stroke="#ff4fa3" strokeWidth={1} dash={[5, 4]} visible={false} listening={false} />
      <Line ref={horizontal} points={[0, 0, 0, 0]} stroke="#ff4fa3" strokeWidth={1} dash={[5, 4]} visible={false} listening={false} />
      {children}
    </Layer>
  );
});

export default GuideLayer;
