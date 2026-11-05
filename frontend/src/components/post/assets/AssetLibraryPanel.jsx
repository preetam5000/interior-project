import { useMemo, useState } from "react";
import { ArrowDownToLine, Heart, Search, Sparkles, X } from "lucide-react";
import { ASSET_CATALOG, ASSET_CATEGORIES } from "./assetCatalog";

const readList = (key) => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };
const TILE_HEIGHT = 132;

export default function AssetLibraryPanel({ onInsert }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [favorites, setFavorites] = useState(() => readList("interior-studio-asset-favorites"));
  const [recent, setRecent] = useState(() => readList("interior-studio-asset-recent"));
  const [preview, setPreview] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return ASSET_CATALOG.filter((asset) => {
      const categoryMatch = category === "All" || (category === "Favorites" ? favorites.includes(asset.id) : category === "Recent" ? recent.includes(asset.id) : asset.category === category);
      return categoryMatch && (!term || `${asset.title} ${asset.category} ${asset.tags.join(" ")}`.toLowerCase().includes(term));
    });
  }, [category, favorites, query, recent]);
  const columns = 2;
  const rowCount = Math.ceil(filtered.length / columns);
  const startRow = Math.max(0, Math.floor(scrollTop / TILE_HEIGHT) - 2);
  const visibleRows = Math.ceil(460 / TILE_HEIGHT) + 5;
  const visible = filtered.slice(startRow * columns, Math.min(rowCount, startRow + visibleRows) * columns);

  const toggleFavorite = (asset) => {
    const next = favorites.includes(asset.id) ? favorites.filter((id) => id !== asset.id) : [asset.id, ...favorites];
    setFavorites(next);
    localStorage.setItem("interior-studio-asset-favorites", JSON.stringify(next));
  };
  const insert = (asset, position) => {
    const next = [asset.id, ...recent.filter((id) => id !== asset.id)].slice(0, 30);
    setRecent(next);
    localStorage.setItem("interior-studio-asset-recent", JSON.stringify(next));
    onInsert(asset, position);
  };
  const beginDrag = (event, asset) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-interior-studio-asset", asset.id);
    event.dataTransfer.setData("text/plain", asset.id);
  };

  return <div className="flex h-full min-h-0 flex-col">
    <div className="shrink-0 space-y-3 border-b border-border/70 p-3.5">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"/><input aria-label="Search assets" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${ASSET_CATALOG.length} assets`} className="h-9 w-full rounded-xl border border-border/70 bg-background/65 pl-9 pr-3 text-[11px] outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10" /></div>
      <div className="scroll-thin flex gap-1 overflow-x-auto pb-1">{ASSET_CATEGORIES.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`shrink-0 rounded-full px-2.5 py-1.5 text-[9px] transition ${category === item ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/70 text-muted-foreground hover:bg-accent hover:text-foreground"}`}>{item}</button>)}</div>
      <div className="flex items-center justify-between text-[9px] text-muted-foreground"><span>{filtered.length} assets</span><span className="inline-flex items-center gap-1"><ArrowDownToLine className="h-3 w-3"/>Drag onto canvas</span></div>
    </div>
    {preview && <div className="relative m-3 rounded-2xl border border-primary/20 bg-background/60 p-2 shadow-sm"><button type="button" aria-label="Close asset preview" onClick={() => setPreview(null)} className="absolute right-2 top-2 z-[1] rounded-lg bg-background/80 p-1 text-muted-foreground hover:text-foreground"><X className="h-3 w-3"/></button><img src={preview.preview} alt={`${preview.title} asset preview`} className="h-28 w-full rounded-xl object-contain"/><div className="mt-2 flex items-center justify-between"><div><div className="text-[10px] font-semibold">{preview.title}</div><div className="text-[9px] text-muted-foreground">{preview.category} · {preview.format} · {preview.metadata.license}</div></div><button type="button" onClick={() => insert(preview)} className="rounded-lg bg-primary px-2.5 py-1.5 text-[9px] font-semibold text-primary-foreground">Add to canvas</button></div></div>}
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2.5" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      {filtered.length ? <div className="grid grid-cols-2 gap-2" style={{ paddingTop: startRow * TILE_HEIGHT, paddingBottom: Math.max(0, rowCount - startRow - visibleRows) * TILE_HEIGHT }}>
        {visible.map((asset) => <article key={asset.id} draggable onDragStart={(event) => beginDrag(event, asset)} className="group relative h-[124px] cursor-grab overflow-hidden rounded-xl border border-border/70 bg-background/55 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg active:cursor-grabbing">
          <button type="button" onClick={() => setPreview(asset)} aria-label={`Preview ${asset.title}`} className="block h-full w-full text-left"><div className="flex h-[94px] items-center justify-center overflow-hidden bg-muted/30 p-1"><img src={asset.preview} alt="" loading="lazy" decoding="async" className="h-full w-full rounded-lg object-contain transition-transform duration-300 group-hover:scale-[1.04]" /></div><div className="truncate px-2 pt-1 text-[9px] font-medium">{asset.title}</div><div className="truncate px-2 text-[8px] text-muted-foreground">{asset.category}</div></button>
          <button type="button" aria-label={`${favorites.includes(asset.id) ? "Remove" : "Add"} ${asset.title} ${favorites.includes(asset.id) ? "from" : "to"} favorites`} onClick={() => toggleFavorite(asset)} className={`absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-lg bg-background/80 shadow-sm backdrop-blur transition hover:scale-105 ${favorites.includes(asset.id) ? "text-rose-500" : "text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"}`}><Heart className="h-3.5 w-3.5" fill={favorites.includes(asset.id) ? "currentColor" : "none"}/></button>
          <button type="button" aria-label={`Add ${asset.title} to canvas`} title="Add to canvas" onClick={() => insert(asset)} className="absolute bottom-7 right-1.5 grid h-6 w-6 place-items-center rounded-lg bg-primary text-primary-foreground opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100"><Sparkles className="h-3 w-3"/></button>
        </article>)}
      </div> : <div className="grid min-h-48 place-content-center text-center"><div className="text-xs font-medium">No matching assets</div><p className="mt-1 text-[10px] text-muted-foreground">Try another search or category.</p></div>}
    </div>
  </div>;
}
