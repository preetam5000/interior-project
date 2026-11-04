import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UploadCloud, FolderSync, ScanSearch, Wand2, PenLine, CheckCircle2, Send, FileImage, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errMsg, fetcher, formatBytes, timeAgo, can } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, StatusBadge, TypeBadge, Spinner } from "@/components/common/Bits";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: FolderSync, t: "Detect", d: "Drive sync monitors filtered images or you drop files here" },
  { icon: ScanSearch, t: "Analyse", d: "Room, stage, style, quality, duplicates" },
  { icon: Wand2, t: "Enhance", d: "Light, white balance, sharpness — no fake furniture" },
  { icon: PenLine, t: "Write", d: "Editorial caption, hashtags, alt text, story text" },
  { icon: CheckCircle2, t: "Approve", d: "One click in the approval queue" },
  { icon: Send, t: "Publish", d: "Feed, story, carousel or reel on Instagram" },
];

function Dropzone({ onFiles, disabled }) {
  const ref = useRef();
  const [over, setOver] = useState(false);
  const drop = (e) => { e.preventDefault(); setOver(false); if (!disabled) onFiles([...e.dataTransfer.files]); };
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}
      onClick={() => !disabled && ref.current?.click()} data-testid="upload-dropzone"
      className={cn("relative grid cursor-pointer place-items-center overflow-hidden rounded-3xl border-2 border-dashed px-6 py-16 text-center transition-colors",
        over ? "border-gold bg-gold/10" : "border-border hover:border-gold/60 hover:bg-accent/30", disabled && "pointer-events-none opacity-60")}>
      <input ref={ref} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" className="hidden"
        data-testid="upload-file-input" onChange={(e) => { onFiles([...e.target.files]); e.target.value = ""; }} />
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-gold bg-gold/10"><UploadCloud className="h-6 w-6 text-gold" /></div>
      <h3 className="mt-5 font-display text-3xl">Drop project photos & videos</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">JPG, PNG, WEBP, MP4, MOV. Name files like <span className="font-mono-ui text-foreground">Villa_A_01.jpg</span>, <span className="font-mono-ui text-foreground">Villa_A_02.jpg</span> and they'll become one carousel automatically.</p>
    </div>
  );
}

function RecentMedia() {
  const { data = [] } = useQuery({
    queryKey: ["media", "recent"], queryFn: () => fetcher("/media?limit=12"),
    refetchInterval: (q) => ((q.state.data || []).some((m) => ["queued", "processing"].includes(m.status)) ? 3000 : 15000),
  });
  return (
    <div className="panel p-6" data-testid="recent-media">
      <div className="eyebrow">Live pipeline</div>
      <h3 className="mt-1 font-display text-2xl">Recently ingested</h3>
      <div className="mt-5 divide-y divide-border/60">
        {data.length === 0 && <p className="py-6 text-sm text-muted-foreground">Nothing yet.</p>}
        {data.map((m) => {
          const busy = ["queued", "processing"].includes(m.status);
          return (
            <div key={m.id} className="relative flex items-center gap-4 py-3" data-testid={`recent-media-${m.id}`}>
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                {m.urls?.enhanced || m.urls?.thumbnail ? <img src={m.urls.square || m.urls.thumbnail || m.urls.enhanced} alt="" className="h-full w-full object-cover" />
                  : <div className="grid h-full place-items-center">{m.kind === "video" ? <Film className="h-5 w-5 text-muted-foreground" /> : <FileImage className="h-5 w-5 text-muted-foreground" />}</div>}
                {busy && <div className="scan-line absolute inset-0" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.filename}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {m.analysis ? `${m.analysis.room_type} · ${m.analysis.project_stage} · ${m.analysis.design_style}` : busy ? "AI is analysing, enhancing and writing captions…" : m.error || "—"}
                </div>
                <div className="font-mono-ui text-[10px] text-muted-foreground">{m.project_name} · {formatBytes(m.size_bytes)} · {timeAgo(m.created_at)}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge status={m.status} testId={`recent-media-status-${m.id}`} />
                {m.analysis?.content_type && <TypeBadge type={m.analysis.content_type} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DriveCard() {
  const { data: driveSync } = useQuery({ queryKey: ["google-drive-sync-status"], queryFn: () => fetcher("/google-drive/status") });
  const connected = driveSync?.connected && driveSync?.folder_id;
  return (
    <div className="panel p-6" data-testid="drive-sync-card">
      <div className="flex items-center justify-between"><div className="eyebrow">Google Drive · via n8n</div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px]", connected ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-500/15 text-muted-foreground")} data-testid="drive-status">{connected ? "Connected" : "Not configured"}</span></div>
      <div className="mt-4 space-y-2 font-mono-ui text-xs">
        <div className="flex justify-between gap-3"><span className="text-muted-foreground">Instagram folder</span><span className="truncate">{driveSync?.folder_id || "—"}</span></div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">n8n discovers the child folders automatically and imports only from filtered images.</p>
      <Button asChild variant="outline" size="sm" className="mt-4 rounded-full" data-testid="drive-configure-btn"><Link to="/settings?tab=automation">Select Instagram Folder</Link></Button>
    </div>
  );
}

export default function Upload() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [project, setProject] = useState("");
  const [busy, setBusy] = useState(false);
  const onFiles = useCallback(async (files) => {
    if (!files.length) return;
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    fd.append("project_name", project);
    setBusy(true);
    try {
      const { data } = await api.post("/media/upload", fd);
      const ok = data.results.filter((r) => r.media_id && !r.duplicate).length;
      const dup = data.results.filter((r) => r.duplicate).length;
      data.results.filter((r) => r.error).forEach((r) => toast.error(`${r.filename}: ${r.error}`));
      if (ok) toast.success(`${ok} file(s) sent to the AI pipeline`);
      if (dup) toast.info(`${dup} duplicate(s) skipped — already processed`);
      qc.invalidateQueries({ queryKey: ["media"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }, [project, qc]);

  return (
    <div>
      <PageHeader overline="Ingestion" title="Upload & ingest" subtitle="Upload directly, or let n8n bring files from Google Drive. Everything after this is automatic." />
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {STEPS.map(({ icon: Icon, t, d }, i) => (
          <div key={t} className="panel p-4 fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center gap-2"><span className="font-mono-ui text-[10px] text-gold">0{i + 1}</span><Icon className="h-4 w-4 text-gold" /></div>
            <div className="mt-2 text-sm font-semibold">{t}</div><div className="text-xs text-muted-foreground">{d}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          {can(user, "upload") ? (<>
            <Input value={project} onChange={(e) => setProject(e.target.value)} placeholder="Project name (optional) — e.g. Villa Aurora" className="h-11 rounded-xl" data-testid="upload-project-input" />
            <Dropzone onFiles={onFiles} disabled={busy} />
            {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="upload-progress"><Spinner className="text-gold" /> Uploading securely…</div>}
          </>) : <p className="panel p-6 text-sm text-muted-foreground">Viewers can't upload media. Ask an admin for Designer access.</p>}
          <DriveCard />
        </div>
        <div className="xl:col-span-5"><RecentMedia /></div>
      </div>
    </div>
  );
}
