import { FormEvent, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { GlowCard } from "./FX";

/* ============================================================
   Register Interest — the pre-launch capture flow.
   Public form writes to Firestore `interest`; the admin panel
   below reads it back inside Mission Control.
   ============================================================ */

const LS_QUEUE = "veylaro.interest.queue";

export function RegisterInterest({ source }: { source: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return;
    setState("busy");
    try {
      await addDoc(collection(db, "interest"), {
        email: clean,
        source,
        ua: navigator.userAgent.slice(0, 120),
        ts: serverTimestamp(),
      });
      setState("done");
    } catch {
      // offline or rules not deployed yet — keep it locally so nothing is lost
      try {
        const q = JSON.parse(localStorage.getItem(LS_QUEUE) || "[]");
        q.push({ email: clean, source, ts: Date.now() });
        localStorage.setItem(LS_QUEUE, JSON.stringify(q));
        setState("done");
      } catch {
        setState("error");
      }
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
  ts?: { seconds: number };
}

export function InterestAdminPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = async () => {
    setState("loading");
    try {
      const snap = await getDocs(query(collection(db, "interest"), orderBy("ts", "desc")));
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setState("ready");
    } catch {
      setState("error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const exportCsv = () => {
    const csv = ["email,source,date", ...rows.map((r) =>
      `${r.email},${r.source},${r.ts ? new Date(r.ts.seconds * 1000).toISOString() : ""}`
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
      {state === "loading" && <p style={{ color: "var(--dim)", fontSize: 13.5 }}>Loading from Firestore…</p>}
      {state === "error" && (
        <p style={{ color: "var(--dim)", fontSize: 13.5 }}>
          Couldn't read the <code className="inline">interest</code> collection — check that Firestore is created
          and the rules from <code className="inline">firestore.rules</code> are published.
        </p>
      )}
      {state === "ready" && rows.length === 0 && (
        <p style={{ color: "var(--dim)", fontSize: 13.5 }}>No signups yet — share the site and watch this fill up.</p>
      )}
      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr><th>Email</th><th>Source</th><th>When</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.email}</td>
                <td>{r.source}</td>
                <td>{r.ts ? new Date(r.ts.seconds * 1000).toLocaleString() : "—"}</td>
                <td style={{ textAlign: "right" }}>
                  <button
                    className="btn ghost sm"
                    onClick={async () => {
                      if (!confirm(`Remove ${r.email}?`)) return;
                      await deleteDoc(doc(db, "interest", r.id));
                      setRows((p) => p.filter((x) => x.id !== r.id));
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </GlowCard>
  );
}
