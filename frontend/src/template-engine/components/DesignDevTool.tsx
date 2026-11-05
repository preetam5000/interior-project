import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { DesignFormat, DesignTemplate } from "../types/designTemplate";
import { validateDesignTemplate } from "../templates/validateDesignTemplate";

const FORMAT_DIMENSIONS: Record<DesignFormat, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

function animationName(id: string): string {
  return id.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export interface DesignDevToolProps {
  template: DesignTemplate;
  format: DesignFormat;
}

export function DesignDevTool({ template, format }: DesignDevToolProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const errors = useMemo(() => validateDesignTemplate(template), [template]);
  const elementTypes = useMemo(
    () => [...new Set(template.elements.map((element) => element.type))],
    [template.elements],
  );
  const dimensions = FORMAT_DIMENSIONS[format];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setOpen((current) => !current);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(template, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Could not copy the design template JSON.", error);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <aside
      aria-label="Design developer diagnostics"
      data-testid="design-dev-tool"
      style={{
        position: "fixed",
        zIndex: 2147483000,
        right: 16,
        bottom: 16,
        width: "min(390px, calc(100vw - 32px))",
        maxHeight: "min(78vh, 760px)",
        display: "flex",
        flexDirection: "column",
        border: "1px solid #3f4652",
        borderRadius: 12,
        background: "#11151c",
        color: "#e8edf5",
        boxShadow: "0 16px 48px rgba(0,0,0,.5)",
        font: "12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid #303743" }}>
        <strong style={{ fontSize: 13 }}>Design Dev Tool</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close Design Dev Tool" style={buttonStyle}>Close</button>
      </header>
      <div style={{ overflowY: "auto", padding: 14 }}>
        <section style={sectionStyle}>
          <div style={rowStyle}><strong>Template</strong><span>{template.name}</span></div>
          <div style={{ color: errors.length ? "#ff8b8b" : "#69dfa1", marginTop: 6 }}>
            {errors.length ? `✕ Invalid · ${errors.length} issue(s)` : "✓ Valid"}
          </div>
          {errors.length > 0 && <ul style={{ color: "#ffaaaa", paddingLeft: 18 }}>{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
        </section>
        <section style={sectionStyle}>
          <strong>Elements · {template.elements.length}</strong>
          <ul style={listStyle}>
            {elementTypes.map((type) => (
              <li key={type}>{type}<span style={{ color: "#9da8b8" }}> × {template.elements.filter((element) => element.type === type).length}</span></li>
            ))}
          </ul>
        </section>
        <section style={sectionStyle}>
          <div style={rowStyle}><strong>Animations</strong><span>{template.animations.length}</span></div>
          {template.animations.length > 0 && (
            <ul style={listStyle}>
              {template.animations.map((animation) => (
                <li key={animation.id}>
                  {animationName(animation.id)}
                  <span style={{ color: "#9da8b8" }}> · {animation.property} · {animation.durationMs}ms</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section style={sectionStyle}>
          <strong>Canvas</strong>
          <div style={{ marginTop: 5 }}>{template.canvas.width} × {template.canvas.height} px</div>
          <div style={{ color: "#9da8b8" }}>Preview: {dimensions.width} × {dimensions.height} · {format}</div>
        </section>
        <section>
          <div style={{ ...rowStyle, marginBottom: 6 }}>
            <strong>JSON</strong>
            <button type="button" onClick={copyJson} style={buttonStyle}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <pre style={{
            margin: 0,
            maxHeight: 240,
            overflow: "auto",
            padding: 10,
            borderRadius: 8,
            background: "#090c11",
            color: "#c5d6ef",
            whiteSpace: "pre",
            tabSize: 2,
          }}>{JSON.stringify(template, null, 2)}</pre>
        </section>
      </div>
      <footer style={{ padding: "8px 14px", borderTop: "1px solid #303743", color: "#9da8b8" }}>
        Toggle: Alt + Shift + D · Esc to close
      </footer>
    </aside>,
    document.body,
  );
}

const sectionStyle = { paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid #303743" };
const rowStyle = { display: "flex", justifyContent: "space-between", gap: 12 };
const listStyle = { margin: "6px 0 0", paddingLeft: 18 };
const buttonStyle = {
  border: "1px solid #485363",
  borderRadius: 6,
  padding: "3px 8px",
  background: "#202733",
  color: "#e8edf5",
  cursor: "pointer",
};
