import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { AgentEvent, LangPref, Msg, Question } from "../types";
import { VeylaroMark } from "./Logo";
import { Check, Compress, Copy, Eye, Globe, Map, Rewind, Sparkle, Users, Warn } from "./icons";

/* ---- tiny glossary so vibe coders can hover dev-speak ---- */
const GLOSSARY: Record<string, string> = {
  regression: "when an old, already-fixed thing breaks again",
  refactor: "reorganizing code without changing what it does",
  "edge case": "a rare input that breaks naive code",
  diff: "the exact lines added and removed",
  "smoke run": "a quick 'does it even start?' check",
  scope: "the file or folder the AI is allowed to touch",
  token: "a chunk of text the model reads or writes",
  lint: "an automatic style-and-mistake checker",
};

function glossify(text: string) {
  const keys = Object.keys(GLOSSARY);
  const pattern = new RegExp(`\\b(${keys.join("|")})\\b`, "gi");
  const parts = text.split(pattern);
  if (parts.length === 1) return text;
  return parts.map((p, i) => {
    const tip = GLOSSARY[p.toLowerCase()];
    return tip ? (
      <span key={i} className="gloss" data-tip={tip}>
        {p}
      </span>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    );
  });
}

/* ---- compact rows: the Claude-Code-style collapsed stream ---- */

function CompactFile({ ev }: { ev: Extract<AgentEvent, { kind: "file" }> }) {
  const [open, setOpen] = useState(false);
  const name = ev.path.split(/[\\/]/).pop();
  return (
    <div className="ev crow-wrap">
      <button className="crow" onClick={() => setOpen((v) => !v)}>
        <span className={`c-op ${ev.op}`}>{ev.op === "create" ? "Created" : "Edited"}</span>
        <span className="c-name">{name}</span>
        <span className="c-plus">+{ev.plus}</span>
        <span className="c-minus">−{ev.minus}</span>
        <span className={`c-chev ${open ? "open" : ""}`}>›</span>
      </button>
      {open && (
        <div className="crow-body">
          <div className="c-path">{ev.path}</div>
          {ev.snippet ? (
            <div className="diff">
              {ev.snippet.del.map((l, i) => <div key={`d${i}`} className="del">- {l}</div>)}
              {ev.snippet.add.map((l, i) => <div key={`a${i}`} className="add">+ {l}</div>)}
            </div>
          ) : (
            <div className="c-path">diff applied inside the scope — open the file to review</div>
          )}
        </div>
      )}
    </div>
  );
}

