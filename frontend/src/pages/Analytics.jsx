import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { RefreshCw, Eye, Heart, MessageCircle, Share2, Bookmark, Users, CheckCircle2, Cpu, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errMsg, fetcher, can } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Spinner, TypeBadge } from "@/components/common/Bits";

const tip = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 };

function Kpi({ label, value, icon: Icon, testId }) {
  return (
    <div className="panel p-5" data-testid={testId}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">{label}<Icon className="h-4 w-4" /></div>
      <div className="mt-3 font-mono-ui text-3xl font-semibold">{value ?? "—"}</div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return <div className="panel p-6"><div className="eyebrow mb-4">{title}</div><div className="h-60">{children}</div></div>;
}

export default function Analytics() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [days, setDays] = useState("30");
  const [syncing, setSyncing] = useState(false);
  const { data: d } = useQuery({ queryKey: ["analytics", days], queryFn: () => fetcher(`/analytics/overview?days=${days}`) });
  const { data: s } = useQuery({ queryKey: ["settings"], queryFn: () => fetcher("/settings") });
  const sync = async () => {
    setSyncing(true);
    try { const { data } = await api.post("/analytics/sync"); toast.success(`Synced ${data.synced_posts} posts · @${data.username}`); qc.invalidateQueries({ queryKey: ["analytics"] }); }
    catch (e) { toast.error(errMsg(e)); } finally { setSyncing(false); }
  };
  const t = d?.totals || {};
  return (
    <div>
      <PageHeader overline="Performance" title="Analytics" subtitle="Real Instagram insights plus your studio's AI and approval metrics."
        actions={<>
          <Tabs value={days} onValueChange={setDays}><TabsList className="rounded-full">{["7", "30", "90"].map((x) => <TabsTrigger key={x} value={x} className="rounded-full" data-testid={`range-${x}`}>{x}d</TabsTrigger>)}</TabsList></Tabs>
          {can(user, "approve") && <Button className="rounded-full" onClick={sync} disabled={syncing} data-testid="sync-analytics-btn">{syncing ? <Spinner /> : <><RefreshCw className="mr-1 h-4 w-4" />Sync Instagram</>}</Button>}
        </>} />
      {!s?.instagram_configured && (
        <div className="panel mb-6 flex flex-col gap-3 border-gold p-5 sm:flex-row sm:items-center" data-testid="instagram-not-connected">
          <Instagram className="h-5 w-5 text-gold" /><p className="flex-1 text-sm">Connect Instagram to pull reach, likes, comments, shares, saves and follower growth.</p>
          <Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/settings">Connect Instagram</Link></Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Reach" value={t.reach} icon={Eye} testId="kpi-reach" />
        <Kpi label="Likes" value={t.likes} icon={Heart} testId="kpi-likes" />
        <Kpi label="Comments" value={t.comments} icon={MessageCircle} testId="kpi-comments" />
        <Kpi label="Shares" value={t.shares} icon={Share2} testId="kpi-shares" />
        <Kpi label="Saves" value={t.saves} icon={Bookmark} testId="kpi-saves" />
        <Kpi label="Follower growth" value={d?.follower_growth} icon={Users} testId="kpi-followers" />
        <Kpi label="Approval rate" value={d?.approval_rate != null ? `${d.approval_rate}%` : "—"} icon={CheckCircle2} testId="kpi-approval-rate" />
        <Kpi label="AI calls" value={d?.ai_calls} icon={Cpu} testId="kpi-ai-calls" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Publishing frequency">
          <ResponsiveContainer><BarChart data={d?.series || []}><CartesianGrid stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" /><Tooltip contentStyle={tip} /><Bar dataKey="published" fill="hsl(var(--gold))" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="AI usage">
          <ResponsiveContainer><LineChart data={d?.series || []}><CartesianGrid stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" /><Tooltip contentStyle={tip} /><Line type="monotone" dataKey="ai_calls" stroke="#10B981" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Follower growth">
          {(d?.followers || []).length ? <ResponsiveContainer><LineChart data={d.followers}><XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" /><YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" /><Tooltip contentStyle={tip} /><Line dataKey="followers" stroke="hsl(var(--gold))" strokeWidth={2} /></LineChart></ResponsiveContainer>
            : <p className="grid h-full place-items-center text-sm text-muted-foreground">Sync Instagram daily to build your follower history.</p>}
        </ChartCard>
        <div className="panel p-6" data-testid="top-posts">
          <div className="eyebrow mb-4">Top performing posts</div>
          {(d?.top_posts || []).length === 0 && <p className="text-sm text-muted-foreground">No insights yet — publish posts and sync.</p>}
          {(d?.top_posts || []).map((p) => (
            <Link key={p.post_id} to={`/approvals/${p.post_id}`} className="flex items-center gap-3 border-b border-border/50 py-3 last:border-0 hover:text-gold">
              <TypeBadge type={p.type} /><span className="flex-1 truncate text-sm">{p.title}</span>
              <span className="font-mono-ui text-xs text-muted-foreground">{p.reach} reach · {p.likes} likes · {p.saves} saves</span>
            </Link>
          ))}
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4 font-mono-ui text-xs">
            <div><div className="text-muted-foreground">Approved</div><div className="text-lg">{d?.approved ?? 0}</div></div>
            <div><div className="text-muted-foreground">Rejected</div><div className="text-lg">{d?.rejected ?? 0}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
