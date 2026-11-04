import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, UploadCloud, CheckCircle2, Images, BarChart3, Settings, Bell, Moon, Sun, LogOut, Menu, X, BrainCircuit, HardDrive } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { api, fetcher, formatIST, IST_TIME_ZONE, ROLE_LABEL } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
  { to: "/upload", label: "Upload & Ingest", icon: UploadCloud, id: "upload" },
  { to: "/approvals", label: "Approvals", icon: CheckCircle2, id: "approvals", badge: true },
  { to: "/library", label: "Media Library", icon: Images, id: "library" },
  { to: "/google-drive/imports", label: "Google Drive Imports", icon: HardDrive, id: "google-drive-imports" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, id: "analytics" },
  { to: "/ai-dashboard", label: "AI Dashboard", icon: BrainCircuit, id: "ai-dashboard" },
  { to: "/settings", label: "Settings", icon: Settings, id: "settings" },
];

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("isa-theme") || "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("isa-theme", theme);
  }, [theme]);
  return [theme, () => setTheme(theme === "dark" ? "light" : "dark")];
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="grid h-9 w-9 place-items-center rounded-xl border border-gold bg-gold/10 font-display text-xl text-gold">I</div>
      <div className="leading-tight">
        <div className="font-display text-xl">Interior Social</div>
        <div className="font-mono-ui text-[10px] uppercase tracking-[0.25em] text-muted-foreground">AI Studio</div>
      </div>
    </div>
  );
}

function SideNav({ pending, onNavigate }) {
  return (
    <nav className="mt-10 flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon, id, badge }) => (
        <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate} data-testid={`nav-${id}`}
          className={({ isActive }) => cn("group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
            isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
          {({ isActive }) => (<>
            <Icon className={cn("h-4 w-4", isActive && "text-gold")} />
            <span className="flex-1">{label}</span>
            {badge && pending > 0 && (
              <span data-testid="nav-pending-count" className="rounded-full bg-gold px-2 py-0.5 font-mono-ui text-[10px] font-bold text-primary-foreground dark:text-background">{pending}</span>
            )}
          </>)}
        </NavLink>
      ))}
    </nav>
  );
}

function Notifications() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => fetcher("/notifications"), refetchInterval: 15000 });
  const readAll = async () => { await api.post("/notifications/read-all"); qc.invalidateQueries({ queryKey: ["notifications"] }); };
  const open = async (n) => { await api.post(`/notifications/${n.id}/read`); qc.invalidateQueries({ queryKey: ["notifications"] }); if (n.link) nav(n.link); };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" data-testid="notifications-btn">
          <Bell className="h-4 w-4" />
          {data?.unread > 0 && <span data-testid="notifications-unread" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-gold" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="glass w-[360px] rounded-2xl p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          <button onClick={readAll} className="text-xs text-gold hover:underline" data-testid="notifications-read-all">Mark all read</button>
        </div>
        <div className="max-h-[400px] overflow-y-auto scroll-thin">
          {(data?.items || []).length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">You're all caught up.</p>}
          {(data?.items || []).map((n) => (
            <button key={n.id} onClick={() => open(n)} data-testid={`notification-${n.id}`}
              className={cn("flex w-full gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-accent/50", !n.read && "bg-gold/5")}>
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.type.includes("fail") ? "bg-rose-500" : n.type === "publish_success" ? "bg-emerald-500" : "bg-gold")} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{n.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{n.message}</span>
                <span className="font-mono-ui text-[10px] text-muted-foreground">{formatIST(n.created_at)}</span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UserFooter({ user, logout }) {
  return (
    <div className="mt-auto flex items-center gap-3 rounded-xl border border-border p-3">
      <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-semibold">{user.name?.[0]?.toUpperCase()}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" data-testid="current-user-name">{user.name}</div>
        <div className="truncate text-[11px] text-muted-foreground" data-testid="current-user-role">{ROLE_LABEL[user.role]}</div>
      </div>
      <Button variant="ghost" size="icon" onClick={logout} data-testid="logout-btn"><LogOut className="h-4 w-4" /></Button>
    </div>
  );
}

export function AppShell({ children }) {
  const { user, logout } = useAuth();
  const [theme, toggle] = useTheme();
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => fetcher("/dashboard/stats"), refetchInterval: 15000 });
  useEffect(() => setMobile(false), [loc.pathname]);
  const pending = stats?.pending_approval || 0;

  const sidebar = (
    <div className="flex h-full flex-col p-5">
      <Brand />
      <SideNav pending={pending} onNavigate={() => setMobile(false)} />
      <div className="mt-8 rounded-xl border border-gold bg-gold/5 p-4">
        <div className="eyebrow">Pipeline</div>
        <p className="mt-1 text-xs text-muted-foreground" data-testid="sidebar-pipeline-status">
          {stats?.processing ? `${stats.processing} item(s) being analysed by AI` : "Idle · watching for new uploads"}
        </p>
      </div>
      <div className="mt-auto pt-6"><UserFooter user={user} logout={logout} /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-border bg-[hsl(var(--surface))] lg:block">{sidebar}</aside>
      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobile(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] border-r border-border bg-[hsl(var(--surface))]">
            <button className="absolute right-4 top-5" onClick={() => setMobile(false)} data-testid="mobile-nav-close"><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-[264px]">
        <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 border-x-0 border-t-0 px-4 sm:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobile(true)} data-testid="mobile-nav-open"><Menu className="h-5 w-5" /></Button>
          <div className="hidden font-mono-ui text-[11px] uppercase tracking-[0.2em] text-muted-foreground sm:block">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric", timeZone: IST_TIME_ZONE })}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="rounded-full" onClick={toggle} data-testid="theme-toggle-btn">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Notifications />
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 lg:py-12">{children}</main>
      </div>
    </div>
  );
}
