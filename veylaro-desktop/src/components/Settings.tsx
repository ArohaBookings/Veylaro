import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { APP_VERSION, LangPref, ModelId, MODELS, REFERRAL_MAX, SubAgentPref } from "../types";
import { fitCheck, recommendModel, SYSTEM_TIERS, TIER_BY_ID } from "../engine/tiers";
import { PRODUCTION_SYSTEMS } from "../engine/executionLattice";
import {
  clearVerifiedPrecedents,
  exportVerifiedPrecedents,
  verifiedPrecedentCount,
} from "../engine/localLearning";
import { decide, DEFAULT_LEARN_CONFIG, LearnStatus, Power } from "../engine/overnightScheduler";
import { Bolt, Check, Clock, Cpu, Eye, Globe, Lock, Shield, Sparkle, TerminalIc, User, Warn, X } from "./icons";

/* ============================================================
   Settings — one calm window, a page per topic.
   Plain English everywhere. Nothing here needs a manual.
   ============================================================ */

type PageId =
  | "general" | "models" | "systems" | "permissions" | "privacy"
  | "account" | "referrals" | "learning" | "terminal" | "about";

const PAGES: { id: PageId; label: string; icon: JSX.Element }[] = [
  { id: "general", label: "General", icon: <Sparkle size={15} /> },
  { id: "models", label: "Models & speed", icon: <Cpu size={15} /> },
  { id: "permissions", label: "Permissions & safety", icon: <Shield size={15} /> },
  { id: "privacy", label: "Privacy", icon: <Eye size={15} /> },
  { id: "account", label: "Account & billing", icon: <User size={15} /> },
  { id: "referrals", label: "Invite friends", icon: <Globe size={15} /> },
  { id: "learning", label: "Overnight learning", icon: <Clock size={15} /> },
  { id: "terminal", label: "Terminal", icon: <TerminalIc size={15} /> },
  { id: "about", label: "About & licences", icon: <Bolt size={15} /> },
];

function Toggle({ on, onChange, title, sub, danger }: {
  on: boolean; onChange: (v: boolean) => void; title: string; sub: string; danger?: boolean;
}) {
  return (
    <div className="tgl">
      <div>
        <div className="tl">{title}</div>
        <div className="ts">{sub}</div>
      </div>
      <span
        className={`sw ${on ? "on" : ""} ${danger && on ? "danger" : ""}`}
        role="switch"
        aria-checked={on}
        tabIndex={0}
        onClick={() => onChange(!on)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChange(!on)}
      />
    </div>
  );
}