function CompactCmd({ ev }: { ev: Extract<AgentEvent, { kind: "cmd" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ev crow-wrap">
      <button className="crow" onClick={() => setOpen((v) => !v)}>
        <span className={`c-op ${ev.ok ? "ran" : "fail"}`}>{ev.ok ? "Ran a command" : "Command failed"}</span>
        <span className="c-name mono">{ev.cmd.length > 44 ? ev.cmd.slice(0, 44) + "…" : ev.cmd}</span>
        <span className={`c-chev ${open ? "open" : ""}`}>›</span>
      </button>
      {open && (
        <div className="crow-body">
          <div className="c-cmdfull">❯ {ev.cmd}</div>
          <div className="c-out">{ev.out}</div>
        </div>
      )}
    </div>
  );
}

/* ---- live "thinking / working" line with elapsed time + token estimate ---- */

function WorkingLine({ mode, streamedChars }: { mode: "think" | "work"; streamedChars: number }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const tokens = streamedChars > 0 ? Math.round(streamedChars / 4) : Math.max(1, Math.round(sec * 32));
  return (
    <span className="working-line">
      <span className="dots"><i /><i /><i /></span>
      {mode === "think" ? "Laro is thinking" : "Laro is working"}… {sec}s · ~{tokens} tokens
    </span>
  );
}

/* ---- event renderers ---- */

function EventView({ ev, lang }: { ev: AgentEvent; lang: LangPref }) {
  switch (ev.kind) {
    case "say":
      return (
        <div className="ev ev-say">
          {lang !== "dev" && <div className="plain">{glossify(ev.plain)}</div>}
          {lang !== "plain" && <div className="dev">{ev.dev}</div>}
        </div>
      );
    case "think":
      return <div className="ev think-inline">{ev.text}</div>;
    case "file":
      return <CompactFile ev={ev} />;
    case "cmd":
      return <CompactCmd ev={ev} />;
    case "verify":
      return (
        <div className={`ev ev-verify ${ev.ok ? "" : "bad"}`}>
          <Check size={15} style={{ color: ev.ok ? "var(--green)" : "var(--red)", flexShrink: 0, marginTop: 2 }} />
          <span>
            <b>{ev.ok ? "Verified" : "Failed check"}</b> · {ev.target} — {ev.detail}
          </span>
        </div>
      );
    case "checkpoint":
      return (
        <div className="ev ev-checkpoint">
          <span className="d" /> checkpoint · {ev.label}
        </div>
      );
    case "restore":
      return (
        <div className="ev ev-restore">
          <Rewind size={13} /> rewound to “{ev.label}” — later edits rolled back
        </div>
      );
    case "recap":
      return <RecapView title={ev.title} bullets={ev.bullets} commit={ev.commit} />;
    case "plan":
      return (
        <div className="ev ev-plan">
          <div className="phead"><Map size={15} /> The plan — {ev.goal}</div>
          <ol>
            {ev.steps.map((s, i) => (
              <li key={i}><span className="pn">{i + 1}</span>{glossify(s)}</li>
            ))}
          </ol>
        </div>
      );
    case "web":
      return (
        <div className="ev ev-web">
          <div className="whead"><Globe size={14} /> Searched the web · <span className="wq">{ev.query}</span></div>
          {ev.results.map((r) => (
            <a key={r.url + r.title} className="wres" href={r.url} target="_blank" rel="noreferrer">
              <span className="wt">{r.title}</span>
              <span className="ws">{r.snippet}</span>
            </a>
          ))}
          <div className="wnote">Pages are fetched and read locally — your code is never part of the search.</div>
        </div>
      );
    case "agents":
      return (
        <div className="ev ev-agents">
          <div className="ahead"><Users size={14} /> {ev.lanes.length} sub-agents on it</div>
          <div className="lanes">
            {ev.lanes.map((l, i) => (
              <div className="lane" key={l.name} style={{ animationDelay: `${i * 140}ms` }}>
                <span className="lname">{l.name}</span>
                <span className="lrole">{l.role}</span>
                <span className="ltask">{l.task}</span>
                <span className="lbar"><i style={{ animationDelay: `${i * 350}ms` }} /></span>
              </div>
            ))}
          </div>
        </div>
      );
    case "reasoning":
      return (
        <details className="ev ev-reason">
          <summary><Eye size={13} /> Reasoning — how Laro got there · ~{Math.max(1, Math.round(ev.text.length / 4))} tokens</summary>
          <div className="rz-body">{ev.text}</div>
        </details>
      );
    case "browse":
      return (
        <div className="ev ev-browse">
          <div className="bhead">🖱 Drove the Viewport · <span className="burl">{ev.url}</span></div>
          <div className="bsteps">
            {ev.steps.map((s, i) => (
              <span key={i} className="bstep">{s.action === "click" ? "⊙" : s.action === "type" ? "⌨" : s.action === "scroll" ? "↕" : "→"} {s.note}</span>
            ))}
          </div>
          <div className="bsum">✓ {ev.summary}</div>
        </div>
      );
    case "radar":
      return <RadarCard items={ev.items} />;
    case "sim":
      return (
        <div className="ev sim-card">
          <div className="sim-h">🔮 Future Simulator — if you approve this plan</div>
          <div className="sim-stat">{ev.files.length} file{ev.files.length === 1 ? "" : "s"} · <b className="c-plus">+{ev.plus}</b> <b className="c-minus">−{ev.minus}</b> predicted</div>
          <div className="sim-cols">
            <div><span className="sim-t good">Why it's safe</span>{ev.pros.map((p) => <div key={p} className="sim-li">✓ {p}</div>)}</div>
            <div><span className="sim-t warn">Watch for</span>{ev.cons.map((c) => <div key={c} className="sim-li">• {c}</div>)}</div>
          </div>
        </div>
      );
    case "gate":
    case "ask":
    case "done":
      return null;
  }
}

/* Weakness Radar — Laro proactively flags risk, one click to fix */
function RadarCard({ items }: { items: { path: string; issue: string; sev: string }[] }) {
  const store = useStore();
  const [sent, setSent] = useState(false);
  return (
    <div className="ev radar-card">
      <div className="radar-h">📡 Weakness Radar — spotted while I was in there</div>
      {items.map((it, i) => (
        <div key={i} className="radar-li">
          <span className={`radar-sev ${it.sev}`}>{it.sev}</span>
          <span>{it.issue}</span>
        </div>
      ))}
      <button
        className="btn ghost sm"
        disabled={sent || store.running || !!store.pending}
        onClick={() => {
          setSent(true);
          store.send(`clean up the weak spots you flagged: ${items.map((i) => i.issue).join("; ")}`, []);
        }}
      >
        {sent ? "On it ✦" : "Clean these up"}
      </button>
    </div>
  );
}

/* Codex-style end-of-run rundown: duration + every file, Undo + Review */
function RunDown({ m }: { m: Msg }) {
  const store = useStore();
  const [review, setReview] = useState(false);
  const done = (m.events || []).find((e) => e.kind === "done");
  if (!done || done.kind !== "done") return null;
  const fileEvs = (m.events || []).filter((e): e is Extract<AgentEvent, { kind: "file" }> => e.kind === "file");
  if (!fileEvs.length) return null;
  const agg: Record<string, { plus: number; minus: number; op: string }> = {};
  fileEvs.forEach((f) => {
    const a = agg[f.path] || { plus: 0, minus: 0, op: f.op };
    a.plus += f.plus; a.minus += f.minus;
    if (f.op === "create") a.op = "create";
    agg[f.path] = a;
  });
  const plus = fileEvs.reduce((n, f) => n + f.plus, 0);
  const minus = fileEvs.reduce((n, f) => n + f.minus, 0);
  const secs = Math.max(1, Math.round(done.ms / 1000));
  const cp = store.active?.checkpoints.find((c) => c.ts >= m.ts);
  return (
    <div className="ev rundown">
      <div className="rd-head">
        <span className="rd-time">Worked for {secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`}</span>
        <span className="rd-files">Edited {Object.keys(agg).length} file{Object.keys(agg).length === 1 ? "" : "s"} <b className="c-plus">+{plus}</b> <b className="c-minus">−{minus}</b></span>
        <span style={{ flex: 1 }} />
        {cp && (
          <button className="btn ghost sm" onClick={() => confirm("Undo this whole run? Every change rolls back.") && store.restoreCheckpoint(cp)}>
            Undo ↩
          </button>
        )}
        <button className="btn ghost sm" onClick={() => setReview((v) => !v)}>{review ? "Close" : "Review"}</button>
      </div>
      <div className="rd-list">
        {Object.entries(agg).map(([path, a]) => (
          <div key={path} className="rd-row">
            <span className="rd-path">{path}</span>
            <span className="c-plus">+{a.plus}</span>
            <span className="c-minus">−{a.minus}</span>
          </div>
        ))}
      </div>
      {review && (
        <div className="rd-review">
          {fileEvs.filter((f) => f.snippet).map((f, i) => (
            <div key={i}>
              <div className="c-path">{f.path}</div>
              <div className="diff">
                {f.snippet!.del.map((l, j) => <div key={`d${j}`} className="del">- {l}</div>)}
                {f.snippet!.add.map((l, j) => <div key={`a${j}`} className="add">+ {l}</div>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecapView({ title, bullets, commit }: { title: string; bullets: string[]; commit: string }) {
  const [copied, setCopied] = useState(false);
  const { saveToVault, active } = useStore();
  const [saved, setSaved] = useState(false);
  return (
    <div className="ev recap">
      <div className="rhead">
        <Sparkle size={15} style={{ color: "var(--copper)" }} /> {title}
      </div>
      <ul>
        {bullets.map((b) => (
          <li key={b}>{glossify(b)}</li>
        ))}
      </ul>
      <div className="commit">
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{commit}</span>
        <button
          className="btn ghost sm"
          onClick={() => {
            navigator.clipboard?.writeText(commit);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          <Copy size={12} /> {copied ? "Copied!" : "Copy commit"}
        </button>
        <button
          className="btn ghost sm"
          disabled={saved}
          onClick={() => {
            saveToVault({ title, commit, bullets, scope: active?.scope || "" });
            setSaved(true);
          }}
        >
          {saved ? "✦ In vault" : "Save to vault"}
        </button>
      </div>
    </div>
  );
}

/* ---- permission gate card ---- */

function GateCard() {
  const { pending, resolveGate } = useStore();
  if (!pending || pending.type !== "gate" || !pending.gate) return null;
  return (
    <div className="gate">
      <div className="gt"><Warn size={16} /> Laro wants to: {pending.gate.what}</div>
      <div className="gd">{pending.gate.detail}</div>
      <div className="gbtns">
        <button className="btn primary sm" onClick={() => resolveGate(true)}>Allow</button>
        <button className="btn ghost sm" onClick={() => resolveGate(false)}>Not this</button>
      </div>
      <div style={{ fontSize: 11, color: "var(--dim)" }}>
        Tired of clicking? Switch the composer to <b>Accept edits</b> or <b>Bypass — full auto</b>.
      </div>
    </div>
  );
}

/* ---- plan approval (plan mode) ---- */

function PlanApproval() {
  const { pending, resolvePlan, previewPlan } = useStore();
  if (!pending || pending.type !== "plan") return null;
  return (
    <div className="gate plan-gate">
      <div className="gt" style={{ color: "var(--copper)" }}><Map size={16} /> Approve this plan?</div>
      <div className="gd">Nothing is touched until you say go. Bypass mode skips this entirely.</div>
      <div className="gbtns">
        <button className="btn primary sm" onClick={() => resolvePlan(true)}>Approve — start building</button>
        <button className="btn ghost sm" onClick={() => resolvePlan(false)}>Re-plan</button>
        <button className="btn ghost sm" onClick={() => previewPlan()}>🔮 Preview outcome</button>
      </div>
    </div>
  );
}

/* ---- question wizard — ONE question at a time, with an "Other" free-text option ---- */

function QuestionWizard() {
  const { pending, answerQuestions } = useStore();
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const questions = pending?.type === "ask" ? pending.questions || [] : [];

  useEffect(() => {
    setIdx(0);
    setAnswers({});
    setOtherOpen(false);
    setOtherText("");
  }, [pending?.msgId]);

  if (!questions.length) return null;
  const q: Question = questions[Math.min(idx, questions.length - 1)];

  const answer = (val: string) => {
    const next = { ...answers, [q.id]: val };
    setAnswers(next);
    setOtherOpen(false);
    setOtherText("");
    if (idx + 1 < questions.length) setIdx(idx + 1);
    else answerQuestions(next);
  };

  return (
    <div className="qwizard">
      <div className="qprog">
        {questions.map((qq, i) => (
          <span key={qq.id} className={`qdot ${i < idx ? "done" : i === idx ? "now" : ""}`} />
        ))}
        <span className="qcount">question {idx + 1} of {questions.length}</span>
        {idx > 0 && (
          <button className="qback" onClick={() => { setIdx(idx - 1); setOtherOpen(false); }}>← back</button>
        )}
      </div>
      <div className="qcard" key={q.id}>
        <div className="qq">{q.q}</div>
        <div className="opts">
          {q.options.map((o) => (
            <button key={o} className={answers[q.id] === o ? "picked" : ""} onClick={() => answer(o)}>
              {o}
            </button>
          ))}
          {q.allowOther !== false && (
            <button className={otherOpen ? "picked" : ""} onClick={() => setOtherOpen((v) => !v)}>
              Other…
            </button>
          )}
        </div>
        {otherOpen && (
          <div className="qother">
            <input
              autoFocus
              type="text"
              value={otherText}
              placeholder="Type it your way — Laro reads this as the answer"
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && otherText.trim() && answer(otherText.trim())}
            />
            <button className="btn primary sm" disabled={!otherText.trim()} onClick={() => answer(otherText.trim())}>
              {idx + 1 < questions.length ? "Next →" : "Go build it →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- one agent message = stream of events ---- */

function AgentMsg({ m, isLast }: { m: Msg; isLast: boolean }) {
  const { settings, running, pending, streamText, streamThink, searching } = useStore();
  const events = m.events || [];
  const done = events.some((e) => e.kind === "done");
  const showPending = isLast && pending?.msgId === m.id;
  const streaming = isLast && running && streamText !== null;
  return (
    <div className="msg-agent">
      <span className="agent-ic">
        <VeylaroMark size={26} />
      </span>
      <div className="agent-col">
        {events.map((ev, i) => (
          <EventView key={i} ev={ev} lang={settings.lang} />
        ))}
        {isLast && running && searching && (
          <span className="working-line searching">
            <Globe size={13} className="spin-slow-ic" /> Searching the web — “{searching}”
          </span>
        )}
        {isLast && running && streamThink && !streamText && (
          <div className="ev ev-reason live">
            <div className="rz-head"><Eye size={13} /> <WorkingLine mode="think" streamedChars={streamThink.length} /></div>
            <div className="rz-body">{streamThink}</div>
          </div>
        )}
        {streaming && streamText && (
          <div className="ev ev-say">
            <div className="plain" style={{ whiteSpace: "pre-wrap" }}>
              {streamText}
              <span className="stream-caret" />
            </div>
          </div>
        )}
        {showPending && pending?.type === "gate" && <GateCard />}
        {showPending && pending?.type === "plan" && <PlanApproval />}
        {showPending && pending?.type === "ask" && <QuestionWizard />}
        {done && <RunDown m={m} />}
        {isLast && running && !done && !streaming && !streamThink && (
          <WorkingLine mode="work" streamedChars={0} />
        )}
      </div>
    </div>
  );
}

/* ---- conversation compaction: fold older messages, forget nothing ---- */

const KEEP_RECENT = 4; // messages that always stay expanded

function CompactBar({
  hidden,
  files,
  expanded,
  onToggle,
}: {
  hidden: Msg[];
  files: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const asks = hidden.filter((m) => m.role === "user").length;
  const steps = hidden.reduce((n, m) => n + (m.events?.length || 0), 0);
  return (
    <button className={`compact-bar ${expanded ? "open" : ""}`} onClick={onToggle}>
      <Compress size={13} />
      <span>
        <b>{expanded ? "Re-compact" : "Compacted"}</b> · {asks} earlier task{asks === 1 ? "" : "s"} ·{" "}
        {steps} steps · {files} file{files === 1 ? "" : "s"} touched
      </span>
      <span className="cnote">context fully retained — Laro forgets nothing</span>
      <span className="carrow">{expanded ? "fold ▴" : "expand ▾"}</span>
    </button>
  );
}

/* ---- the chat surface ---- */

const AWAY_MS = 6 * 3600 * 1000;

function WelcomeBack({ onDismiss }: { onDismiss: () => void }) {
  const { active } = useStore();
  if (!active) return null;
  const lastRecap = [...active.msgs].reverse().flatMap((m) => m.events || []).find((e) => e.kind === "recap");
  const files = Object.keys(active.files).length;
  return (
    <div className="wb-card">
      <span className="wb-t">✦ Welcome back.</span>
      <span className="wb-b">
        Last time in this session{lastRecap && lastRecap.kind === "recap" ? `: “${lastRecap.title}”` : ""} — {files} file{files === 1 ? "" : "s"} touched,
        every change and checkpoint saved. Pick up right where you left off.
      </span>
      <button className="wb-x" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  );
}

export function Chat() {
  const { active } = useStore();
  const endRef = useRef<HTMLDivElement>(null);
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const [wbDismissed, setWbDismissed] = useState(false);
  const wasAway = useMemo(() => {
    if (!active?.msgs.length) return false;
    const last = active.msgs[active.msgs.length - 1];
    return Date.now() - last.ts > AWAY_MS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);
  const { streamText } = useStore();
  const count = useMemo(
    () => (active ? active.msgs.reduce((n, m) => n + (m.events?.length || 0), 0) + active.msgs.length : 0),
    [active]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [count, streamText?.length]);

  if (!active) return null;

  const lastAgentId = [...active.msgs].reverse().find((m) => m.role === "agent")?.id;
  const compactable = active.msgs.length > KEEP_RECENT + 2;
  const expanded = expandedFor === active.id;
  const hidden = compactable && !expanded ? active.msgs.slice(0, active.msgs.length - KEEP_RECENT) : [];
  const visible = compactable && !expanded ? active.msgs.slice(active.msgs.length - KEEP_RECENT) : active.msgs;

  return (
    <div className="chat">
      <div className="chat-inner">
        {wasAway && !wbDismissed && <WelcomeBack onDismiss={() => setWbDismissed(true)} />}
        {compactable && (
          <CompactBar
            hidden={hidden.length ? hidden : active.msgs.slice(0, active.msgs.length - KEEP_RECENT)}
            files={Object.keys(active.files).length}
            expanded={expanded}
            onToggle={() => setExpandedFor(expanded ? null : active.id)}
          />
        )}
        {visible.map((m) =>
          m.role === "user" ? (
            <div className="msg-user" key={m.id}>
              {m.attachments && m.attachments.length > 0 && (
                <div className="shots">
                  {m.attachments.map((a) => (
                    <img key={a.id} src={a.dataUrl} alt={a.name} title={a.name} />
                  ))}
                </div>
              )}
              {m.text && <div className="bubble">{m.text}</div>}
            </div>
          ) : (
            <AgentMsg key={m.id} m={m} isLast={m.id === lastAgentId} />
          )
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
