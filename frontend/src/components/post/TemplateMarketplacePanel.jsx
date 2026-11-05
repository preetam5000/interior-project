import { useMemo, useState } from "react";
import { Check, Copy, Filter, Heart, Layers3, Search, Sparkles, Star, Tag, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import DesignTemplateRenderer from "@/template-engine/renderers/DesignTemplateRenderer";

const KEYS = { favorites: "interior-social-ai.marketplace.favorites.v1", installed: "interior-social-ai.marketplace.installed.v1", recent: "interior-social-ai.marketplace.recent.v1", usage: "interior-social-ai.marketplace.usage.v1", duplicates: "interior-social-ai.marketplace.duplicates.v1" };
const TABS = ["Featured", "Popular", "Trending", "Newest", "Favorites", "Recommended", "Professional Packs", "Recently Used"];
const loadList = (key) => { try { const parsed = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } };
const persist = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const clone = (value) => JSON.parse(JSON.stringify(value));
const numberFromId = (id) => Number(/(\d+)$/.exec(id)?.[1] || 0);
const toMarketTemplate = (template, origin = "studio") => ({
  id: template.id,
  name: template.name,
  category: template.category,
  tags: template.tags || [],
  difficulty: template.difficulty || "intermediate",
  formats: template.supportedFormats || [],
  brandCompatibility: template.brandCompatibility || "any-brand",
  animationCompatibility: template.animationCompatibility?.supported ?? Boolean(template.jsonDefinition?.animations?.length),
  qualityScore: template.qualityScore || template.metadata?.qualityScore || 92,
  rating: Math.min(5, Math.max(4.5, Number(((template.qualityScore || template.metadata?.qualityScore || 92) / 20).toFixed(1)))),
  author: template.author || "Interior Studio",
  version: template.version || "1.0.0",
  origin,
  preview: template.preview?.large || template.preview?.library || template.preview || template.jsonDefinition?.thumbnail || "",
  document: template.jsonDefinition || template.document,
});
const formatTemplate = (template) => template?.supportedFormats?.includes("portrait") ? template : { ...template, supportedFormats: [...(template?.supportedFormats || []), "portrait"] };

export default function TemplateMarketplacePanel({ catalog = [], onUse }) {
  const seed = useMemo(() => catalog.map((item) => toMarketTemplate(item)), [catalog]);
  const [duplicates, setDuplicates] = useState(() => loadList(KEYS.duplicates));
  const [favorites, setFavorites] = useState(() => loadList(KEYS.favorites));
  const [installed, setInstalled] = useState(() => loadList(KEYS.installed));
  const [recent, setRecent] = useState(() => loadList(KEYS.recent));
  const [usage, setUsage] = useState(() => { try { return JSON.parse(localStorage.getItem(KEYS.usage) || "{}") || {}; } catch { return {}; } });
  const [tab, setTab] = useState("Featured");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [tagFilter, setTagFilter] = useState("All tags");
  const [difficulty, setDifficulty] = useState("All levels");
  const [format, setFormat] = useState("All formats");
  const [preview, setPreview] = useState(null);
  const templates = useMemo(() => [...seed, ...duplicates], [seed, duplicates]);
  const categories = useMemo(() => [...new Set(templates.map((item) => item.category))].sort(), [templates]);
  const tags = useMemo(() => [...new Set(templates.flatMap((item) => item.tags))].sort(), [templates]);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    let result = templates.filter((item) => {
      const matchesSearch = !search || [item.name, item.category, item.author, ...item.tags].join(" ").toLowerCase().includes(search);
      return matchesSearch && (category === "All categories" || item.category === category) && (tagFilter === "All tags" || item.tags.includes(tagFilter)) && (difficulty === "All levels" || item.difficulty === difficulty) && (format === "All formats" || item.formats.includes(format)) && (tab !== "Favorites" || favorites.includes(item.id)) && (tab !== "Recently Used" || recent.includes(item.id));
    });
    if (tab === "Newest") result.sort((a, b) => numberFromId(b.id) - numberFromId(a.id));
    else if (tab === "Popular") result.sort((a, b) => ((usage[b.id] || 0) * 100 + Number(installed.includes(b.id)) * 10 + b.rating) - ((usage[a.id] || 0) * 100 + Number(installed.includes(a.id)) * 10 + a.rating));
    else if (tab === "Trending") result.sort((a, b) => (Number(favorites.includes(b.id)) * 100 + Math.max(0, 20 - recent.indexOf(b.id)) * 5 + b.qualityScore) - (Number(favorites.includes(a.id)) * 100 + Math.max(0, 20 - recent.indexOf(a.id)) * 5 + a.qualityScore));
    else if (tab === "Recently Used") result.sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));
    else result.sort((a, b) => b.qualityScore - a.qualityScore);
    return result;
  }, [templates, query, category, tagFilter, difficulty, format, tab, favorites, installed, recent, usage]);
  const setPersisted = (setter, key, value) => { setter(value); persist(key, value); };
  const toggleFavorite = (item) => setPersisted(setFavorites, KEYS.favorites, favorites.includes(item.id) ? favorites.filter((id) => id !== item.id) : [...favorites, item.id]);
  const install = (item) => { if (!installed.includes(item.id)) setPersisted(setInstalled, KEYS.installed, [...installed, item.id]); };
  const duplicate = (item) => {
    const nextId = `custom-${crypto.randomUUID()}`;
    const document = clone(item.document);
    document.id = nextId;
    document.name = `${item.name} Copy`;
    document.thumbnail = "";
    const copy = { ...item, id: nextId, name: `${item.name} Copy`, document, origin: "duplicate", author: "You", version: "1.0.0", preview: "" };
    const next = [...duplicates, copy];
    setDuplicates(next);
    persist(KEYS.duplicates, next);
    setPersisted(setInstalled, KEYS.installed, [...installed, nextId]);
    setPreview(copy);
  };
  const applyTemplate = (item) => {
    const next = [item.id, ...recent.filter((id) => id !== item.id)].slice(0, 20);
    setPersisted(setRecent, KEYS.recent, next);
    const nextUsage = { ...usage, [item.id]: (usage[item.id] || 0) + 1 };
    setUsage(nextUsage);
    persist(KEYS.usage, nextUsage);
    install(item);
    onUse?.(item);
    setPreview(null);
  };

  return <div className="space-y-3.5">
    <section className="space-y-2 rounded-xl border border-border/70 bg-background/45 p-3"><div className="flex items-center justify-between"><div><div className="flex items-center gap-1.5 text-[10px] font-semibold"><Layers3 className="h-3.5 w-3.5 text-primary"/>Template Marketplace</div><p className="mt-1 text-[8px] text-muted-foreground">{templates.length} local templates · no marketplace backend</p></div><span className="rounded-full bg-primary/10 px-2 py-1 text-[7px] font-semibold text-primary">LOCAL</span></div><div className="relative"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates, tags, authors" className="h-8 rounded-lg pl-8 text-[9px]"/></div><div className="grid grid-cols-2 gap-1.5"><select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-8 min-w-0 rounded-lg border border-border/70 bg-background px-2 text-[8px]"><option>All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className="h-8 min-w-0 rounded-lg border border-border/70 bg-background px-2 text-[8px]"><option>All tags</option>{tags.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="h-8 min-w-0 rounded-lg border border-border/70 bg-background px-2 text-[8px]"><option>All levels</option>{["beginner", "intermediate", "advanced"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by format" value={format} onChange={(event) => setFormat(event.target.value)} className="h-8 min-w-0 rounded-lg border border-border/70 bg-background px-2 text-[8px]"><option>All formats</option>{["story", "portrait", "square", "landscape", "carousel"].map((item) => <option key={item}>{item}</option>)}</select></div></section>
    <div className="flex gap-1 overflow-x-auto pb-1">{TABS.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 rounded-lg px-2 py-1.5 text-[8px] transition ${tab === item ? "bg-primary text-primary-foreground" : "border border-border/70 text-muted-foreground hover:bg-accent"}`}>{item}</button>)}</div>
    {tab === "Professional Packs" && <section className="rounded-lg bg-primary/[.06] p-2.5"><div className="mb-2 flex items-center gap-1 text-[8px] font-semibold"><Sparkles className="h-3 w-3 text-primary"/>Professional Packs</div><div className="flex flex-wrap gap-1">{categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-full border px-2 py-1 text-[7px] ${category === item ? "border-primary/40 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:bg-accent"}`}>{item} <span className="opacity-60">{templates.filter((entry) => entry.category === item).length}</span></button>)}</div></section>}
    <div className="flex items-center justify-between px-0.5"><span className="text-[8px] text-muted-foreground">{filtered.length} results · {tab}</span><span className="flex items-center gap-1 text-[7px] text-muted-foreground"><Filter className="h-3 w-3"/>{tab === "Popular" ? "Local uses + installs" : tab === "Trending" ? "Local favorites + recency" : "Filters active"}</span></div>
    {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-border/70 p-5 text-center"><div className="text-[9px] font-medium">No templates match</div><button type="button" onClick={() => { setQuery(""); setCategory("All categories"); setTagFilter("All tags"); setDifficulty("All levels"); setFormat("All formats"); }} className="mt-1 text-[8px] text-primary">Clear filters</button></div> : <div className="grid grid-cols-2 gap-2">{filtered.map((item) => <article key={item.id} className="overflow-hidden rounded-xl border border-border/70 bg-background/40 transition hover:border-primary/35 hover:shadow-md"><button type="button" onClick={() => setPreview(item)} className="group relative block aspect-[4/5] w-full overflow-hidden bg-muted/30 text-left">{item.preview ? <img src={item.preview.startsWith("<svg") ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.preview)}` : item.preview} alt={`${item.name} preview`} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"/> : <div className="grid h-full place-items-center p-2 text-center text-[8px] text-muted-foreground">Preview available in full studio</div>}<span className="absolute left-1.5 top-1.5 rounded bg-background/85 px-1.5 py-1 text-[7px] font-semibold backdrop-blur">{item.category}</span><span className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded bg-background/85 px-1.5 py-1 text-[7px] backdrop-blur"><Star className="h-2.5 w-2.5 fill-amber-400 text-amber-500"/>{item.rating.toFixed(1)}</span></button><div className="space-y-1.5 p-2"><div className="flex items-start justify-between gap-1"><div className="min-w-0"><div className="truncate text-[8px] font-semibold">{item.name}</div><div className="mt-0.5 truncate text-[7px] text-muted-foreground">{item.author} · v{item.version}</div></div><button type="button" aria-label={favorites.includes(item.id) ? "Remove favorite" : "Add favorite"} onClick={() => toggleFavorite(item)} className="grid h-6 w-6 shrink-0 place-items-center rounded-md hover:bg-accent"><Heart className={`h-3 w-3 ${favorites.includes(item.id) ? "fill-rose-500 text-rose-500" : "text-muted-foreground"}`}/></button></div><div className="flex flex-wrap gap-1">{item.tags.slice(0, 2).map((tag) => <span key={tag} className="inline-flex max-w-full items-center gap-0.5 truncate rounded bg-muted/70 px-1 py-0.5 text-[6px] text-muted-foreground"><Tag className="h-2 w-2"/>{tag}</span>)}</div><div className="grid grid-cols-2 gap-1"><button type="button" onClick={() => install(item)} className="flex h-7 items-center justify-center gap-1 rounded-md border border-border/70 text-[7px] transition hover:bg-accent">{installed.includes(item.id) ? <><Check className="h-3 w-3 text-emerald-600"/>Installed</> : "Install"}</button><button type="button" onClick={() => setPreview(item)} className="h-7 rounded-md bg-primary text-[7px] font-semibold text-primary-foreground transition hover:opacity-90">Preview</button></div></div></article>)}</div>}
    <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }}><DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden rounded-2xl p-0"><DialogHeader className="sr-only"><DialogTitle>{preview?.name || "Template preview"}</DialogTitle><DialogDescription>Preview a local marketplace template and choose whether to duplicate, install, or use it.</DialogDescription></DialogHeader>{preview && <div className="grid max-h-[92vh] md:grid-cols-[minmax(0,1fr)_300px]"><div className="grid min-h-[360px] place-items-center overflow-auto bg-muted/30 p-4"><div className="w-full max-w-[360px] shadow-2xl"><DesignTemplateRenderer template={formatTemplate(preview.document)} format="portrait" className="w-full rounded-lg"/></div></div><div className="flex min-h-0 flex-col p-4"><div className="flex items-start justify-between gap-2"><div><div className="text-sm font-semibold">{preview.name}</div><div className="mt-1 text-[10px] text-muted-foreground">{preview.category} · {preview.difficulty}</div></div><button type="button" onClick={() => setPreview(null)} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-accent"><X className="h-4 w-4"/></button></div><div className="mt-3 flex items-center gap-1 text-[10px]"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500"/>{preview.rating.toFixed(1)} <span className="text-muted-foreground">quality rating · {preview.author} · v{preview.version}</span></div><div className="mt-3 flex flex-wrap gap-1">{preview.tags.map((tag) => <span key={tag} className="rounded-full border border-border/70 px-2 py-1 text-[8px] text-muted-foreground">{tag}</span>)}</div><div className="mt-3 grid grid-cols-2 gap-2 text-[9px]"><div className="rounded-lg bg-muted/50 p-2"><div className="text-[7px] text-muted-foreground">Brand fit</div>{preview.brandCompatibility}</div><div className="rounded-lg bg-muted/50 p-2"><div className="text-[7px] text-muted-foreground">Motion</div>{preview.animationCompatibility ? "Supported" : "Static"}</div><div className="rounded-lg bg-muted/50 p-2"><div className="text-[7px] text-muted-foreground">Formats</div>{preview.formats.join(", ")}</div><div className="rounded-lg bg-muted/50 p-2"><div className="text-[7px] text-muted-foreground">Quality</div>{preview.qualityScore}/100</div></div><div className="mt-auto space-y-2 pt-5"><button type="button" onClick={() => applyTemplate(preview)} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[10px] font-semibold text-primary-foreground"><Check className="h-3.5 w-3.5"/>Use template</button><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => install(preview)} className="h-8 rounded-lg border border-border/70 text-[9px] hover:bg-accent">{installed.includes(preview.id) ? "Installed" : "Install locally"}</button><button type="button" onClick={() => duplicate(preview)} className="flex h-8 items-center justify-center gap-1 rounded-lg border border-border/70 text-[9px] hover:bg-accent"><Copy className="h-3 w-3"/>Duplicate</button></div></div></div></div>}</DialogContent></Dialog>
  </div>;
}
