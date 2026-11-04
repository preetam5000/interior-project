import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errMsg, fetcher, ROLE_LABEL, timeAgo } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/common/Bits";

const ROLES = Object.keys(ROLE_LABEL);

function RoleSelect({ value, onChange, testId, disabled }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-9 w-48 rounded-full" data-testid={testId}><SelectValue /></SelectTrigger>
      <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function AddUser({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", email: "", password: "", role: "designer" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await api.post("/users", f); toast.success("Team member added"); qc.invalidateQueries({ queryKey: ["users"] }); onOpenChange(false); setF({ name: "", email: "", password: "", role: "designer" }); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl" data-testid="add-user-dialog">
        <DialogHeader><DialogTitle className="font-display text-3xl">Add team member</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="rounded-xl" data-testid="add-user-name" />
          <Input placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="rounded-xl" data-testid="add-user-email" />
          <Input placeholder="Temporary password (min 6)" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="rounded-xl" data-testid="add-user-password" />
          <RoleSelect value={f.role} onChange={(r) => setF({ ...f, role: r })} testId="add-user-role" />
        </div>
        <DialogFooter><Button className="rounded-full" onClick={submit} disabled={busy} data-testid="add-user-submit">{busy ? <Spinner /> : "Add member"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UsersPanel() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({ queryKey: ["users"], queryFn: () => fetcher("/users") });
  const update = async (id, role) => { try { await api.patch(`/users/${id}`, { role }); toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["users"] }); } catch (e) { toast.error(errMsg(e)); } };
  const remove = async (id) => { try { await api.delete(`/users/${id}`); toast.success("Removed"); qc.invalidateQueries({ queryKey: ["users"] }); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="panel p-6" data-testid="users-panel">
      <div className="mb-5 flex items-center justify-between">
        <div><div className="eyebrow">Role-based access</div><h3 className="mt-1 font-display text-2xl">Team</h3>
          <p className="mt-1 text-xs text-muted-foreground">Admin: everything · Manager: approve & publish · Designer: upload · Viewer: read-only</p></div>
        <Button className="rounded-full" onClick={() => setOpen(true)} data-testid="add-user-btn"><UserPlus className="mr-1 h-4 w-4" />Add member</Button>
      </div>
      <div className="divide-y divide-border/60">
        {data.map((u) => (
          <div key={u.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center" data-testid={`user-row-${u.id}`}>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-semibold">{u.name?.[0]?.toUpperCase()}</div>
            <div className="min-w-0 flex-1"><div className="text-sm font-medium">{u.name} {u.id === me.id && <span className="text-xs text-gold">(you)</span>}</div><div className="text-xs text-muted-foreground">{u.email} · joined {timeAgo(u.created_at)}</div></div>
            <RoleSelect value={u.role} onChange={(r) => update(u.id, r)} testId={`user-role-${u.id}`} disabled={u.id === me.id} />
            <Button variant="ghost" size="icon" disabled={u.id === me.id} onClick={() => remove(u.id)} data-testid={`user-delete-${u.id}`}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <AddUser open={open} onOpenChange={setOpen} />
    </div>
  );
}
