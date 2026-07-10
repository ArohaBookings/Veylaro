import { FormEvent, ReactNode, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, SUPER_ADMINS } from "../lib/supabase";
import { VeylaroMark } from "./Logo";

/* ============================================================
   Mission Control gate — Supabase email/password auth.
   Only SUPER_ADMINS get through. First run: the admin creates
   their own account (we never ship a password in the code).
   ============================================================ */

export function AdminGate({ children }: { children: (user: User, logout: () => void) => ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booted, setBooted] = useState(false);
  const [email, setEmail] = useState(SUPER_ADMINS[0]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setNotice(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      const m = error.message.toLowerCase();
      setErr(
        m.includes("confirm")
          ? "Your email isn't confirmed yet — check your inbox for the Veylaro confirmation link, then sign in."
          : m.includes("invalid")
            ? "Wrong email or password. First time here? Use “Create admin account”."
            : `Sign-in failed: ${error.message}`
      );
    }
    setBusy(false);
  };

  const signUp = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setNotice(null);
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      setErr(/already/i.test(error.message) ? "Account already exists — just sign in." : error.message);
    } else if (data.user && !data.session) {
      setNotice(`Confirmation email sent to ${email.trim()}. Click the link, then come back and sign in.`);
    } else {
      setNotice("Account created — you're in.");
    }
    setBusy(false);
  };

  if (!booted) {
    return <div className="admin-login"><p style={{ color: "var(--dim)" }}>Checking session…</p></div>;
  }

  if (user && SUPER_ADMINS.includes((user.email || "").toLowerCase())) {
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
        {notice && <div className="login-notice">{notice}</div>}
        <button className="btn primary" type="submit" disabled={busy || !password}>
          {busy ? "Checking…" : "Sign in"}
        </button>
        <button className="btn ghost sm" type="button" disabled={busy || !password} onClick={signUp}>
          First time? Create admin account
        </button>
        <span className="login-hint">
          Create the account once with your email + a password you choose, confirm via email, then it's sign-in only.
        </span>
      </form>
    </div>
  );
}
