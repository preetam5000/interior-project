import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Send, X, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errMsg, fetcher, can } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { TypeBadge, StatusBadge, Spinner, ConfidenceRing } from "@/components/common/Bits";

export const coverUrl = (post) => {
  const m = post.media?.[0];
  return m?.urls?.portrait || m?.urls?.enhanced || m?.urls?.thumbnail || m?.urls?.original;
};

export function usePostActions() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null);
  const refresh = () => ["posts", "stats", "post", "notifications", "activity", "media"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const { data } = await fn();
      if (data?.status === "published") toast.success("Published to Instagram", { description: data.permalink || data.title });
      else if (data?.error) toast.warning(data.error);
      else if (okMsg) toast.success(okMsg);
      refresh();
      return data;
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };
  return {
    busy,
    approve: (id, publish_now = true) => run(`approve-${id}`, () => api.post(`/posts/${id}/approve`, { publish_now }), "Approved"),
    reject: (id, reason = "") => run(`reject-${id}`, () => api.post(`/posts/${id}/reject`, { reason }), "Rejected"),
    publish: (id) => run(`publish-${id}`, () => api.post(`/posts/${id}/publish`)),
    run,
  };
}

export function QuickApproveList() {
  const { user } = useAuth();
  const { data = [] } = useQuery({ queryKey: ["posts", "pending"], queryFn: () => fetcher("/posts?status=pending&limit=5"), refetchInterval: 10000 });
  const { approve, reject, busy } = usePostActions();
  return (
    <div className="panel p-6" data-testid="quick-approve-list">
      <div className="mb-4 flex items-center justify-between">
        <div><div className="eyebrow">Awaiting your approval</div><h3 className="mt-1 font-display text-2xl">Ready to publish</h3></div>
        <Link to="/approvals" className="text-xs text-gold hover:underline" data-testid="view-all-approvals-link">View all</Link>
      </div>
      {data.length === 0 && <p className="py-6 text-sm text-muted-foreground">Nothing pending. New uploads will appear here automatically after AI processing.</p>}
      <div className="divide-y divide-border/60">
        {data.map((p) => (
          <div key={p.id} className="flex items-center gap-4 py-3" data-testid={`quick-item-${p.id}`}>
            <img src={coverUrl(p)} alt={p.title} className="h-16 w-14 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><TypeBadge type={p.type} /><StatusBadge status={p.status} /></div>
              <div className="mt-1 truncate font-medium">{p.title}</div>
              <div className="truncate text-xs text-muted-foreground">{p.ai?.reason}</div>
            </div>
            <div className="hidden sm:block"><ConfidenceRing value={p.ai?.confidence} size={44} /></div>
            <div className="flex shrink-0 gap-1">
              <Button size="icon" variant="ghost" asChild data-testid={`quick-review-${p.id}`}><Link to={`/approvals/${p.id}`}><Eye className="h-4 w-4" /></Link></Button>
              {can(user, "approve") && (<>
                <Button size="icon" variant="ghost" onClick={() => reject(p.id)} data-testid={`quick-reject-${p.id}`}><X className="h-4 w-4" /></Button>
                <Button size="sm" className="rounded-full" disabled={busy === `approve-${p.id}`} onClick={() => approve(p.id)} data-testid={`quick-approve-${p.id}`}>
                  {busy === `approve-${p.id}` ? <Spinner /> : <><Send className="mr-1 h-3.5 w-3.5" />Approve & Post</>}
                </Button>
              </>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
