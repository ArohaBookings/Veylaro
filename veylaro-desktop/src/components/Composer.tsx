import { useEffect, useRef, useState } from "react";
import { useStore, uid } from "../state/store";
import { Attachment, PermMode } from "../types";
import { Globe, ImageIc, Lock, Map, Mic, Send } from "./icons";

const PERM_LABELS: Record<PermMode, string> = {
  ask: "Ask before edits & commands",
  edits: "Accept edits, ask for commands",
  bypass: "Bypass — full auto, never stops",
};

export function Composer({
  attachments,
  setAttachments,
  onUpgrade,
}: {
  attachments: Attachment[];
  setAttachments: (fn: (a: Attachment[]) => Attachment[]) => void;
  onUpgrade: () => void;
}) {
  const store = useStore();
  const { settings, setSettings, running, pending, locked, account, active, effectivePlan, remaining } = store;
  const [text, setText] = useState("");

  // crash-proof drafts: restore what you were typing, per session
  useEffect(() => {
    setText(active?.draft || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);
  const [listening, setListening] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

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
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<any>(null);
  const baseTextRef = useRef("");

  const canSend = !!active && !running && !pending && !locked && (text.trim().length > 0 || attachments.length > 0);

  const send = () => {
    if (!canSend) return;
    stopVoice();
    store.send(text.trim(), attachments);
    setText("");
    if (active) store.setDraft(active.id, "");
    setAttachments(() => []);
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const autoGrow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(200, ta.scrollHeight) + "px";
  };

  /* ---- voice typing (Web Speech API) ---- */
  const stopVoice = () => {
    recRef.current?.stop?.();
    recRef.current = null;
    setListening(false);
  };

  const toggleVoice = () => {
    if (listening) return stopVoice();
    const SR = (window as any).SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Voice typing needs the desktop app or a Chromium browser — this environment doesn't expose speech recognition.");
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    baseTextRef.current = text ? text.replace(/\s+$/, "") + " " : "";
    rec.onresult = (e: any) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      setText(baseTextRef.current + final + interim);
      autoGrow();
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  useEffect(() => () => stopVoice(), []);

  /* ---- file input fallback for attaching images ---- */
  const fileRef = useRef<HTMLInputElement>(null);
  const addFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((f) => {
      if (!f.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () =>
        setAttachments((a) => [...a, { id: uid(), name: f.name, dataUrl: String(reader.result) }]);
      reader.readAsDataURL(f);
    });
  };

  const plan = effectivePlan;

  return (
    <div className="composer-wrap">
      {account?.billing === "past_due" && (
        <div className="lock-banner billing">
          <Lock size={20} style={{ color: "var(--amber)", flexShrink: 0 }} />
          <div className="lt">
            <b>Payment issue — your {account.plan === "team" ? "Team" : "Pro"} plan is paused.</b>
            <p>Nothing is deleted. You're on Free limits until the payment goes through, then everything unlocks again automatically.</p>
          </div>
          <a className="btn primary" href="https://veylaroai.com/#/pricing" target="_blank" rel="noreferrer">Fix payment</a>
        </div>
      )}
      {plan === "free" && !locked && remaining <= 20 && (
        <div className="low-strip">
          ⚡ {remaining} free message{remaining === 1 ? "" : "s"} left this week — resets Monday.
          <button className="low-cta" onClick={onUpgrade}>Go unlimited →</button>
        </div>
      )}
      {locked && (
        <div className="lock-banner">
          <Lock size={22} style={{ color: "var(--copper)", flexShrink: 0 }} />
          <div className="lt">
            <b>You've used all 200 free messages this week — resets Monday.</b>
            <p>The model is still on your machine — the free tier just caps the agent. Pro removes every limit: run it all night for one flat price.</p>
          </div>
          <button className="btn primary" onClick={onUpgrade}>Unlock unlimited</button>
        </div>
      )}
      <div className="composer" onPaste={(e) => e.clipboardData?.files?.length && addFiles(e.clipboardData.files)}>
        {attachments.length > 0 && (
          <div className="attach-strip">
            {attachments.map((a) => (
              <span className="attach" key={a.id}>
                <img src={a.dataUrl} alt={a.name} />
                <button aria-label="Remove" onClick={() => setAttachments((arr) => arr.filter((x) => x.id !== a.id))}>×</button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          disabled={!active || locked}
          placeholder={
            !active
              ? "Start a session first — point Laro at a file."
              : listening
                ? "Listening… speak your task."
                : `Tell Laro what to do in ${active.scope.split(/[\\/]/).pop()} — plain English is perfect.`
          }
          onChange={(e) => {
            setText(e.target.value);
            if (active) store.setDraft(active.id, e.target.value); // survives crashes
            autoGrow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="comp-bar">
          <button className={`icon-btn ${listening ? "rec" : ""}`} title="Voice typing" onClick={toggleVoice}>
            <Mic size={15} />
          </button>
          {listening && (
            <span className="wave" aria-hidden><i /><i /><i /><i /><i /></span>
          )}
          <button className="icon-btn" title="Attach a screenshot (or just drag one in)" onClick={() => fileRef.current?.click()}>
            <ImageIc size={15} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <button
            className={`icon-btn globe ${settings.internet && online ? "on" : ""} ${!online ? "off" : ""}`}
            title={
              !online
                ? "No internet right now — Laro keeps working fully offline"
                : settings.internet
                  ? "Internet ON — Laro can search the live web (your code never goes with it)"
                  : "Internet OFF — pure offline mode"
            }
            onClick={() => online && setSettings({ internet: !settings.internet })}
          >
            <Globe size={15} />
          </button>
          <button
            className={`icon-btn plan ${settings.planMode ? "on" : ""}`}
            title={settings.planMode ? "Plan mode ON — Laro shows the plan and waits for your approval" : "Plan mode OFF — Laro plans silently and just goes"}
            onClick={() => setSettings({ planMode: !settings.planMode })}
          >
            <Map size={15} />
          </button>
          <span className="perm">
            <select
              value={settings.permMode}
              onChange={(e) => setSettings({ permMode: e.target.value as PermMode })}
              title="Permission mode"
            >
              {(Object.keys(PERM_LABELS) as PermMode[]).map((k) => (
                <option key={k} value={k}>{PERM_LABELS[k]}</option>
              ))}
            </select>
            {settings.permMode === "bypass" && <span className="warn">full auto</span>}
          </span>
          {plan === "free" && !locked && (
            <span style={{ fontSize: 11, color: "var(--dim)", fontFamily: "var(--font-mono)" }}>
              {store.remaining} msgs left this week
            </span>
          )}
          <button className="send" disabled={!canSend} onClick={send} aria-label="Send">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
