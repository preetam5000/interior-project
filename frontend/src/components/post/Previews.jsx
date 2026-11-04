import { useState } from "react";
import { Reorder } from "framer-motion";
import { ChevronLeft, ChevronRight, GripVertical, Heart, MessageCircle, Send, Bookmark, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function BeforeAfter({ before, after, afterLabel = "ENHANCED" }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative aspect-[4/5] w-full select-none overflow-hidden rounded-2xl bg-muted" data-testid="before-after-slider">
      <img src={after} alt={afterLabel[0] + afterLabel.slice(1).toLowerCase()} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before} alt="Original" className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="absolute inset-y-0 w-px bg-white/90 shadow-[0_0_12px_rgba(0,0,0,.5)]" style={{ left: `${pos}%` }}>
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-black/50 px-2 py-1 font-mono-ui text-[10px] text-white backdrop-blur">⟷</div>
      </div>
      <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 font-mono-ui text-[10px] text-white">ORIGINAL</span>
      <span className="absolute right-3 top-3 rounded-full bg-gold px-2 py-0.5 font-mono-ui text-[10px] text-black">{afterLabel}</span>
      <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(+e.target.value)} data-testid="before-after-range"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" aria-label={`Compare original and ${afterLabel.toLowerCase()}`} />
    </div>
  );
}

function PhoneHeader({ brand }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-amber-400 to-rose-500 p-[2px]"><div className="h-full w-full rounded-full bg-black" /></div>
      <span className="text-xs font-semibold text-white">{brand?.toLowerCase().replace(/\s+/g, "") || "studio"}</span>
    </div>
  );
}

function Caption({ post, brand }) {
  return (
    <div className="space-y-1 px-3 pb-4 text-[11px] leading-relaxed text-white/90">
      <div className="flex gap-3 py-2 text-white"><Heart className="h-5 w-5" /><MessageCircle className="h-5 w-5" /><Send className="h-5 w-5" /><Bookmark className="ml-auto h-5 w-5" /></div>
      <p className="line-clamp-4"><b>{brand?.toLowerCase().replace(/\s+/g, "")} </b>{post.caption}</p>
      <p className="line-clamp-2 text-sky-300">{(post.hashtags || []).map((h) => `#${h}`).join(" ")}</p>
    </div>
  );
}

export function FeedPreview({ post, brand, slides }) {
  const [i, setI] = useState(0);
  const list = slides.length ? slides : [null];
  const url = list[i]?.urls?.portrait || list[i]?.urls?.thumbnail;
  return (
    <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[28px] border border-border bg-black" data-testid="feed-preview">
      <PhoneHeader brand={brand} />
      <div className="relative aspect-[4/5] bg-zinc-900">
        {url && <img src={url} alt={post.alt_text} className="h-full w-full object-cover" />}
        {list.length > 1 && (<>
          <button onClick={() => setI(Math.max(0, i - 1))} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1" data-testid="carousel-prev-btn"><ChevronLeft className="h-4 w-4 text-black" /></button>
          <button onClick={() => setI(Math.min(list.length - 1, i + 1))} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1" data-testid="carousel-next-btn"><ChevronRight className="h-4 w-4 text-black" /></button>
          <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white">{i + 1}/{list.length}</span>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">{list.map((_, k) => <span key={k} className={cn("h-1.5 w-1.5 rounded-full", k === i ? "bg-sky-400" : "bg-white/50")} />)}</div>
        </>)}
      </div>
      <Caption post={post} brand={brand} />
    </div>
  );
}

export function StoryPreview({ post, brand, slides }) {
  const url = slides[0]?.urls?.story || slides[0]?.urls?.thumbnail;
  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-[28px] border border-border bg-black" data-testid="story-preview">
      {post.story_video_url ? <video src={post.story_video_url} controls playsInline className="h-full w-full object-cover" data-testid="story-video-preview" />
        : url && <img src={url} alt="" className="kenburns h-full w-full object-cover" />}
      <div className="absolute inset-x-3 top-3 h-0.5 rounded bg-white/40"><div className="h-full w-1/3 rounded bg-white" /></div>
      <div className="absolute left-0 top-4"><PhoneHeader brand={brand} /></div>
      {post.story_text && <div className="absolute inset-x-6 bottom-24 rounded-xl bg-black/40 px-4 py-3 text-center font-display text-xl text-white backdrop-blur-sm">{post.story_text}</div>}
    </div>
  );
}

export function ReelPreview({ post, slides, brand }) {
  const video = post.reel_video_url || slides[0]?.urls?.video;
  const poster = slides[0]?.urls?.story || slides[0]?.urls?.thumbnail;
  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-[28px] border border-border bg-black" data-testid="reel-preview">
      {video ? <video src={video} poster={poster} controls loop playsInline className="h-full w-full object-cover" data-testid="reel-video" />
        : poster && <img src={poster} alt="" className="kenburns h-full w-full object-cover opacity-70" />}
      {!video && <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-xl bg-black/60 p-4 text-center text-xs text-white backdrop-blur">No reel video yet. Use “Generate slideshow reel” to render a Ken Burns reel from these images.</div>}
      <div className="pointer-events-none absolute left-3 right-3 top-14 rounded-lg bg-black/40 p-2 text-[11px] text-white backdrop-blur-sm">
        <b>{brand}</b><p className="line-clamp-2 text-white/80">{post.caption}</p>
        {post.music_suggestion && <p className="mt-1 flex items-center gap-1 truncate text-white/70"><Music2 className="h-3 w-3" />{post.music_suggestion}</p>}
      </div>
    </div>
  );
}

export function SlideReorder({ slides, onChange, disabled }) {
  return (
    <Reorder.Group axis="y" values={slides} onReorder={onChange} className="space-y-2" data-testid="slide-reorder-list">
      {slides.map((m, i) => (
        <Reorder.Item key={m.id} value={m} dragListener={!disabled} data-testid={`slide-item-${i}`}
          className="flex cursor-grab items-center gap-3 rounded-xl border border-border bg-card p-2 active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono-ui text-[10px] text-gold">{String(i + 1).padStart(2, "0")}</span>
          <img src={m.urls?.square || m.urls?.thumbnail} alt="" className="h-12 w-12 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{m.filename}</div>
            <div className="truncate text-[11px] text-muted-foreground">{m.analysis?.room_type} · {m.analysis?.design_style}</div>
          </div>
          {i === 0 && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] text-gold">Cover</span>}
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}
