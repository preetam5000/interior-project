import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Download, FileDown, Loader2, Play, RefreshCw, X } from "lucide-react";
import { defaultExportEngine, getExportProfile } from "@/template-engine/export";

const FORMATS = ["png", "jpeg", "webp", "svg", "pdf"];
const PROFILES = [["instagram-story", "Instagram Story"], ["instagram-feed", "Instagram Feed"], ["carousel", "Feed / Carousel"], ["reel-cover", "Reel Cover"]];
const BRAND_STORAGE_KEY = "interior-social-ai.brand-kits.v1";
const profileFor = (id) => getExportProfile(id);
const safeName = (value) => String(value || "design").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "design";
const triggerDownload = (blob, filename) => { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); };
const readBrandKits = () => { try { const kits = JSON.parse(localStorage.getItem(BRAND_STORAGE_KEY) || "[]"); return Array.isArray(kits) ? kits : []; } catch { return []; } };

export default function ExportStudioPanel({ document: design, context = {} }) {
  const [formats, setFormats] = useState(["png"]);
  const [profiles, setProfiles] = useState(["instagram-story"]);
  const [scale, setScale] = useState(1);
  const [transparent, setTransparent] = useState(false);
  const [brandSafe, setBrandSafe] = useState(true);
  const [kits] = useState(readBrandKits);
  const [kitId, setKitId] = useState("");
  const [jobs, setJobs] = useState([]);
  const [running, setRunning] = useState(false);
  const aborters = useRef(new Map());
  const liveJobs = useRef([]);
  const brandKit = kits.find((kit) => kit.id === kitId) || kits[0];
  const unsupportedTransparency = formats.some((format) => ["jpeg", "pdf"].includes(format));
  const warnings = useMemo(() => {
    if (!design?.elements || !brandSafe) return [];
    const results = [];
    profiles.forEach((id) => {
      const profile = profileFor(id);
      const insets = design.canvas?.safeZones?.[profile.designFormat] || profile.safeInsets;
      design.elements.filter((element) => element.visible !== false).forEach((element) => {
        if (element.x < (insets.left || 0) || element.y < (insets.top || 0) || element.x + element.width > 1 - (insets.right || 0) || element.y + element.height > 1 - (insets.bottom || 0)) results.push(`${element.data?.layerName || element.type} crosses ${profile.label} safe zones`);
      });
    });
    if (design.elements.some((element) => element.type === "Image" && !element.source && !context.imageSrc)) results.push("An image layer has no source image");
    if (design.elements.some((element) => (element.color || "").startsWith("$") && !design.branding?.palette?.[element.color.slice(1)] && !brandKit)) results.push("Some brand color tokens are unresolved");
    return [...new Set(results)].slice(0, 5);
  }, [design, profiles, context.imageSrc, brandKit, brandSafe]);
  const patchJob = (id, update) => { liveJobs.current = liveJobs.current.map((job) => job.id === id ? { ...job, ...update } : job); setJobs(liveJobs.current); };

  const runJobs = async (items) => {
    if (running) return;
    setRunning(true);
    for (const item of items) {
      if (item.status !== "queued") continue;
      const controller = new AbortController();
      aborters.current.set(item.id, controller);
      patchJob(item.id, { status: "running", progress: 0.05, stage: "Preparing" });
      try {
        const result = await defaultExportEngine.export({
          document: item.document,
          context: item.context,
          brandKit: item.brandKit,
          format: item.format,
          profile: item.profile,
          scale: item.scale,
          transparentBackground: item.transparent,
          safeZones: item.brandSafe,
          signal: controller.signal,
          onProgress: ({ stage, progress }) => patchJob(item.id, { stage: stage[0].toUpperCase() + stage.slice(1), progress }),
        });
        if (controller.signal.aborted) throw new DOMException("Export cancelled.", "AbortError");
        const suffix = item.scale > 1 ? `-${item.scale}x` : "";
        const filename = `${safeName(item.document.name)}-${item.profile}${suffix}.${item.format}`;
        triggerDownload(result.blob, filename);
        if (result.animationMetadata?.length) {
          const metadata = new Blob([JSON.stringify({ documentId: item.document.id, animations: result.animationMetadata }, null, 2)], { type: "application/json" });
          triggerDownload(metadata, `${safeName(item.document.name)}-${item.profile}-animation-metadata.json`);
        }
        patchJob(item.id, { status: "completed", progress: 1, stage: "Downloaded", filename, dimensions: `${result.width} × ${result.height}` });
      } catch (error) {
        patchJob(item.id, { status: controller.signal.aborted || error?.name === "AbortError" ? "cancelled" : "failed", stage: error?.message || "Export failed" });
      } finally { aborters.current.delete(item.id); }
    }
    setRunning(false);
  };

  const enqueue = () => {
    if (!design || !formats.length || !profiles.length || running) return;
    const snapshot = JSON.parse(JSON.stringify(design));
    const batch = profiles.flatMap((profile) => formats.map((format) => ({ id: crypto.randomUUID(), document: snapshot, context, brandKit, format, profile, scale, transparent: transparent && !["jpeg", "pdf"].includes(format), brandSafe, status: "queued", progress: 0, stage: "Queued" })));
    liveJobs.current = [...liveJobs.current, ...batch];
    setJobs(liveJobs.current);
    void runJobs(batch);
  };
  const cancel = (job) => {
    aborters.current.get(job.id)?.abort();
    if (job.status === "queued") patchJob(job.id, { status: "cancelled", stage: "Cancelled" });
  };
  const retry = (job) => { const retryJob = { ...job, id: crypto.randomUUID(), status: "queued", progress: 0, stage: "Queued" }; liveJobs.current = [...liveJobs.current, retryJob]; setJobs(liveJobs.current); void runJobs([retryJob]); };
  const toggle = (list, setList, id) => setList((value) => value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  return <div className="space-y-3.5">
    <section className="rounded-xl border border-border/70 bg-background/45 p-3"><div className="flex items-center gap-2 text-[10px] font-semibold"><FileDown className="h-4 w-4 text-primary"/>Local Export Studio</div><p className="mt-1 text-[8px] leading-relaxed text-muted-foreground">Files are rendered in this browser and downloaded directly. Nothing is uploaded.</p><div className="mt-3 space-y-2"><div><div className="mb-1 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">Formats</div><div className="grid grid-cols-5 gap-1">{FORMATS.map((item) => <button key={item} type="button" onClick={() => toggle(formats, setFormats, item)} className={`h-7 rounded-md border text-[8px] uppercase ${formats.includes(item) ? "border-primary/40 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>{item}</button>)}</div></div><div><div className="mb-1 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">Social profiles</div><div className="grid grid-cols-2 gap-1">{PROFILES.map(([id, label]) => <button key={id} type="button" onClick={() => toggle(profiles, setProfiles, id)} className={`rounded-md border px-2 py-1.5 text-left text-[8px] ${profiles.includes(id) ? "border-primary/40 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>{label}</button>)}</div></div>
      <label className="block space-y-1"><span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">Resolution</span><select value={scale} onChange={(event) => setScale(Number(event.target.value))} className="h-8 w-full rounded-lg border border-border/70 bg-background px-2 text-[9px]">{[[1,"Standard"],[2,"High resolution · 2×"],[3,"Ultra · 3×"],[4,"Maximum · 4×"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {kits.length > 0 && <label className="block space-y-1"><span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">Brand kit tokens</span><select value={brandKit?.id || ""} onChange={(event) => setKitId(event.target.value)} className="h-8 w-full rounded-lg border border-border/70 bg-background px-2 text-[9px]">{kits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}</option>)}</select></label>}
      <div className="space-y-1.5 rounded-lg border border-border/70 bg-background/40 p-2"><label className="flex items-start gap-2 text-[8px]"><input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} className="mt-0.5 accent-primary"/><span><b>Transparent background</b><span className="block text-muted-foreground">Supported by PNG, WEBP and SVG. JPEG/PDF remain opaque.</span></span></label><label className="flex items-start gap-2 text-[8px]"><input type="checkbox" checked={brandSafe} onChange={(event) => setBrandSafe(event.target.checked)} className="mt-0.5 accent-primary"/><span><b>Brand safe zones</b><span className="block text-muted-foreground">Use profile safe-zone metadata and show preflight warnings.</span></span></label></div>
      {unsupportedTransparency && transparent && <p className="text-[8px] text-amber-600">Transparency is ignored for JPEG and PDF jobs.</p>}
      {warnings.length > 0 && <div role="status" className="space-y-1 rounded-lg bg-amber-500/10 p-2 text-[8px] text-amber-700"><div className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-3 w-3"/>Brand safety review</div>{warnings.map((warning) => <div key={warning}>• {warning}</div>)}</div>}
      <button type="button" disabled={!design || !formats.length || !profiles.length || running} onClick={enqueue} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[9px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"><Play className="h-3.5 w-3.5"/>Add {formats.length * profiles.length || 0} export{formats.length * profiles.length === 1 ? "" : "s"} to queue</button>
    </div></section>
    <section className="rounded-xl border border-border/70 bg-background/35 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-semibold">Export queue</span><span className="text-[8px] text-muted-foreground">{jobs.length} jobs</span></div>{jobs.length === 0 ? <div className="rounded-lg border border-dashed border-border/70 p-4 text-center text-[8px] text-muted-foreground">Your local export queue is empty.</div> : <div className="max-h-[38vh] space-y-2 overflow-auto">{[...jobs].reverse().map((job) => <div key={job.id} className="rounded-lg border border-border/70 bg-background/45 p-2"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[8px] font-semibold">{job.profile} · {job.format.toUpperCase()} · {job.scale}×</div><div className="truncate text-[7px] text-muted-foreground">{job.stage}{job.dimensions ? ` · ${job.dimensions}` : ""}</div></div><div className="flex shrink-0 items-center gap-1">{job.status === "running" && <button type="button" title="Cancel export" onClick={() => cancel(job)} className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent"><Ban className="h-3 w-3"/></button>}{["failed", "cancelled"].includes(job.status) && <button type="button" title="Retry export" onClick={() => retry(job)} className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent"><RefreshCw className="h-3 w-3"/></button>}{job.status === "completed" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600"/>}{job.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary"/>}{job.status === "cancelled" && <X className="h-3.5 w-3.5 text-muted-foreground"/>}</div></div>{job.status === "running" && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((job.progress || 0) * 100)}%` }}/></div>}{job.filename && <div className="mt-1 truncate text-[7px] text-emerald-700">{job.filename}</div>}</div>)}</div>}</section>
  </div>;
}
