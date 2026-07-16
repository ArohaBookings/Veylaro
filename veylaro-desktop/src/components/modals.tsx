import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { APP_VERSION, LangPref, MODELS, SubAgentPref } from "../types";
import { recommendModel } from "../engine/tiers";
import { VeylaroMark } from "./Logo";
import { Bolt, Check, Clock, Cpu, FileIc, FolderIc, Sparkle, User } from "./icons";

const SITE_URL = import.meta.env.DEV ? "http://localhost:5174" : "https://veylaroai.com";

function Veil({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="modal-veil" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal">{children}</div>
    </div>
  );
}

/* ============ Sign in ============ */

export function SignInModal({ onClose }: { onClose: () => void }) {
  const { signIn } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [license, setLicense] = useState("");
  const [phase, setPhase] = useState<"form" | "sync" | "done">("form");
  const [foundPlan, setFoundPlan] = useState("free");

  const go = async () => {
    if (!email.includes("@")) return;
    setPhase("sync");
    const acct = await signIn(name, email, license);
    setFoundPlan(acct.plan);
    setPhase("done");
    setTimeout(onClose, 1600);
  };

  return (
    <Veil onClose={phase === "form" ? onClose : undefined}>
      {phase === "form" && (
        <>
          <h2><User size={19} /> Sign in to Veylaro</h2>
          <p className="sub">Use the account you created on veylaro.ai. Your plan syncs; your code never does.</p>
          <div className="mrow">
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Leo" />
          </div>
          <div className="mrow">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="mrow">
            <label>License key — optional</label>
            <input type="text" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="VEY-PRO-XXXX-XXXX" />
            <div className="hintline">Pro & Team keys unlock unlimited usage instantly.</div>
          </div>
          <div className="mfoot">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={go} disabled={!email.includes("@")}>Sign in</button>
          </div>
        </>
      )}
      {phase === "sync" && (
        <div style={{ textAlign: "center", padding: "26px 0 18px" }}>
          <span className="spin-star" style={{ display: "inline-grid" }}><Sparkle size={34} style={{ color: "var(--copper)" }} /></span>
          <h2 style={{ justifyContent: "center", marginTop: 16 }}>Syncing with your Veylaro account…</h2>
          <p className="sub">Checking your plan. Nothing else leaves this machine.</p>
        </div>
      )}
      {phase === "done" && (
        <div style={{ textAlign: "center", padding: "26px 0 18px" }}>
          <Check size={36} style={{ color: "var(--green)" }} />
          <h2 style={{ justifyContent: "center", marginTop: 14 }}>Welcome back.</h2>
          <p className="sub">
            {foundPlan === "free"
              ? "You're on the Free plan — 200 agent messages a week, resets Monday."
              : `${foundPlan === "pro" ? "Pro" : "Team"} plan found — unlimited usage unlocked. ✦`}
          </p>
        </div>
      )}
    </Veil>
  );
}

/* ============ New session (scope picker + hardware fit) ============ */

