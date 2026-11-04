import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/api";
import { Spinner } from "@/components/common/Bits";
import { AuthLayout, Field } from "@/pages/Login";

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await register(form.name, form.email, form.password); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <AuthLayout title="Join the studio" subtitle="New members start as Designers. An admin can change your role."
      footer={<>Already have an account? <Link to="/login" className="text-gold hover:underline" data-testid="go-login-link">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-5" data-testid="register-form">
        <Field id="name" label="Full name" required value={form.name} onChange={set("name")} data-testid="register-name-input" placeholder="Priya Sharma" />
        <Field id="email" label="Email" type="email" required value={form.email} onChange={set("email")} data-testid="register-email-input" placeholder="you@studio.com" />
        <Field id="password" label="Password" type="password" required minLength={6} value={form.password} onChange={set("password")} data-testid="register-password-input" placeholder="Min. 6 characters" />
        {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" data-testid="register-error">{error}</p>}
        <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl" data-testid="register-submit-btn">
          {busy ? <Spinner /> : <>Create account <ArrowRight className="ml-1 h-4 w-4" /></>}
        </Button>
      </form>
    </AuthLayout>
  );
}
