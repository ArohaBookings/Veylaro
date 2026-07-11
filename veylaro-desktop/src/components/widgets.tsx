import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { FREE_WEEKLY_LIMIT, MODELS, ModelId } from "../types";
import { tokenSpeed } from "../engine/demo";
import { Checkpoint } from "../types";
import { Bolt, Rewind, Shield, Wifi0 } from "./icons";

/* ============ Model slider — Laro Lite ⟷ Laro Max ============ */

export function ModelSlider() {
  const { settings, setSettings } = useStore();
  const [burst, setBurst] = useState(0);
  const [toast, setToast] = useState<ModelId | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const flip = (m: ModelId) => {
    if (m === settings.model) return;
    setSettings({ model: m });
    setBurst((b) => b + 1);
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1900);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const sparks = Array.from({ length: 10 });
  return (
    <div
      className={`mslider ${settings.model === "max" ? "max" : ""} ${burst ? "burst" : ""}`}
      key={burst /* re-trigger spark animation */}
      role="radiogroup"
      aria-label="Model"
      title={MODELS[settings.model].blurb}
    >
      <div className="thumb" />
      <button className={`opt ${settings.model === "lite" ? "on" : ""}`} style={{ all: "unset", position: "absolute", inset: "0 50% 0 0", display: "grid", placeItems: "center", cursor: "pointer", zIndex: 2 }} onClick={() => flip("lite")}>
        <span className={`opt-lbl`} style={{ fontSize: 12.5, fontWeight: 700, color: settings.model === "lite" ? "#fff" : "var(--dim)", transition: "color .3s" }}>Laro Lite</span>
      </button>
      <button className={`opt r ${settings.model === "max" ? "on" : ""}`} style={{ all: "unset", position: "absolute", inset: "0 0 0 50%", display: "grid", placeItems: "center", cursor: "pointer", zIndex: 2 }} onClick={() => flip("max")}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: settings.model === "max" ? "#fff" : "var(--dim)", transition: "color .3s", display: "inline-flex", alignItems: "center", gap: 5 }}>
          Laro Max
        </span>
      </button>
      {burst > 0 &&
        sparks.map((_, i) => {
          const ang = (i / sparks.length) * Math.PI * 2;
          const dist = 26 + Math.random() * 22;
          return (
            <span
              key={`${burst}-${i}`}
              className="spark"
              style={{
                left: settings.model === "max" ? "75%" : "25%",
                top: "50%",
                ["--sx" as any]: `${Math.cos(ang) * dist}px`,
                ["--sy" as any]: `${Math.sin(ang) * dist}px`,
              }}
            />
          );
        })}
      {toast && (
        <div className="swap-toast">
          <span>
            Swapping weights → <b style={{ color: "var(--text)" }}>{MODELS[toast].name}</b> · {MODELS[toast].disk} mapped
          </span>
          <span className="bar"><i /></span>
        </div>
      )}
    </div>
  );
}

/* ============ Privacy HUD — proof it's local ============ */

export function PrivacyHud() {
  const { running, settings } = useStore();
  const [tps, setTps] = useState(0);
  const [ram, setRam] = useState(4.2);
  const [online, setOnline] = useState(navigator.onLine);
  const [saved, setSaved] = useState(() => Number(localStorage.getItem("veylaro.saved") || 0));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!running) {
      setTps(0);
      return;
    }
    const t = setInterval(() => {
      setTps(tokenSpeed(settings.model));
      setRam((r) => Math.min(settings.model === "max" ? 9.6 : 4.4, Math.max(3.2, r + (Math.random() - 0.45))));
      setSaved((s) => {
        const n = +(s + Math.random() * 0.03).toFixed(2);
        localStorage.setItem("veylaro.saved", String(n));
        return n;
      });
    }, 700);
    return () => clearInterval(t);
  }, [running, settings.model]);

  return (
    <div className="hud" aria-label="Privacy and performance">
      <span className="cell ok"><Shield size={12} /> <b>0 bytes</b> to the cloud</span>
      <span className="cell"><Bolt size={12} /> <b>{running ? tps : "—"}</b> tok/s</span>
      <span className="cell"><b>{ram.toFixed(1)} GB</b> RAM</span>
      <span className="cell"><b>${saved.toFixed(2)}</b> saved vs cloud</span>
      {!online && <span className="cell off"><Wifi0 size={12} /> offline — still fully working</span>}
    </div>
  );
}

/* ============ Usage meter ring (free tier) ============ */

export function UsageRing() {
  const { usage, effectivePlan, billingStatus } = useStore();
  const plan = effectivePlan;
  if (plan !== "free") {
    return (
      <div className="meter">
        <span className="inf">∞</span>
        <div className="lbl">
          <b>Unlimited usage</b>
          {billingStatus.label}{billingStatus.daysLeft != null ? ` · ${billingStatus.daysLeft}d left` : " — run it all day."}
        </div>
      </div>
    );
  }
  const used = usage.used;
  const left = Math.max(0, FREE_WEEKLY_LIMIT - used);
  const pct = Math.min(1, used / FREE_WEEKLY_LIMIT);
  const R = 19;
  const C = 2 * Math.PI * R;
  return (
    <div className="meter">
      <div className="ring">
        <svg width="46" height="46">
          <defs>
            <linearGradient id="meterGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e7b487" />
              <stop offset="1" stopColor="#b06a3a" />
            </linearGradient>
          </defs>
          <circle className="track" cx="23" cy="23" r={R} fill="none" strokeWidth="4" />
          <circle
            className="fill"
            cx="23"
            cy="23"
            r={R}
            fill="none"
            strokeWidth="4"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct)}
          />
        </svg>
        <span className="n">{left}</span>
      </div>
      <div className="lbl">
        <b>{left} messages left</b>
        {billingStatus.banner ? billingStatus.label : "Free tier · resets Monday"}
      </div>
    </div>
  );
}

/* ============ Time machine — checkpoint timeline ============ */

export function Timeline({ checkpoints }: { checkpoints: Checkpoint[] }) {
  const { restoreCheckpoint, running } = useStore();
  if (checkpoints.length === 0) return null;
  return (
    <div className="timeline" aria-label="Checkpoints">
      <span className="tl-lbl"><Rewind size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Time machine</span>
      <div className="tl-track">
        {checkpoints.map((cp, i) => (
          <span key={cp.id} style={{ display: "contents" }}>
            {i > 0 && <span className="tl-seg" />}
            <button
              className="tl-node"
              disabled={running}
              onClick={() => {
                if (confirm(`Rewind to "${cp.label}"?\nEvery edit after this point is rolled back.`)) restoreCheckpoint(cp);
              }}
            >
              <span className="nd" />
              <span className="tip">{cp.label} · {new Date(cp.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
