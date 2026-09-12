import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { Field } from "../components/Field";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("demo@lumen.supply");
  const [password, setPassword] = useState("lumen-demo");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(location.state?.from || "/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2" data-testid="login-page">
      <div className="relative hidden lg:block overflow-hidden bg-ink">
        <img
          src="https://images.unsplash.com/photo-1697898807751-a4380192892d?auto=format&fit=crop&w=1400&q=80"
          alt="Camp at dusk"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-ink/60" />
        <div className="absolute bottom-12 left-12 right-12 text-canvas">
          <div className="eyebrow !text-canvas/60 mb-4">Est. 2019 — Bend, Oregon</div>
          <h2 className="font-display text-5xl leading-[1.02] tracking-tight">
            Goods built for weather,<br />
            <span className="italic font-light">kept for decades.</span>
          </h2>
        </div>
      </div>
      <div className="flex items-center justify-center px-6 py-16">
        <form onSubmit={submit} className="w-full max-w-sm reveal" data-testid="login-form">
          <div className="font-display text-2xl text-ink mb-1">
            Lumen <span className="italic font-light">Supply Co.</span>
          </div>
          <p className="text-sm text-ink2 mb-10">Sign in to your field account.</p>
          <div className="space-y-5">
            <Field label="Email" id="email" name="email" type="email" testid="login-email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            <Field label="Password" id="password" name="password" type="password" testid="login-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required hint="demo password: lumen-demo" />
          </div>
          {error && (
            <p className="mt-4 text-sm text-red-700" data-testid="login-error">{error}</p>
          )}
          <button type="submit" className="btn-ink w-full mt-8" disabled={busy} data-testid="login-submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
