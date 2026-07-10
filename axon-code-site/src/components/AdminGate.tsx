import { FormEvent, ReactNode, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, User,
} from "firebase/auth";
import { auth, SUPER_ADMINS } from "../lib/firebase";
import { VeylaroMark } from "./Logo";

/* ============================================================
   Mission Control gate — Firebase email/password auth.
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

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setBooted(true); }), []);

  const logout = () => signOut(auth);

  const go = async (e: FormEvent, create = false) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (create) await createUserWithEmailAndPassword(auth, email.trim(), password);
      else await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (ex: any) {
      const code = String(ex?.code || ex?.message || ex);
      setErr(
        /user-not-found|invalid-credential/.test(code)
          ? "No account with that password yet — first time here? Use “Create admin account”."
          : /email-already-in-use/.test(code)
            ? "Account already exists — sign in instead."
            : /weak-password/.test(code)
              ? "Password needs at least 6 characters."
              : /network/.test(code)
                ? "Network error — are you online?"
                : `Sign-in failed (${code.replace("auth/", "")}).`
      );
    }
    setBusy(false);
  };

  if (!booted) {
    return <div className="admin-login"><p style={{ color: "var(--dim)" }}>Checking session…</p></div>;
  }

  if (user && SUPER_ADMINS.includes(user.email || "")) {
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
      <form className="login-card" onSubmit={(e) => go(e)}>
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
        <button className="btn primary" type="submit" disabled={busy || !password}>
          {busy ? "Checking…" : "Sign in"}
        </button>
        <button className="btn ghost sm" type="button" disabled={busy || !password} onClick={(e) => go(e as any, true)}>
          First time? Create admin account
        </button>
        <span className="login-hint">
          Create the account once with your email + a password you choose — after that it's sign-in only.
        </span>
      </form>
    </div>
  );
}
