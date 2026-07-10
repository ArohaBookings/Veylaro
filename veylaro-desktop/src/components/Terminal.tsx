import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { TerminalIc } from "./icons";

const QUICK = [
  "git status",
  'git add -A && git commit -m "checkpoint from Veylaro"',
  "git log --oneline -5",
  "npm test",
  "ls",
];

/** Terminal mode — every command, straight through. Real shell in the
    desktop app (scoped to the session), simulated in browser preview. */
export function TerminalView() {
  const { active, runTerminal } = useStore();
  const [cmd, setCmd] = useState("");
  const [busy, setBusy] = useState(false);
  const [histIdx, setHistIdx] = useState(-1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lines = active?.term || [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length, busy]);

  if (!active) return null;

  const run = async (c: string) => {
    const trimmed = c.trim();
    if (!trimmed || busy) return;
    setCmd("");
    setHistIdx(-1);
    setBusy(true);
    await runTerminal(trimmed);
    setBusy(false);
    inputRef.current?.focus();
  };

  const history = lines.map((l) => l.cmd);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") run(cmd);
    if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      const i = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(i);
      setCmd(history[i]);
    }
    if (e.key === "ArrowDown" && histIdx >= 0) {
      e.preventDefault();
      const i = histIdx + 1;
      if (i >= history.length) {
        setHistIdx(-1);
        setCmd("");
      } else {
        setHistIdx(i);
        setCmd(history[i]);
      }
    }
  };

  const isDesktop = !!window.veylaro?.exec;

  return (
    <div className="term-view" onClick={() => inputRef.current?.focus()}>
      <div className="term-note">
        <TerminalIc size={13} />
        {isDesktop
          ? `Real shell · scoped to ${active.scope} · every command runs on your machine`
          : "Preview shell (simulated) — the desktop app runs every real command through your actual shell"}
      </div>
      <div className="term-scroll">
        {lines.length === 0 && (
          <div className="term-hint">
            Commit files, run tests, poke around — anything your shell can do.
            <div className="term-quick">
              {QUICK.map((q) => (
                <button key={q} onClick={(e) => { e.stopPropagation(); run(q); }}>{q}</button>
              ))}
            </div>
          </div>
        )}
        {lines.map((l) => (
          <div className="term-block" key={l.id}>
            <div className="tcmd"><span className="tp">❯</span> {l.cmd}</div>
            <div className={`tout ${l.ok ? "" : "bad"}`}>{l.out}</div>
          </div>
        ))}
        {busy && <div className="tout dimline">running…</div>}
        <div className="term-prompt">
          <span className="tp">❯</span>
          <input
            ref={inputRef}
            type="text"
            value={cmd}
            disabled={busy}
            spellCheck={false}
            placeholder={isDesktop ? "type any command — git commit, npm test, whatever" : "try: git status · git commit -m \"...\" · npm test · help"}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <div ref={endRef} />
      </div>
    </div>
  );
}