/* ---- the dangerous one: full-disk access ---- */
function FullDiskCard() {
  const { settings, setFullDiskAccess } = useStore();
  const [arming, setArming] = useState(false);
  const [typed, setTyped] = useState("");
  const on = settings.fullDiskAccess;

  if (on) {
    return (
      <div className="danger-card on">
        <div className="dc-head"><Warn size={16} /> Full-disk access is ON</div>
        <p>
          Laro can read and write anywhere in your home folder. Your system files, keychain, SSH keys
          and Veylaro's own data stay blocked — that part never turns off.
        </p>
        <div className="dc-foot">
          <span className="dc-since">
            You turned this on {settings.fullDiskAckAt ? new Date(settings.fullDiskAckAt).toLocaleString() : "recently"}
          </span>
          <button className="btn ghost sm" onClick={() => setFullDiskAccess(false)}>Turn it off</button>
        </div>
      </div>
    );
  }

  return (
    <div className="danger-card">
      <div className="dc-head"><Warn size={16} /> Full-disk access — off</div>
      <p>
        Right now Laro can only touch the file or folder you picked for the session. That's the safe
        default and it's what almost everyone should stay on.
      </p>
      <p className="dc-warn">
        Turning this on lets Laro edit anything in your home folder — other projects, documents,
        everything. Useful for big refactors across repos. Genuinely risky if you're not watching.
      </p>
      {!arming ? (
        <button className="btn ghost sm" onClick={() => setArming(true)}>I understand — let me enable it</button>
      ) : (
        <div className="dc-arm">
          <label>Type <b>ALLOW</b> to confirm</label>
          <div className="dc-row">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="ALLOW" autoFocus />
            <button
              className="btn primary sm"
              disabled={typed.trim().toUpperCase() !== "ALLOW"}
              onClick={() => { setFullDiskAccess(true); setArming(false); setTyped(""); }}
            >
              Enable
            </button>
            <button className="btn ghost sm" onClick={() => { setArming(false); setTyped(""); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- pages ---- */

function GeneralPage() {
  const { settings, setSettings } = useStore();
  return (
    <>
      <Toggle on={settings.personality} onChange={(v) => setSettings({ personality: v })}
        title="Let Laro think out loud" sub="You'll see the little asides while it works — “wait, off-by-one right there”." />
      <Toggle on={settings.reasoning} onChange={(v) => setSettings({ reasoning: v })}
        title="Show work summaries" sub="See the plan, evidence and verification summary. Turn off for maximum speed." />
      <Toggle on={settings.planMode} onChange={(v) => setSettings({ planMode: v })}
        title="Show me the plan first" sub="Laro writes the plan and waits for your OK before touching anything." />
      <Toggle on={settings.internet} onChange={(v) => setSettings({ internet: v })}
        title="Let it search the web" sub="Only your search words leave the machine — never your code. Works offline without it." />
      <Toggle on={settings.voice} onChange={(v) => setSettings({ voice: v })}
        title="Read summaries aloud" sub="Laro speaks the recap when a job finishes." />
      <Toggle on={settings.sounds} onChange={(v) => setSettings({ sounds: v })}
        title="Sound when a job finishes" sub="A soft chime, nothing else." />
      <div className="mrow">
        <label>How much detail in the chat</label>
        <div className="seg" style={{ width: "fit-content" }}>
          {(["both", "plain", "dev"] as LangPref[]).map((l) => (
            <button key={l} className={settings.lang === l ? "on" : ""} onClick={() => setSettings({ lang: l })}>
              {l === "both" ? "Plain + technical" : l === "plain" ? "Plain English" : "Technical only"}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function ModelsPage() {
  const { settings, setSettings, ramGB, liveModel } = useStore();
  const suggested = recommendModel(ramGB);
  return (
    <>
      <div className="fit-note" style={{ marginTop: 0 }}>
        <Cpu size={16} style={{ flexShrink: 0, marginTop: 1, color: "var(--champagne)" }} />
        <span>
          This machine has <b>{ramGB} GB</b> of memory. We'd put you on <b>{TIER_BY_ID[suggested].name}</b>.
          {liveModel ? <> Installed right now: <b>{liveModel.replace(/:latest$/, "")}</b>.</> : <> No Laro weights installed yet — the preview brain is driving.</>}
        </span>
      </div>

      <div className="tier-grid">
        {SYSTEM_TIERS.map((t) => {
          const fit = fitCheck(t.id, ramGB);
          const picked = settings.model === t.id;
          return (
            <button key={t.id} className={`tier-card ${picked ? "on" : ""} fit-${fit.status}`}
              disabled={fit.status === "insufficient"}
              title={fit.note}
              onClick={() => setSettings({ model: t.id, autoPickModel: false })}>
              <span className="tc-top">
                <b>{t.name}</b>
                {picked && <span className="tc-pick">✓ in use</span>}
                {!picked && t.id === suggested && <span className="tc-sug">suggested</span>}
              </span>
              <span className="tc-line">{t.tagline}</span>
              <span className="tc-meta">{t.paramsB}B · {t.diskGB} GB on disk · needs {t.minRamGB} GB RAM</span>
              <span className={`tc-fit ${fit.status}`}>{fit.note}</span>
            </button>
          );
        })}
      </div>

      <Toggle on={settings.autoPickModel} onChange={(v) => setSettings({ autoPickModel: v, ...(v ? { model: suggested } : {}) })}
        title="Pick the best model for me" sub="Veylaro chooses based on your memory, and switches down if the machine gets busy." />

      <div className="safe-note">
        <Shield size={15} />
        <div>
          <b>{PRODUCTION_SYSTEMS.length} execution systems on every tier</b>
          <p>
            Contract, reproduction, scoped retrieval, blast-radius, counterexample,
            execution, failure-memory, holdout, evidence-budget and claim-calibration
            gates stay the same when you swap Lite, Med or Max.
          </p>
        </div>
      </div>

      <div className="mrow">
        <label>How many helpers work at once</label>
        <div className="seg" style={{ width: "fit-content" }}>
          {(["off", "duo", "auto"] as SubAgentPref[]).map((s) => (
            <button key={s} className={settings.subAgents === s ? "on" : ""} onClick={() => setSettings({ subAgents: s })}>
              {s === "off" ? "Just Laro" : s === "duo" ? "Two" : "Auto"}
            </button>
          ))}
        </div>
        <div className="hintline">More helpers finish faster but use more memory. Auto reads your machine.</div>
      </div>

      <div className="mrow">
        <label>Where the model runs</label>
        <div className="seg" style={{ width: "fit-content" }}>
          <button className={settings.engine === "demo" ? "on" : ""} onClick={() => setSettings({ engine: "demo" })}>Preview brain</button>
          <button className={settings.engine === "veylaro" ? "on" : ""} onClick={() => setSettings({ engine: "veylaro" })}>Installed weights</button>
        </div>
        {settings.engine === "veylaro" && (
          <>
            <div className="mrow">
              <label>Local address</label>
              <input type="text" value={settings.engineUrl} onChange={(e) => setSettings({ engineUrl: e.target.value })} />
            </div>
            <div className="mrow">
              <label>Model name</label>
              <input type="text" value={settings.engineModel} onChange={(e) => setSettings({ engineModel: e.target.value })} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

function PermissionsPage() {
  const { settings, setSettings } = useStore();
  return (
    <>
      <div className="mrow">
        <label>How much Laro asks before acting</label>
        <div className="perm-list">
          {([
            ["ask", "Ask me everything", "Every file change and every command waits for your OK. Slowest, safest."],
            ["edits", "Edits are fine, ask for commands", "It edits freely inside the session, but checks before running anything. Recommended."],
            ["bypass", "Full auto — don't stop", "It plans, edits, runs and verifies without pausing. Fastest. Dangerous commands are still blocked."],
          ] as const).map(([id, title, sub]) => (
            <button key={id} className={`perm-opt ${settings.permMode === id ? "on" : ""}`} onClick={() => setSettings({ permMode: id })}>
              <span className="po-t">{title}</span>
              <span className="po-s">{sub}</span>
            </button>
          ))}
        </div>
      </div>

      <Toggle on={settings.confirmDestructive} onChange={(v) => setSettings({ confirmDestructive: v })}
        title="Always ask before anything destructive" sub="Deleting files, force-pushing, dropping tables — you get asked even in full auto. Leave this on." />

      <FullDiskCard />

      <div className="safe-note">
        <Lock size={15} />
        <div>
          <b>What Laro can never do, in any mode</b>
          <p>
            Touch your system files, keychain, SSH or cloud keys, or Veylaro's own data. Run
            machine-destroying commands like <code>rm -rf /</code> or disk formatting. Those are
            blocked in the app itself, below the model — turning on full-disk access doesn't unlock them,
            and the model can't switch them off.
          </p>
        </div>
      </div>
    </>
  );
}

function PrivacyPage() {
  return (
    <>
      <div className="safe-note" style={{ marginTop: 0 }}>
        <Shield size={15} />
        <div>
          <b>The short version</b>
          <p>
            Your code, your prompts, your files and Laro's answers never leave this machine. There's no
            server to send them to. Everything below is off unless you turn it on.
          </p>
        </div>
      </div>
      <div className="mrow">
        <label>Diagnostic uploads</label>
        <div className="hintline">
          Disabled in this build. There is no telemetry or crash-upload endpoint to turn on.
          Private verified learning is configured separately and remains on this device.
        </div>
      </div>
    </>
  );
}

function AccountPage({ onSignIn, onUpgrade }: { onSignIn: () => void; onUpgrade: () => void }) {
  const { account, billingStatus, usage, signOut, verifyBilling } = useStore();
  const SITE = import.meta.env.DEV ? "http://localhost:5174" : "https://veylaroai.com";
  if (!account) {
    return (
      <div className="empty-page">
        <User size={30} />
        <h3>You're not signed in</h3>
        <p>Sign in with your veylaroai.com account to sync your plan. Billing lives on the website — one account, both places.</p>
        <button className="btn primary" onClick={onSignIn}>Sign in</button>
      </div>
    );
  }
  return (
    <>
      <div className="acct-big">
        <span className="avatar" style={{ width: 46, height: 46, fontSize: 18 }}>{account.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <div className="ab-name">{account.name}</div>
          <div className="ab-mail">{account.email}</div>
        </div>
        <span className={`plan-pill ${billingStatus.plan}`}>{billingStatus.label}</span>
      </div>

      <div className="update-box" style={{ marginTop: 14 }}>
        <div className="urow"><span>Plan</span><b>{billingStatus.label}{billingStatus.daysLeft != null ? ` · ${billingStatus.daysLeft} days left` : ""}</b></div>
        <div className="urow"><span>This week</span><b>{billingStatus.plan === "free" ? `${usage.used} of 200 messages` : "Unlimited"}</b></div>
        <div className="unote">
          Billing is handled on the website so your card details never touch this app. Changes show up
          here within a minute of checkout.
        </div>
      </div>

      <div className="mfoot" style={{ justifyContent: "flex-start", marginTop: 16 }}>
        <a className="btn primary" href={`${SITE}/#/pricing`} target="_blank" rel="noreferrer">Manage billing on the website</a>
        <button className="btn ghost" onClick={verifyBilling}>Re-check my plan</button>
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </div>
    </>
  );
}

function ReferralsPage() {
  const { account, redeemReferral } = useStore();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const mine = account?.referralCode || "sign in to get your code";
  const used = account?.referralsUsed || 0;
  return (
    <>
      <div className="ref-hero">
        <div className="rh-t">Give a month, get a month.</div>
        <p>
          Share your code. Anyone who signs up with it gets <b>10% off their first month</b> — and you get
          <b> a free month</b> when they do. Up to {REFERRAL_MAX} friends.
        </p>
        <div className="ref-code">
          <code>{mine}</code>
          <button className="btn primary sm" disabled={!account}
            onClick={() => { navigator.clipboard?.writeText(mine); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? "Copied ✓" : "Copy code"}
          </button>
        </div>
        <div className="ref-bar">
          {Array.from({ length: REFERRAL_MAX }).map((_, i) => <span key={i} className={`ref-pip ${i < used ? "on" : ""}`} />)}
          <span className="ref-count">{used} of {REFERRAL_MAX} used</span>
        </div>
      </div>

      <div className="mrow">
        <label>Got a code from a friend?</label>
        <div className="dc-row">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LARO-XXXXXX" />
          <button className="btn primary sm" onClick={() => setMsg(redeemReferral(code))}>Redeem</button>
        </div>
        {msg && <div className={msg.ok ? "login-notice" : "login-err"} style={{ marginTop: 8 }}>{msg.msg}</div>}
      </div>
    </>
  );
}

/* Live progress panel — reads the real power/idle state and runs it through the
   same decide() the scheduler uses, so it shows exactly why Laro is or isn't
   consolidating right now. No fake activity: if it says "learning", the gates
   are genuinely open. */
const STATUS_UI: Record<LearnStatus, { label: string; tone: string; note: string }> = {
  off: { label: "Off", tone: "dim", note: "Overnight learning is switched off." },
  learning: { label: "Consolidating now", tone: "green", note: "Idle, on power, past the cool-down — Laro is folding in your verified wins." },
  "paused-active": { label: "Paused — you're here", tone: "amber", note: "You're using the machine. Laro stops the instant you touch it, and waits an hour after." },
  "paused-battery": { label: "Paused — on battery", tone: "amber", note: "Set to power-only. It'll resume when you plug in." },
  cooldown: { label: "Cooling down", tone: "amber", note: "Within the 1-hour quiet window after your last activity." },
  "idle-waiting": { label: "Waiting for idle", tone: "dim", note: "Enabled and on power — it starts once you've been away a few minutes." },
};

function OvernightProgress({ count }: { count: number }) {
  const { settings } = useStore();
  const [power, setPower] = useState<Power | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => window.veylaro?.powerState?.().then((p) => alive && setPower(p)).catch(() => {});
    read();
    const t = setInterval(read, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const cfg = {
    ...DEFAULT_LEARN_CONFIG,
    enabled: settings.overnight,
    onlyWhenPlugged: settings.overnightOnlyWhenPlugged,
  };
  const p: Power = power || { idleSec: 0, onBattery: false, ok: false };
  const d = decide(cfg, p, "off", 0, Date.now());
  const ui = STATUS_UI[d.status];
  return (
    <div className={`learn-panel ${ui.tone}`}>
      <div className="lp-head">
        <span className={`lp-dot ${ui.tone}`} />
        <b>{ui.label}</b>
        {power?.ok && (
          <span className="lp-power">
            {power.onBattery ? "on battery" : "plugged in"} · idle {Math.floor(power.idleSec / 60)}m {Math.floor(power.idleSec % 60)}s
          </span>
        )}
      </div>
      <p className="lp-note">{ui.note}</p>
      <div className="lp-stats">
        <span><b>{count}</b> verified precedent{count === 1 ? "" : "s"} banked</span>
        <span>{settings.overnightIntensity === "gentle" ? "Gentle" : "Normal"} review budget</span>
      </div>
    </div>
  );
}

function LearningPage() {
  const { settings, setSettings, liveModel } = useStore();
  const [count, setCount] = useState(() => verifiedPrecedentCount());
  const clear = () => {
    if (!confirm("Delete every local verified-learning record? This cannot be undone.")) return;
    clearVerifiedPrecedents();
    setCount(0);
  };
  return (
    <>
      <OvernightProgress count={count} />
      <Toggle on={settings.overnight} onChange={(v) => setSettings({ overnight: v })}
        title="Use private verified learning" sub="Save only locally observed passing checks, then retrieve relevant precedents on future work. Off by default." />
      <Toggle on={settings.overnightOnlyWhenPlugged} onChange={(v) => setSettings({ overnightOnlyWhenPlugged: v })}
        title="Reserve adapter preparation for idle power" sub="Future adapter jobs may run only while plugged in and idle. Retrieval itself is lightweight." />
      <div className="mrow">
        <label>Local review budget</label>
        <div className="seg" style={{ width: "fit-content" }}>
          <button className={settings.overnightIntensity === "gentle" ? "on" : ""} onClick={() => setSettings({ overnightIntensity: "gentle" })}>Gentle</button>
          <button className={settings.overnightIntensity === "normal" ? "on" : ""} onClick={() => setSettings({ overnightIntensity: "normal" })}>Normal</button>
        </div>
        <div className="hintline">This controls review and retrieval depth. It does not claim to rewrite model weights.</div>
      </div>
      <div className="safe-note">
        <Sparkle size={15} />
        <div>
          <b>{count} verified local precedent{count === 1 ? "" : "s"}</b>
          <p>
            A record is created only from an observed passing terminal or verification result.
            Records stay on this machine and are never mixed into another user's model.
            {liveModel ? ` Current runtime: ${liveModel.replace(/:latest$/, "")}.` : " No trainable weights are installed yet."}
          </p>
        </div>
      </div>
      <div className="mfoot" style={{ justifyContent: "flex-start" }}>
        <button className="btn ghost sm" disabled={count === 0} onClick={exportVerifiedPrecedents}>Export records</button>
        <button className="btn ghost sm" disabled={count === 0} onClick={clear}>Delete records</button>
      </div>
      <div className="hintline">
        Weight training is a separate release-gated process. Veylaro may prepare examples,
        but it must not promote an adapter until an unseen holdout beats the installed model.
      </div>
    </>
  );
}

function TerminalPage() {
  const { settings, setSettings } = useStore();
  const [copied, setCopied] = useState<string | null>(null);
  const isDesktop = !!window.veylaro;
  const install = "curl -fsSL https://veylaroai.com/install.sh | sh";
  const copy = (t: string, k: string) => { navigator.clipboard?.writeText(t); setCopied(k); setTimeout(() => setCopied(null), 1500); };
  return (
    <>
      <div className="safe-note" style={{ marginTop: 0 }}>
        <TerminalIc size={15} />
        <div>
          <b>Laro in your own terminal</b>
          <p>Prefer the command line? Install the <code>veylaro</code> command and you get the same agent, same models, same guard — in whatever terminal you already live in.</p>
        </div>
      </div>
      <div className="mrow">
        <label>Install</label>
        <div className="code-copy">
          <code>{install}</code>
          <button className="btn ghost sm" onClick={() => copy(install, "i")}>{copied === "i" ? "Copied ✓" : "Copy"}</button>
        </div>
        <div className="hintline">Then just type <code>veylaro</code> in any folder. <code>veylaro --help</code> lists everything.</div>
      </div>
      <div className="mrow">
        <label>Shell used by terminal mode</label>
        <input type="text" placeholder={isDesktop ? "system default" : "system default"}
          value={settings.terminalShell} onChange={(e) => setSettings({ terminalShell: e.target.value })} />
        <div className="hintline">Leave blank to use your login shell. Every command still passes the safety guard first.</div>
      </div>
    </>
  );
}

function AboutPage() {
  const { liveModel } = useStore();
  const SITE = import.meta.env.DEV ? "http://localhost:5174" : "https://veylaroai.com";
  return (
    <>
      <div className="about-hero">
        <div className="ah-v">Veylaro Code</div>
        <div className="ah-ver">Version {APP_VERSION}</div>
        <p>The most capable AI we know how to fit on your own machine.</p>
      </div>
      <div className="update-box">
        <div className="urow"><span>App</span><b>v{APP_VERSION}</b></div>
        <div className="urow"><span>Model</span><b>{liveModel ? liveModel.replace(/:latest$/, "") : "not installed yet"}</b></div>
      </div>
      <div className="mrow">
        <label>Licences</label>
        <div className="lic-box">
          <p>
            Laro is built on Google's <b>Gemma</b> open-weight models, used under the
            {" "}<b>Apache License 2.0</b> and the Gemma Terms of Use — so those terms flow through to
            every Veylaro product until we ship our own base model.
          </p>
          <p>
            Our own training layers, the agent, the guard and this app are Veylaro Labs' proprietary work.
            The weights we ship are closed and not extractable from the app.
          </p>
          <a href={`${SITE}/#/licenses`} target="_blank" rel="noreferrer">Read the full licence notice →</a>
        </div>
      </div>
      <div className="mrow">
        <label>Legal</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn ghost sm" href={`${SITE}/#/privacy`} target="_blank" rel="noreferrer">Privacy policy</a>
          <a className="btn ghost sm" href={`${SITE}/#/terms`} target="_blank" rel="noreferrer">Terms</a>
          <a className="btn ghost sm" href={`${SITE}/#/licenses`} target="_blank" rel="noreferrer">Licences</a>
        </div>
      </div>
    </>
  );
}

/* ---- the shell ---- */

export function SettingsModal({ onClose, onSignIn, onUpgrade }: {
  onClose: () => void; onSignIn: () => void; onUpgrade: () => void;
}) {
  const [page, setPage] = useState<PageId>("general");
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="modal-veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-shell">
        <aside className="set-side">
          <div className="set-title">Settings</div>
          {PAGES.map((p) => (
            <button key={p.id} className={page === p.id ? "on" : ""} onClick={() => setPage(p.id)}>
              {p.icon} {p.label}
            </button>
          ))}
        </aside>
        <div className="set-main">
          <div className="set-head">
            <h2>{PAGES.find((p) => p.id === page)?.label}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close settings"><X size={14} /></button>
          </div>
          <div className="set-body">
            {page === "general" && <GeneralPage />}
            {page === "models" && <ModelsPage />}
            {page === "permissions" && <PermissionsPage />}
            {page === "privacy" && <PrivacyPage />}
            {page === "account" && <AccountPage onSignIn={onSignIn} onUpgrade={onUpgrade} />}
            {page === "referrals" && <ReferralsPage />}
            {page === "learning" && <LearningPage />}
            {page === "terminal" && <TerminalPage />}
            {page === "about" && <AboutPage />}
          </div>
        </div>
      </div>
    </div>
  );
}
