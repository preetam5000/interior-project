import { useCallback, useEffect, useState } from "react";
import type { Viewport } from "../utils/coordinates";
import { fitViewport, zoomAt } from "../utils/viewport";
export function useViewport(width: number, height: number, host: HTMLElement | null) {
 const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
 const fit = useCallback(() => { if (host) setViewport(fitViewport(width, height, host.clientWidth, host.clientHeight)); }, [host, width, height]);
 useEffect(() => { fit(); if (!host || typeof ResizeObserver === "undefined") return; const observer = new ResizeObserver(fit); observer.observe(host); return () => observer.disconnect(); }, [fit, host]);
 const zoom = useCallback((point: {x:number;y:number}, scale: number) => setViewport((current) => zoomAt(current, point, Math.max(0.1, Math.min(4, scale)))), []);
 return { viewport, setViewport, zoom, fit };
}
