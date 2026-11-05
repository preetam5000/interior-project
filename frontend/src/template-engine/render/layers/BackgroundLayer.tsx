import { memo, useEffect, useState } from "react";
import { Image as KImage, Layer, Rect } from "react-konva";
import type { DesignRenderContext, DesignTemplate } from "../../types/designTemplate";
function BackgroundLayer({ template, context }: { template: DesignTemplate; context: DesignRenderContext }) {
 const [image,setImage]=useState<HTMLImageElement|null>(null); const source=template.background.image ? context.assets?.[template.background.image]||template.background.image : undefined;
 useEffect(()=>{if(!source)return;const img=new window.Image();img.onload=()=>setImage(img);img.src=source;},[source]);
 const stops=template.background.gradient?.stops.flatMap(stop=>[stop.position,stop.color.startsWith("$")?template.branding.palette?.[stop.color.slice(1)]||stop.color:stop.color]);
 return <Layer listening={false} clearBeforeDraw><Rect width={template.canvas.width} height={template.canvas.height} fill={template.background.color||template.background.gradient?.stops[0]?.color||"#fff"} fillLinearGradientStartPoint={{x:0,y:0}} fillLinearGradientEndPoint={{x:template.canvas.width,y:template.canvas.height}} fillLinearGradientColorStops={stops}/>{image&&<KImage image={image} width={template.canvas.width} height={template.canvas.height} listening={false}/>}</Layer>;
}
export default memo(BackgroundLayer);
