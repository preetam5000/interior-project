import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useState } from "react";
import { ArrowUpRight, CheckCircle2, CircleAlert, Clock3, Download, HardDrive, RotateCw, Trash2, X } from "lucide-react";
import { api, errMsg, fetcher, formatIST } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, EmptyState, Spinner } from "@/components/common/Bits";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const FILTERS = [
  ["", "All imports"], ["waiting", "Waiting"], ["downloading", "Downloading"], ["uploading", "Uploading"],
  ["processing", "Processing"], ["completed", "Completed"], ["failed", "Failed"],
  ["skipped_duplicate", "Duplicates"], ["cancelled", "Cancelled"],
];
const TERMINAL = new Set(["completed", "failed", "skipped_duplicate", "cancelled"]);

function Status({ value }) {
  const tone = value === "Completed" ? "text-emerald-400 bg-emerald-500/10" : value === "Failed" ? "text-rose-400 bg-rose-500/10" : value === "Skipped Duplicate" ? "text-violet-300 bg-violet-500/10" : value === "Cancelled" ? "text-muted-foreground bg-muted" : "text-amber-300 bg-amber-500/10";
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium", tone)}>{value || "Waiting"}</span>;
}

function Value({ children }) {
  return <span className="text-xs text-muted-foreground">{children || "—"}</span>;
}

