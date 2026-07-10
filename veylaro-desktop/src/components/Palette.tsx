import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { Session } from "../types";

/* ============================================================
   ⌘K command palette — jump anywhere, do anything, no mouse.
   Also home of the Flight Recorder: export any session as a
   beautiful standalone HTML report.
   ============================================================ */

export function exportSessionReport(session: Session) {
  const ev = session.msgs.flatMap((m) =>
    m.role === "user"
      ? [`<div class="u">🧑 ${esc(m.text || "")}</div>`]
      : (m.events || []).map((e) => {
          switch (e.kind) {
            case "say": return `<div class="s">${esc(e.plain)}<div class="d">› ${esc(e.dev)}</div></div>`;
            case "think": return `<div class="t">✦ ${esc(e.text)}</div>`;
            case "file": return `<div class="f">${e.op === "create" ? "NEW" : "EDIT"} ${esc(e.path)} <b>+${e.plus}</b> <s>−${e.minus}</s></div>`;
            case "cmd": return `<div class="c">❯ ${esc(e.cmd)}<div class="o">${esc(e.out)}</div></div>`;
            case "verify": return `<div class="v">${e.ok ? "✓ Verified" : "✗ Failed"} · ${esc(e.target)} — ${esc(e.detail)}</div>`;
            case "plan": return `<div class="p">PLAN — ${esc(e.goal)}<ol>${e.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>`;
            case "recap": return `<div class="r"><b>${esc(e.title)}</b><ul>${e.bullets.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><code>${esc(e.commit)}</code></div>`;
            case "browse": return `<div class="s">🖱 Viewport: ${esc(e.summary)}</div>`;
            default: return "";
          }
        })
  ).join("\n");
  const files = Object.values(session.files)
    .map((f) => `<tr><td>${esc(f.path)}</td><td>+${f.plus}</td><td>−${f.minus}</td><td>${f.verified ? "verified" : "—"}</td></tr>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Veylaro session — ${esc(session.title)}</title><style>
  body{background:#0b0908;color:#f4efe6;font:15px/1.6 -apple-system,Inter,sans-serif;max-width:760px;margin:40px auto;padding:0 20px}
  h1{font-size:22px} .meta{color:#84786a;font-size:13px;margin-bottom:26px}
  .u{background:rgba(216,154,102,.14);border:1px solid rgba(216,154,102,.3);border-radius:12px;padding:10px 14px;margin:18px 0 10px;font-weight:600}
  .s{margin:10px 0}.d{color:#84786a;font-family:ui-monospace,monospace;font-size:12px}
  .t{color:#84786a;font-style:italic;font-size:13px;margin:8px 0}
  .f{font-family:ui-monospace,monospace;font-size:13px;border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:7px 11px;margin:8px 0}
  .f b{color:#4fd396}.f s{color:#f87171;text-decoration:none}
  .c{font-family:ui-monospace,monospace;font-size:13px;background:rgba(0,0,0,.4);border-radius:9px;padding:8px 12px;margin:8px 0;color:#eed3ae}.o{color:#b4a998}
  .v{color:#4fd396;font-size:13.5px;margin:8px 0}
  .p{border:1px solid rgba(238,211,174,.3);border-radius:11px;padding:10px 14px;margin:10px 0;font-size:14px}
  .r{border:1px solid rgba(216,154,102,.4);border-radius:12px;padding:12px 16px;margin:12px 0}.r code{display:block;margin-top:8px;color:#eed3ae;font-size:12.5px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.08)}
  </style></head><body>
  <h1>✦ Veylaro Code — session report</h1>
  <div class="meta">${esc(session.title)} · scope ${esc(session.scope)} · ${new Date(session.createdAt).toLocaleString()} · generated locally, shared only by you</div>
  ${ev}
  <h1 style="font-size:17px;margin-top:36px">Files touched</h1><table>${files || "<tr><td>none</td></tr>"}</table>
  </body></html>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  a.download = `veylaro-session-${session.title.replace(/[^a-z0-9.-]+/gi, "-")}.html`;
  a.click();
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function Palette({ onClose, openModal, setView }: {
  onClose: () => void;
  openModal: (m: "signin" | "new" | "settings" | "upgrade" | "intel") => void;
  setView: (v: "chat" | "term") => void;
}) {
  const store = useStore();
  const { settings, setSettings, sessions, active, vault } = store;
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const cmds = useMemo<Cmd[]>(() => {
    const c: Cmd[] = [
      { id: "new", label: "New session…", hint: "pick a file or folder", run: () => openModal("new") },
      { id: "model", label: `Switch model → ${settings.model === "max" ? "Laro Lite" : "Laro Max"}`, hint: "weights swap instantly", run: () => setSettings({ model: settings.model === "max" ? "lite" : "max" }) },
      { id: "plan", label: `Plan mode → ${settings.planMode ? "off" : "on"}`, hint: "approve plans before edits", run: () => setSettings({ planMode: !settings.planMode }) },
      { id: "net", label: `Internet → ${settings.internet ? "off" : "on"}`, hint: "web search + browser viewport", run: () => setSettings({ internet: !settings.internet }) },
      { id: "reason", label: `Visible reasoning → ${settings.reasoning ? "off" : "on"}`, hint: "watch Laro think", run: () => setSettings({ reasoning: !settings.reasoning }) },
      { id: "voice", label: `Voice replies → ${settings.voice ? "off" : "on"}`, hint: "Laro reads recaps aloud", run: () => setSettings({ voice: !settings.voice }) },
      { id: "deck", label: `${settings.deckOpen ? "Hide" : "Show"} the Viewport deck`, run: () => setSettings({ deckOpen: !settings.deckOpen }) },
      { id: "term", label: "Open Terminal view", hint: "real shell, scoped", run: () => setView("term") },
      { id: "agent", label: "Open Agent view", run: () => setView("chat") },
      { id: "intel", label: "Intelligence — updates & overnight training", run: () => openModal("intel") },
      { id: "settings", label: "Settings", run: () => openModal("settings") },
    ];
    if (active) {
      c.unshift({ id: "report", label: "Export session report", hint: "standalone HTML flight-recorder", run: () => exportSessionReport(active) });
    }
    sessions.forEach((s) => c.push({ id: `s-${s.id}`, label: `Session: ${s.title}`, hint: s.scope, run: () => store.selectSession(s.id) }));
    vault.forEach((v) => c.push({ id: `v-${v.id}`, label: `Vault: ${v.title}`, hint: "copy commit message", run: () => navigator.clipboard?.writeText(v.commit) }));
    return c;
  }, [settings, sessions, vault, active]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cmds;
    return cmds.filter((c) => (c.label + " " + (c.hint || "")).toLowerCase().includes(needle));
  }, [q, cmds]);

  const pick = (c: Cmd) => {
    c.run();
    onClose();
  };

  return (
    <div className="modal-veil" style={{ alignItems: "flex-start", paddingTop: "12vh" }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette">
        <input
          ref={inputRef}
          value={q}
          placeholder="Type a command, session or vault entry…"
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") setIdx((i) => Math.min(filtered.length - 1, i + 1));
            if (e.key === "ArrowUp") setIdx((i) => Math.max(0, i - 1));
            if (e.key === "Enter" && filtered[idx]) pick(filtered[idx]);
          }}
        />
        <div className="pal-list">
          {filtered.slice(0, 12).map((c, i) => (
            <button key={c.id} className={`pal-item ${i === idx ? "on" : ""}`} onMouseEnter={() => setIdx(i)} onClick={() => pick(c)}>
              <span>{c.label}</span>
              {c.hint && <span className="pal-hint">{c.hint}</span>}
            </button>
          ))}
          {!filtered.length && <div className="pal-none">Nothing matches “{q}”.</div>}
        </div>
        <div className="pal-foot">↑↓ navigate · ↵ run · esc close</div>
      </div>
    </div>
  );
}
