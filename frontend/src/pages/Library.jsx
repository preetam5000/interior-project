import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Download, RefreshCw, SquareStack, Send, Film, ImageOff, CheckSquare, Trash2, CalendarDays, ChevronDown, Check, HardDrive } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, errMsg, fetcher, formatBytes, formatIST, can } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, StatusBadge, TypeBadge, EmptyState, SkeletonGrid, Spinner } from "@/components/common/Bits";
import { BeforeAfter } from "@/components/post/Previews";
import GPTEnhancementModal from "@/components/gpt-enhancement/GPTEnhancementModal";
import StoryMusicPicker from "@/components/post/StoryMusicPicker";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const FILTERS = {
  status: ["ready", "pending", "approved", "scheduled", "published", "rejected", "skipped", "processing", "failed"],
  kind: ["image", "video"],
  room_type: ["Living Room", "Bedroom", "Kitchen", "Dining", "Bathroom", "Wardrobe", "Office", "Exterior", "Landscape", "Commercial"],
};
const LABELS = { status: "Status", kind: "Type", room_type: "Room" };
const DATE_PRESETS = [["today", "Today"], ["yesterday", "Yesterday"], ["this_week", "This Week"], ["this_month", "This Month"]];

function localStart(date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; }
function addDays(date, count) { const value = new Date(date); value.setDate(value.getDate() + count); return value; }
function dateBounds(preset, range) {
  if (preset === "custom" && range?.from && range?.to) return [localStart(range.from), localStart(addDays(range.to, 1))];
  if (!preset || preset === "custom") return [null, null];
  const today = localStart(new Date());
  if (preset === "today") return [today, addDays(today, 1)];
  if (preset === "yesterday") return [addDays(today, -1), today];
  if (preset === "this_week") { const offset = (today.getDay() + 6) % 7; return [addDays(today, -offset), addDays(today, 1)]; }
  if (preset === "this_month") return [new Date(today.getFullYear(), today.getMonth(), 1), addDays(today, 1)];
  return [null, null];
}

