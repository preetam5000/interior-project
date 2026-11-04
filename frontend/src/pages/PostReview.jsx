import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Send, Check, CalendarClock, X, Wand2, ImageIcon, Replace, Clapperboard, Sparkles, Save, ExternalLink, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errMsg, fetcher, can, formatIST, formatISTScheduleAction } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { TypeBadge, StatusBadge, ConfidenceRing, Spinner, FullLoader } from "@/components/common/Bits";
import { BeforeAfter, FeedPreview, StoryPreview, ReelPreview, SlideReorder } from "@/components/post/Previews";
import { HashtagEditor, ImageEditDialog, ReplaceMediaDialog, ScheduleDialog, RejectDialog } from "@/components/post/Editors";
import TemplateEditor from "@/components/post/TemplateEditor";
import StoryMusicPicker from "@/components/post/StoryMusicPicker";
import { usePostActions } from "@/components/post/QuickApprove";

const TONES = ["Architectural Digest editorial", "Warm & personal", "Minimal & poetic", "Bold & aspirational", "Informative behind-the-scenes"];

function AIInsight({ post, media }) {
  const a = media?.analysis || {};
  const q = media?.quality || {};
  const rows = [["Room", a.room_type], ["Stage", a.project_stage], ["Style", a.design_style], ["Aesthetic", a.aesthetic_score != null ? `${a.aesthetic_score}/10` : "—"],
  ["Crop", post.ai?.recommended_crop], ["Priority", post.ai?.priority], ["Sharpness", q.sharpness], ["Brightness", q.brightness], ["Exposure", q.exposure], ["Noise", q.noise]];
  return (
    <div className="panel relative overflow-hidden p-6 gold-glow" data-testid="ai-insight-card">
      <div className="flex items-start gap-4">
        <ConfidenceRing value={post.ai?.confidence} />
        <div className="min-w-0 flex-1">
          <div className="eyebrow">AI recommendation</div>
          <div className="mt-1 flex items-center gap-2"><span className="text-sm">Suggested:</span><TypeBadge type={post.ai?.suggested_type} testId="ai-suggested-type" /></div>
          <p className="mt-2 text-sm text-muted-foreground" data-testid="ai-reason">{post.ai?.reason}</p>
          {post.ai?.editing_style && <p className="mt-2 text-xs"><span className="text-muted-foreground">Editing style · </span><span data-testid="ai-editing-style">{post.ai.editing_style}</span></p>}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border pt-4 font-mono-ui text-[11px] sm:grid-cols-5">
        {rows.map(([k, v]) => <div key={k}><div className="text-muted-foreground">{k}</div><div className="truncate">{v ?? "—"}</div></div>)}
      </div>
    </div>
  );
}

function ActionBar({ post, onSchedule, onReject }) {
  const { approve, publish, busy } = usePostActions();
  const pending = post.status === "pending";
  return (
    <div className="glass sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-2xl p-3 shadow-2xl" data-testid="post-action-bar">
      {pending && <Button variant="ghost" className="rounded-full text-rose-400" onClick={onReject} data-testid="reject-btn"><X className="mr-1 h-4 w-4" />Reject</Button>}
      <div className="ml-auto flex flex-wrap gap-2">
        {["pending", "approved", "failed", "scheduled"].includes(post.status) && <Button variant="outline" className="rounded-full" onClick={onSchedule} data-testid="schedule-btn"><CalendarClock className="mr-1 h-4 w-4" />{post.status === "scheduled" ? "Reschedule" : "Schedule"}</Button>}
        {pending && <Button variant="outline" className="rounded-full" disabled={!!busy} onClick={() => approve(post.id, false)} data-testid="approve-only-btn"><Check className="mr-1 h-4 w-4" />Approve only</Button>}
        {pending && <Button className="rounded-full px-6" disabled={!!busy} onClick={() => approve(post.id, true)} data-testid="approve-publish-btn">{busy ? <Spinner /> : <><Send className="mr-1 h-4 w-4" />Approve & Publish</>}</Button>}
        {["approved", "failed", "scheduled"].includes(post.status) && <Button className="rounded-full px-6" disabled={!!busy} onClick={() => publish(post.id)} data-testid="publish-now-btn">{busy ? <Spinner /> : <><Send className="mr-1 h-4 w-4" />Publish now</>}</Button>}
        {post.permalink && <Button asChild variant="outline" className="rounded-full"><a href={post.permalink} target="_blank" rel="noreferrer" data-testid="permalink-btn"><ExternalLink className="mr-1 h-4 w-4" />View on Instagram</a></Button>}
      </div>
    </div>
  );
}

