import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { fetcher, istDateParts, istInputToUTC, utcToISTInput } from "@/lib/api";
import { Spinner } from "@/components/common/Bits";
import { cn } from "@/lib/utils";

export function HashtagEditor({ tags, onChange, disabled }) {
  const [v, setV] = useState("");
  const add = () => {
    const parts = v.split(/[\s,]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...tags, ...parts])]);
    setV("");
  };
  return (
    <div data-testid="hashtag-editor">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full border border-border bg-accent/50 px-2.5 py-1 font-mono-ui text-[11px]">
            #{t}{!disabled && <button onClick={() => onChange(tags.filter((x) => x !== t))} data-testid={`hashtag-remove-${t}`}><X className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button>}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="mt-3 flex gap-2">
          <Input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
            placeholder="Add hashtags…" className="h-9 rounded-xl font-mono-ui text-xs" data-testid="hashtag-input" />
          <Button size="sm" variant="outline" onClick={add} className="rounded-xl" data-testid="hashtag-add-btn"><Plus className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}

const ADJ = [
  { k: "brightness", l: "Exposure", min: 0.7, max: 1.4, step: 0.01, d: 1 },
  { k: "contrast", l: "Contrast", min: 0.7, max: 1.4, step: 0.01, d: 1 },
  { k: "saturation", l: "Colour", min: 0.6, max: 1.4, step: 0.01, d: 1 },
  { k: "sharpness", l: "Sharpness", min: 0, max: 2.5, step: 0.05, d: 1 },
  { k: "warmth", l: "Warmth", min: -1, max: 1, step: 0.05, d: 0.15 },
];

export function ImageEditDialog({ open, onOpenChange, media, onApply, busy }) {
  const [adj, setAdj] = useState(() => Object.fromEntries(ADJ.map((a) => [a.k, a.d])));
  const css = `brightness(${adj.brightness}) contrast(${adj.contrast}) saturate(${adj.saturation}) sepia(${Math.max(0, adj.warmth) * 0.25}) hue-rotate(${Math.min(0, adj.warmth) * 12}deg)`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-2xl" data-testid="image-edit-dialog">
        <DialogHeader><DialogTitle className="font-display text-3xl">Edit image</DialogTitle>
          <DialogDescription>Realistic adjustments only — architecture, furniture and layout are never altered.</DialogDescription></DialogHeader>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="aspect-[4/5] overflow-hidden rounded-xl bg-muted"><img src={media?.urls?.original} alt="" style={{ filter: css }} className="h-full w-full object-cover" /></div>
          <div className="space-y-5">
            {ADJ.map((a) => (
              <div key={a.k}>
                <div className="mb-2 flex justify-between text-xs"><Label>{a.l}</Label><span className="font-mono-ui text-muted-foreground">{adj[a.k].toFixed(2)}</span></div>
                <Slider min={a.min} max={a.max} step={a.step} value={[adj[a.k]]} onValueChange={([v]) => setAdj({ ...adj, [a.k]: v })} data-testid={`edit-slider-${a.k}`} />
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setAdj(Object.fromEntries(ADJ.map((a) => [a.k, a.d])))} data-testid="edit-reset-btn">Reset to AI defaults</Button>
          </div>
        </div>
        <DialogFooter><Button onClick={() => onApply(adj)} disabled={busy} className="rounded-full" data-testid="edit-apply-btn">{busy ? <Spinner /> : "Apply & regenerate crops"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReplaceMediaDialog({ open, onOpenChange, onPick, exclude = [] }) {
  const { data = [], isLoading } = useQuery({ queryKey: ["media", "replace"], queryFn: () => fetcher("/media?kind=image&limit=120"), enabled: open });
  const items = data.filter((m) => m.analysis && !exclude.includes(m.id));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-2xl" data-testid="replace-media-dialog">
        <DialogHeader><DialogTitle className="font-display text-3xl">Replace media</DialogTitle><DialogDescription>Choose a processed image from your library.</DialogDescription></DialogHeader>
        {isLoading ? <Spinner /> : (
          <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto scroll-thin sm:grid-cols-4">
            {items.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No other processed images available.</p>}
            {items.map((m) => (
              <button key={m.id} onClick={() => onPick(m)} className="group overflow-hidden rounded-xl border border-border hover:border-gold" data-testid={`replace-pick-${m.id}`}>
                <img src={m.urls?.square} alt="" className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
                <div className="truncate p-1.5 text-[10px]">{m.filename}</div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleDialog({ open, onOpenChange, onConfirm, busy, scheduledAt }) {
  const initialValue = () => utcToISTInput(new Date(Date.now() + 3600e3).toISOString()).slice(0, 13) + ":00";
  const [v, setV] = useState(initialValue);
  useEffect(() => {
    if (open) setV(scheduledAt ? utcToISTInput(scheduledAt) : initialValue());
  }, [open, scheduledAt]);
  const presets = [["Tomorrow 9:00", 1, 9], ["Tomorrow 19:00", 1, 19], ["In 2 days 11:00", 2, 11]];
  const preset = (days, hour) => {
    const today = istDateParts(new Date());
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + days));
    setV(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00`);
  };
  const scheduledUtc = istInputToUTC(v);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl" data-testid="schedule-dialog">
        <DialogHeader><DialogTitle className="font-display text-3xl">{scheduledAt ? "Update schedule" : "Schedule post"}</DialogTitle><DialogDescription>Choose the publishing time in Indian Standard Time (IST).</DialogDescription></DialogHeader>
        <Input type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} className="h-11 rounded-xl" data-testid="schedule-datetime-input" />
        <div className="flex flex-wrap gap-2">{presets.map(([l, d, h]) => <Button key={l} size="sm" variant="outline" className="rounded-full" onClick={() => preset(d, h)}>{l}</Button>)}</div>
        <DialogFooter><Button className="rounded-full" disabled={busy || !scheduledUtc} onClick={() => onConfirm(scheduledUtc)} data-testid="schedule-confirm-btn">{busy ? <Spinner /> : "Confirm schedule"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RejectDialog({ open, onOpenChange, onConfirm, busy }) {
  const [reason, setReason] = useState("");
  const quick = ["Poor lighting", "Client privacy", "Not on brand", "Duplicate content"];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl" data-testid="reject-dialog">
        <DialogHeader><DialogTitle className="font-display text-3xl">Reject post</DialogTitle><DialogDescription>Optional: tell the team why.</DialogDescription></DialogHeader>
        <div className="flex flex-wrap gap-2">{quick.map((q) => <button key={q} onClick={() => setReason(q)} className={cn("rounded-full border px-3 py-1 text-xs", reason === q ? "border-gold text-gold" : "border-border")}>{q}</button>)}</div>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…" className="rounded-xl" data-testid="reject-reason-input" />
        <DialogFooter><Button variant="destructive" className="rounded-full" disabled={busy} onClick={() => onConfirm(reason)} data-testid="reject-confirm-btn">{busy ? <Spinner /> : "Reject"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