function DateFilter({ preset, onPreset, range, onRange, sort, onSort }) {
  const [open, setOpen] = useState(false);
  const label = preset === "custom" && range?.from ? (range.to ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d")}` : format(range.from, "MMM d"))
    : DATE_PRESETS.find(([key]) => key === preset)?.[1] || "Date";
  const choosePreset = (value) => { onPreset(preset === value ? "" : value, preset === value ? "" : "dropdown"); setOpen(false); };
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="outline" className="h-10 w-[150px] shrink-0 justify-between rounded-full px-3" data-testid="filter-date-select"><span className="flex min-w-0 items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{label}</span></span><ChevronDown className="h-3.5 w-3.5 opacity-60" /></Button></PopoverTrigger>
    <PopoverContent align="end" className="glass w-[292px] rounded-2xl p-2" data-testid="date-filter-menu">
      <div className="space-y-0.5">{DATE_PRESETS.map(([key, title]) => <button key={key} type="button" onClick={() => choosePreset(key)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted/70">{title}{preset === key && <Check className="h-4 w-4 text-gold" />}</button>)}</div>
      <div className="my-2 border-t border-border/70" />
      <button type="button" onClick={() => { if (preset === "custom") { onPreset("", ""); setOpen(false); } else onPreset("custom", "dropdown"); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted/70">Custom Range...{preset === "custom" && <Check className="h-4 w-4 text-gold" />}</button>
      {preset === "custom" && <Calendar mode="range" selected={range} onSelect={(next) => { onRange(next); if (next?.from && next?.to) setOpen(false); }} numberOfMonths={1} className="mx-auto" />}
      <div className="my-2 border-t border-border/70" />
      {[ ["newest", "Newest First"], ["oldest", "Oldest First"] ].map(([key, title]) => <button key={key} type="button" onClick={() => onSort(key)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted/70">{title}{sort === key && <Check className="h-4 w-4 text-gold" />}</button>)}
    </PopoverContent>
  </Popover>;
}

function groupByUploadDate(items) {
  const today = localStart(new Date());
  const yesterday = addDays(today, -1);
  const groups = new Map();
  for (const media of items || []) {
    const date = new Date(media.created_at || media.uploaded_at || 0);
    const day = localStart(date);
    const key = Number.isNaN(day.getTime()) ? "Unknown date" : day.toISOString();
    const label = key === "Unknown date" ? key : day.getTime() === today.getTime() ? "TODAY" : day.getTime() === yesterday.getTime() ? "YESTERDAY" : `${format(day, "d MMMM yyyy").toUpperCase()}`;
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key).items.push(media);
  }
  return [...groups.values()];
}

function FilterSelect({ k, value, onChange }) {
  return (
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger className="h-10 w-[150px] rounded-full" data-testid={`filter-${k}-select`}><SelectValue placeholder={LABELS[k]} /></SelectTrigger>
      <SelectContent><SelectItem value="all">All {LABELS[k].toLowerCase()}</SelectItem>{FILTERS[k].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function Detail({ id, onClose }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: m, refetch } = useQuery({ queryKey: ["media", id], queryFn: () => fetcher(`/media/${id}`), enabled: !!id });
  const { data: driveImport, refetch: refetchDriveImport } = useQuery({ queryKey: ["google-drive-import", m?.drive_sync_record_id], queryFn: () => fetcher(`/google-drive/imports/${m.drive_sync_record_id}`), enabled: !!m?.drive_sync_record_id });
  const act = async (k, fn, msg) => { setBusy(k); try { const { data } = await fn(); toast.success(msg); qc.invalidateQueries({ queryKey: ["media"] }); await refetch(); return data; } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); } };
  const deleteMedia = async () => {
    setBusy("delete");
    try {
      await api.delete(`/media/${id}`);
      qc.setQueriesData({ queryKey: ["media"] }, (current) =>
        Array.isArray(current) ? current.filter((media) => media.id !== id) : current);
      qc.removeQueries({ queryKey: ["media", id], exact: true });
      qc.invalidateQueries({ queryKey: ["media", "library"] });
      toast.success("Media deleted");
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
      setConfirmDelete(false);
    } finally {
      setBusy(null);
    }
  };
  const a = m?.analysis || {};
  const qualityBefore = m?.quality?.before || m?.quality || {};
  const qualityAfter = m?.quality?.after || m?.quality_after || {};
  const report = m?.processing_report || {};
  const gptStatus = m?.gpt_image_status || report.gpt_image_status || "not_run";
  const generateStory = async (musicSelection) => {
    setBusy("story");
    try {
      const { data: post } = await api.post(`/media/${id}/generate-story`, musicSelection);
      toast.success(musicSelection.music_mode === "no_music" ? "Silent story generated" : "Story generated with music");
      qc.invalidateQueries({ queryKey: ["media"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
      nav(`/approvals/${post.id}`);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };
  const retryDriveImport = async () => {
    if (!m?.drive_sync_record_id) return;
    setBusy("drive-retry");
    try {
      await api.post(`/google-drive/import/${m.drive_sync_record_id}/retry`);
      toast.success("Import retry queued");
      qc.invalidateQueries({ queryKey: ["google-drive-sync-status"] });
      await Promise.all([refetch(), refetchDriveImport()]);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };
  const improvedQualityMetrics = Object.entries(qualityAfter.score_breakdown || {})
    .map(([name, detail]) => ({
      name,
      delta: Number(detail.score) - Number(qualityBefore.score_breakdown?.[name]?.score),
    }))
    .filter((metric) => Number.isFinite(metric.delta) && metric.delta > 0.05);
  return (
    <>
    <Sheet open={!!id} onOpenChange={(o) => !o && busy !== "delete" && onClose()}>
      <SheetContent className="w-full overflow-y-auto scroll-thin sm:max-w-xl" data-testid="media-detail-sheet">
        {!m ? <><SheetTitle className="sr-only">Loading media</SheetTitle><Spinner /></> : (<>
          <SheetHeader><SheetTitle className="font-display text-3xl">{a.title || m.filename}</SheetTitle></SheetHeader>
          <div className="mt-2 flex flex-wrap gap-2"><StatusBadge status={m.status} />{a.content_type && <TypeBadge type={a.content_type} />}{m.is_duplicate && <span className="rounded-full bg-rose-500/10 px-2 text-[11px] text-rose-400">Duplicate</span>}</div>
          <div className="mt-5">
            {m.kind === "video" ? <video src={m.urls?.video || m.urls?.original} controls className="w-full rounded-xl" /> : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <figure className="overflow-hidden rounded-xl border border-border"><img src={m.urls?.original} alt="Original" className="aspect-[4/5] w-full object-cover" /><figcaption className="px-3 py-2 text-xs">Original image</figcaption></figure>
                  <figure className="overflow-hidden rounded-xl border border-border"><img src={m.urls?.opencv || m.urls?.enhanced} alt="OpenCV enhanced" className="aspect-[4/5] w-full object-cover" /><figcaption className="px-3 py-2 text-xs">OpenCV enhanced</figcaption></figure>
                </div>
                {m.urls?.gpt && <figure className="overflow-hidden rounded-xl border border-gold/40"><BeforeAfter before={m.urls?.opencv || m.urls?.enhanced} after={m.urls.gpt} afterLabel="GPT FINAL" /><figcaption className="px-3 py-2 text-xs">GPT enhanced image</figcaption></figure>}
              </div>
            )}
          </div>
          {m.error && <p className="mt-3 text-sm text-rose-400">{m.error}</p>}
          <div className="mt-5 grid grid-cols-2 gap-3 font-mono-ui text-[11px]">
            {[["Room", a.room_type], ["Stage", a.project_stage], ["Style", a.design_style], ["Aesthetic", a.aesthetic_score], ["Mood", a.mood], ["Project", m.project_name],
              ["Source", m.source], ["Size", formatBytes(m.size_bytes)], ["Sharpness", m.quality?.sharpness], ["Exposure", m.quality?.exposure]].map(([k, v]) => <div key={k}><div className="text-muted-foreground">{k}</div><div>{v ?? "—"}</div></div>)}
          </div>
          {m.source === "google_drive" && <section className="mt-4 rounded-xl border border-gold/30 bg-gold/5 p-4" data-testid="google-drive-media-details">
            <div className="flex items-center gap-2"><HardDrive className="h-4 w-4 text-gold" /><div className="eyebrow">Imported Automatically</div></div>
            <div className="mt-3 grid grid-cols-2 gap-3 font-mono-ui text-[11px]">
              {[ ["Google Drive File ID", m.google_drive_file_id || m.drive_file_id], ["Original Filename", m.drive_file_name || m.filename], ["Imported Time", m.sync_time ? formatIST(m.sync_time) : "—"], ["Source Folder", m.folder || "filtered images"], ["Sync Status", driveImport?.status_label || m.sync_status], ["Retry Count", driveImport?.retry_count ?? 0], ["Processing Duration", driveImport?.processing_time != null ? `${Number(driveImport.processing_time).toFixed(1)} sec` : "—"] ].map(([label, value]) => <div key={label}><div className="text-muted-foreground">{label}</div><div className="break-all">{value ?? "—"}</div></div>)}
            </div>
            {m.drive_web_view_link && <a className="mt-3 inline-flex text-xs text-gold hover:underline" href={m.drive_web_view_link} target="_blank" rel="noreferrer">Open source in Google Drive</a>}
            {user?.role === "admin" && m.drive_sync_record_id && (m.status === "failed" || driveImport?.status === "failed") && <Button size="sm" variant="outline" className="mt-3 rounded-full" onClick={retryDriveImport} disabled={!!busy}><RefreshCw className="mr-1 h-3.5 w-3.5" />Retry Import</Button>}
          </section>}
          {qualityAfter.quality_score != null && <section className="mt-5 rounded-xl border border-gold/40 bg-gold/5 p-4" data-testid="media-quality-score">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><div className="eyebrow">Quality Score</div><div className="mt-1 font-mono-ui text-2xl">{Number(qualityBefore.quality_score ?? qualityAfter.quality_score).toFixed(1)} <span className="text-muted-foreground">→</span> {Number(qualityAfter.quality_score).toFixed(1)}<span className="text-sm text-muted-foreground"> / 100</span></div></div>
              <div className="text-right"><div className="eyebrow">Overall Grade</div><div className="mt-1 font-mono-ui text-xl text-gold">{qualityBefore.quality_grade || "—"} → {qualityAfter.quality_grade || "—"}</div></div>
              <div className="text-sm">Gain <span className="font-mono-ui text-emerald-400">{Number(m.quality_gain ?? qualityAfter.quality_score - qualityBefore.quality_score).toFixed(1)} pts</span></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {improvedQualityMetrics.length ? improvedQualityMetrics.map(({ name, delta }) => <span key={name} className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">{name.replaceAll("_", " ")} +{delta.toFixed(1)}</span>) : <span className="text-xs text-muted-foreground">No score metrics improved.</span>}
            </div>
          </section>}
          {m.kind === "image" && <section className="mt-4 rounded-xl border border-border p-4" data-testid="enhancement-summary">
            <div className="eyebrow">Processing summary</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <div><div className="text-muted-foreground">Quality before</div><div className="mt-1 font-mono-ui">{qualityBefore.quality_score == null ? "—" : `${Number(qualityBefore.quality_score).toFixed(1)} / 100`}</div></div>
              <div><div className="text-muted-foreground">Quality after OpenCV</div><div className="mt-1 font-mono-ui">{(m.quality?.after_opencv?.quality_score ?? qualityAfter.quality_score) == null ? "—" : `${Number(m.quality?.after_opencv?.quality_score ?? qualityAfter.quality_score).toFixed(1)} / 100`}</div></div>
              {m.quality?.after_gpt && <div><div className="text-muted-foreground">Quality after GPT</div><div className="mt-1 font-mono-ui">{Number(m.quality.after_gpt.quality_score).toFixed(1)} / 100</div></div>}
              <div><div className="text-muted-foreground">OpenCV processing</div><div className="mt-1 font-mono-ui">{Number(report.opencv_processing_time_ms || 0).toFixed(0)} ms</div></div>
              <div><div className="text-muted-foreground">GPT processing</div><div className="mt-1 font-mono-ui">{gptStatus === "not_run" ? "Not run" : `${(Number(report.gpt_image_processing_time_ms || 0) / 1000).toFixed(1)} sec`}</div></div>
              {gptStatus === "not_run" && <div><div className="text-muted-foreground">Estimated GPT time</div><div className="mt-1 font-mono-ui">{Number(m.estimated_gpt_time_seconds || report.estimated_gpt_time_seconds || 15)} sec</div></div>}
              <div><div className="text-muted-foreground">GPT status</div><div className="mt-1 font-mono-ui">{gptStatus === "completed" ? "Completed ✓" : gptStatus === "failed_fallback" ? "Failed · OpenCV kept" : gptStatus === "processing" ? "Processing…" : "Not Run"}</div></div>
              <div><div className="text-muted-foreground">Estimated GPT cost</div><div className="mt-1 font-mono-ui">${Number(m.estimated_gpt_cost_usd || 0).toFixed(4)} USD</div></div>
              {m.actual_gpt_cost_usd != null && <div><div className="text-muted-foreground">Actual GPT cost</div><div className="mt-1 font-mono-ui">${Number(m.actual_gpt_cost_usd).toFixed(4)} USD</div></div>}
            </div>
            {gptStatus === "failed_fallback" && <p className="mt-3 text-sm text-rose-400">GPT enhancement failed. Using OpenCV enhanced image instead.</p>}
          </section>}
          {m.kind === "image" && m.analysis && can(user, "approve") && <StoryMusicPicker mediaId={id} onGenerate={generateStory} generating={busy === "story"} disabled={!!busy || gptStatus === "processing"} initialMusicMode={m.posts?.find((post) => post.type === "story" && post.status === "pending")?.music_mode} initialTrackId={m.posts?.find((post) => post.type === "story" && post.status === "pending")?.music_track_id} />}
          {a.reason && <p className="mt-4 text-sm text-muted-foreground"><span className="text-gold">AI: </span>{a.reason}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            {["original", "enhanced", "portrait", "square", "story", "video"].filter((k) => m.urls?.[k]).map((k) => (
              <Button key={k} asChild size="sm" variant="outline" className="rounded-full" disabled={!!busy}><a href={m.urls[k]} target="_blank" rel="noreferrer" download data-testid={`download-${k}`}><Download className="mr-1 h-3 w-3" />{k}</a></Button>))}
          </div>
          {can(user, "upload") && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => act("re", () => api.post(`/media/${id}/reprocess`), "Re-queued for AI")} disabled={!!busy} data-testid="reprocess-btn"><RefreshCw className="mr-1 h-3.5 w-3.5" />Re-run AI</Button>
              {m.kind === "image" && can(user, "upload") && (
                <GPTEnhancementModal
                  media={m}
                  imageUrl={m.urls?.portrait || m.urls?.enhanced || m.urls?.original}
                  buttonLabel="Enhance with GPT"
                  buttonTestId="enhance-with-gpt-btn"
                  disabled={!!busy || gptStatus === "processing"}
                />)}
              {can(user, "approve") && a.content_type !== "story" && ["ready", "skipped", "rejected"].includes(m.status) && (
                <Button size="sm" className="rounded-full" disabled={!!busy} data-testid="send-to-approval-btn"
                  onClick={async () => { const p = await act("cp", () => api.post(`/media/${id}/create-post`, { type: a.content_type === "story" ? "story" : "feed" }), "Sent to approval queue"); if (p) nav(`/approvals/${p.id}`); }}>
                  <Send className="mr-1 h-3.5 w-3.5" />Continue with OpenCV</Button>)}
              {can(user, "deleteMedia") && (
                <Button size="sm" variant="destructive" className="rounded-full" onClick={() => setConfirmDelete(true)}
                  disabled={!!busy} data-testid="delete-media-btn">
                  {busy === "delete" ? <><Spinner />Deleting...</> : <><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</>}
                </Button>)}
            </div>
          )}
          <div className="mt-6"><div className="eyebrow mb-2">History</div>
            {(m.history || []).map((h) => <div key={h.id} className="flex justify-between gap-3 border-b border-border/50 py-2 text-xs"><span>{h.message}</span><span className="shrink-0 text-muted-foreground">{formatIST(h.created_at)}</span></div>)}
            {(m.posts || []).map((p) => <button key={p.id} disabled={!!busy} onClick={() => nav(`/approvals/${p.id}`)} className="mt-2 flex w-full items-center justify-between rounded-lg border border-border p-2 text-xs hover:border-gold disabled:pointer-events-none disabled:opacity-50"><span>{p.title}</span><StatusBadge status={p.status} /></button>)}
          </div>
        </>)}
      </SheetContent>
    </Sheet>
    <AlertDialog open={confirmDelete} onOpenChange={(open) => !busy && setConfirmDelete(open)}>
      <AlertDialogContent data-testid="delete-media-confirmation">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Media</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to permanently delete this media? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy === "delete"}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={busy === "delete"} onClick={deleteMedia} data-testid="confirm-delete-media-btn">
            {busy === "delete" ? <><Spinner />Deleting...</> : "Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

export default function Library() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [f, setF] = useState({ q: "", status: "", kind: "", room_type: "" });
  const [datePreset, setDatePreset] = useState("");
  const [dateSource, setDateSource] = useState("");
  const [dateRange, setDateRange] = useState(undefined);
  const [sortOrder, setSortOrder] = useState("newest");
  const [open, setOpen] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (searchParams.get("media")) setOpen(searchParams.get("media")); }, [searchParams]);
  const closeDetail = () => { setOpen(null); if (searchParams.has("media")) { const next = new URLSearchParams(searchParams); next.delete("media"); setSearchParams(next, { replace: true }); } };
  const qs = useMemo(() => {
    const params = new URLSearchParams(Object.entries(f).filter(([, value]) => value));
    const [from, to] = dateBounds(datePreset, dateRange);
    if (from && to) { params.set("date_from", from.toISOString()); params.set("date_to", to.toISOString()); }
    params.set("sort", sortOrder);
    params.set("limit", "500");
    return params.toString();
  }, [f, datePreset, dateRange, sortOrder]);
  const { data, isLoading } = useQuery({ queryKey: ["media", "library", qs], queryFn: () => fetcher(`/media?${qs}`),
    refetchInterval: (q) => ((q.state.data || []).some((m) => ["queued", "processing"].includes(m.status)) ? 4000 : 20000) });
  const groupedMedia = useMemo(() => groupByUploadDate(data || []), [data]);
  const setDateSelection = (preset, source) => { setDatePreset(preset); setDateSource(source); if (preset !== "custom") setDateRange(undefined); };
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const makeCarousel = async () => {
    setBusy(true);
    try { const { data: p } = await api.post("/posts/carousel", { media_ids: sel }); toast.success("Carousel created"); nav(`/approvals/${p.id}`); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader overline="Archive" title="Media library" subtitle="Every original, edit, and published asset — searchable by room, style and stage."
        actions={can(user, "approve") && (selecting ? (<>
          <Button variant="ghost" className="rounded-full" onClick={() => { setSelecting(false); setSel([]); }} data-testid="cancel-select-btn">Cancel</Button>
          <Button className="rounded-full" disabled={sel.length < 2 || busy} onClick={makeCarousel} data-testid="create-carousel-btn">{busy ? <Spinner /> : <><SquareStack className="mr-1 h-4 w-4" />Create carousel ({sel.length})</>}</Button>
        </>) : <Button variant="outline" className="rounded-full" onClick={() => setSelecting(true)} data-testid="select-mode-btn"><CheckSquare className="mr-1 h-4 w-4" />Build carousel</Button>)} />
      <div className="glass sticky top-16 z-10 -mx-4 mb-4 flex flex-nowrap gap-2 overflow-x-auto px-4 py-3 sm:-mx-8 sm:px-8" data-testid="library-filter-bar">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search filename, project, objects…" className="h-10 rounded-full pl-10" data-testid="library-search-input" /></div>
        {Object.keys(FILTERS).map((k) => <FilterSelect key={k} k={k} value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} />)}
        <DateFilter preset={datePreset} onPreset={setDateSelection} range={dateRange} onRange={setDateRange} sort={sortOrder} onSort={setSortOrder} />
      </div>
      {(!datePreset || dateSource === "quick") && <div className="mb-6 flex flex-wrap items-center gap-2" data-testid="media-date-quick-filters">
        {DATE_PRESETS.map(([key, title]) => <Button key={key} type="button" size="sm" variant={datePreset === key && dateSource === "quick" ? "secondary" : "outline"} className={cn("h-8 rounded-full px-3 text-xs", datePreset === key && dateSource === "quick" && "border-gold/60 bg-gold/10 text-foreground")} onClick={() => setDateSelection(datePreset === key && dateSource === "quick" ? "" : key, datePreset === key && dateSource === "quick" ? "" : "quick")} data-testid={`quick-date-${key}`}>{title}</Button>)}
      </div>}
      {isLoading ? <SkeletonGrid n={8} cls="aspect-square" /> : (data || []).length === 0 ? <EmptyState icon={ImageOff} title="No media found" text="Try different filters, or upload new project media." testId="library-empty" /> : (
        <div className="space-y-8" data-testid="media-date-groups">
          {groupedMedia.map((group) => <section key={group.label}>
            <div className="mb-4 flex items-center gap-4"><h2 className="shrink-0 font-mono-ui text-[11px] font-medium tracking-[0.2em] text-muted-foreground">{group.label}</h2><div className="h-px flex-1 bg-border/80" /></div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {group.items.map((m, i) => {
            const busyM = ["queued", "processing"].includes(m.status);
            const picked = sel.includes(m.id);
            return (
              <button key={m.id} onClick={() => (selecting ? m.kind === "image" && m.analysis && toggle(m.id) : setOpen(m.id))} data-testid={`media-card-${m.id}`}
                className={cn("panel panel-hover group relative overflow-hidden text-left fade-up", picked && "ring-2 ring-[hsl(var(--gold))]")} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                <div className="relative aspect-square bg-muted">
                  {(m.urls?.square || m.urls?.thumbnail) ? <img src={m.urls.square || m.urls.thumbnail} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-muted-foreground">{m.kind === "video" ? <Film /> : <Spinner />}</div>}
                  {busyM && <div className="scan-line absolute inset-0" />}
                  {m.project_id && <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full border border-white/20 bg-black/70 px-2 py-1 text-[10px] text-white">{m.project_name || "Project"}</span>}
                  {m.kind === "video" && <Film className="absolute right-2 top-2 h-4 w-4 text-white" />}
                  {m.source === "google_drive" && <span title={`Imported Automatically · ${m.drive_file_name || m.filename} · ${m.sync_time ? formatIST(m.sync_time) : ""}`} className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/70 px-2 py-1 text-[10px] text-white"><HardDrive className="h-3 w-3" />Google Drive</span>}
                  {selecting && <span className={cn("absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full border-2 text-[10px] font-bold", picked ? "border-gold bg-gold text-black" : "border-white/80 bg-black/30")}>{picked ? sel.indexOf(m.id) + 1 : ""}</span>}
                </div>
                <div className="space-y-1.5 p-3">
                  <div className="truncate text-xs font-medium">{m.filename}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{m.analysis ? `${m.analysis.room_type} · ${m.analysis.design_style}` : m.project_name}</div>
                  <StatusBadge status={m.status} />
                </div>
              </button>
            );
          })}
            </div>
          </section>)}
        </div>
      )}
      <Detail id={open} onClose={closeDetail} />
    </div>
  );
}
