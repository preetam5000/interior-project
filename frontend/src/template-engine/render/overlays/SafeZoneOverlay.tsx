import { Rect } from "react-konva";
import type { DesignCanvas, DesignFormat } from "../../types/designTemplate";
export default function SafeZoneOverlay({canvas,format}:{canvas:DesignCanvas;format:DesignFormat}) { const z=canvas.safeZones?.[format]; if(!z)return null; const x=z.left*canvas.width,y=z.top*canvas.height,w=canvas.width-x-z.right*canvas.width,h=canvas.height-y-z.bottom*canvas.height; return <Rect x={x} y={y} width={w} height={h} stroke="#ffffff99" dash={[12,10]} strokeWidth={2} listening={false}/>; }
