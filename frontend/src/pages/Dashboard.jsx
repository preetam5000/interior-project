import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Images, Film, Sparkles, Clock, CheckCircle2, CalendarClock, XCircle, HardDrive, Cpu, Layers, Clapperboard, SquareStack, ChevronLeft, ChevronRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetcher, formatBytes, formatIST, istDateParts, IST_TIME_ZONE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, TypeBadge } from "@/components/common/Bits";
import { QuickApproveList } from "@/components/post/QuickApprove";
import { cn } from "@/lib/utils";

function Stat({ label, value, icon: Icon, accent, testId, i = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.035 }}
      className="panel panel-hover relative overflow-hidden p-5" data-testid={testId}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", accent ? "text-gold" : "text-muted-foreground")} />
      </div>
      <div className="mt-3 font-mono-ui text-3xl font-semibold tracking-tight">{value ?? "—"}</div>
    </motion.div>
  );
}

function Calendar({ month, setMonth }) {
  const { data = [] } = useQuery({ queryKey: ["calendar", month], queryFn: () => fetcher(`/dashboard/calendar?month=${month}`) });
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 15));
  const days = new Date(y, m, 0).getDate();
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const byDay = useMemo(() => {
    const map = {};
    data.forEach((p) => {
      const date = istDateParts(p.published_at || p.scheduled_at);
      if (date?.year === y && date.month === m) (map[date.day] = map[date.day] || []).push(p);
    });
    return map;
  }, [data, m, y]);
  const shift = (n) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`); };
  const today = istDateParts(new Date());
  return (
    <div className="panel p-6" data-testid="publishing-calendar">
      <div className="mb-5 flex items-center justify-between">
        <div><div className="eyebrow">Publishing calendar · IST</div><h3 className="mt-1 font-display text-2xl">{new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: IST_TIME_ZONE }).format(first)}</h3></div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => shift(-1)} data-testid="calendar-prev-btn"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => shift(1)} data-testid="calendar-next-btn"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center font-mono-ui text-[10px] uppercase text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="pb-2">{d}</div>)}
        {Array.from({ length: offset }).map((_, i) => <div key={`o${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const d = i + 1;
          const items = byDay[d] || [];
          const isToday = today?.year === y && today.month === m && today.day === d;
          return (
            <div key={d} className={cn("min-h-[64px] rounded-lg border border-border/60 p-1.5 text-left", isToday && "border-gold bg-gold/5")}>
              <div className={cn("text-[11px]", isToday ? "text-gold" : "text-muted-foreground")}>{d}</div>
              {items.slice(0, 2).map((p) => (
                <Link key={p.id} to={`/approvals/${p.id}`} title={`${p.title} · ${formatIST(p.published_at || p.scheduled_at)}`}
                  className={cn("mt-1 block truncate rounded px-1 py-0.5 text-[9px] normal-case", p.status === "published" ? "bg-emerald-500/15 text-emerald-400" : "bg-violet-500/15 text-violet-300")}>
                  {p.title} · {formatIST(p.published_at || p.scheduled_at, { timeOnly: true })}
                </Link>
              ))}
              {items.length > 2 && <div className="mt-0.5 text-[9px]">+{items.length - 2}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityFeed() {
  const { data = [] } = useQuery({ queryKey: ["activity"], queryFn: () => fetcher("/dashboard/activity?limit=12"), refetchInterval: 10000 });
  return (
    <div className="panel p-6" data-testid="recent-activity">
      <div className="eyebrow">Recent activity</div>
      <div className="mt-4 space-y-4">
        {data.length === 0 && <p className="text-sm text-muted-foreground">No activity yet — upload your first project photos.</p>}
        {data.map((a) => (
          <div key={a.id} className="flex gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
            <div className="min-w-0">
              <p className="text-sm">{a.message}</p>
              <p className="font-mono-ui text-[10px] text-muted-foreground">{a.user_name} · {formatIST(a.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsMini() {
  const { data } = useQuery({ queryKey: ["analytics", 30], queryFn: () => fetcher("/analytics/overview?days=30") });
  return (
    <div className="panel p-6" data-testid="analytics-overview-mini">
      <div className="flex items-start justify-between">
        <div><div className="eyebrow">Analytics overview · 30d</div>
          <div className="mt-2 flex gap-6 font-mono-ui text-sm">
            <span>Reach <b className="text-foreground">{data?.totals?.reach ?? 0}</b></span>
            <span>Likes <b>{data?.totals?.likes ?? 0}</b></span>
            <span>Approval <b>{data?.approval_rate != null ? `${data.approval_rate}%` : "—"}</b></span>
          </div>
        </div>
        <Link to="/analytics" className="text-xs text-gold hover:underline" data-testid="view-analytics-link">Open <ArrowUpRight className="inline h-3 w-3" /></Link>
      </div>
      <div className="mt-4 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data?.series || []}>
            <defs><linearGradient id="g1" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity={0.35} /><stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0} /></linearGradient></defs>
            <XAxis dataKey="date" hide />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
            <Area type="monotone" dataKey="ai_calls" name="AI calls" stroke="hsl(var(--gold))" fill="url(#g1)" strokeWidth={2} />
            <Area type="monotone" dataKey="published" name="Published" stroke="#10B981" fill="transparent" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const now = istDateParts(new Date());
  const [month, setMonth] = useState(`${now.year}-${String(now.month).padStart(2, "0")}`);
  const { data: s } = useQuery({ queryKey: ["stats"], queryFn: () => fetcher("/dashboard/stats"), refetchInterval: 15000 });
  const { data: driveSync } = useQuery({ queryKey: ["google-drive-sync-status"], queryFn: () => fetcher("/google-drive/status"), refetchInterval: 15000 });
  const hour = Number(new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const primary = [
    { label: "Pending approval", value: s?.pending_approval, icon: Clock, accent: true, testId: "stat-pending-approval" },
    { label: "Published today", value: s?.published_today, icon: CheckCircle2, testId: "stat-published-today" },
    { label: "Scheduled posts", value: s?.scheduled, icon: CalendarClock, testId: "stat-scheduled" },
    { label: "Rejected posts", value: s?.rejected, icon: XCircle, testId: "stat-rejected" },
  ];
  const secondary = [
    { label: "Images uploaded", value: s?.images_uploaded, icon: Images, testId: "stat-images" },
    { label: "Videos uploaded", value: s?.videos_uploaded, icon: Film, testId: "stat-videos" },
    { label: "Posts generated", value: s?.posts_generated, icon: Sparkles, accent: true, testId: "stat-posts" },
    { label: "Stories generated", value: s?.stories_generated, icon: Layers, testId: "stat-stories" },
    { label: "Carousels generated", value: s?.carousels_generated, icon: SquareStack, testId: "stat-carousels" },
    { label: "Reels generated", value: s?.reels_generated, icon: Clapperboard, testId: "stat-reels" },
  ];
  return (
    <div>
      <PageHeader overline="Studio overview" title={<>{greet}, <em className="text-gold">{user?.name?.split(" ")[0]}</em></>}
        subtitle="Your content pipeline at a glance — from Drive upload to Instagram."
        actions={<><Button asChild variant="outline" className="rounded-full" data-testid="dash-upload-btn"><Link to="/upload">Upload media</Link></Button>
          <Button asChild className="rounded-full" data-testid="dash-review-btn"><Link to="/approvals">Review queue ({s?.pending_approval ?? 0})</Link></Button></>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{primary.map((x, i) => <Stat key={x.label} {...x} i={i} />)}</div>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">{secondary.map((x, i) => <Stat key={x.label} {...x} i={i + 4} />)}</div>
      <div className="panel mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" data-testid="google-drive-sync-dashboard">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-gold/10 text-gold"><HardDrive className="h-5 w-5" /></div>
          <div><div className="text-sm font-semibold">Google Drive Sync</div><div className="mt-1 text-xs text-muted-foreground">{driveSync?.connection_error || (driveSync?.connected ? !driveSync.folder_id ? "Select an Instagram Folder" : driveSync?.sync_state === "error" ? "Needs attention · sync error" : "Running · filtered images" : "Not connected")}</div></div></div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div><span className="text-muted-foreground">Last checked </span><span>{driveSync?.last_sync ? formatIST(driveSync.last_sync) : "—"}</span></div>
          <div><span className="text-muted-foreground">Imported today </span><span className="font-mono-ui font-semibold">{driveSync?.imported_today ?? 0}</span></div>
          <div><span className="text-muted-foreground">Instagram folder </span><span className="font-mono-ui font-semibold">{driveSync?.folder_name || (driveSync?.folder_id ? "Selected" : "Not selected")}</span></div>
          <Link to="/settings?tab=automation" className="text-gold hover:underline">Settings <ArrowUpRight className="inline h-3 w-3" /></Link>
        </div>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <QuickApproveList />
          <AnalyticsMini />
          <Calendar month={month} setMonth={setMonth} />
        </div>
        <div className="space-y-6 xl:col-span-4">
          <div className="panel p-6" data-testid="usage-card">
            <div className="eyebrow">Storage & API usage</div>
            <div className="mt-4 space-y-4 text-sm">
              <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted-foreground"><HardDrive className="h-4 w-4" />Storage used</span><span className="font-mono-ui" data-testid="storage-usage">{formatBytes(s?.storage_bytes)}</span></div>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted-foreground"><Cpu className="h-4 w-4" />OpenAI calls (month)</span><span className="font-mono-ui" data-testid="openai-usage">{s?.api_usage?.openai_month ?? 0}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">OpenAI calls (total)</span><span className="font-mono-ui">{s?.api_usage?.openai_total ?? 0}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Instagram API calls</span><span className="font-mono-ui">{s?.api_usage?.instagram_total ?? 0}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Cloudinary operations</span><span className="font-mono-ui">{s?.api_usage?.cloudinary_total ?? 0}</span></div>
            </div>
          </div>
          <ActivityFeed />
          <div className="panel p-6">
            <div className="eyebrow">Content mix</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["feed", "story", "carousel", "reel"].map((t) => <span key={t} className="flex items-center gap-2"><TypeBadge type={t} /><span className="font-mono-ui text-xs">{s?.[{ feed: "feed_generated", story: "stories_generated", carousel: "carousels_generated", reel: "reels_generated" }[t]] ?? 0}</span></span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
