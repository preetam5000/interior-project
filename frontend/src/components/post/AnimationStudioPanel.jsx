import { useEffect, useMemo, useState } from "react";
import { Film, Layers3, Plus, RotateCcw, Sparkles, Timer } from "lucide-react";
import { ANIMATION_PRESETS, getAnimationPreset } from "@/template-engine/presets";
import AnimatedStoryPreview from "@/template-engine/render/AnimatedStoryPreview";

const PRESETS = Object.keys(ANIMATION_PRESETS);
const EASINGS = ["linear", "ease-in", "ease-out", "ease-in-out"];
const DIRECTIONS = ["normal", "reverse", "alternate", "alternate-reverse"];
const VALUES = ["opacity", "translateX", "translateY", "scaleX", "scaleY", "rotation", "blur"];
const clone = (value) => JSON.parse(JSON.stringify(value));
const label = (value) => value.replaceAll("-", " ").replace(/\b\w/g, (char) => char.toUpperCase());

export default function AnimationStudioPanel({ template, selectedIds, onSelect, onApply, onRemove, timeMs = 0, previewOptions = {}, context }) {
  const selected = template?.elements?.find((element) => selectedIds.includes(element.id));
  const [preset, setPreset] = useState("fade");
  const [durationMs, setDurationMs] = useState(520);
  const [delayMs, setDelayMs] = useState(0);
  const [easing, setEasing] = useState("ease-out");
  const [direction, setDirection] = useState("normal");
  const [loop, setLoop] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [staggerMs, setStaggerMs] = useState(100);
  const [cascade, setCascade] = useState(false);
  const [keyframes, setKeyframes] = useState([]);

  useEffect(() => {
    const animation = selected?.animations?.at(-1);
    const definition = getAnimationPreset(animation?.preset || "fade");
    if (animation) {
      setPreset(animation.preset);
      setDurationMs(animation.durationMs || definition.durationMs);
      setDelayMs(animation.delayMs || 0);
      setEasing(animation.easing || definition.easing);
      setDirection(animation.direction || "normal");
      setLoop(Boolean(animation.loop));
      setKeyframes(clone(animation.keyframes || definition.keyframes));
    } else {
      setDurationMs(definition.durationMs);
      setEasing(definition.easing);
      setDirection("normal");
      setLoop(false);
      setDelayMs(0);
      setKeyframes(clone(definition.keyframes));
    }
  }, [selected?.id, selected?.animations]);

  const previewOptionsForAnimation = useMemo(() => ({ ...previewOptions }), [previewOptions]);
  const changeFrame = (index, key, value) => setKeyframes((frames) => frames.map((frame, frameIndex) => frameIndex === index ? { ...frame, [key === "offset" ? "offset" : "values"]: key === "offset" ? Number(value) : { ...frame.values, [key]: Number(value) } } : frame));
  const addKeyframe = () => {
    const offset = keyframes.length ? Math.min(1, Math.max(...keyframes.map((frame) => frame.offset)) + 0.2) : 0.5;
    const values = clone(keyframes.at(-1)?.values || {});
    setKeyframes((frames) => [...frames, { offset, values }].sort((a, b) => a.offset - b.offset));
  };
  const apply = () => {
    if (!selectedIds.length) return;
    onApply(selectedIds, { preset, durationMs: Number(durationMs), delayMs: Number(delayMs), easing, direction, loop, keyframes: clone(keyframes) }, { grouped, staggerMs: Number(staggerMs), cascade });
  };

  return <div className="space-y-3.5">
    <section className="rounded-xl border border-border/70 bg-background/45 p-3">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-[11px] font-semibold"><Sparkles className="h-4 w-4 text-primary"/>Animation Inspector</div><span className="text-[9px] text-muted-foreground">Preview only</span></div>
      <p className="mt-1 text-[9px] text-muted-foreground">{selectedIds.length ? `${selectedIds.length} selected layer${selectedIds.length === 1 ? "" : "s"}` : "Select one or more canvas layers to animate."}</p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">{PRESETS.map((item) => <button key={item} type="button" onClick={() => { const def = getAnimationPreset(item); setPreset(item); setDurationMs(def.durationMs); setEasing(def.easing); setKeyframes(clone(def.keyframes)); }} className={`rounded-lg border px-2 py-2 text-[9px] capitalize transition hover:border-primary/40 ${preset === item ? "border-primary/35 bg-primary/10 text-primary" : "border-border/70 bg-background/50 text-muted-foreground hover:bg-accent"}`}>{label(item)}</button>)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2"><label className="space-y-1 text-[9px] text-muted-foreground">Duration (ms)<input type="number" min="50" max="30000" step="50" value={durationMs} onChange={(event) => setDurationMs(Number(event.target.value))} className="h-8 w-full rounded-lg border border-border/70 bg-background px-2 text-[10px] text-foreground"/></label><label className="space-y-1 text-[9px] text-muted-foreground">Delay (ms)<input type="number" min="0" max="30000" step="50" value={delayMs} onChange={(event) => setDelayMs(Number(event.target.value))} className="h-8 w-full rounded-lg border border-border/70 bg-background px-2 text-[10px] text-foreground"/></label></div>
      <div className="mt-2 grid grid-cols-2 gap-2"><label className="space-y-1 text-[9px] text-muted-foreground">Easing<select value={easing} onChange={(event) => setEasing(event.target.value)} className="h-8 w-full rounded-lg border border-border/70 bg-background px-2 text-[10px] text-foreground">{EASINGS.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label><label className="space-y-1 text-[9px] text-muted-foreground">Direction<select value={direction} onChange={(event) => setDirection(event.target.value)} className="h-8 w-full rounded-lg border border-border/70 bg-background px-2 text-[10px] text-foreground">{DIRECTIONS.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label></div>
      <label className="mt-2 flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-2 text-[10px]">Loop playback<input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} className="accent-primary"/></label>
      <div className="mt-2 space-y-2 rounded-lg border border-border/70 p-2.5"><label className="flex items-center justify-between gap-2 text-[9px]"><span className="inline-flex items-center gap-1.5"><Layers3 className="h-3.5 w-3.5 text-primary"/>Group animation</span><input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} className="accent-primary"/></label><label className="flex items-center justify-between gap-2 text-[9px]"><span>Stagger selected layers</span><input type="checkbox" checked={staggerMs > 0} onChange={(event) => setStaggerMs(event.target.checked ? 100 : 0)} className="accent-primary"/></label>{staggerMs > 0 && <label className="block space-y-1 text-[9px] text-muted-foreground">Stagger delay<input type="number" min="0" max="5000" step="25" value={staggerMs} onChange={(event) => setStaggerMs(Number(event.target.value))} className="h-7 w-full rounded-md border border-border/70 bg-background px-2 text-foreground"/></label>}<label className="flex items-center justify-between gap-2 text-[9px]"><span>Cascade order</span><input type="checkbox" checked={cascade} onChange={(event) => setCascade(event.target.checked)} className="accent-primary"/></label></div>
      <button type="button" disabled={!selectedIds.length} onClick={apply} className="mt-3 h-9 w-full rounded-xl bg-primary text-[10px] font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-40"><Timer className="mr-1.5 inline h-3.5 w-3.5"/>Apply animation</button>
      {selected?.animations?.length > 0 && <button type="button" onClick={() => onRemove(selectedIds)} className="mt-2 h-8 w-full rounded-lg text-[9px] text-muted-foreground hover:bg-accent hover:text-foreground"><RotateCcw className="mr-1 inline h-3 w-3"/>Remove all animations on selected layers</button>}
    </section>

    <section className="rounded-xl border border-border/70 bg-background/45 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-semibold">Keyframes</span><button type="button" onClick={addKeyframe} className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2 py-1 text-[9px] hover:bg-accent"><Plus className="h-3 w-3"/>Add</button></div>{keyframes.map((frame, index) => <div key={`${index}-${frame.offset}`} className="mb-2 rounded-lg border border-border/60 bg-background/40 p-2"><div className="mb-2 flex items-center justify-between"><label className="text-[8px] text-muted-foreground">Frame {index + 1} · offset<input type="number" min="0" max="1" step="0.05" value={frame.offset} onChange={(event) => changeFrame(index, "offset", event.target.value)} className="ml-1 w-14 rounded border border-border/70 bg-background px-1 py-0.5 text-[9px] text-foreground"/></label>{keyframes.length > 2 && <button type="button" onClick={() => setKeyframes((frames) => frames.filter((_, frameIndex) => frameIndex !== index))} className="text-[8px] text-muted-foreground hover:text-rose-500">Remove</button>}</div><div className="grid grid-cols-2 gap-x-2 gap-y-1">{VALUES.filter((key) => key in frame.values).map((key) => <label key={key} className="flex items-center justify-between gap-1 text-[8px] capitalize text-muted-foreground">{label(key)}<input type="number" step="0.05" value={frame.values[key]} onChange={(event) => changeFrame(index, key, event.target.value)} className="h-6 w-14 rounded border border-border/70 bg-background px-1 text-[8px] text-foreground"/></label>)}</div></div>)}</section>

    <section className="rounded-xl border border-border/70 bg-background/45 p-3"><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold"><Film className="h-3.5 w-3.5 text-primary"/>Animated Story Preview</div>{template && <AnimatedStoryPreview template={template} context={context} timeMs={timeMs} options={previewOptionsForAnimation}/>}<p className="mt-2 text-center text-[8px] text-muted-foreground">Scrub the timeline below to preview motion. Video export is not available.</p></section>
  </div>;
}
