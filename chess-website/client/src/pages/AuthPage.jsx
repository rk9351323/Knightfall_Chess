import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Crown, LoaderCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { getApiError } from "../lib/api.js";

export default function AuthPage({ mode }) {
  const isRegister = mode === "register";
  const { user, loading: authLoading, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ displayName: "", username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (authLoading) return <div className="auth-loading">Checking your session…</div>;
  if (user) return <Navigate to="/profile" replace />;

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setError(""); setSubmitting(true);
    try {
      if (isRegister) await register(form);
      else await login({ email: form.email, password: form.password });
      navigate(location.state?.from || "/profile", { replace: true });
    } catch (err) { setError(getApiError(err)); }
    finally { setSubmitting(false); }
  };

  return <section className="auth-page">
    <div className="auth-card">
      <div className="auth-brand-mark"><Crown size={23}/></div>
      <div className="eyebrow auth-eyebrow">YOUR NEXT MOVE STARTS HERE</div>
      <h1>{isRegister ? <>Create your <em>account.</em></> : <>Welcome <em>back.</em></>}</h1>
      <p className="auth-subtitle">{isRegister ? "Join Knightfall Chess and build your chess journey." : "Log in to continue your chess journey."}</p>
      <form onSubmit={submit} className="auth-form">
        {isRegister && <>
          <label className="auth-label" htmlFor="displayName">Display name</label>
          <input id="displayName" className="auth-input" name="displayName" autoComplete="name" value={form.displayName} onChange={update} minLength={2} maxLength={40} required placeholder="Your name" />
          <label className="auth-label" htmlFor="username">Username</label>
          <input id="username" className="auth-input" name="username" autoComplete="username" value={form.username} onChange={update} minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" required placeholder="chess_player_01" />
          <p className="auth-hint">3–20 characters. Letters, numbers, and underscores only.</p>
        </>}
        <label className="auth-label" htmlFor="email">Email address</label>
        <input id="email" className="auth-input" type="email" name="email" autoComplete="email" value={form.email} onChange={update} maxLength={254} required placeholder="you@example.com" />
        <label className="auth-label" htmlFor="password">Password</label>
        <input id="password" className="auth-input" type="password" name="password" autoComplete={isRegister ? "new-password" : "current-password"} value={form.password} onChange={update} minLength={isRegister ? 8 : 1} maxLength={72} required placeholder={isRegister ? "At least 8 characters" : "Enter your password"} />
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="button button-primary auth-submit" type="submit" disabled={submitting}>
          {submitting ? <><LoaderCircle size={16} className="auth-spinner"/> Please wait…</> : isRegister ? "Create account" : "Log in"}
        </button>
      </form>
      <div className="auth-switch">{isRegister ? "Already have an account?" : "New to Knightfall Chess?"} <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Log in" : "Create account"}</Link></div>
      <div className="auth-security"><ShieldCheck size={15}/><span>Your password is hashed before it is stored. Sessions use an HTTP-only cookie.</span></div>
    </div>
  </section>;
}
