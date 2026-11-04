import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock3, Heart, Music2, Pause, Play, Search, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errMsg, fetcher } from "@/lib/api";
import { Spinner } from "@/components/common/Bits";

const MOODS = ["Calm", "Luxury", "Modern", "Elegant", "Minimal", "Epic", "Romantic", "Energetic", "Motivational", "Relaxing"];
const GENRES = [{ value: "Piano", label: "Piano" }, { value: "LoFi", label: "Lo-fi" }, { value: "Ambient", label: "Ambient" }, { value: "Corporate", label: "Corporate" }, { value: "Electronic", label: "Electronic" }, { value: "Acoustic", label: "Acoustic" }, { value: "Pop", label: "Pop" }, { value: "Cinematic", label: "Cinematic" }, { value: "Jazz", label: "Jazz" }];
const DURATIONS = [15, 30, 45, 60];
const PROJECT_STAGES = ["Construction", "Wood Work", "Painting", "Interior", "Exterior", "Villa", "Commercial", "Completed", "Furniture"];
const ROOMS = ["Bedroom", "Kitchen", "Living Room", "Office", "Villa", "Commercial", "Wardrobe", "Bathroom", "Dining"];

function durationLabel(seconds = 0) {
  const value = Number(seconds) || 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function TrackCard({ track, confidence, selected, onUse, onFavorite, previewId, onPreviewChange }) {
  const audio = useRef(null);
  const playing = previewId === track.id;
  const [volume, setVolume] = useState(70);
  useEffect(() => {
    if (!playing && audio.current && !audio.current.paused) audio.current.pause();
  }, [playing]);
  const bars = track.waveform?.length ? track.waveform : Array.from({ length: 40 }, (_, i) => 0.35 + ((i * 13 + track.id.length * 7) % 55) / 100);
  const togglePlay = async () => {
    if (!audio.current) return;
    if (playing) { audio.current.pause(); onPreviewChange(""); return; }
    audio.current.volume = volume / 100;
    try { await audio.current.play(); onPreviewChange(track.id); } catch (error) { toast.error("Could not play this preview"); }
  };
  return <article className={`rounded-xl border p-3 transition-colors ${selected ? "border-gold/70 bg-gold/5" : "border-border/70 bg-background/30"}`} data-testid={`music-track-${track.id}`}>
    <audio ref={audio} src={`${api.defaults.baseURL}${track.preview_url}`} preload="none" onEnded={() => onPreviewChange("")} />
    <div className="flex items-start gap-3">
      <img src={`${api.defaults.baseURL}${track.cover_art}`} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-full" onClick={togglePlay} aria-label={`${playing ? "Pause" : "Preview"} ${track.title}`} data-testid={`preview-music-${track.id}`}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-medium">{track.title}</h3>{track.is_featured && <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[10px] text-gold">Featured</span>}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span>{track.mood_tags?.join(", ") || track.mood}</span><span>{track.genre}</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{durationLabel(track.duration)}</span><span>{track.tempo || track.bpm} BPM</span><span>Energy {track.energy ?? 50}%</span></div>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={() => onFavorite(track)} aria-label={track.favorite ? "Remove favorite" : "Add favorite"} data-testid={`favorite-music-${track.id}`}>
        <Heart className={`h-4 w-4 ${track.favorite ? "fill-rose-400 text-rose-400" : "text-muted-foreground"}`} />
      </Button>
    </div>
    <div className="mt-3 flex items-center gap-3">
      <div className="flex h-8 flex-1 items-center gap-[2px] overflow-hidden" aria-label="Track waveform">
        {bars.map((bar, index) => <span key={index} className={`min-w-[2px] flex-1 rounded-full ${playing ? "bg-gold" : "bg-gold/50"}`} style={{ height: `${Math.max(12, Math.min(100, Number(bar) * 100))}%` }} />)}
      </div>
      <label className="flex w-24 items-center gap-2" title={`Preview volume ${volume}%`}><span className="sr-only">Preview volume</span><Music2 className="h-3.5 w-3.5 text-muted-foreground" /><input type="range" min="0" max="100" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); if (audio.current) audio.current.volume = next / 100; }} className="w-full accent-[hsl(var(--gold))]" /></label>
    </div>
    {confidence != null && <div className="mt-2 border-t border-border/60 pt-2">
      <div className="flex items-center justify-between text-xs"><span className="inline-flex text-gold" aria-label={`${Math.round(Number(track.rating) || 4)} stars`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`h-3 w-3 ${i < Math.round(Number(track.rating) || 4) ? "fill-current" : "opacity-30"}`} />)}</span><span className="font-mono-ui">{confidence}% match</span></div>
      <div className="mt-1 flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{track.reason || "A royalty-free match for your scene."}</p>
      <Button size="sm" variant={selected ? "secondary" : "outline"} className="h-8 rounded-full px-3" onClick={() => onUse(track)} data-testid={`use-recommended-${track.id}`}>{selected ? "Selected" : "Use This"}</Button>
      </div>
    </div>}
    {confidence == null && <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2"><span className="text-[11px] text-muted-foreground">★ {Number(track.rating || 0).toFixed(1)} · {Number(track.times_used || 0)} uses</span><Button size="sm" variant={selected ? "secondary" : "outline"} className="h-8 rounded-full px-3" onClick={() => onUse(track)} data-testid={`use-library-${track.id}`}>{selected ? "Selected" : "Use this music"}</Button></div>}
  </article>;
}

