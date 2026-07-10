import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { BrowseStep } from "../types";
import { Bolt, Check, Globe, TerminalIc, Warn, X } from "./icons";

/* ============================================================
   The Deck — Veylaro Code's right-hand panel.
   Viewport tab: an embedded browser aimed at your localhost app
   (or the live web when internet is on) with Laro's visible
   cursor driving it. Tasks tab: everything running in the
   background. Resizable, collapsible, remembers its width.
   ============================================================ */

const REL = (ts: number) => {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

/* ---- Laro's cursor, animated across the viewport ---- */
function AiCursor() {
  const { lastBrowse } = useStore();
  const [pos, setPos] = useState({ x: 50, y: 40 });
  const [note, setNote] = useState<string | null>(null);
  const [ripple, setRipple] = useState(0);
  const [typing, setTyping] = useState(false);
  const [visible, setVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!lastBrowse) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setVisible(true);
    lastBrowse.steps.forEach((step: BrowseStep, i: number) => {
      timers.current.push(
        setTimeout(() => {
          setPos({ x: step.x, y: step.y });
          setNote(step.note);
          setTyping(step.action === "type");
          if (step.action === "click") setRipple((r) => r + 1);
        }, 500 + i * 700)
      );
    });
    timers.current.push(
      setTimeout(() => {
        setVisible(false);
        setNote(null);
        setTyping(false);
      }, 500 + lastBrowse.steps.length * 700 + 1600)
    );
    return () => timers.current.forEach(clearTimeout);
  }, [lastBrowse?.ts]);

  if (!visible) return null;
  return (
    <div className="ai-cursor-layer" aria-hidden>
      <div className="ai-cursor" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
        {ripple > 0 && <span key={ripple} className="ai-ripple" />}
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path d="M4 2l6 17 2.5-6.5L19 10z" fill="#e7b487" stroke="#0b0908" strokeWidth="1.4" />
        </svg>
        {note && (
          <span className="ai-note">
            {typing ? "⌨ " : ""}
            {note}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---- localhost health watch ---- */
function useHealth(url: string, enabled: boolean) {
  const [up, setUp] = useState<boolean | null>(null);
  const [wentDownAt, setWentDownAt] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let wasUp: boolean | null = null;
    const probe = async () => {
      try {
        await fetch(url, { mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(3500) });
        if (!alive) return;
        setUp(true);
        wasUp = true;
      } catch {
        if (!alive) return;
        setUp(false);
        if (wasUp) setWentDownAt(Date.now());
        wasUp = false;
      }
    };
    probe();
    const t = setInterval(probe, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [url, enabled]);
  return { up, wentDownAt, clearDown: () => setWentDownAt(null) };
}

/* ---- the viewport tab ---- */
function Viewport() {
  const store = useStore();
  const { settings, setSettings, active, running } = store;
  const [urlDraft, setUrlDraft] = useState(settings.viewportUrl);
  const [reloadKey, setReloadKey] = useState(0);
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(settings.viewportUrl);
  const allowed = isLocal || settings.internet;
  const isDesktop = !!window.veylaro;
  const { up, wentDownAt, clearDown } = useHealth(settings.viewportUrl, isLocal);

  const go = () => {
    let u = urlDraft.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
    setSettings({ viewportUrl: u });
    setUrlDraft(u);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="vp">
      <div className="vp-bar">
        <span className={`vp-dot ${isLocal ? (up === null ? "" : up ? "up" : "down") : "web"}`} title={isLocal ? (up ? "app responding" : up === false ? "app down" : "checking…") : "web mode"} />
        <input
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          spellCheck={false}
          aria-label="Viewport URL"
        />
        <button className="icon-btn" style={{ width: 28, height: 28 }} title="Go / reload" onClick={go}>
          ⟳
        </button>
      </div>
      <div className="vp-stage">
        {allowed ? (
          isDesktop ? (
            // Electron webview renders anything, incl. sites that refuse iframes
            // @ts-expect-error — webview is an Electron tag
            <webview key={`${settings.viewportUrl}-${reloadKey}`} src={settings.viewportUrl} className="vp-frame" allowpopups="false" />
          ) : (
            <iframe
              key={`${settings.viewportUrl}-${reloadKey}`}
              src={settings.viewportUrl}
              className="vp-frame"
              sandbox="allow-scripts allow-same-origin allow-forms"
              title="Laro's viewport"
            />
          )
        ) : (
          <div className="vp-blocked">
            <Globe size={26} />
            <p>
              Internet is off — flip the globe in the composer and the Viewport becomes Laro's
              browser screen. Localhost always works, fully offline.
            </p>
          </div>
        )}
        <AiCursor />
        {isLocal && up === false && (
          <div className="vp-down">
            <Warn size={15} />
            <span>Nothing answering at {settings.viewportUrl}</span>
          </div>
        )}
      </div>
      {wentDownAt && active && (
        <div className="vp-alert">
          <span>⚠ Your app stopped responding{running ? "" : " — want Laro on it?"}</span>
          <span style={{ display: "inline-flex", gap: 6 }}>
            {!running && (
              <button
                className="btn primary sm"
                onClick={() => {
                  clearDown();
                  store.send(`My app at ${settings.viewportUrl} just stopped responding after the last change — investigate and fix it.`, []);
                }}
              >
                Fix it
              </button>
            )}
            <button className="btn ghost sm" onClick={clearDown}>
              <X size={12} />
            </button>
          </span>
        </div>
      )}
      <div className="vp-note">
        {isLocal
          ? "Laro's viewport — it clicks through your app here after each change."
          : "Web mode — Laro can read pages here; only URLs leave your machine."}
      </div>
    </div>
  );
}

/* ---- background tasks tab ---- */
function Tasks() {
  const { bgTasks } = useStore();
  if (!bgTasks.length) {
    return (
      <div className="tasks-empty">
        <Bolt size={22} />
        <p>Background work shows up here — weight warm-ups, web searches, terminal runs, Viewport drives.</p>
      </div>
    );
  }
  return (
    <div className="tasks">
      {bgTasks.map((t) => (
        <div key={t.id} className={`task ${t.status}`}>
          <span className="t-ic">
            {t.status === "running" ? <span className="t-spin" /> : t.status === "done" ? <Check size={13} /> : <X size={13} />}
          </span>
          <span className="t-body">
            <span className="t-label">{t.label}</span>
            {t.detail && <span className="t-detail">{t.detail}</span>}
          </span>
          <span className="t-time">{REL(t.ts)}</span>
        </div>
      ))}
    </div>
  );
}

/* ---- the deck shell ---- */
export function Deck() {
  const { settings, setSettings, bgTasks } = useStore();
  const [tab, setTab] = useState<"viewport" | "tasks">("viewport");
  const dragging = useRef(false);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const w = Math.min(680, Math.max(300, window.innerWidth - e.clientX));
      setSettings({ deckWidth: w });
    };
    const upH = () => (dragging.current = false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", upH);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", upH);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runningCount = bgTasks.filter((t) => t.status === "running").length;

  if (!settings.deckOpen) {
    return (
      <button className="deck-tab-closed" onClick={() => setSettings({ deckOpen: true })} title="Open the Viewport deck">
        <TerminalIc size={14} />
        <span>Viewport</span>
        {runningCount > 0 && <i className="deck-badge">{runningCount}</i>}
      </button>
    );
  }

  return (
    <aside className="deck" style={{ width: settings.deckWidth }}>
      <div className="deck-grip" onPointerDown={() => (dragging.current = true)} title="Drag to resize" />
      <div className="deck-head">
        <div className="seg">
          <button className={tab === "viewport" ? "on" : ""} onClick={() => setTab("viewport")}>
            Viewport
          </button>
          <button className={tab === "tasks" ? "on" : ""} onClick={() => setTab("tasks")}>
            Tasks{runningCount > 0 ? ` · ${runningCount}` : ""}
          </button>
        </div>
        <button className="icon-btn" style={{ width: 28, height: 28 }} title="Collapse deck" onClick={() => setSettings({ deckOpen: false })}>
          <X size={13} />
        </button>
      </div>
      {tab === "viewport" ? <Viewport /> : <Tasks />}
    </aside>
  );
}
