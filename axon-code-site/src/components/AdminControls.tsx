import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { AppConfig, DEFAULT_CONFIG, loadAppConfig, saveAppConfig } from "../lib/appConfig";
import { GlowCard } from "./FX";

/* ============================================================
   Mission Control → Controls
   The switches that change the live product without a redeploy.
   ============================================================ */

function Row({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="ctl-row">
      <div className="ctl-txt">
        <div className="ctl-t">{title}</div>
        <div className="ctl-s">{sub}</div>
      </div>
      <div className="ctl-act">{children}</div>
    </div>
  );
}

export function AdminControls() {
  const [cfg, setCfg] = useState<AppConfig>(DEFAULT_CONFIG);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [ver, setVer] = useState("");
  const [notes, setNotes] = useState("");
  const [tag, setTag] = useState("");
  const [resetCount, setResetCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const c = await loadAppConfig(true);
      setCfg(c); setVer(c.latest_app_version); setNotes(c.update_notes); setTag(c.latest_model_tag);
      // if the table is missing, saving will fail — detect it up front
      const { error } = await supabase.from("app_config").select("id").eq("id", 1).single();
      setState(error ? "missing" : "ready");
    })();
  }, []);

  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(null), 3000); };

  const set = async (patch: Partial<AppConfig>, label: string) => {
    setBusy(label);
    const r = await saveAppConfig(patch);
    setBusy(null);
    if (r.ok) { setCfg((c) => ({ ...c, ...patch })); flash(`✓ ${label} saved — live everywhere now.`); }
    else flash(`Couldn't save: ${r.error}`);
  };

  const resetWeekly = async () => {
    if (!confirm("Reset this week's message count for EVERY user?\nEveryone gets a fresh 200 immediately.")) return;
    setBusy("reset");
    const { data, error } = await supabase
      .from("profiles")
      .update({ weekly_used: 0, week_key: "", updated_at: new Date().toISOString() })
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id");
    setBusy(null);
    if (error) return flash(`Couldn't reset: ${error.message}`);
    setResetCount(data?.length ?? 0);
    flash(`✓ Weekly limits reset for ${data?.length ?? 0} user${data?.length === 1 ? "" : "s"}.`);
  };

  return (
    <>
      {state === "missing" && (
        <GlowCard className="panel" style={{ marginBottom: 16, borderColor: "rgba(251,191,36,0.4)" }}>
          <h4>⚠ One migration left</h4>
          <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6 }}>
            These controls write to an <code className="inline">app_config</code> table that doesn't exist yet.
            Paste <code className="inline">supabase/migrations/0002_platform.sql</code> into the Supabase SQL editor
            and run it — then this page goes live. Until then the site uses safe defaults (downloads off).
          </p>
        </GlowCard>
      )}

      {note && <div className="ctl-note">{note}</div>}

      <GlowCard className="panel">
        <h4>The big switch</h4>
        <Row
          title="Downloads open to the public"
          sub={cfg.downloads_enabled
            ? "LIVE — the download buttons work for everyone right now."
            : "Off — buttons are visible but greyed out, and visitors see the register-interest form instead."}
        >
          <button
            className={`btn ${cfg.downloads_enabled ? "ghost" : "primary"}`}
            disabled={busy !== null || state === "missing"}
            onClick={() => set({ downloads_enabled: !cfg.downloads_enabled }, "Downloads")}
          >
            {busy === "Downloads" ? "Saving…" : cfg.downloads_enabled ? "Turn downloads OFF" : "Turn downloads ON"}
          </button>
        </Row>
        <Row
          title="Launch month — first month unlimited"
          sub={cfg.launch_month_on
            ? "Every new account gets 30 days of unlimited, no card."
            : "Off — new accounts start on the normal free tier."}
        >
          <button className="btn ghost" disabled={busy !== null || state === "missing"}
            onClick={() => set({ launch_month_on: !cfg.launch_month_on }, "Launch month")}>
            {cfg.launch_month_on ? "Turn off" : "Turn on"}
          </button>
        </Row>
        <Row
          title="Unlimited for EVERYONE (kill-switch)"
          sub={cfg.unlimited_for_all
            ? "LIVE — every account, free or paid, has uncapped usage right now. The app honours this the moment it syncs."
            : "Off — normal per-plan limits apply (free tier capped, launch month + paid uncapped)."}
        >
          <button
            className={`btn ${cfg.unlimited_for_all ? "ghost" : "primary"}`}
            disabled={busy !== null || state === "missing"}
            onClick={() => set({ unlimited_for_all: !cfg.unlimited_for_all }, "Unlimited-for-all")}
          >
            {busy === "Unlimited-for-all" ? "Saving…" : cfg.unlimited_for_all ? "Turn OFF unlimited" : "Turn ON unlimited for all"}
          </button>
        </Row>
      </GlowCard>

      <GlowCard className="panel" style={{ marginTop: 16 }}>
        <h4>Model release gates</h4>
        <p style={{ color: "var(--dim)", fontSize: 13, marginBottom: 8 }}>
          A tier appears as downloadable only when its own gate and the global
          download switch are both on. Keep a tier off until its signed artifact,
          checksum, licence notice and required benchmark evidence are complete.
        </p>
        {([
          ["Laro Lite", "4B · 4 GB minimum · HumanEval measured", "lite_download_enabled"],
          ["Laro Med", "12B · 12 GB minimum · HumanEval measured", "med_download_enabled"],
          ["Laro Max", "24B · 24 GB minimum · benchmark pending", "max_download_enabled"],
        ] as const).map(([title, sub, key]) => (
          <Row key={key} title={title} sub={`${sub}. ${cfg[key] ? "Enabled for release." : "Held behind the release gate."}`}>
            <button
              className={`btn ${cfg[key] ? "ghost" : "primary"}`}
              disabled={busy !== null || state === "missing"}
              onClick={() => set({ [key]: !cfg[key] }, title)}
            >
              {busy === title ? "Saving…" : cfg[key] ? "Hold tier" : "Enable tier"}
            </button>
          </Row>
        ))}
        <div className="ctl-cur">
          Public installer: {cfg.downloads_enabled ? "on" : "off"} · available tiers:{" "}
          {[cfg.lite_download_enabled && "Lite", cfg.med_download_enabled && "Med", cfg.max_download_enabled && "Max"]
            .filter(Boolean).join(", ") || "none"}
        </div>
      </GlowCard>

      <GlowCard className="panel" style={{ marginTop: 16 }}>
        <h4>Push an update to everyone</h4>
        <p style={{ color: "var(--dim)", fontSize: 13, marginBottom: 14 }}>
          Installed apps check this every time they open. Bump the version and they'll show a
          <b> Download update</b> button with your notes.
        </p>
        <div className="ctl-grid">
          <label>
            App version
            <input value={ver} onChange={(e) => setVer(e.target.value)} placeholder="1.0.1" />
          </label>
          <label>
            Model tag
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="laro-med" />
          </label>
        </div>
        <label className="ctl-full">
          What's new
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            placeholder="Faster on 8 GB machines. Better at multi-file refactors." />
        </label>
        <button className="btn primary" disabled={busy !== null || state === "missing"}
          onClick={() => set({ latest_app_version: ver.trim(), latest_model_tag: tag.trim(), update_notes: notes.trim() }, "Update")}>
          {busy === "Update" ? "Publishing…" : "Publish update"}
        </button>
        <div className="ctl-cur">Currently live: v{cfg.latest_app_version} · {cfg.latest_model_tag}</div>
      </GlowCard>

      <GlowCard className="panel" style={{ marginTop: 16 }}>
        <h4>Usage & limits</h4>
        <Row title="Reset everyone's weekly free limit"
          sub="Gives every free user a fresh 200 messages straight away. Useful after an outage or a big launch push.">
          <button className="btn ghost" disabled={busy !== null || state === "missing"} onClick={resetWeekly}>
            {busy === "reset" ? "Resetting…" : "Reset now"}
          </button>
        </Row>
        {resetCount != null && <div className="ctl-cur">Last reset touched {resetCount} account{resetCount === 1 ? "" : "s"}.</div>}
      </GlowCard>
    </>
  );
}