export default function StoryMusicPicker({ mediaId, onGenerate, generating = false, disabled = false, initialMusicMode, initialTrackId }) {
  const queryClient = useQueryClient();
  const initialMode = initialMusicMode === "AI Recommended" || initialMusicMode === "ai_recommended"
    ? "ai_recommended"
    : initialMusicMode === "Manual Selection" || initialMusicMode === "manual"
      ? "browse"
      : "no_music";
  const [mode, setMode] = useState(initialMode);
  const [selectedId, setSelectedId] = useState(initialTrackId || "");
  const [previewId, setPreviewId] = useState("");
  const [filters, setFilters] = useState({ mood: "", genre: "", duration: "", project_stage: "", room_type: "", q: "", favorites: false, recently_used: false });
  const params = useMemo(() => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value !== "" && value !== false) search.set(key, String(value)); });
    return search.toString();
  }, [filters]);
  const recommendationsQuery = useQuery({
    queryKey: ["story-music-recommendations", mediaId],
    queryFn: () => fetcher(`/posts/story-music/recommendations/${mediaId}`),
    enabled: !!mediaId && mode === "ai_recommended",
  });
  const libraryQuery = useQuery({
    queryKey: ["story-music", params],
    queryFn: () => fetcher(`/posts/story-music${params ? `?${params}` : ""}`),
    enabled: mode === "browse",
  });
  const selectedTrack = [...(recommendationsQuery.data || []), ...(libraryQuery.data || [])].find((track) => track.id === selectedId);
  const chooseMode = (nextMode) => { setMode(nextMode); setSelectedId(""); setPreviewId(""); };
  const favorite = async (track) => {
    try {
      await api.post(`/posts/story-music/${track.id}/favorite`);
      await queryClient.invalidateQueries({ queryKey: ["story-music"] });
      await queryClient.invalidateQueries({ queryKey: ["story-music-recommendations", mediaId] });
    } catch (error) { toast.error(errMsg(error)); }
  };
  const useRecommended = (track) => { setSelectedId(track.id); setMode("ai_recommended"); };
  const useLibraryTrack = (track) => { setSelectedId(track.id); setMode("browse"); };
  const generate = () => {
    if (mode === "ai_recommended" && !selectedId) return;
    if (mode === "browse" && !selectedId) return;
    onGenerate({
      music_mode: mode === "no_music" ? "no_music" : mode === "ai_recommended" ? "ai_recommended" : "manual",
      music_track_id: mode === "no_music" ? null : selectedId,
    });
  };
  const selectedText = mode === "no_music" ? "Silent story · no audio" : selectedTrack ? `${selectedTrack.title} · ${mode === "ai_recommended" ? "AI recommendation" : "Library selection"}` : "Choose a track to continue";

  return <section className="rounded-2xl border border-border bg-card/70 p-4 sm:p-5" data-testid="story-options">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><div className="eyebrow">Story Options</div><h2 className="mt-1 font-display text-xl">Story Music</h2></div><span className="text-xs text-muted-foreground">Music is never added unless you choose it.</span></div>
    <RadioGroup value={mode} onValueChange={chooseMode} className="mt-4 grid gap-2 sm:grid-cols-3">
      <label htmlFor={`music-none-${mediaId}`} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${mode === "no_music" ? "border-gold/60 bg-gold/5" : "border-border/70"}`}><RadioGroupItem id={`music-none-${mediaId}`} value="no_music" className="mt-0.5" /><span><b className="block text-sm">No Music</b><span className="text-xs text-muted-foreground">Default · silent story</span></span></label>
      <label htmlFor={`music-ai-${mediaId}`} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${mode === "ai_recommended" ? "border-gold/60 bg-gold/5" : "border-border/70"}`}><RadioGroupItem id={`music-ai-${mediaId}`} value="ai_recommended" className="mt-0.5" /><span><b className="block text-sm">AI Recommended</b><span className="text-xs text-muted-foreground">Top matches for this scene</span></span></label>
      <label htmlFor={`music-browse-${mediaId}`} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${mode === "browse" ? "border-gold/60 bg-gold/5" : "border-border/70"}`}><RadioGroupItem id={`music-browse-${mediaId}`} value="browse" className="mt-0.5" /><span><b className="block text-sm">Search Music</b><span className="text-xs text-muted-foreground">Search similar royalty-free tracks</span></span></label>
    </RadioGroup>

    {mode === "ai_recommended" && <div className="mt-4 space-y-2" data-testid="ai-music-recommendations">
      <div className="flex items-center justify-between gap-2"><div className="text-sm font-medium">Top 5 scene matches</div>{recommendationsQuery.isFetching && <Spinner />}</div>
      {recommendationsQuery.isError && <p className="rounded-lg border border-rose-500/30 p-3 text-sm text-rose-400">Could not load music recommendations.</p>}
      {(recommendationsQuery.data || []).map((track) => <TrackCard key={track.id} track={track} confidence={track.confidence} selected={selectedId === track.id} onUse={useRecommended} onFavorite={favorite} previewId={previewId} onPreviewChange={setPreviewId} />)}
      {!recommendationsQuery.isFetching && !recommendationsQuery.isError && !recommendationsQuery.data?.length && <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">No royalty-free recommendations are available yet.</p>}
    </div>}

    {mode === "browse" && <div className="mt-4 space-y-3" data-testid="music-library-browser">
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={filters.q} onChange={(event) => setFilters((old) => ({ ...old, q: event.target.value }))} placeholder="Search a mood, style, or feeling…" className="rounded-xl pl-9" data-testid="music-search" /></div>
      {!!filters.q.trim() && <p className="text-xs text-muted-foreground">Showing similar royalty-free tracks.</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Select value={filters.mood || "all"} onValueChange={(value) => setFilters((old) => ({ ...old, mood: value === "all" ? "" : value }))}><SelectTrigger className="rounded-xl" data-testid="music-filter-mood"><SelectValue placeholder="Mood" /></SelectTrigger><SelectContent><SelectItem value="all">All moods</SelectItem>{MOODS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
        <Select value={filters.genre || "all"} onValueChange={(value) => setFilters((old) => ({ ...old, genre: value === "all" ? "" : value }))}><SelectTrigger className="rounded-xl" data-testid="music-filter-genre"><SelectValue placeholder="Genre" /></SelectTrigger><SelectContent><SelectItem value="all">All genres</SelectItem>{GENRES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
        <Select value={filters.duration || "all"} onValueChange={(value) => setFilters((old) => ({ ...old, duration: value === "all" ? "" : value }))}><SelectTrigger className="rounded-xl" data-testid="music-filter-duration"><SelectValue placeholder="Duration" /></SelectTrigger><SelectContent><SelectItem value="all">Any duration</SelectItem>{DURATIONS.map((item) => <SelectItem key={item} value={String(item)}>{item} sec</SelectItem>)}</SelectContent></Select>
        <Select value={filters.project_stage || "all"} onValueChange={(value) => setFilters((old) => ({ ...old, project_stage: value === "all" ? "" : value }))}><SelectTrigger className="rounded-xl" data-testid="music-filter-stage"><SelectValue placeholder="Project stage" /></SelectTrigger><SelectContent><SelectItem value="all">All project tags</SelectItem>{PROJECT_STAGES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
        <Select value={filters.room_type || "all"} onValueChange={(value) => setFilters((old) => ({ ...old, room_type: value === "all" ? "" : value }))}><SelectTrigger className="rounded-xl" data-testid="music-filter-room"><SelectValue placeholder="Room" /></SelectTrigger><SelectContent><SelectItem value="all">All rooms</SelectItem>{ROOMS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
        <div className="flex gap-1"><Button size="sm" variant={filters.favorites ? "secondary" : "outline"} className="flex-1 rounded-xl px-2" onClick={() => setFilters((old) => ({ ...old, favorites: !old.favorites, recently_used: false }))}><Heart className={`mr-1 h-3.5 w-3.5 ${filters.favorites ? "fill-rose-400 text-rose-400" : ""}`} />Favorites</Button><Button size="sm" variant={filters.recently_used ? "secondary" : "outline"} className="flex-1 rounded-xl px-2" onClick={() => setFilters((old) => ({ ...old, recently_used: !old.recently_used, favorites: false }))}>Recent</Button></div>
      </div>
      {libraryQuery.isLoading ? <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Spinner />Loading royalty-free tracks…</div>
        : libraryQuery.isError ? <p className="rounded-lg border border-rose-500/30 p-3 text-sm text-rose-400">Could not load the music library.</p>
          : <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">{(libraryQuery.data || []).map((track) => <TrackCard key={track.id} track={track} selected={selectedId === track.id} onUse={useLibraryTrack} onFavorite={favorite} previewId={previewId} onPreviewChange={setPreviewId} />)}{!libraryQuery.data?.length && <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No tracks match those filters.</p>}</div>}
    </div>}

    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4"><div className="min-w-0"><div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Selected audio</div><div className="mt-1 truncate text-sm">{selectedText}</div></div>
      <Button className="rounded-full px-5" onClick={generate} disabled={disabled || generating || ((mode === "ai_recommended" || mode === "browse") && !selectedId)} data-testid="generate-story-btn">
        {generating ? <><Spinner className="mr-2" />Generating story…</> : <><Sparkles className="mr-2 h-4 w-4" />Generate Story</>}
      </Button>
    </div>
  </section>;
}
