import { FormEvent, ReactNode, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { VeylaroMark } from "./Logo";

/* ============================================================
   Mission Control gate — Supabase email/password auth.
   Only users with server-controlled app_metadata.role=admin get
   through. No owner email or allow-list ships in the public bundle.
   ============================================================ */

export function AdminGate({ children }: { children: (user: User, logout: () => void) => ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booted, setBooted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setBooted(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const logout = () => supabase.auth.signOut();

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      const m = error.message.toLowerCase();
      setErr(
        m.includes("confirm")
          ? "Your email isn't confirmed yet — check your inbox for the Veylaro confirmation link, then sign in."
          : m.includes("invalid")
            ? "Wrong email or password."
            : `Sign-in failed: ${error.message}`
      );
    }
    setBusy(false);
  };

  if (!booted) {
    return <div className="admin-login"><p style={{ color: "var(--dim)" }}>Checking session…</p></div>;
  }

  if (user && user.app_metadata?.role === "admin") {
    return <>{children(user, logout)}</>;
  }

  if (user) {
    return (
      <div className="admin-login">
        <div className="login-card">
          <VeylaroMark size={54} />
          <h2>Not authorized</h2>
          <p>{user.email} isn't on the Mission Control list.</p>
          <button className="btn ghost" onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-login">
      <form className="login-card" onSubmit={signIn}>
        <VeylaroMark size={54} />
        <h2>Mission Control</h2>
        <p>Super-admin access only. Everything else on this site needs no account.</p>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="your admin password"
        />
        {err && <div className="login-err">{err}</div>}
        <button className="btn primary" type="submit" disabled={busy || !email || !password}>
          {busy ? "Checking…" : "Sign in"}
        </button>
        <span className="login-hint">
          Admin accounts are provisioned privately in Supabase and require the server-controlled admin role.
        </span>
      </form>
    </div>
  );
}
