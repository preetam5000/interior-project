import { useMemo, useState } from "react";
import { Check, Eye, Lightbulb, RefreshCw, Sparkles, WandSparkles } from "lucide-react";
import { defaultDesignAssistant } from "@/template-engine/ai/design-assistant/DesignAssistantEngine";
import DesignTemplateRenderer from "@/template-engine/renderers/DesignTemplateRenderer";

const CATEGORY_LABELS = { layout: "Layout", typography: "Typography", spacing: "Spacing", colors: "Colors", cta: "CTA", template: "Template", animation: "Animation", "logo-placement": "Logo placement", "image-crop": "Image crop", hierarchy: "Hierarchy", "safe-zone": "Safe zones" };
const previewReady = (template) => template?.supportedFormats?.includes("portrait") ? template : { ...template, supportedFormats: [...(template?.supportedFormats || []), "portrait"] };

export default function DesignAssistantPanel({ template, selectedIds, templateCandidates = [], onApply }) {
  const [suggestions, setSuggestions] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [previewedId, setPreviewedId] = useState("");
  const [appliedIds, setAppliedIds] = useState([]);
  const [analysisDocument, setAnalysisDocument] = useState(null);
  const [analysisSelection, setAnalysisSelection] = useState("");
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const selectionKey = (selectedIds || []).join("|");
  const stale = Boolean(analysisDocument && (analysisDocument !== template || analysisSelection !== selectionKey));
  const selected = suggestions.find((item) => item.id === selectedId);
  const categories = useMemo(() => [...new Set(suggestions.map((item) => item.category))], [suggestions]);
  const analyze = () => {
    if (!template) return;
    const next = defaultDesignAssistant.suggest({ document: template, selection: selectedIds, templateCandidates });
    setSuggestions(next);
    setAnalysisDocument(template);
    setAnalysisSelection(selectionKey);
    setHasAnalyzed(true);
    setAppliedIds([]);
    setSelectedId(next[0]?.id || "");
    setPreviewedId("");
  };
  const preview = () => { if (selected) setPreviewedId(selected.id); };
  const apply = () => {
    if (!selected || previewedId !== selected.id || stale) return;
    onApply(selected);
    setAppliedIds((ids) => [...ids, selected.id]);
  };

  return <div className="space-y-3">
    <section className="rounded-xl border border-border/70 bg-background/45 p-3.5"><div className="flex items-center gap-2 text-[11px] font-semibold"><WandSparkles className="h-4 w-4 text-primary"/>AI Design Assistant</div><p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">Local design heuristics suggest edits for your review. Nothing changes until you preview and apply a suggestion.</p><button type="button" onClick={analyze} disabled={!template} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[10px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"><Sparkles className="h-3.5 w-3.5"/>Analyze current design</button><div className="mt-2 flex items-center justify-center gap-1 text-[8px] text-muted-foreground"><Lightbulb className="h-3 w-3"/>No AI API or automatic edits</div></section>

    {suggestions.length > 0 && <><div className="flex items-center justify-between px-1"><span className="text-[9px] font-semibold">{suggestions.length} suggestions</span><button type="button" onClick={analyze} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[8px] text-muted-foreground hover:bg-accent"><RefreshCw className="h-3 w-3"/>Refresh</button></div>
      {categories.map((category) => <section key={category} className="space-y-1.5"><h3 className="px-1 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORY_LABELS[category]}</h3>{suggestions.filter((item) => item.category === category).map((item) => <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setPreviewedId(""); }} className={`w-full rounded-xl border p-2.5 text-left transition hover:border-primary/35 ${selectedId === item.id ? "border-primary/40 bg-primary/[.04] shadow-sm" : "border-border/70 bg-background/40"}`}><div className="flex items-start justify-between gap-2"><span className="text-[9px] font-semibold leading-relaxed">{item.title}</span><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[7px] ${item.impact === "high" ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"}`}>{item.impact}</span></div><p className="mt-1 line-clamp-2 text-[8px] leading-relaxed text-muted-foreground">{item.rationale}</p></button>)}</section>)}</>}

    {selected && <section className="rounded-xl border border-primary/25 bg-background/55 p-3"><div className="text-[10px] font-semibold">Review suggestion</div><p className="mt-1 text-[8px] leading-relaxed text-muted-foreground">{selected.rationale}</p>{stale && <p role="status" className="mt-2 rounded-lg bg-amber-500/10 p-2 text-[8px] text-amber-700">The design changed after this review. Refresh suggestions before previewing or applying.</p>}<div className="mt-2 flex gap-2"><button type="button" disabled={stale} onClick={preview} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/70 text-[9px] transition hover:bg-accent disabled:opacity-40"><Eye className="h-3.5 w-3.5"/>Preview changes</button><button type="button" disabled={previewedId !== selected.id || appliedIds.includes(selected.id) || stale} onClick={apply} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-[9px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40">{appliedIds.includes(selected.id) ? <><Check className="h-3.5 w-3.5"/>Applied</> : "Apply"}</button></div>
      {previewedId === selected.id && !stale && <div className="mt-3 space-y-2"><div className="grid grid-cols-2 gap-2"><div><div className="mb-1 text-center text-[7px] text-muted-foreground">Current</div><div className="overflow-hidden rounded-lg border border-border/60 bg-muted/30 p-1"><DesignTemplateRenderer template={previewReady(template)} format="portrait" className="mx-auto max-h-[150px] w-full max-w-[84px] rounded-md"/></div></div><div><div className="mb-1 text-center text-[7px] text-primary">Proposed</div><div className="overflow-hidden rounded-lg border border-primary/25 bg-muted/30 p-1"><DesignTemplateRenderer template={previewReady(selected.previewDocument)} format="portrait" className="mx-auto max-h-[150px] w-full max-w-[84px] rounded-md"/></div></div></div><p className="text-center text-[7px] text-muted-foreground">Preview only · Apply records an undoable editor change</p></div>}
    </section>}

    {!suggestions.length && <div className="rounded-xl border border-dashed border-border/70 p-5 text-center"><div className="text-[10px] font-medium">{hasAnalyzed ? "No suggestions found" : "Ready when you are"}</div><p className="mt-1 text-[8px] leading-relaxed text-muted-foreground">{hasAnalyzed ? "The local review found no changes to recommend for this design." : "Run a local review for layout, type, spacing, color, CTA, template, motion, logo placement, image crop, hierarchy, and safe zones."}</p></div>}
  </div>;
}