function CopyEditor({ post, draft, setDraft, editable, onSave, saving }) {
  const qc = useQueryClient();
  const [tone, setTone] = useState(TONES[0]);
  const [instr, setInstr] = useState("");
  const [regen, setRegen] = useState(false);
  const regenerate = async () => {
    setRegen(true);
    try {
      const { data } = await api.post(`/posts/${post.id}/regenerate-caption`, { tone, instructions: instr });
      setDraft({ ...draft, caption: data.caption, hashtags: data.hashtags, story_text: data.story_text, alt_text: data.alt_text });
      qc.invalidateQueries({ queryKey: ["post", post.id] });
      toast.success("New caption written by AI");
    } catch (e) { toast.error(errMsg(e)); } finally { setRegen(false); }
  };
  const field = (k) => ({ value: draft[k] || "", disabled: !editable, onChange: (e) => setDraft({ ...draft, [k]: e.target.value }) });
  return (
    <div className="panel space-y-5 p-6" data-testid="copy-editor">
      <div className="flex items-center justify-between"><div className="eyebrow">Caption & copy</div>
        {editable && <Button size="sm" className="rounded-full" onClick={onSave} disabled={saving} data-testid="save-copy-btn">{saving ? <Spinner /> : <><Save className="mr-1 h-3.5 w-3.5" />Save</>}</Button>}</div>
      <Input {...field("title")} className="rounded-xl font-display text-xl" data-testid="title-input" />
      <Textarea {...field("caption")} rows={7} className="rounded-xl text-sm leading-relaxed" data-testid="caption-editor-input" />
      {editable && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-accent/30 p-3 sm:flex-row">
          <Select value={tone} onValueChange={setTone}><SelectTrigger className="rounded-xl sm:w-56" data-testid="tone-select"><SelectValue /></SelectTrigger>
            <SelectContent>{TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          <Input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Extra instruction (e.g. mention teak wood)" className="rounded-xl" data-testid="regen-instructions-input" />
          <Button variant="outline" className="rounded-xl" onClick={regenerate} disabled={regen} data-testid="regenerate-caption-btn">{regen ? <Spinner /> : <><Sparkles className="mr-1 h-4 w-4 text-gold" />Rewrite</>}</Button>
        </div>
      )}
      <div><div className="mb-2 text-xs text-muted-foreground">Hashtags ({draft.hashtags?.length || 0})</div>
        <HashtagEditor tags={draft.hashtags || []} onChange={(h) => setDraft({ ...draft, hashtags: h })} disabled={!editable} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><div className="mb-1 text-xs text-muted-foreground">Story text</div><Input {...field("story_text")} className="rounded-xl" data-testid="story-text-input" /></div>
        <div><div className="mb-1 text-xs text-muted-foreground">Alt text</div><Input {...field("alt_text")} className="rounded-xl" data-testid="alt-text-input" /></div>
      </div>
      <div className="grid gap-4 border-t border-border pt-4 text-xs sm:grid-cols-2">
        <div><div className="eyebrow mb-1">Editorial description</div><p className="text-muted-foreground" data-testid="editorial-description">{post.editorial_description}</p></div>
        <div><div className="eyebrow mb-1">SEO description</div><p className="text-muted-foreground" data-testid="seo-description">{post.seo_description}</p></div>
      </div>
    </div>
  );
}

