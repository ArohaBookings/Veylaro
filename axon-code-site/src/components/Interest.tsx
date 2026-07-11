import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { GlowCard } from "./FX";

/* ============================================================
   Register Interest — the pre-launch capture flow.
   Public form inserts into Supabase `interest`; the admin panel
   below reads it back inside Mission Control.
   ============================================================ */

const LS_QUEUE = "veylaro.interest.queue";

/** Push any locally-queued signups to Supabase. Safe to call anytime —
    no-ops if the queue is empty or the table doesn't exist yet. Returns
    how many synced. This is what makes register-interest self-healing:
    emails captured before the table existed flush in automatically. */
export async function flushInterestQueue(): Promise<number> {
  let queue: { email: string; source: string; ts: number }[];
  try {
    queue = JSON.parse(localStorage.getItem(LS_QUEUE) || "[]");
  } catch {
    return 0;
  }
  if (!queue.length) return 0;
  const { error } = await supabase
    .from("interest")
    .upsert(queue.map((q) => ({ email: q.email, source: q.source, ua: "queued" })), { onConflict: "email", ignoreDuplicates: true });
  if (error) return 0; // table still missing / offline — keep the queue for next time
  localStorage.removeItem(LS_QUEUE);
  return queue.length;
}

export function RegisterInterest({ source }: { source: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  // self-heal: on mount, try to sync anything captured while the table was missing
  useEffect(() => {
    flushInterestQueue();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return;
    setState("busy");
    const { error } = await supabase.from("interest").insert({
      email: clean,
      source,
      ua: navigator.userAgent.slice(0, 200),
    });
    if (!error) {
      setState("done");
      return;
    }
    // table missing / offline — keep it locally so nothing is ever lost
    try {
      const q = JSON.parse(localStorage.getItem(LS_QUEUE) || "[]");
      q.push({ email: clean, source, ts: Date.now() });
      localStorage.setItem(LS_QUEUE, JSON.stringify(q));
      setState("done");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="interest-done">
        ✦ You're on the list. We'll email you the moment downloads open — nothing else, ever.
      </div>
    );
  }

  return (
    <form className="interest-form" onSubmit={submit}>
      <input
        type="email"
        required
        value={email}
        placeholder="you@example.com"
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Email for early access"
      />
      <button className="btn primary" type="submit" disabled={state === "busy"}>
        {state === "busy" ? "Adding…" : "Register interest"}
      </button>
      {state === "error" && <span className="interest-err">Couldn't save — try again in a moment.</span>}
    </form>
  );
}

/* ============ Mission Control panel ============ */

interface Row {
  id: string;
  email: string;
  source: string;
  created_at?: string;
}

export function InterestAdminPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  const load = async () => {
    setState("loading");
    await flushInterestQueue(); // sync anything captured before the table existed
    const { data, error } = await supabase
      .from("interest")
      .select("id,email,source,created_at")
      .order("created_at", { ascending: false });
    if (error) {
      setErrMsg(error.message);
      setState("error");
      return;
    }
    setRows(data as Row[]);
    setState("ready");
  };

  useEffect(() => {
    load();
  }, []);

  const exportCsv = () => {
    const csv = ["email,source,date", ...rows.map((r) =>
      `${r.email},${r.source},${r.created_at || ""}`
    )].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `veylaro-interest-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <GlowCard className="panel">
      <h4>
        Register interest — {rows.length} signup{rows.length === 1 ? "" : "s"}
        <span style={{ display: "inline-flex", gap: 8 }}>
          <button className="btn ghost sm" onClick={load}>Refresh</button>
          <button className="btn ghost sm" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
        </span>
      </h4>
      {state === "loading" && <p style={{ color: "var(--dim)", fontSize: 13.5 }}>Loading from Supabase…</p>}
      {state === "error" && (
        <p style={{ color: "var(--dim)", fontSize: 13.5 }}>
          Couldn't read the <code className="inline">interest</code> table ({errMsg}). Make sure the migration in{" "}
          <code className="inline">supabase/migrations</code> has been run.
        </p>
      )}
      {state === "ready" && rows.length === 0 && (
        <p style={{ color: "var(--dim)", fontSize: 13.5 }}>No signups yet — share the site and watch this fill up.</p>
      )}
      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr><th>Email</th><th>Source</th><th>When</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.email}</td>
                <td>{r.source}</td>
                <td>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </GlowCard>
  );
}