export function NewSessionModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [manual, setManual] = useState("");
  const [ramGB, setRamGB] = useState<number | null>(null);

  useEffect(() => {
    if (window.veylaro?.sysinfo) {
      window.veylaro.sysinfo().then((s) => setRamGB(s.ramGB)).catch(() => {});
    } else if ((navigator as any).deviceMemory) {
      setRamGB((navigator as any).deviceMemory);
    }
  }, []);

  const start = (scope: string, kind: "file" | "folder") => {
    store.newSession(scope, kind);
    onClose();
  };

  const pick = async (kind: "file" | "folder") => {
    if (window.veylaro) {
      const p = kind === "file" ? await window.veylaro.pickFile() : await window.veylaro.pickFolder();
      if (p) start(p, kind);
      return;
    }
    // browser preview fallback: file input gives us the name
    const input = document.createElement("input");
    input.type = "file";
    if (kind === "folder") (input as any).webkitdirectory = true;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const rel = (f as any).webkitRelativePath as string | undefined;
      const scope = kind === "folder" && rel ? rel.split("/")[0] : f.name;
      start(scope, kind);
    };
    input.click();
  };

  const fitModel = ramGB == null ? null : recommendModel(ramGB);

  return (
    <Veil onClose={onClose}>
      <h2><Sparkle size={18} style={{ color: "var(--copper)" }} /> New session</h2>
      <p className="sub">
        Pick what Laro is allowed to work on. It reads the scope, plans, and only ever edits inside it —
        that's the scope lock.
      </p>
      <div className="mrow scope-pick">
        <button onClick={() => pick("file")}>
          <span className="st"><FileIc size={16} /> A single file</span>
          <span className="ss">Laser focus. Laro edits this file and nothing else.</span>
        </button>
        <button onClick={() => pick("folder")}>
          <span className="st"><FolderIc size={16} /> A project folder</span>
          <span className="ss">Full context. Indexed on-device in seconds.</span>
        </button>
      </div>
      <div className="mrow">
        <label>Or type a path</label>
        <input
          type="text"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="~/projects/app/src/checkout.ts"
          onKeyDown={(e) => e.key === "Enter" && manual.trim() && start(manual.trim(), manual.includes(".") ? "file" : "folder")}
        />
      </div>
      {fitModel && (
        <div className="fit-note">
          <Cpu size={16} style={{ flexShrink: 0, marginTop: 1, color: "var(--champagne)" }} />
          <span>
            Hardware fit check: this machine reports <b>{ramGB} GB RAM</b> —{" "}
            {fitModel === "lite" ? (
              <>we recommend <b>Laro Lite</b> here. Same brain, feather footprint.</>
            ) : (
              <>you can run <b>Laro Max</b> at full power. Lucky you.</>
            )}
            {store.settings.model !== fitModel && (
              <>
                {" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    store.setSettings({ model: fitModel });
                  }}
                >
                  Switch to {MODELS[fitModel].name} →
                </a>
              </>
            )}
          </span>
        </div>
      )}
      <div className="mfoot">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!manual.trim()} onClick={() => start(manual.trim(), manual.includes(".") ? "file" : "folder")}>
          Start session
        </button>
      </div>
    </Veil>
  );
}

/* ============ Settings ============ */

function Toggle({ on, onChange, title, sub }: { on: boolean; onChange: (v: boolean) => void; title: string; sub: string }) {
  return (
    <div className="tgl">
      <div>
        <div className="tl">{title}</div>
        <div className="ts">{sub}</div>
      </div>
      <span className={`sw ${on ? "on" : ""}`} role="switch" aria-checked={on} onClick={() => onChange(!on)} />
    </div>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, setSettings, ramGB } = useStore();
  return (
    <Veil onClose={onClose}>
      <h2>Settings</h2>
      <p className="sub">Everything here is stored locally — like everything else.</p>
      <div className="mrow">
        <Toggle
          on={settings.personality}
          onChange={(v) => setSettings({ personality: v })}
          title="Personality while working"
          sub="Laro thinks out loud — “silly me, wrong import path…”"
        />
        <Toggle
          on={settings.planMode}
          onChange={(v) => setSettings({ planMode: v })}
          title="Plan mode"
          sub="Laro presents the plan and waits for your approval before touching anything."
        />
        <Toggle
          on={settings.internet}
          onChange={(v) => setSettings({ internet: v })}
          title="Internet access"
          sub="Search and read the live web when online. Your code never leaves the machine."
        />
        <Toggle
          on={settings.permMode === "bypass"}
          onChange={(v) => setSettings({ permMode: v ? "bypass" : "edits" })}
          title="Bypass permissions (full auto)"
          sub="Never stops to ask — plans, edits and commands run straight through."
        />
        <Toggle
          on={settings.reasoning}
          onChange={(v) => setSettings({ reasoning: v })}
          title="Visible reasoning"
          sub="Watch Laro think before it answers — frontier-style, fully local."
        />
        <Toggle
          on={settings.voice}
          onChange={(v) => setSettings({ voice: v })}
          title="Voice replies"
          sub="Laro reads each recap aloud when a run finishes."
        />
        <Toggle
          on={settings.sounds}
          onChange={(v) => setSettings({ sounds: v })}
          title="Completion sounds"
          sub="A soft chime when a run finishes."
        />
      </div>
      <div className="mrow">
        <label>Sub-agents</label>
        <div className="seg" style={{ width: "fit-content" }}>
          {(["off", "duo", "auto"] as SubAgentPref[]).map((s) => (
            <button key={s} className={settings.subAgents === s ? "on" : ""} onClick={() => setSettings({ subAgents: s })}>
              {s === "off" ? "Solo" : s === "duo" ? "2 agents" : `Auto (${ramGB >= 16 ? 3 : 2} on this Mac)`}
            </button>
          ))}
        </div>
        <div className="hintline">Auto scales with your hardware — {ramGB} GB RAM detected → {ramGB >= 16 ? "3 lanes" : "2 lanes"}.</div>
      </div>
      <div className="mrow">
        <label>Explanation style</label>
        <div className="seg" style={{ width: "fit-content" }}>
          {(["both", "plain", "dev"] as LangPref[]).map((l) => (
            <button key={l} className={settings.lang === l ? "on" : ""} onClick={() => setSettings({ lang: l })}>
              {l === "both" ? "Plain + Dev" : l === "plain" ? "Plain English" : "Dev only"}
            </button>
          ))}
        </div>
      </div>
      <div className="mrow">
        <label>Engine</label>
        <div className="seg" style={{ width: "fit-content" }}>
          <button className={settings.engine === "demo" ? "on" : ""} onClick={() => setSettings({ engine: "demo" })}>
            Preview brain
          </button>
          <button className={settings.engine === "ollama" ? "on" : ""} onClick={() => setSettings({ engine: "ollama" })}>
            Live Laro weights
          </button>
        </div>
        {settings.engine === "ollama" && (
          <>
            <div className="mrow">
              <label>Local endpoint</label>
              <input type="text" value={settings.ollamaUrl} onChange={(e) => setSettings({ ollamaUrl: e.target.value })} />
            </div>
            <div className="mrow">
              <label>Model name</label>
              <input type="text" value={settings.ollamaModel} onChange={(e) => setSettings({ ollamaModel: e.target.value })} />
              <div className="hintline">Point this at the served Laro weights (Ollama / OpenAI-compatible).</div>
            </div>
          </>
        )}
      </div>
      <div className="mfoot">
        <button className="btn primary" onClick={onClose}>Done</button>
      </div>
    </Veil>
  );
}

