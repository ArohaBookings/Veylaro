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
  const [step, setStep] = useState(0);
  const ram = typeof navigator !== "undefined" && (navigator as any).deviceMemory ? (navigator as any).deviceMemory : null;
  return (
    <div className="onboard">
      <div className="inner">
        {step === 0 && (
          <>
            <VeylaroMark size={110} animated />
            <h1>Meet <span className="g">Laro</span>.</h1>
            <p>
              An AI engineer that lives on this machine. Not in a data centre, not behind an API key —
              here, on your disk, answering only to you. Unplug the internet and it keeps working.
            </p>
            <div className="ob-ctas">
              <button className="btn primary" onClick={() => setStep(1)}>Show me →</button>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div className="launch-card" style={{ maxWidth: 480, margin: "0 auto" }}>
              <div className="lc-t">✦ Your first month is on us — unlimited.</div>
              <p>
                No card, no trial countdown you have to cancel. Thirty days of everything Veylaro can do,
                because the only honest way to sell a local AI is to let you actually use it.
              </p>
              <p style={{ color: "var(--dim)", fontSize: 12 }}>
                After that: 200 messages a week free forever, or go Pro for unlimited. Your call, later.
              </p>
            </div>
            <div className="ob-ctas">
              <button className="btn primary" onClick={() => setStep(2)}>Nice. What else? →</button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h1 style={{ fontSize: 27 }}>Three things worth knowing.</h1>
            <div className="ob-list">
              <div><b>It only touches what you point it at.</b> Each session is locked to one file or folder. It physically cannot wander — and system files, keys and keychains are blocked in every mode.</div>
              <div><b>It shows its work.</b> You'll see it think, plan, edit, run your app and click through it with its own cursor. No black box.</div>
              <div><b>It gets better while you sleep.</b> Optional. Off by default. Everything it learns stays on this machine.</div>
            </div>
            <div className="ob-ctas">
              <button className="btn primary" onClick={onDone}>Let's build something →</button>
            </div>
            {ram && <div className="ob-ram">We'll set you up on the right model for your {ram} GB of memory.</div>}
          </>
        )}
      </div>
    </div>
  );
}
