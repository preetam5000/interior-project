import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Send, X, Eye, Inbox, Layers, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetcher, can } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, TypeBadge, StatusBadge, EmptyState, SkeletonGrid, Spinner } from "@/components/common/Bits";
import { coverUrl, usePostActions } from "@/components/post/QuickApprove";
import GPTEnhancementModal from "@/components/gpt-enhancement/GPTEnhancementModal";

const TABS = [
  { v: "pending", l: "Pending" }, { v: "approved", l: "Approved" }, { v: "scheduled", l: "Scheduled" },
  { v: "published", l: "Published" }, { v: "failed", l: "Failed" }, { v: "rejected", l: "Rejected" },
];

function PostCard({ p, i }) {
  const { user } = useAuth();
  const { approve, reject, busy } = usePostActions();
  const slides = p.media?.length || 1;
  const imageMedia = p.media?.find((media) => media.kind === "image");
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
      className="panel panel-hover group overflow-hidden" data-testid={`approval-card-${p.id}`}>
      <Link to={`/approvals/${p.id}`} className="relative block aspect-[4/5] overflow-hidden bg-muted">
        <img src={coverUrl(p)} alt={p.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
        <div className="absolute left-4 top-4 flex gap-2 rounded-full bg-black/60 backdrop-blur"><TypeBadge type={p.type} /></div>
        {slides > 1 && <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white"><Layers className="h-3 w-3" />{slides}</span>}
        <div className="absolute bottom-4 left-4 right-4 text-white">
          <div className="font-mono-ui text-[10px] uppercase tracking-widest text-white/60">{p.project_name}</div>
          <div className="font-display text-2xl leading-tight">{p.title}</div>
        </div>
      </Link>
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <StatusBadge status={p.status} />
          <span className="font-mono-ui text-xs text-gold" data-testid={`approval-confidence-${p.id}`}>{Math.round((p.ai?.confidence || 0) * 100)}% confidence</span>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{p.ai?.reason}</p>
        {p.error && <p className={`line-clamp-2 text-xs ${p.status === "approved" ? "text-amber-600 dark:text-amber-400" : "text-rose-400"}`}>{p.error}</p>}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button asChild variant="outline" size="sm" className="w-full rounded-full" data-testid={`approval-review-${p.id}`}><Link to={`/approvals/${p.id}`}><Eye className="mr-1 h-3.5 w-3.5" />Review</Link></Button>
          {can(user, "upload") && imageMedia && (
            <GPTEnhancementModal media={imageMedia} imageUrl={coverUrl({ ...p, media: [imageMedia] })} />
          )}
          {can(user, "upload") && imageMedia && (
            <Button asChild variant="outline" size="sm" className="w-full rounded-full" data-testid={`approval-template-${p.id}`}>
              <Link to={`/approvals/${p.id}`} state={{ openTemplateEditor: true }}><Sparkles className="mr-1 h-3.5 w-3.5" />Template</Link>
            </Button>
          )}
          {can(user, "approve") && ["pending", "approved", "failed"].includes(p.status) && (
            <div className={`flex gap-2 ${p.status === "pending" ? "col-span-2" : ""}`}>
              {p.status === "pending" && <Button variant="ghost" size="icon" onClick={() => reject(p.id)} data-testid={`approval-reject-${p.id}`}><X className="h-4 w-4" /></Button>}
              <Button size="sm" className="w-full min-w-0 flex-1 rounded-full" disabled={!!busy} data-testid={`approval-approve-${p.id}`}
                onClick={() => approve(p.id)}>
                {busy === `approve-${p.id}` ? <Spinner /> : <><Send className="mr-1 h-3.5 w-3.5" />{p.status === "pending" ? "Approve & Post" : "Retry publish"}</>}
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function Approvals() {
  const [tab, setTab] = useState("pending");
  const { data, isLoading } = useQuery({ queryKey: ["posts", tab], queryFn: () => fetcher(`/posts?status=${tab}${tab === "published" ? "" : ""}`), refetchInterval: 8000 });
  return (
    <div>
      <PageHeader overline="Human in the loop" title="Approval queue" subtitle="AI has planned every post. Review, tweak if you like, and publish with one click." />
      <Tabs value={tab} onValueChange={setTab} className="mb-8">
        <TabsList className="h-auto flex-wrap rounded-full p-1" data-testid="approval-tabs">
          {TABS.map((t) => <TabsTrigger key={t.v} value={t.v} className="rounded-full px-4" data-testid={`approval-tab-${t.v}`}>{t.l}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      {isLoading ? <SkeletonGrid /> : (data || []).length === 0 ? (
        <EmptyState icon={Inbox} title="Nothing here" testId="approvals-empty" text={tab === "pending" ? "Upload project media and AI-generated posts will land here for approval." : `No ${tab} posts yet.`}
          action={tab === "pending" && <Button asChild className="rounded-full"><Link to="/upload">Upload media</Link></Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{data.map((p, i) => <PostCard key={p.id} p={p} i={i} />)}</div>
      )}
    </div>
  );
}
