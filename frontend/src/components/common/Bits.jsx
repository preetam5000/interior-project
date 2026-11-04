import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const TYPE_META = {
  feed: { label: "Feed Post", cls: "text-sky-700 dark:text-sky-400 border-sky-500/30 bg-sky-500/10" },
  story: { label: "Story", cls: "text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/10" },
  carousel: { label: "Carousel", cls: "text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10" },
  reel: { label: "Reel", cls: "text-rose-700 dark:text-rose-400 border-rose-500/30 bg-rose-500/10" },
  skip: { label: "Skip", cls: "text-zinc-700 dark:text-zinc-400 border-zinc-500/30 bg-zinc-500/10" },
};

export const STATUS_META = {
  pending: { label: "Pending approval", cls: "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/30" },
  approved: { label: "Approved", cls: "text-sky-700 dark:text-sky-400 bg-sky-500/10 border-sky-500/30" },
  scheduled: { label: "Scheduled", cls: "text-violet-700 dark:text-violet-300 bg-violet-500/10 border-violet-500/30" },
  publishing: { label: "Publishing…", cls: "text-sky-700 dark:text-sky-300 bg-sky-500/10 border-sky-500/30" },
  published: { label: "Published", cls: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  rejected: { label: "Rejected", cls: "text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/30" },
  failed: { label: "Failed", cls: "text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/30" },
  queued: { label: "Queued", cls: "text-zinc-700 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/30" },
  processing: { label: "AI processing", cls: "text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30" },
  ready: { label: "Ready", cls: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  skipped: { label: "Skipped by AI", cls: "text-zinc-700 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/30" },
};

export function Pill({ meta, children, testId }) {
  return (
    <span data-testid={testId} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", meta?.cls)}>
      {children || meta?.label}
    </span>
  );
}

export const TypeBadge = ({ type, testId }) => <Pill meta={TYPE_META[type] || TYPE_META.feed} testId={testId} />;
export const StatusBadge = ({ status, testId }) => <Pill meta={STATUS_META[status] || STATUS_META.queued} testId={testId} />;

export function PageHeader({ overline, title, subtitle, actions }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between fade-up">
      <div>
        {overline && <div className="eyebrow mb-2">{overline}</div>}
        <h1 className="font-display text-4xl sm:text-5xl font-medium leading-[1.05]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm sm:text-base text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Sparkles, title, text, action, testId }) {
  return (
    <div data-testid={testId} className="panel flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-gold bg-gold/10">
        <Icon className="h-5 w-5 text-gold" />
      </div>
      <h3 className="font-display text-2xl">{title}</h3>
      {text && <p className="mt-2 max-w-md text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function FullLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-background" data-testid="app-loader">
      <Loader2 className="h-6 w-6 animate-spin text-gold" />
    </div>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

export function SkeletonGrid({ n = 6, cls = "aspect-[4/5]" }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={cn("panel overflow-hidden", cls)}><div className="scan-line h-full w-full" /></div>
      ))}
    </div>
  );
}

export function ConfidenceRing({ value = 0, size = 64 }) {
  const pct = Math.round((value || 0) * 100);
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }} data-testid="confidence-ring">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--border))" strokeWidth="4" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--gold))" strokeWidth="4" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} style={{ transition: "stroke-dashoffset .8s ease" }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono-ui text-sm font-semibold">{pct}%</span>
    </div>
  );
}