/* ---- referrals list ---- */
export function AdminReferrals() {
  const [rows, setRows] = useState<{ id: string; referrer_code: string; referred_email: string; created_at: string }[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("referrals").select("id,referrer_code,referred_email,created_at")
        .order("created_at", { ascending: false });
      if (error) return setState("error");
      setRows(data as any); setState("ready");
    })();
  }, []);

  return (
    <GlowCard className="panel">
      <h4>Referrals — {rows.length}</h4>
      {state === "loading" && <p style={{ color: "var(--dim)", fontSize: 13.5 }}>Loading…</p>}
      {state === "error" && (
        <p style={{ color: "var(--dim)", fontSize: 13.5 }}>
          No <code className="inline">referrals</code> table yet — run <code className="inline">0002_platform.sql</code>.
        </p>
      )}
      {state === "ready" && rows.length === 0 && (
        <p style={{ color: "var(--dim)", fontSize: 13.5 }}>Nobody's referred anyone yet. It starts the day downloads open.</p>
      )}
      {rows.length > 0 && (
        <table className="table">
          <thead><tr><th>Code</th><th>Signed up</th><th>When</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontFamily: "var(--font-mono)" }}>{r.referrer_code}</td>
                <td>{r.referred_email}</td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </GlowCard>
  );
}
