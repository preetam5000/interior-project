import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DesignElement } from "../../types/designTemplate";

interface OverlayRect { left: number; top: number; width: number; height: number; rotation: number; fontScale: number }

export default function TextEditorOverlay({ node, rect, onCommit, onCancel }: {
  node: DesignElement | null;
  rect: OverlayRect | null;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const [value, setValue] = useState(node?.content || "");

  const resize = useCallback(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(rect?.height || 36, textarea.scrollHeight)}px`;
  }, [rect?.height]);

  useEffect(() => {
    done.current = false;
    setValue(node?.content || "");
    if (node) requestAnimationFrame(() => { ref.current?.focus(); ref.current?.select(); resize(); });
  }, [node, resize]);
  useLayoutEffect(resize, [resize, value]);

  if (!node || !rect) return null;
  const multiline = Boolean(node.data?.multiline || node.style?.multiline);
  const maxLength = node.id === "headline" ? 120 : node.id === "subtitle" ? 200 : node.id === "cta" ? 40 : undefined;
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onCommit(value);
  };

  return (
    <textarea
      ref={ref}
      aria-label="Edit canvas text"
      maxLength={maxLength}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === "Escape") { done.current = true; onCancel(); return; }
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); finish(); return; }
        if (event.key === "Enter" && !multiline && !event.shiftKey) { event.preventDefault(); finish(); }
      }}
      style={{
        position: "absolute", left: rect.left, top: rect.top,
        width: Math.max(rect.width, 80), minHeight: Math.max(rect.height, 36), height: rect.height,
        transform: `rotate(${rect.rotation}deg)`, transformOrigin: "center",
        zIndex: 5, resize: "none", overflow: "hidden", boxSizing: "border-box",
        border: "2px solid #6d5dfc", outline: "none", padding: 4,
        fontFamily: node.fontFamily || "Arial", fontSize: `${(node.fontSize || 24) * rect.fontScale}px`,
        fontWeight: node.fontWeight || "normal", lineHeight: node.lineHeight || 1.2,
        textAlign: node.alignment || "left", color: node.color || "#222", background: "#ffffffee",
        whiteSpace: multiline ? "pre-wrap" : "pre",
      }}
    />
  );
}
