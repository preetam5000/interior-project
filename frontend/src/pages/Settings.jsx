import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plug, Palette, Workflow, Users, Check, KeyRound, Copy, RotateCw, Download, ExternalLink, HardDrive, FolderOpen, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errMsg, fetcher, can, API, formatIST } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Spinner } from "@/components/common/Bits";
import { UsersPanel } from "@/pages/UsersPanel";

function F({ label, k, form, set, type = "text", placeholder, hint, disabled, min, step }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} min={min} step={step} value={form[k] ?? ""} placeholder={placeholder} disabled={disabled} onChange={(e) => set(k, e.target.value)} className="h-10 rounded-xl" data-testid={`setting-${k}`} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Card({ title, overline, status, children, onTest, testing, testId }) {
  return (
    <div className="panel p-6" data-testid={testId}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div><div className="eyebrow">{overline}</div><h3 className="mt-1 font-display text-2xl">{title}</h3></div>
        <div className="flex items-center gap-2">
          {status !== undefined && <span className={`rounded-full px-2 py-0.5 text-[10px] ${status ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-500/15 text-muted-foreground"}`}>{status ? "Connected" : "Not set"}</span>}
          {onTest && <Button size="sm" variant="outline" className="rounded-full" onClick={onTest} disabled={testing} data-testid={`${testId}-test-btn`}>{testing ? <Spinner /> : "Test"}</Button>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Endpoint({ method, path, desc }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/50 py-2.5 sm:flex-row sm:items-center sm:gap-4">
      <span className={`w-14 shrink-0 font-mono-ui text-[11px] font-semibold ${method === "GET" ? "text-emerald-400" : "text-gold"}`}>{method}</span>
      <code className="font-mono-ui text-xs">{path}</code><span className="text-xs text-muted-foreground sm:ml-auto">{desc}</span>
    </div>
  );
}

function GoogleDriveCard({ admin }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: drive, refetch } = useQuery({ queryKey: ["google-drive-status"], queryFn: () => fetcher("/settings/google-drive/status"), enabled: admin, refetchOnWindowFocus: true });
  const { data: sync, refetch: refetchSync } = useQuery({ queryKey: ["google-drive-sync-status"], queryFn: () => fetcher("/google-drive/status"), refetchInterval: 15000 });
  const connected = sync ? sync.connected : drive?.connected;
  const connect = async () => {
    setBusy(true);
    try { const { data } = await api.post("/settings/google-drive/connect"); window.location.assign(data.auth_url); }
    catch (e) { toast.error(errMsg(e)); setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true);
    try { await api.post("/settings/google-drive/disconnect"); await Promise.all([refetch(), refetchSync()]); qc.invalidateQueries({ queryKey: ["settings"] }); toast.success("Google Drive disconnected"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { const { data } = await api.post("/settings/google-drive/test"); toast.success(data.message || "Connection Successful"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const syncNow = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/google-drive/import-now");
      toast.success(data.message || "Google Drive sync started");
      await Promise.all([refetch(), refetchSync()]);
    } catch (e) { toast.error(errMsg(e)); await refetchSync(); } finally { setBusy(false); }
  };
  const retryFailed = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/google-drive/import-now?retry_failed=true");
      toast.success(data.message || "Failed imports queued for retry");
      await refetchSync();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const togglePause = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(sync?.paused ? "/google-drive/resume" : "/google-drive/pause");
      await Promise.all([refetchSync(), refetch()]);
      toast.success(data.paused ? "Google Drive sync paused" : "Google Drive sync resumed");
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const selectFolder = async () => {
    setBusy(true);
    try {
      const refreshed = await refetch();
      if (refreshed.isError) throw refreshed.error;
      const pickerConfig = refreshed.data?.picker;
      if (!pickerConfig?.api_key) {
        toast.error("Google Picker API key (picker.api_key) is missing from the backend response.");
        return;
      }
      if (!pickerConfig?.access_token) {
        toast.error("Google Picker access token (picker.access_token) is missing from the backend response. Reconnect Google Drive and try again.");
        return;
      }
      if (!pickerConfig?.app_id) {
        toast.error("Google Cloud Project Number (GOOGLE_CLOUD_PROJECT_NUMBER / picker.app_id) is missing. Set the numeric Project Number in backend/.env and restart the backend.");
        return;
      }

      if (!window.gapi) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://apis.google.com/js/api.js";
          script.async = true;
          const timeout = window.setTimeout(() => reject(new Error("Google API script loading timed out")), 15000);
          script.onload = () => {
            window.clearTimeout(timeout);
            window.gapi ? resolve() : reject(new Error("Google API script loaded without gapi"));
          };
          script.onerror = () => {
            window.clearTimeout(timeout);
            reject(new Error("Could not load the Google API script"));
          };
          document.head.appendChild(script);
        });
      }
      if (!window.gapi?.load) throw new Error("Google API loader is unavailable");
      await new Promise((resolve, reject) => {
        window.gapi.load("picker", {
          callback: resolve,
          onerror: () => reject(new Error("Google Picker failed to initialize")),
          ontimeout: () => reject(new Error("Google Picker initialization timed out")),
          timeout: 10000,
        });
      });
      const pickerApi = window.google?.picker;
      if (!pickerApi?.PickerBuilder) throw new Error("Google Picker did not initialize");
      const view = new pickerApi.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMimeTypes("application/vnd.google-apps.folder")
        .setEnableDrives(true);
      const builder = new pickerApi.PickerBuilder().addView(view)
        .setOAuthToken(pickerConfig.access_token).setDeveloperKey(pickerConfig.api_key)
        .setCallback(async (data) => {
          if (data.action !== pickerApi.Action.PICKED) return;
          if (data.docs?.length !== 1) { toast.error("Google Picker must return exactly one folder"); return; }
          const folder = data.docs[0];
          if (!folder?.id || !folder?.name) { toast.error("Google Picker did not return a folder"); return; }
          try { await api.post("/settings/google-drive/folder", { id: folder.id, name: folder.name }); await Promise.all([refetch(), refetchSync()]); qc.invalidateQueries({ queryKey: ["settings"] }); toast.success("Instagram folder saved"); }
          catch (e) { toast.error(errMsg(e)); }
        });
      builder.setAppId(pickerConfig.app_id);
      builder.setOrigin(window.location.origin);
      const picker = builder.build();
      picker.setVisible(true);
    } catch (e) { toast.error(errMsg(e, "Could not open Google Drive Picker")); }
    finally { setBusy(false); }
  };
  return <div className="panel overflow-hidden" data-testid="drive-settings-card">
    <div className="border-b border-border/60 bg-gradient-to-r from-gold/10 via-transparent to-transparent p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl border border-gold/20 bg-gold/10 text-gold"><HardDrive className="h-6 w-6" /></div>
          <div><div className="eyebrow">Drive & n8n</div><h3 className="mt-1 font-display text-2xl">Google Drive</h3><p className="mt-1 text-sm text-muted-foreground">Automatically import images from filtered images.</p></div></div>
        <span className={`rounded-full px-3 py-1 text-xs ${connected ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-500/15 text-muted-foreground"}`}><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />{connected ? "Connected" : "Disconnected"}</span>
      </div>
    </div>
    <div className="space-y-5 p-6">{connected ? <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border/70 p-4"><div className="text-xs text-muted-foreground">Connected Account</div><div className="mt-1 truncate text-sm font-medium">{drive?.account || "Google account"}</div></div>
        <div className="rounded-xl border border-border/70 p-4"><div className="text-xs text-muted-foreground">Instagram Folder</div><div className="mt-1 flex items-center gap-2 text-sm font-medium"><FolderOpen className="h-4 w-4 text-gold" />{drive?.folder?.name || (sync?.folder_id ? "Selected" : "No folder selected")}</div>{sync?.folder_id && <code className="mt-1 block truncate font-mono-ui text-[11px] text-muted-foreground">Folder ID: {sync.folder_id}</code>}</div>
      </div>
      <p className="text-xs text-muted-foreground">The app finds “dumped images” and “filtered images” inside this folder automatically. Only “filtered images” is monitored and imported.</p>
      <div className="grid gap-3 rounded-xl border border-border/70 p-4 sm:grid-cols-3 xl:grid-cols-7">
        <div><div className="text-xs text-muted-foreground">Last Sync</div><div className="mt-1 text-sm">{sync?.last_sync ? formatIST(sync.last_sync) : "Not synced yet"}</div></div>
        <div><div className="text-xs text-muted-foreground">Next Sync</div><div className="mt-1 text-sm">{sync?.paused ? "Paused" : sync?.next_sync ? formatIST(sync.next_sync) : "Pending"}</div></div>
        <div><div className="text-xs text-muted-foreground">Images Imported</div><div className="mt-1 text-sm font-semibold">{sync?.total_imported ?? 0}</div></div>
        <div><div className="text-xs text-muted-foreground">Imported Today</div><div className="mt-1 text-sm font-semibold">{sync?.imported_today ?? 0}</div></div>
        <div><div className="text-xs text-muted-foreground">Failed Today</div><div className="mt-1 text-sm font-semibold text-rose-400">{sync?.failed_today ?? 0}</div></div>
        <div><div className="text-xs text-muted-foreground">Queue Size</div><div className="mt-1 text-sm font-semibold">{sync?.current_queue_size ?? 0}</div></div>
        <div><div className="text-xs text-muted-foreground">Auto Sync · Interval</div><div className="mt-1 text-sm">{sync?.paused ? "Paused" : "On"} · {sync?.sync_interval_seconds ?? 30}s</div></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs ${sync?.watcher_status === "running" ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-500/10 text-muted-foreground"}`}>Watcher: {sync?.watcher_status || "starting"}</span>
        {sync?.sync_error && <span className="text-xs text-amber-300">{sync.sync_error}</span>}
      </div>
      {(drive?.connection_error || sync?.connection_error || sync?.sync_error) && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">{drive?.connection_error || sync?.connection_error || sync?.sync_error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" className="rounded-full" onClick={selectFolder} disabled={busy || !admin || !connected}><FolderOpen className="mr-2 h-4 w-4" />Select Instagram Folder</Button><Button variant="outline" className="rounded-full" onClick={test} disabled={busy || !admin || !connected}><ShieldCheck className="mr-2 h-4 w-4" />Test Connection</Button><Button variant="outline" className="rounded-full" onClick={syncNow} disabled={busy || !admin || !sync?.folder_id || !connected || sync?.paused}><RotateCw className="mr-2 h-4 w-4" />Import Now</Button><Button variant="outline" className="rounded-full" onClick={retryFailed} disabled={busy || !admin || !sync?.folder_id || !connected || sync?.paused || !sync?.errors}><RotateCw className="mr-2 h-4 w-4" />Retry Failed Imports</Button><Button variant="outline" className="rounded-full" onClick={togglePause} disabled={busy || !admin || !connected || !sync?.folder_id}>{sync?.paused ? "Resume Sync" : "Pause Sync"}</Button>{admin && <><Button variant="ghost" className="rounded-full" onClick={connect} disabled={busy}>Reconnect Google Drive</Button><Button variant="ghost" className="rounded-full text-muted-foreground" onClick={disconnect} disabled={busy}>Disconnect</Button></>}</div>
    </> : <div className="space-y-4"><div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-medium">Connect your studio Drive</div><p className="mt-1 max-w-xl text-xs text-muted-foreground">Grant read-only access so the app can find the Instagram subfolders and import only from filtered images.</p></div>{admin && <Button className="rounded-full" onClick={connect} disabled={busy}><HardDrive className="mr-2 h-4 w-4" />Connect Google Drive</Button>}</div>{(drive?.connection_error || sync?.connection_error) && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">{drive?.connection_error || sync?.connection_error}</p>}</div>}</div>
  </div>;
}

function AutomationTab({ form, set, admin }) {
  const [key, setKey] = useState("");
  const reveal = async () => { const { data } = await api.get("/settings/n8n-key"); setKey(data.n8n_api_key); };
  const rotate = async () => { const { data } = await api.post("/settings/rotate-n8n-key"); setKey(data.n8n_api_key); toast.success("New n8n API key generated"); };
  const copy = (t) => { navigator.clipboard.writeText(t); toast.success("Copied"); };
  const template = async () => {
    const k = key || (await api.get("/settings/n8n-key")).data.n8n_api_key;
    const r = await fetch(`${API}/n8n/workflow-template`, { headers: { "X-API-Key": k } });
    const blob = new Blob([JSON.stringify(await r.json(), null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "interior_social_ai_n8n_workflow.json"; a.click();
  };
  const curl = `curl -X POST ${API}/n8n/ingest \\\n  -H "X-API-Key: ${key || "<your-key>"}" \\\n  -F "file=@Villa_A_01.jpg" -F "drive_file_id=1AbC..." -F "folder=villa"`;
  return (
    <div className="space-y-6">
      <GoogleDriveCard admin={admin} />
      {admin && (
        <div className="panel p-6" data-testid="n8n-key-card">
          <div className="eyebrow">n8n REST access</div><h3 className="mt-1 font-display text-2xl">API key</h3>
          <p className="mt-2 text-sm text-muted-foreground">Add it in n8n as an HTTP header <code className="font-mono-ui text-gold">X-API-Key</code> (or env var <code className="font-mono-ui">INTERIOR_SOCIAL_API_KEY</code>).</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={key || form.n8n_api_key || ""} className="h-10 rounded-xl font-mono-ui text-xs" data-testid="n8n-key-value" />
            <Button variant="outline" className="rounded-xl" onClick={reveal} data-testid="n8n-key-reveal-btn"><KeyRound className="mr-1 h-4 w-4" />Reveal</Button>
            {key && <Button variant="outline" className="rounded-xl" onClick={() => copy(key)} data-testid="n8n-key-copy-btn"><Copy className="h-4 w-4" /></Button>}
            <Button variant="ghost" className="rounded-xl" onClick={rotate} data-testid="n8n-key-rotate-btn"><RotateCw className="mr-1 h-4 w-4" />Rotate</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="rounded-full" onClick={template} data-testid="download-n8n-template-btn"><Download className="mr-1 h-4 w-4" />Download n8n workflow</Button>
            <Button asChild variant="outline" className="rounded-full"><a href={`${API}/docs`} target="_blank" rel="noreferrer" data-testid="api-docs-link"><ExternalLink className="mr-1 h-4 w-4" />API docs (Swagger)</a></Button>
          </div>
        </div>
      )}
      <Card title="Automation rules" overline="Behaviour" testId="automation-rules-card">
        <div className="flex items-center justify-between rounded-xl border border-border p-4 sm:col-span-2">
          <div><div className="text-sm font-medium">Publish instantly on approval</div><div className="text-xs text-muted-foreground">"Approve & Publish" posts straight to Instagram. Off = approved posts wait for n8n / schedule.</div></div>
          <Switch checked={!!form.auto_publish_on_approve} disabled={!admin} onCheckedChange={(v) => set("auto_publish_on_approve", v)} data-testid="setting-auto_publish_on_approve" />
        </div>
        <F label="Notification webhook (n8n / Slack / email flow)" k="notification_webhook_url" form={form} set={set} disabled={!admin} placeholder="https://your-n8n/webhook/notify" hint="We POST every notification as JSON here." />
      </Card>
      <div className="panel p-6" data-testid="n8n-endpoints">
        <div className="eyebrow mb-3"><Workflow className="mr-1 inline h-3 w-3" />Endpoints for n8n</div>
        <Endpoint method="GET" path="/api/n8n/config" desc="Folders to watch" />
        <Endpoint method="POST" path="/api/n8n/check-duplicates" desc="Returns only new Drive file IDs" />
        <Endpoint method="POST" path="/api/n8n/ingest" desc="Multipart upload → AI pipeline" />
        <Endpoint method="POST" path="/api/n8n/ingest-url" desc="Ingest by URL (e.g. Cloudinary)" />
        <Endpoint method="GET" path="/api/n8n/media/{id}" desc="Processing status + analysis" />
        <Endpoint method="GET" path="/api/n8n/posts/approved" desc="Approved posts payload" />
        <Endpoint method="GET" path="/api/n8n/posts/due" desc="Scheduled posts that are due" />
        <Endpoint method="POST" path="/api/n8n/posts/{id}/publish" desc="Publish via FastAPI" />
        <Endpoint method="POST" path="/api/n8n/posts/{id}/published" desc="Mark published by n8n" />
        <Endpoint method="POST" path="/api/n8n/notify" desc="Push a notification" />
        <pre className="mt-4 overflow-x-auto rounded-xl bg-black/60 p-4 font-mono-ui text-[11px] text-emerald-300 scroll-thin">{curl}</pre>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const admin = can(user, "admin");
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") || "integrations");
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => fetcher("/settings") });
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);
  useEffect(() => { if (data) setForm(data); }, [data]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    const body = Object.fromEntries(Object.entries(form).filter(([k, v]) => !k.endsWith("_set") && !k.endsWith("_configured") && !["gdrive_refresh_token", "gdrive_selected_folder_id", "gdrive_selected_folder_name"].includes(k) && v !== data[k]));
    if (!Object.keys(body).length) return true;
    setSaving(true);
    try {
      const { data: s } = await api.patch("/settings", body);
      qc.setQueryData(["settings"], s); toast.success("Settings saved");
      return true;
    } catch (e) { toast.error(errMsg(e)); return false; } finally { setSaving(false); }
  };
  const test = async (svc) => {
    setTesting(svc);
    try {
      if (!(await save())) return;
      const { data: r } = await api.post(`/settings/test/${svc}`);
      toast.success(r.message);
    } catch (e) { toast.error(errMsg(e)); } finally { setTesting(null); }
  };
  if (!data) return <Spinner />;
  const p = { form, set, disabled: !admin };
  return (
    <div>
      <PageHeader overline="Workspace" title="Settings" subtitle={admin ? "Paste your keys here — everything works instantly, no redeploy." : "Only admins can change settings."}
        actions={admin && tab !== "users" && <Button className="rounded-full px-6" onClick={save} disabled={saving} data-testid="save-settings-btn">{saving ? <Spinner /> : <><Check className="mr-1 h-4 w-4" />Save changes</>}</Button>} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-8 h-auto flex-wrap rounded-full p-1" data-testid="settings-tabs">
          <TabsTrigger value="integrations" className="rounded-full" data-testid="settings-tab-integrations"><Plug className="mr-1 h-4 w-4" />Integrations</TabsTrigger>
          <TabsTrigger value="brand" className="rounded-full" data-testid="settings-tab-brand"><Palette className="mr-1 h-4 w-4" />Brand</TabsTrigger>
          <TabsTrigger value="automation" className="rounded-full" data-testid="settings-tab-automation"><Workflow className="mr-1 h-4 w-4" />Drive & n8n</TabsTrigger>
          {admin && <TabsTrigger value="users" className="rounded-full" data-testid="settings-tab-users"><Users className="mr-1 h-4 w-4" />Team</TabsTrigger>}
        </TabsList>
        <TabsContent value="integrations" className="space-y-6">
          <Card title="OpenAI" overline="AI analysis & captions" status testId="openai-card" onTest={admin && (() => test("openai"))} testing={testing === "openai"}>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Model</Label>
              <Select value={form.openai_model} onValueChange={(v) => set("openai_model", v)} disabled={!admin}><SelectTrigger className="h-10 rounded-xl" data-testid="setting-openai_model"><SelectValue /></SelectTrigger>
                <SelectContent>{["gpt-5.4", "gpt-5.2", "gpt-5.4-mini", "gpt-4.1"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
            <F label="Own OpenAI API key (optional)" k="openai_api_key" type="password" {...p} placeholder="Leave empty to use the built-in Emergent key" hint="Works out of the box with the included universal key." />
            <F label="GPT Image edit cost per request (USD)" k="gpt_image_cost_per_request_usd" type="number" min="0" step="any" {...p} placeholder="e.g. 0.04" hint="Estimated flat price for each successful GPT Image edit request." />
            <F label="Other GPT request cost (USD)" k="gpt_text_cost_per_request_usd" type="number" min="0" step="any" {...p} placeholder="e.g. 0.002" hint="Estimated flat price per successful analysis, caption, and other non-image GPT request. Leave blank to mark these requests unpriced." />
          </Card>
          <Card title="Cloudinary" overline="Storage, auto-enhance & smart crops" status={data.cloudinary_configured} testId="cloudinary-card" onTest={admin && (() => test("cloudinary"))} testing={testing === "cloudinary"}>
            <F label="Cloud name" k="cloudinary_cloud_name" {...p} placeholder="my-studio" />
            <F label="API key" k="cloudinary_api_key" {...p} placeholder="123456789012345" />
            <F label="API secret" k="cloudinary_api_secret" type="password" {...p} hint="cloudinary.com → Settings → API Keys. Without it, images are enhanced by the built-in editor." />
          </Card>
          <Card title="Instagram" overline="Graph API publishing" status={data.instagram_configured} testId="instagram-card" onTest={admin && (() => test("instagram"))} testing={testing === "instagram"}>
            <F label="Long-lived access token" k="instagram_access_token" type="password" {...p} hint="Meta for Developers → your app → Instagram Graph API → generate long-lived token." />
            <F label="Instagram Business Account ID" k="instagram_account_id" {...p} placeholder="17841400000000000" />
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">API host</Label>
              <Select value={form.instagram_api_host} onValueChange={(v) => set("instagram_api_host", v)} disabled={!admin}><SelectTrigger className="h-10 rounded-xl" data-testid="setting-instagram_api_host"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="graph.facebook.com">graph.facebook.com (Facebook Login token)</SelectItem><SelectItem value="graph.instagram.com">graph.instagram.com (Instagram Login token)</SelectItem></SelectContent></Select></div>
          </Card>
        </TabsContent>
        <TabsContent value="brand" className="space-y-6">
          <Card title="Visual Enhancement Debugger" overline="Optional stage checkpoints" testId="visual-debug-settings-card">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4 sm:col-span-2">
              <div><div className="text-sm font-medium">Debug Mode</div><div className="text-xs text-muted-foreground">Adds detailed quality measurements to stage checkpoints. Pipeline execution reports and compressed per-stage images are saved for every processed image.</div></div>
              <Switch checked={!!form.visual_debug_enabled} disabled={!admin} onCheckedChange={(v) => set("visual_debug_enabled", v)} data-testid="setting-visual_debug_enabled" />
            </div>
          </Card>
          <Card title="Photo Enhancement" overline="Adaptive image processing" testId="enhancement-settings-card">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Enhancement preset</Label>
              <Select value={form.enhancement_preset || "AUTO"} onValueChange={(v) => set("enhancement_preset", v)} disabled={!admin}>
                <SelectTrigger className="h-10 rounded-xl" data-testid="setting-enhancement_preset"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["AUTO", "ARCHITECTURAL", "LUXURY", "CONSTRUCTION PROGRESS", "COMPLETED INTERIOR", "MINIMAL", "SCANDINAVIAN", "MODERN"].map((preset) => (
                    <SelectItem key={preset} value={preset}>{preset.replaceAll("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">The preset subtly adjusts an image-specific profile; it does not apply fixed tuning values.</p>
            </div>
          </Card>
          <Card title="Brand Kit" overline="Brand identity, content & watermark" testId="brand-card">
            <F label="Studio name" k="brand_name" {...p} />
            <F label="Caption tone" k="caption_tone" {...p} />
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Primary colour</Label><div className="flex gap-2"><input type="color" value={form.brand_primary_color || "#E5C158"} disabled={!admin} onChange={(e) => set("brand_primary_color", e.target.value)} className="h-10 w-14 rounded-lg border border-border bg-transparent" data-testid="setting-brand_primary_color" /><Input value={form.brand_primary_color || ""} disabled={!admin} onChange={(e) => set("brand_primary_color", e.target.value)} className="h-10 rounded-xl font-mono-ui" /></div></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Secondary colour</Label><div className="flex gap-2"><input type="color" value={form.brand_secondary_color || "#09090B"} disabled={!admin} onChange={(e) => set("brand_secondary_color", e.target.value)} className="h-10 w-14 rounded-lg border border-border bg-transparent" data-testid="setting-brand_secondary_color" /><Input value={form.brand_secondary_color || ""} disabled={!admin} onChange={(e) => set("brand_secondary_color", e.target.value)} className="h-10 rounded-xl font-mono-ui" /></div></div>
            <F label="Company logo URL" k="logo_url" {...p} placeholder="https://…/logo.png" hint="Paste a publicly accessible logo image URL." />
            {form.logo_url && <img src={form.logo_url} alt="logo" className="h-16 rounded-lg border border-border object-contain p-2" data-testid="logo-preview" />}
            <F label="Heading font" k="heading_font" {...p} placeholder="Cormorant Garamond" />
            <F label="Body font" k="body_font" {...p} placeholder="Plus Jakarta Sans" />
            <F label="Default CTA" k="default_cta" {...p} placeholder="Enquire now" />
            <div className="flex items-center justify-between rounded-xl border border-border p-4 sm:col-span-2">
              <div><div className="text-sm font-medium">Company watermark</div><div className="text-xs text-muted-foreground">Adds your studio name subtly on generated 1080px crops.</div></div>
              <Switch checked={!!form.watermark_enabled} disabled={!admin} onCheckedChange={(v) => set("watermark_enabled", v)} data-testid="setting-watermark_enabled" />
            </div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Default theme</Label>
              <Select value={form.theme} onValueChange={(v) => set("theme", v)} disabled={!admin}><SelectTrigger className="h-10 rounded-xl" data-testid="setting-theme"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dark">Dark</SelectItem><SelectItem value="light">Light</SelectItem></SelectContent></Select></div>
          </Card>
        </TabsContent>
        <TabsContent value="automation"><AutomationTab form={form} set={set} admin={admin} /></TabsContent>
        {admin && <TabsContent value="users"><UsersPanel /></TabsContent>}
      </Tabs>
    </div>
  );
}