/* ============ Upgrade ============ */

export function UpgradeModal({ onClose }: { onClose: () => void }) {
  const { account } = useStore();
  return (
    <Veil onClose={onClose}>
      <h2><Sparkle size={18} style={{ color: "var(--copper)" }} /> Go unlimited</h2>
      <p className="sub">
        The model already lives on your machine — Pro simply removes the meter. Heavy usage costs us
        nothing, so we don't charge you for it.
      </p>
      <div className="mrow" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { t: "Unlimited agent messages", s: "Run a 12-hour overnight refactor. Flat price." },
          { t: "Advanced long-term memory", s: "Laro remembers your architecture between sessions." },
          { t: "Local API endpoint", s: "Point your own scripts at your own machine." },
          { t: "Commercial license", s: "Ship real work with it." },
        ].map((f) => (
          <div key={f.t} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Check size={15} style={{ color: "var(--copper)", marginTop: 3, flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{f.t}</div>
              <div style={{ color: "var(--dim)", fontSize: 12 }}>{f.s}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mfoot">
        <button className="btn ghost" onClick={onClose}>Not now</button>
        <a className="btn primary" href="https://buy.stripe.com/5kQ8wH5cnfkRfN7576aR200" target="_blank" rel="noreferrer">
          Upgrade — $29/mo →
        </a>
      </div>
      <div className="hintline" style={{ textAlign: "right" }}>
        <a href="https://buy.stripe.com/bJe9ALgV55Kh9oJbvuaR201" target="_blank" rel="noreferrer">
          Or annual — $290/yr (2 months free) →
        </a>{" "}
        · Stripe checkout · USD & NZD
      </div>
      {account && (
        <div className="hintline" style={{ textAlign: "right" }}>
          Signed in as {account.email} — your plan syncs automatically after checkout.
        </div>
      )}
    </Veil>
  );
}

/* ============ Intelligence — overnight training + updates ============ */

interface UpdateFeed {
  app_version: string;
  model_version: string;
  model_name: string;
  notes: string;
  pull_command?: string;
}

export function IntelligenceModal({ onClose }: { onClose: () => void }) {
  const { settings, setSettings, liveModel } = useStore();
  const [feed, setFeed] = useState<UpdateFeed | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateState, setUpdateState] = useState<"idle" | "downloading" | "done" | "error">("idle");

  const checkUpdates = async () => {
    setChecking(true);
    setFeed(null);
    try {
      const res = await fetch(`${SITE_URL}/code-updates.json?t=${Date.now()}`, { signal: AbortSignal.timeout(6000) });
      if (res.ok) setFeed(await res.json());
    } catch {
      /* offline or site unreachable — stays null */
    }
    setChecking(false);
  };

  useEffect(() => {
    checkUpdates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasUpdate = feed && feed.app_version !== APP_VERSION;

  const downloadUpdate = async () => {
    if (!feed) return;
    setUpdateState("downloading");
    try {
      if (window.veylaro?.exec && feed.pull_command) {
        const r = await window.veylaro.exec(feed.pull_command);
        setUpdateState(r.ok ? "done" : "error");
      } else {
        window.open(`${SITE_URL}/#/download`, "_blank");
        setUpdateState("done");
      }
    } catch {
      setUpdateState("error");
    }
  };

  return (
    <Veil onClose={onClose}>
      <h2><Bolt size={18} style={{ color: "var(--copper)" }} /> Intelligence</h2>
      <p className="sub">Your Laro gets smarter two ways: our updates, and — if you opt in — its own overnight practice.</p>

      <div className="mrow">
        <Toggle
          on={settings.overnight}
          onChange={(v) => setSettings({ overnight: v })}
          title="Overnight training"
          sub="While you sleep (idle + plugged in), Laro runs a small LoRA pass on your accepted work — a personal adapter, trained on your style, stored only on this machine."
        />
        <div className="fit-note" style={{ marginTop: 10 }}>
          <Clock size={15} style={{ flexShrink: 0, marginTop: 2, color: "var(--champagne)" }} />
          <span>
            {settings.overnight ? (
              <>
                <b>Armed.</b> Trains only when the machine is idle and powered. Your personal adapter is kept{" "}
                <b>separate from the base weights</b> — when a Veylaro update lands, the adapter is re-applied on
                top, so updates never erase what Laro learned about you.
              </>
            ) : (
              <>Off. Laro still improves with every Veylaro update — this switch just adds personal practice on top.</>
            )}
          </span>
        </div>
      </div>

      <div className="mrow">
        <label>Your personal Laro</label>
        <div className="update-box">
          <div className="urow"><span>Base weights</span><b>{liveModel ? liveModel.replace(/:latest$/, "") : "arrives with launch"}</b></div>
          <div className="urow"><span>Your adapter</span><b>{settings.overnight ? "training nightly ✦" : "not started"}</b></div>
          <div className="unote">
            Your adapter is yours alone — it layers on top of the base weights. When we ship a smarter
            Laro, your adapter re-applies automatically: new brain, same you-shaped instincts. Weights
            stay closed and on this machine.
          </div>
        </div>
      </div>

      <div className="mrow">
        <label>Updates</label>
        <div className="update-box">
          <div className="urow">
            <span>App</span>
            <b>v{APP_VERSION}</b>
          </div>
          <div className="urow">
            <span>Model</span>
            <b>{liveModel ? liveModel.replace(/:latest$/, "") : "preview brain (no local weights found)"}</b>
          </div>
          {checking && <div className="unote">Checking veylaro for updates…</div>}
          {!checking && feed && hasUpdate && (
            <div className="update-cta">
              <div>
                <b>Update available — v{feed.app_version}</b>
                <div className="unote">{feed.notes}</div>
              </div>
              <button className="btn primary sm" onClick={downloadUpdate} disabled={updateState === "downloading"}>
                {updateState === "downloading" ? "Downloading…" : updateState === "done" ? "✓ Ready — restart app" : "Download update"}
              </button>
            </div>
          )}
          {!checking && feed && !hasUpdate && <div className="unote">✓ You're on the latest Veylaro Code.</div>}
          {!checking && !feed && <div className="unote">Couldn't reach the update feed — offline is fine, Laro keeps working. Try again later.</div>}
          {updateState === "error" && <div className="unote" style={{ color: "var(--red)" }}>Update failed — check your connection and retry.</div>}
        </div>
      </div>

      <div className="mfoot">
        <button className="btn ghost" onClick={checkUpdates} disabled={checking}>Check again</button>
        <button className="btn primary" onClick={onClose}>Done</button>
      </div>
    </Veil>
  );
}

/* ============ First-run onboarding ============ */

export function Onboarding({ onDone }: { onDone: () => void }) {
  return (
    <div className="onboard">
      <div className="inner">
        <VeylaroMark size={120} animated />
        <h1>
          Meet <span className="g">Laro</span>.
        </h1>
        <p>
          The most powerful local AI coding agent in the world — living on this machine, not in a
          data center. Private by physics. No usage meters running in the background. Works on a
          plane, in a bunker, on your terms.
        </p>
        <div className="ob-ctas">
          <button className="btn primary" onClick={onDone}>
            Start building →
          </button>
        </div>
      </div>
    </div>
  );
}
