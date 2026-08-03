import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { BrowseStep } from "../types";
import { UI_AUDIT_JS, formatCritique, highIssues, UiReport } from "../engine/uiCritique";
import { pickVisionModel, VISION_CRITIQUE_PROMPT, parseVerdict, verdictToCritique } from "../engine/visionJudge";
import {
  FunctionalReport,
  INJECT_ERRORS_JS,
  PROBE_JS,
  functionalCritique,
  functionalIssues,
  isBroken,
  truthCappedVisualScore,
} from "../engine/functionalGate";

/* Side chat — a pure conversational Laro (talk + web only). Streams live from
   the local model, auto-scrolls, and holds several chats you can switch between. */
function SideChat() {
  const { sideThreads, activeSideThread, sendSideChat, newSideChat, selectSideChat } = useStore();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const threads = sideThreads && sideThreads.length ? sideThreads : [];
  const active = threads.find((t) => t.id === activeSideThread) || threads[threads.length - 1];
  const msgs = active?.msgs || [];
  const last = msgs[msgs.length - 1];

  // Pin to the bottom as messages arrive AND as the streaming reply grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active?.id, msgs.length, last?.text, last?.streaming]);

  return (
    <div className="schat">
      <div className="schat-tabs">
        <div className="schat-tablist">
          {threads.map((th) => (
            <button
              key={th.id}
              className={`schat-tab ${th.id === active?.id ? "on" : ""}`}
              title={th.title}
              onClick={() => selectSideChat(th.id)}
            >
              {th.title || "Chat"}
            </button>
          ))}
        </div>
        <button className="schat-new" title="Start a new chat" onClick={() => newSideChat()}>＋</button>
      </div>
      <div className="schat-scroll" ref={scrollRef}>
        {!msgs.length && (
          <div className="schat-hint">✦ hey — this is chat + web only, so the main build never slows down. ask me anything.</div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`schat-m ${m.role}`}>
            {m.text}
            {m.streaming && (m.text ? <span className="schat-caret" /> : <span className="schat-typing">Laro is thinking…</span>)}
          </div>
        ))}
      </div>
      <div className="schat-bar">
        <input
          value={text}
          placeholder="chat with laro…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { sendSideChat(text); setText(""); } }}
        />
      </div>
    </div>
  );
}
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
  const auditable = isLocal || /^file:/i.test(settings.viewportUrl);
  const allowed = isLocal || settings.internet;
  const isDesktop = !!window.veylaro;
  const { up, wentDownAt, clearDown } = useHealth(settings.viewportUrl, isLocal);

  // UI-TASTE LOOP (in-app): when a page loads, measure its objective quality —
  // contrast, overflow, fonts, tap targets — and surface a taste score. One tap
  // on "Polish" feeds the exact issues back to Laro to fix. Same loop the harness
  // proved took a page from 0/100 to 100/100.
  const vpRef = useRef<any>(null);
  const [taste, setTaste] = useState<UiReport | null>(null);
  const [functional, setFunctional] = useState<FunctionalReport | null>(null);
  const consoleErrors = useRef<string[]>([]);
  useEffect(() => {
    const wv = vpRef.current;
    if (!wv || !isDesktop || !auditable) { setTaste(null); setFunctional(null); return; }
    let alive = true;
    const audit = async () => {
      try {
        await wv.executeJavaScript(INJECT_ERRORS_JS, false).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 300));
        const [visual, reality] = await Promise.all([
          wv.executeJavaScript(UI_AUDIT_JS, false),
          wv.executeJavaScript(PROBE_JS, false),
        ]);
        if (!alive) return;
        if (visual) setTaste(visual as UiReport);
        if (reality) {
          const report = reality as FunctionalReport;
          report.jsErrors = [...new Set([...(report.jsErrors || []), ...consoleErrors.current])].slice(0, 6);
          setFunctional(report);
        }
      } catch { /* webview not ready */ }
    };
    // A webview whose page failed to load still fires dom-ready (for the error
    // page), and auditing it calls executeJavaScript on a guest view that cannot
    // run scripts. That surfaces in the MAIN process as
    //   "Error occurred in handler for 'GUEST_VIEW_MANAGER_CALL'"
    // and was followed by the GPU process dying — the app crash the user hit
    // after Laro pointed the Viewport at http://localhost:3000 with no dev
    // server running (ERR_CONNECTION_REFUSED). Never audit a page that isn't there.
    const loadFailed = { current: false };
    const onFail = (e: any) => {
      // -3 is ABORTED (a normal navigation cancel), not a real failure.
      if (Number(e?.errorCode) === -3) return;
      loadFailed.current = true;
      setFunctional(null);
      setTaste(null);
    };
    const onStart = () => { consoleErrors.current = []; loadFailed.current = false; setFunctional(null); };
    const onConsole = (event: any) => {
      const level = Number(event?.level ?? 0);
      if (level >= 3 && event?.message) consoleErrors.current = [...consoleErrors.current, String(event.message).slice(0, 160)].slice(-6);
    };
    const onReady = () => setTimeout(() => { if (!loadFailed.current) void audit(); }, 500);
    wv.addEventListener("did-start-loading", onStart);
    wv.addEventListener("did-fail-load", onFail);
    wv.addEventListener("console-message", onConsole);
    wv.addEventListener("dom-ready", onReady);
    wv.addEventListener("did-navigate-in-page", onReady);
    return () => {
      alive = false;
      try {
        wv.removeEventListener("did-start-loading", onStart);
      wv.removeEventListener("did-fail-load", onFail);
        wv.removeEventListener("console-message", onConsole);
        wv.removeEventListener("dom-ready", onReady);
        wv.removeEventListener("did-navigate-in-page", onReady);
      } catch { /* gone */ }
    };
  }, [settings.viewportUrl, reloadKey, isDesktop, auditable]);

  const polish = async () => {
    if (!taste) return;
    let critique = formatCritique(taste);
    // Auto vision judge: if a multimodal model is installed, screenshot the render
    // and get a brutal designer's verdict too — the objective audit catches the
    // measurable faults, the vision model catches composition/taste.
    try {
      const listing = await fetch(`${settings.engineUrl.replace(/\/$/, "")}/v1/models`).then((r) => r.json());
      const vm = pickVisionModel((listing?.data || []).map((m: any) => String(m?.id || "")));
      if (vm && vpRef.current?.capturePage) {
        const img = await vpRef.current.capturePage();
        const dataUrl = img.toDataURL();
        const resp = await fetch(`${settings.engineUrl.replace(/\/$/, "")}/v1/chat/completions`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: vm,
            stream: false,
            max_tokens: 260,
            temperature: 0.2,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: VISION_CRITIQUE_PROMPT },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            }],
          }),
        }).then((r) => r.json());
        const vc = verdictToCritique(parseVerdict(resp?.choices?.[0]?.message?.content || ""));
        if (vc) critique += "\n\n" + vc;
      }
    } catch { /* no vision model / capture unavailable — objective audit still applies */ }
    store.send(`Polish the UI you just built — a design review found issues. ${critique}`, []);
  };

  const go = () => {
    let u = urlDraft.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
    setSettings({ viewportUrl: u });
    setUrlDraft(u);
    setReloadKey((k) => k + 1);
  };

  const functionalBroken = !!functional && isBroken(functional);
  const displayedTaste = taste ? truthCappedVisualScore(taste.score, functional) : null;
  const reviewTitle = [
    taste?.issues.length ? "Visual review:\n" + taste.issues.map((i) => `• ${i.msg}`).join("\n") : "Visual checks found no measured issue.",
    functional ? (functionalIssues(functional).length ? "Runtime review:\n" + functionalIssues(functional).map((i) => `• ${i}`).join("\n") : `Runtime probe passed ${functional.testedButtons} safely testable control(s); ${functional.skippedButtons} unclassified or high-impact control(s) were not clicked.`) : "Runtime probe has not completed.",
  ].join("\n\n");

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
        {taste && auditable && displayedTaste !== null && (
          <span
            className={`vp-taste ${highIssues(taste) || functionalBroken ? "bad" : "good"}`}
            title={reviewTitle}
          >
            ✦ {displayedTaste}
            {(functionalBroken || highIssues(taste) > 0) && !running && (
              <button
                className="vp-polish"
                onClick={() => functionalBroken && functional ? store.send(functionalCritique(functional), []) : polish()}
                title={functionalBroken ? "Send the measured runtime failures to Laro" : "Send the measured visual issues to Laro"}
              >
                Fix
              </button>
            )}
          </span>
        )}
      </div>
      <div className="vp-stage">
        {allowed ? (
          isDesktop ? (
            // Electron webview renders anything, incl. sites that refuse iframes
            // @ts-expect-error — webview is an Electron tag
            <webview ref={vpRef} key={`${settings.viewportUrl}-${reloadKey}`} src={settings.viewportUrl} className="vp-frame" allowpopups="false" />
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
  const [tab, setTab] = useState<"viewport" | "tasks" | "chat">("viewport");
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
          <button className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>
            Chat
          </button>
        </div>
        <button className="icon-btn" style={{ width: 28, height: 28 }} title="Collapse deck" onClick={() => setSettings({ deckOpen: false })}>
          <X size={13} />
        </button>
      </div>
      {tab === "viewport" ? <Viewport /> : tab === "tasks" ? <Tasks /> : <SideChat />}
    </aside>
  );
}
