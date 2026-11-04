import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/api";
import { Spinner } from "@/components/common/Bits";

const HERO = "https://images.unsplash.com/photo-1653972233739-667468bbd5a9?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600";

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.15fr_1fr]">
      <div className="relative hidden overflow-hidden lg:block grain">
        <img src={HERO} alt="Luxury interior" className="kenburns absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />
        <div className="absolute bottom-0 left-0 right-0 p-14 text-white">
          <div className="eyebrow mb-4">Interior Social AI</div>
          <h2 className="font-display text-6xl leading-[1.02]">Upload once.<br /><em>Publish beautifully.</em></h2>
          <p className="mt-5 max-w-md text-sm text-white/70">Drop project photos in Google Drive. AI analyses, enhances, writes editorial captions and plans your feed, stories, carousels and reels. You approve with one click.</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm fade-up">
          <div className="mb-10 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-gold bg-gold/10 font-display text-2xl text-gold">I</div>
            <span className="font-display text-2xl">Interior Social</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 text-sm text-muted-foreground">{footer}</div>
        </div>
      </div>
    </div>
  );
}

export function Field({ id, label, ...props }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input id={id} className="h-11 rounded-xl" {...props} />
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await login(form.email, form.password); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your studio's content desk."
      footer={<>New to the studio? <Link to="/register" className="text-gold hover:underline" data-testid="go-register-link">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-5" data-testid="login-form">
        <Field id="email" label="Email" type="email" required value={form.email} data-testid="login-email-input"
          onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@studio.com" />
        <Field id="password" label="Password" type="password" required value={form.password} data-testid="login-password-input"
          onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
        {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" data-testid="login-error">{error}</p>}
        <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl" data-testid="login-submit-btn">
          {busy ? <Spinner /> : <>Sign in <ArrowRight className="ml-1 h-4 w-4" /></>}
        </Button>
      </form>
    </AuthLayout>
  );
}
