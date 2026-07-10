import { useEffect, useRef, useState } from "react";
import { StoreProvider, uid, useStore } from "./state/store";
import { Attachment, LangPref } from "./types";
import { VeylaroMark } from "./components/Logo";
import { Sidebar } from "./components/Sidebar";
import { Chat } from "./components/Chat";
import { Composer } from "./components/Composer";
import { ModelSlider, PrivacyHud, Timeline } from "./components/widgets";
import { IntelligenceModal, NewSessionModal, Onboarding, SettingsModal, SignInModal, UpgradeModal } from "./components/modals";
import { TerminalView } from "./components/Terminal";
import { Deck } from "./components/Deck";
import { Palette } from "./components/Palette";
import { ChatIc, FileIc, ImageIc, TerminalIc } from "./components/icons";

function Shell() {
  const store = useStore();
  const { active, settings, setSettings, onboarded, liveModel, lastSaved } = store;
  const [modal, setModal] = useState<null | "signin" | "new" | "settings" | "upgrade" | "intel">(null);
  const [view, setView] = useState<"chat" | "term">("chat");
  const [palette, setPalette] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setModal("new");
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setSettings({ deckOpen: !settingsRef.current.deckOpen });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  /* window-level drag & drop for screenshots — from anywhere */
  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      dragDepth.current++;
      setDragging(true);
    };
    const leave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = e.dataTransfer?.files;
      if (!files) return;
      Array.from(files).forEach((f) => {
        if (!f.type.startsWith("image/")) return;
        const reader = new FileReader();
        reader.onload = () =>
          setAttachments((a) => [...a, { id: uid(), name: f.name, dataUrl: String(reader.result) }]);
        reader.readAsDataURL(f);
      });
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  if (!onboarded) return <Onboarding onDone={() => store.setOnboarded()} />;

  return (
    <div className="shell">
      <div className="titlebar">
        <span className="brand">
          <VeylaroMark size={20} /> Veylaro <span style={{ color: "var(--copper)", marginLeft: 2 }}>Code</span>
        </span>
        <span className="env">
          <span className="saved-chip" title="Everything autosaves locally — chat, files, checkpoints, drafts. Crash-proof.">
            ✓ saved {new Date(lastSaved).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="dot-live" /> local ·{" "}
          {settings.engine === "ollama" && liveModel
            ? `live weights · ${liveModel.replace(/:latest$/, "")}`
            : settings.engine === "ollama"
              ? "live engine (model offline)"
              : "preview brain"}
        </span>
      </div>

      <div className="body" style={{ gridTemplateColumns: "var(--side-w) 1fr auto" }}>
        <Sidebar
          onNewSession={() => setModal("new")}
          onSignIn={() => setModal("signin")}
          onSettings={() => setModal("settings")}
          onUpgrade={() => setModal("upgrade")}
          onIntelligence={() => setModal("intel")}
        />

        <div className="main">
          <div className="chat-head">
            <ModelSlider />
            {active && (
              <span className="scope-chip" title={active.scope}>
                <FileIc size={12} /> <span className="p">{active.scope}</span> · scope-locked
              </span>
            )}
            {active && (
              <div className="seg" role="radiogroup" aria-label="View">
                <button className={view === "chat" ? "on" : ""} onClick={() => setView("chat")}>
                  <ChatIc size={12} style={{ verticalAlign: -2, marginRight: 5 }} />Agent
                </button>
                <button className={view === "term" ? "on" : ""} onClick={() => setView("term")}>
                  <TerminalIc size={12} style={{ verticalAlign: -2, marginRight: 5 }} />Terminal
                </button>
              </div>
            )}
            <span className="head-spacer" />
            <div className="seg" role="radiogroup" aria-label="Explanation style">
              {(["both", "plain", "dev"] as LangPref[]).map((l) => (
                <button key={l} className={settings.lang === l ? "on" : ""} onClick={() => setSettings({ lang: l })}>
                  {l === "both" ? "Both" : l === "plain" ? "Plain" : "Dev"}
                </button>
              ))}
            </div>
            <PrivacyHud />
          </div>

          {active ? (
            view === "term" ? (
              <TerminalView />
            ) : (
              <>
                <Chat />
                <Timeline checkpoints={active.checkpoints} />
              </>
            )
          ) : (
            <div className="empty">
              <div className="ei">
                <VeylaroMark size={86} animated />
                <h2>Point Laro at something.</h2>
                <p>
                  Start a session, choose a file or folder, and give it real work. It plans, edits,
                  runs and verifies — and it never phones home.
                </p>
                <div className="hints">
                  <button onClick={() => setModal("new")}>✦ New session — pick a file to work on</button>
                  <button onClick={() => setModal("signin")}>✦ Sign in to sync your plan from veylaro.ai</button>
                  <button onClick={() => setModal("settings")}>✦ Choose how much Laro asks before acting</button>
                </div>
              </div>
            </div>
          )}

          {(view === "chat" || !active) && (
            <Composer attachments={attachments} setAttachments={setAttachments} onUpgrade={() => setModal("upgrade")} />
          )}
        </div>

        <Deck />
      </div>

      {dragging && (
        <div className="drop-overlay">
          <div className="di">
            <ImageIc size={46} style={{ color: "var(--copper)" }} />
            <h3>Drop it — I'll take a look.</h3>
            <p>Screenshots, mockups, error dialogs. Analyzed locally, of course.</p>
          </div>
        </div>
      )}

      {modal === "signin" && <SignInModal onClose={() => setModal(null)} />}
      {modal === "new" && <NewSessionModal onClose={() => setModal(null)} />}
      {modal === "settings" && <SettingsModal onClose={() => setModal(null)} />}
      {modal === "upgrade" && <UpgradeModal onClose={() => setModal(null)} />}
      {modal === "intel" && <IntelligenceModal onClose={() => setModal(null)} />}
      {palette && <Palette onClose={() => setPalette(false)} openModal={(m) => setModal(m)} setView={setView} />}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