export default function PostReview() {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const editable = can(user, "approve");
  const { data: post, isLoading, refetch } = useQuery({
    queryKey: ["post", id], queryFn: () => fetcher(`/posts/${id}`),
    refetchInterval: (q) => (["publishing"].includes(q.state.data?.status) || q.state.data?.reel_status === "rendering" ? 3000 : false)
  });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => fetcher("/settings") });
  const { reject, run, busy } = usePostActions();
  const [draft, setDraft] = useState({});
  const [slides, setSlides] = useState([]);
  const [active, setActive] = useState(0);
  const [dlg, setDlg] = useState(null);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState("compare");

  useEffect(() => {
    if (location.state?.openTemplateEditor) setTemplateEditorOpen(true);
  }, [location.key, location.state]);

  useEffect(() => {
    if (!post) return;
    setDraft({ title: post.title, caption: post.caption, hashtags: post.hashtags, story_text: post.story_text, alt_text: post.alt_text });
    setSlides(post.media || []);
    setPreview(post.type === "reel" ? "reel" : post.type === "story" ? "story" : "compare");
  }, [post?.id, post?.updated_at, post?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !post) return <FullLoader />;
  const media = slides[active] || slides[0];
  const templateUrl = media?.urls?.template;
  const brand = settings?.brand_name;
  const refresh = () => qc.invalidateQueries({ queryKey: ["post", id] });
  const patch = async (body, msg) => {
    try { await api.patch(`/posts/${id}`, body); refresh(); qc.invalidateQueries({ queryKey: ["posts"] }); if (msg) toast.success(msg); } catch (e) { toast.error(errMsg(e)); }
  };
  const save = async () => { setSaving(true); await patch(draft, "Changes saved"); setSaving(false); };
  const reorder = (list) => { setSlides(list); clearTimeout(window.__reo); window.__reo = setTimeout(() => patch({ media_ids: list.map((m) => m.id) }, "Slide order saved"), 600); };
  const applyEdit = async (adj) => { await run("edit", () => api.post(`/media/${media.id}/edit`, adj), "Image re-edited, crops regenerated"); setDlg(null); refresh(); };
  const replace = async (m) => { await run("replace", () => api.post(`/posts/${id}/replace-media`, { old_media_id: media.id, new_media_id: m.id }), "Media replaced"); setDlg(null); };
  const genReel = () => run("reel", () => api.post(`/posts/${id}/generate-reel`), "Rendering slideshow reel… this takes ~30-60s");
  const generateStory = async (selection) => {
    const result = await run("story", () => api.post(`/media/${media.id}/generate-story`, selection), "Story generated");
    if (result) {
      await qc.invalidateQueries({ queryKey: ["post", id] });
      await qc.invalidateQueries({ queryKey: ["posts"] });
      await refetch();
    }
  };

  return (
    <div className="pb-6" data-testid="post-review-page">
      <Link to="/approvals" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="back-to-approvals"><ArrowLeft className="h-4 w-4" />Approval queue</Link>
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between fade-up">
        <div>
          <div className="eyebrow mb-2">{post.project_name}</div>
          <h1 className="font-display text-4xl sm:text-5xl" data-testid="post-title">{post.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2"><TypeBadge type={post.type} testId="post-type-badge" /><StatusBadge status={post.status} testId="post-status-badge" />
            {post.scheduled_at && post.status === "scheduled" && <span className="font-mono-ui text-xs text-muted-foreground">→ {formatIST(post.scheduled_at)}</span>}</div>
          {post.error && <p className={`mt-3 max-w-2xl rounded-lg border px-3 py-2 text-sm ${post.status === "approved" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-rose-500/30 bg-rose-500/10 text-rose-400"}`} data-testid="post-error">{post.error}</p>}
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Content type</span>
            <Select value={post.type} onValueChange={(t) => patch({ type: t }, `Changed to ${t}`)}>
              <SelectTrigger className="w-40 rounded-full" data-testid="change-type-select"><SelectValue /></SelectTrigger>
              <SelectContent>{["feed", "story", "carousel", "reel"].map((t) => <SelectItem key={t} value={t} data-testid={`type-option-${t}`}>{t[0].toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-5">
          <Tabs value={preview} onValueChange={setPreview}>
            <TabsList className="h-auto w-full flex-wrap rounded-full p-1" data-testid="preview-tabs">
              {[["compare", "Original / Edited"], ["feed", slides.length > 1 ? "Carousel" : "Feed"], ["story", "Story"], ["reel", "Reel"]].map(([v, l]) =>
                <TabsTrigger key={v} value={v} className="flex-1 rounded-full text-xs" data-testid={`preview-tab-${v}`}>{l}</TabsTrigger>)}
              <TabsTrigger value="template" disabled={!templateUrl} className="flex-1 rounded-full text-xs" data-testid="preview-tab-template">Template</TabsTrigger>
            </TabsList>
            {!templateUrl && <p className="mt-2 text-center text-xs text-muted-foreground" data-testid="no-template-generated">No template generated</p>}
            <TabsContent value="compare" className="mt-4">
              {media?.kind === "video" ? <ReelPreview post={post} slides={slides} brand={brand} /> : <BeforeAfter before={media?.urls?.original} after={media?.urls?.portrait || media?.urls?.enhanced} />}
              <p className="mt-2 text-center font-mono-ui text-[10px] text-muted-foreground">Enhanced by {media?.enhanced_by === "cloudinary" ? "Cloudinary auto-enhance" : "Interior Social AI editor"} · 1080×1350 / 1080×1080 / 1080×1920</p>
            </TabsContent>
            <TabsContent value="template" className="mt-4">
              {templateUrl && <BeforeAfter before={media?.urls?.original} after={templateUrl} afterLabel="TEMPLATE" />}
            </TabsContent>
            <TabsContent value="feed" className="mt-4"><FeedPreview post={{ ...post, ...draft }} brand={brand} slides={slides} /></TabsContent>
            <TabsContent value="story" className="mt-4"><StoryPreview post={{ ...post, ...draft }} brand={brand} slides={slides} /></TabsContent>
            <TabsContent value="reel" className="mt-4"><ReelPreview post={{ ...post, ...draft }} brand={brand} slides={slides} /></TabsContent>
          </Tabs>
          {slides.length > 1 && (
            <div className="flex gap-2 overflow-x-auto scroll-thin pb-1">
              {slides.map((m, i) => <button key={m.id} onClick={() => setActive(i)} data-testid={`slide-thumb-${i}`} className={`shrink-0 overflow-hidden rounded-lg border-2 ${i === active ? "border-gold" : "border-transparent"}`}><img src={m.urls?.square || m.urls?.thumbnail} alt="" className="h-14 w-14 object-cover" /></button>)}
            </div>
          )}
          {editable && media?.kind === "image" && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setDlg("edit")} data-testid="edit-image-btn"><ImageIcon className="mr-1 h-4 w-4" />Edit image</Button>
              <Button variant="outline" className="rounded-xl" onClick={() => setDlg("replace")} data-testid="replace-media-btn"><Replace className="mr-1 h-4 w-4" />Replace media</Button>
              <Button variant="outline" className="col-span-2 rounded-xl" onClick={genReel} disabled={post.reel_status === "rendering" || busy === "reel"} data-testid="generate-reel-btn">
                {post.reel_status === "rendering" ? <><Spinner className="mr-2" />Rendering Ken Burns reel…</> : <><Clapperboard className="mr-1 h-4 w-4" />Generate slideshow reel (Ken Burns + fade)</>}
              </Button>
            </div>
          )}
          {media?.kind === "image" && can(user, "upload") && (
            <div className="flex flex-wrap gap-2">
              <TemplateEditor
                media={media}
                open={templateEditorOpen}
                onOpenChange={setTemplateEditorOpen}
                onApplied={async (updatedMedia) => {
                  setSlides((current) => current.map((item) => item.id === updatedMedia.id ? updatedMedia : item));
                  await qc.invalidateQueries({ queryKey: ["post", id] });
                  await qc.invalidateQueries({ queryKey: ["posts"] });
                }}
              />
            </div>
          )}
        </div>

        <div className="space-y-6 lg:col-span-7">
          <AIInsight post={post} media={media} />
          {post.type === "story" && editable && media?.kind === "image" && <StoryMusicPicker mediaId={media.id} onGenerate={generateStory} generating={busy === "story"} disabled={!!busy} initialMusicMode={post.music_mode} initialTrackId={post.music_track_id || post.music_selection?.track_id} />}
          {slides.length > 1 && (
            <div className="panel p-6" data-testid="carousel-builder">
              <div className="mb-3 flex items-center justify-between"><div className="eyebrow">Carousel slides · drag to reorder</div>
                {editable && <Button size="sm" variant="ghost" onClick={() => run("cc", () => api.post(`/posts/${id}/refresh-carousel-caption`), "Carousel caption refreshed")} data-testid="refresh-carousel-caption-btn"><Wand2 className="mr-1 h-3.5 w-3.5 text-gold" />Rewrite for carousel</Button>}</div>
              <SlideReorder slides={slides} onChange={reorder} disabled={!editable} />
            </div>
          )}
          <CopyEditor post={post} draft={draft} setDraft={setDraft} editable={editable} onSave={save} saving={saving} />
          {post.music_mode && <div className="panel p-6" data-testid="story-music-selection"><div className="eyebrow">Story Music</div><p className="mt-2 text-sm">{post.music_mode}{post.music_name ? ` · ${post.music_name}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">{post.music_duration_seconds || 0}s source track · {post.story_music_used_duration_seconds || 0}s used in {post.story_duration_seconds || 12}s story</p></div>}
          {post.music_suggestion && <div className="panel p-6"><div className="eyebrow">Suggested royalty-free music</div><p className="mt-2 text-sm" data-testid="music-suggestion">{post.music_suggestion}</p></div>}
          <div className="panel p-6" data-testid="post-history">
            <div className="eyebrow mb-3 flex items-center gap-2"><History className="h-3 w-3" />History</div>
            {(post.history || []).slice().reverse().map((h, i) => <div key={i} className="flex justify-between gap-4 border-b border-border/50 py-2 text-xs last:border-0"><span>{formatISTScheduleAction(h.action)}</span><span className="shrink-0 font-mono-ui text-muted-foreground">{h.by} · {formatIST(h.at)}</span></div>)}
          </div>
          {editable && <ActionBar post={post} onSchedule={() => setDlg("schedule")} onReject={() => setDlg("reject")} />}
        </div>
      </div>

      {dlg === "edit" && <ImageEditDialog open onOpenChange={() => setDlg(null)} media={media} onApply={applyEdit} busy={busy === "edit"} />}
      <ReplaceMediaDialog open={dlg === "replace"} onOpenChange={() => setDlg(null)} onPick={replace} exclude={post.media_ids} />
      <ScheduleDialog open={dlg === "schedule"} onOpenChange={() => setDlg(null)} busy={busy === "schedule"} scheduledAt={post.scheduled_at}
        onConfirm={async (iso) => { await run("schedule", () => api.post(`/posts/${id}/schedule`, { scheduled_at: iso }), "Scheduled"); setDlg(null); }} />
      <RejectDialog open={dlg === "reject"} onOpenChange={() => setDlg(null)} busy={busy === `reject-${id}`} onConfirm={async (r) => { await reject(id, r); setDlg(null); }} />
    </div>
  );
}