export default function GoogleDriveImports() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState("");
  const { data: imports, isLoading } = useQuery({
    queryKey: ["google-drive-imports", filter],
    queryFn: () => fetcher(`/google-drive/imports?limit=100${filter ? `&status=${encodeURIComponent(filter)}` : ""}`),
    refetchInterval: (query) => (query.state.data?.items || []).some((item) => !TERMINAL.has(item.status)) ? 2000 : 10000,
  });
  const { data: sync } = useQuery({ queryKey: ["google-drive-sync-status"], queryFn: () => fetcher("/google-drive/status"), refetchInterval: 10000 });
  const refresh = async () => Promise.all([
    qc.invalidateQueries({ queryKey: ["google-drive-imports"] }),
    qc.invalidateQueries({ queryKey: ["google-drive-sync-status"] }),
  ]);
  const importNow = async () => {
    setBusyId("sync");
    try { const { data } = await api.post("/google-drive/import-now"); toast.success(data.message); await refresh(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusyId(""); }
  };
  const act = async (id, action, label) => {
    setBusyId(id);
    try { await api.post(`/google-drive/import/${id}/${action}`); toast.success(label); await refresh(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusyId(""); }
  };
  const removeCompleted = async () => {
    setBusyId("remove");
    try { const { data } = await api.delete("/google-drive/imports/completed"); toast.success(`Removed ${data.removed} completed history item(s)`); await refresh(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusyId(""); }
  };
  const items = imports?.items || [];

  return <div>
    <PageHeader overline="Integrations · Google Drive" title="Google Drive Imports" subtitle="Track image imports, review failures, and open each item in the Media Library."
      actions={<>
        {admin && <Button variant="outline" className="rounded-full" onClick={removeCompleted} disabled={busyId === "remove"}>{busyId === "remove" ? <Spinner /> : <><Trash2 className="mr-2 h-4 w-4" />Remove Completed</>}</Button>}
        {admin && <Button className="rounded-full" onClick={importNow} disabled={busyId === "sync" || !sync?.connected || !sync?.folder_id || sync?.paused}>{busyId === "sync" ? <Spinner /> : <><Download className="mr-2 h-4 w-4" />Import Now</>}</Button>}
      </>} />

    <section className="panel mb-6 p-5" data-testid="drive-import-queue-summary">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-gold/10 text-gold"><HardDrive className="h-5 w-5" /></div>
          <div><div className="text-sm font-semibold">Import Queue</div><div className="text-xs text-muted-foreground">{sync?.paused ? "Sync paused" : sync?.watcher_status === "running" ? "Watching filtered images" : "Drive is not active"} · {sync?.sync_interval_seconds ?? 30}s interval</div></div></div>
        <div className="flex gap-5 text-xs"><div><div className="text-muted-foreground">Pending</div><div className="mt-1 font-mono-ui text-base">{sync?.pending ?? 0}</div></div><div><div className="text-muted-foreground">Completed</div><div className="mt-1 font-mono-ui text-base">{sync?.total_imported ?? 0}</div></div><div><div className="text-muted-foreground">Failed</div><div className="mt-1 font-mono-ui text-base text-rose-400">{sync?.errors ?? 0}</div></div></div>
      </div>
    </section>

    <section className="panel mb-8 p-5" data-testid="google-drive-sync-history">
      <div className="mb-4 flex items-center justify-between"><div><div className="eyebrow">Recent Syncs</div><h2 className="mt-1 font-display text-2xl">Sync history</h2></div><span className="text-xs text-muted-foreground">Last sync {sync?.last_sync ? formatIST(sync.last_sync) : "not run yet"}</span></div>
      {(sync?.recent_syncs || []).length ? <div className="overflow-x-auto"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>Instagram Folder</TableHead><TableHead>Last Sync</TableHead><TableHead>Next Sync</TableHead><TableHead>Duration</TableHead><TableHead>Files Found</TableHead><TableHead>Imported</TableHead><TableHead>Duplicates</TableHead><TableHead>Errors</TableHead></TableRow></TableHeader>
        <TableBody>{sync.recent_syncs.map((run) => <TableRow key={run.id}><TableCell className="text-xs">{run.project_name || "Instagram folder"}</TableCell><TableCell className="text-xs">{formatIST(run.started_at)}</TableCell><TableCell className="text-xs">{sync.paused ? "Paused" : formatIST(run.next_sync_at)}</TableCell><TableCell>{Number(run.duration_seconds || 0).toFixed(1)}s</TableCell><TableCell>{run.files_found ?? 0}</TableCell><TableCell>{run.files_imported ?? 0}</TableCell><TableCell>{run.duplicates ?? 0}</TableCell><TableCell className={run.errors ? "text-rose-400" : ""}>{run.errors ?? 0}</TableCell></TableRow>)}</TableBody></Table></div>
        : <p className="text-sm text-muted-foreground">Sync history will appear after the next folder check.</p>}
    </section>

    <section className="panel p-5" data-testid="google-drive-import-history">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><div className="eyebrow">Import History</div><h2 className="mt-1 font-display text-2xl">Files</h2></div><div className="flex flex-wrap gap-1.5">{FILTERS.map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={cn("rounded-full px-3 py-1.5 text-xs", filter === key ? "bg-gold text-background" : "bg-muted text-muted-foreground hover:text-foreground")}>{label}</button>)}</div></div>
      {isLoading ? <div className="grid min-h-40 place-items-center"><Spinner /></div> : !items.length ? <EmptyState icon={HardDrive} title="No Drive imports yet" text="New files in filtered images will show up here automatically." /> : <div className="overflow-x-auto"><Table className="min-w-[1250px]">
        <TableHeader><TableRow><TableHead>Thumbnail</TableHead><TableHead>Filename</TableHead><TableHead>Folder</TableHead><TableHead>Imported Time</TableHead><TableHead>Processing Status</TableHead><TableHead>AI Status</TableHead><TableHead>Cloudinary</TableHead><TableHead>Caption</TableHead><TableHead>Approval</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
        <TableBody>{items.map((item) => <TableRow key={item.id} data-testid={`drive-import-${item.id}`}>
          <TableCell><div className="h-12 w-12 overflow-hidden rounded-lg bg-muted">{item.thumbnail_url && <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" />}</div></TableCell>
          <TableCell className="max-w-[180px] truncate text-xs font-medium" title={item.filename}>{item.filename}</TableCell>
          <TableCell><Value>{item.source_folder || "filtered images"}</Value></TableCell>
          <TableCell className="whitespace-nowrap text-xs">{formatIST(item.completed_at || item.started_at || item.created_at)}</TableCell>
          <TableCell className="w-48"><div className="space-y-2"><Status value={item.status_label} /><div className="flex items-center gap-2"><Progress value={item.progress} className="h-1.5" /><span className="font-mono-ui text-[10px] text-muted-foreground">{item.progress}%</span></div><div className="text-[10px] text-muted-foreground">{item.stage}</div>{item.error_message && <div className="max-w-44 truncate text-[10px] text-rose-400" title={item.error_message}>{item.error_message}</div>}</div></TableCell>
          <TableCell><Value>{item.ai_status}</Value></TableCell><TableCell><Value>{item.cloudinary_status}</Value></TableCell><TableCell><Value>{item.caption_status}</Value></TableCell><TableCell><Value>{item.approval_status}</Value></TableCell>
          <TableCell><div className="flex min-w-[190px] gap-1.5">{admin && item.status === "failed" && <Button size="sm" variant="outline" className="h-8 rounded-full px-2.5" onClick={() => act(item.id, "retry", "Import retry queued")} disabled={busyId === item.id || sync?.paused}>{busyId === item.id ? <Spinner /> : <><RotateCw className="mr-1 h-3 w-3" />Retry</>}</Button>}{admin && ["waiting", "pending", "downloading"].includes(item.status) && <Button size="sm" variant="ghost" className="h-8 rounded-full px-2.5" onClick={() => act(item.id, "cancel", "Import cancelled")} disabled={busyId === item.id}><X className="mr-1 h-3 w-3" />Cancel</Button>}{item.media_id && <Button asChild size="sm" variant="ghost" className="h-8 rounded-full px-2.5"><Link to={`/library?media=${encodeURIComponent(item.media_id)}`}>View Media<ArrowUpRight className="ml-1 h-3 w-3" /></Link></Button>}</div></TableCell>
        </TableRow>)}</TableBody>
      </Table></div>}
    </section>
  </div>;
}
