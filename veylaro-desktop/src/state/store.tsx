import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import {
  Account, AgentEvent, Attachment, BgTask, BrowseStep, Checkpoint, FileStat, FREE_WEEKLY_LIMIT, Msg,
  PermMode, Question, Session, Settings, TermLine, Usage, VaultItem,
} from "../types";
import { buildQuestions, buildRun, needsClarification, simulateTerminal, TimedEvent } from "../engine/demo";
import { detectLiveModel, LARO_SYSTEM_PROMPT, ollamaChat, warmup } from "../engine/ollama";
import { resultsToContext, webSearch } from "../engine/search";
import { subAgentLanes } from "../engine/tiers";

/* ============ helpers ============ */

export const uid = () => Math.random().toString(36).slice(2, 10);

export function weekKey(d = new Date()): string {
  // ISO week key, e.g. 2026-W28
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const LS_KEY = "veylaro.v1";

interface Persisted {
  account: Account | null;
  settings: Settings;
  sessions: Session[];
  activeId: string | null;
  usage: Usage;
  onboarded: boolean;
  vault: VaultItem[];
  autoEngineDone?: boolean; // live-weights auto-switch runs once, ever
}

const DEFAULT_SETTINGS: Settings = {
  model: "max",
  permMode: "edits",
  lang: "both",
  personality: true,
  sounds: false,
  engine: "demo",
  ollamaUrl: "http://127.0.0.1:11434",
  ollamaModel: "veylaro-code",
  internet: true,
  planMode: true,
  subAgents: "auto",
  overnight: false,
  reasoning: true,
  voice: false,
  deckOpen: true,
  deckWidth: 380,
  viewportUrl: "http://localhost:3000",
};

function load(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Persisted;
      if (p.usage.weekKey !== weekKey()) p.usage = { weekKey: weekKey(), used: 0 };
      p.settings = { ...DEFAULT_SETTINGS, ...p.settings };
      p.sessions = p.sessions.map((s) => ({ ...s, term: s.term || [] }));
      p.vault = p.vault || [];
      return p;
    }
  } catch { /* fresh start */ }
  return {
    account: null,
    settings: DEFAULT_SETTINGS,
    sessions: [],
    activeId: null,
    usage: { weekKey: weekKey(), used: 0 },
    onboarded: false,
    vault: [],
  };
}

/* ============ store ============ */

export interface Pending {
  type: "gate" | "ask" | "plan";
  msgId: string;
  gate?: { what: string; detail: string };
  questions?: Question[];
  resume: TimedEvent[]; // remaining script after the pause
}

interface Store extends Persisted {
  running: boolean;
  pending: Pending | null;
  restoredTo: string | null;
  ramGB: number;
  liveModel: string | null; // detected local Veylaro weights (null = preview brain)
  streamText: string | null; // live token stream from the real model
  streamThink: string | null; // live reasoning stream (visible thinking)
  searching: string | null; // active web-search query, shown in the UI
  bgTasks: BgTask[]; // background activity for the deck
  lastBrowse: { url: string; steps: BrowseStep[]; summary: string; ts: number } | null;
  // derived
  active: Session | null;
  remaining: number; // free-tier messages left this week
  locked: boolean;
  // actions
  signIn(name: string, email: string, license?: string): Promise<Account>;
  signOut(): void;
  setSettings(patch: Partial<Settings>): void;
  newSession(scope: string, scopeKind: "file" | "folder", title?: string): void;
  selectSession(id: string): void;
  deleteSession(id: string): void;
  send(text: string, attachments: Attachment[]): void;
  resolveGate(approve: boolean): void;
  resolvePlan(approve: boolean): void;
  answerQuestions(answers: Record<string, string>): void;
  restoreCheckpoint(cp: Checkpoint): void;
  runTerminal(cmd: string): Promise<void>;
  saveToVault(item: Omit<VaultItem, "id" | "ts">): void;
  removeVaultItem(id: string): void;
  setOnboarded(): void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("store missing");
  return s;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<Persisted>(load);
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [restoredTo, setRestoredTo] = useState<string | null>(null);
  const [ramGB, setRamGB] = useState(8);
  const [liveModel, setLiveModel] = useState<string | null>(null);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [streamThink, setStreamThink] = useState<string | null>(null);
  const [searching, setSearching] = useState<string | null>(null);
  const [bgTasks, setBgTasks] = useState<BgTask[]>([]);
  const [lastBrowse, setLastBrowse] = useState<Store["lastBrowse"]>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const pushBg = (label: string, detail?: string): string => {
    const id = uid();
    setBgTasks((p) => [{ id, label, detail, status: "running" as const, ts: Date.now() }, ...p].slice(0, 24));
    return id;
  };
  const doneBg = (id: string, ok = true, detail?: string) =>
    setBgTasks((p) => p.map((t) => (t.id === id ? { ...t, status: ok ? "done" : "failed", ...(detail ? { detail } : {}) } : t)));

  useEffect(() => {
    if (window.veylaro?.sysinfo) window.veylaro.sysinfo().then((s) => setRamGB(s.ramGB)).catch(() => {});
    else if ((navigator as any).deviceMemory) setRamGB((navigator as any).deviceMemory);
  }, []);

  // Plug-and-play: detect installed Veylaro weights, switch to them, pre-warm.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await detectLiveModel(st.settings.ollamaUrl);
      if (cancelled) return;
      setLiveModel(found);
      if (found) {
        setSt((p) => {
          if (p.autoEngineDone) return p; // user's explicit engine choice wins forever after
          return {
            ...p,
            autoEngineDone: true,
            settings: { ...p.settings, engine: "ollama", ollamaModel: found.replace(/:latest$/, "") },
          };
        });
        // pre-warm only when the app will actually use the live engine
        if (!st.autoEngineDone || st.settings.engine === "ollama") {
          const bg = pushBg("Warming up Laro weights", found);
          warmup(st.settings.ollamaUrl, found).then(() => doneBg(bg, true, `${found} hot — first token is instant`));
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(LS_KEY, JSON.stringify(st)), 250);
    return () => clearTimeout(t);
  }, [st]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const active = st.sessions.find((s) => s.id === st.activeId) || null;
  const remaining =
    st.account?.plan === "free" || !st.account
      ? Math.max(0, FREE_WEEKLY_LIMIT - st.usage.used)
      : Infinity;
  const locked = (st.account?.plan ?? "free") === "free" && remaining <= 0;

  /* ---- session mutation helpers ---- */

  const mutSession = (id: string, fn: (s: Session) => Session) =>
    setSt((p) => ({ ...p, sessions: p.sessions.map((s) => (s.id === id ? fn({ ...s }) : s)) }));

  const appendEvent = (sessionId: string, msgId: string, ev: AgentEvent) => {
    if (ev.kind === "browse") {
      setLastBrowse({ url: ev.url, steps: ev.steps, summary: ev.summary, ts: Date.now() });
      const bg = pushBg("Driving the Viewport", ev.summary);
      setTimeout(() => doneBg(bg), ev.steps.length * 700 + 800);
      setSt((p) => (p.settings.deckOpen ? p : { ...p, settings: { ...p.settings, deckOpen: true } }));
    }
    if (ev.kind === "recap" && st.settings.voice && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(`${ev.title}. ${ev.bullets[0] || ""}`);
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    }
    return mutSession(sessionId, (s) => {
      const msgs = s.msgs.map((m) => (m.id === msgId ? { ...m, events: [...(m.events || []), ev] } : m));
      let files = s.files;
      let checkpoints = s.checkpoints;
      if (ev.kind === "file") {
        files = { ...files };
        Object.values(files).forEach((f) => (f.active = false));
        const prev = files[ev.path];
        files[ev.path] = {
          path: ev.path,
          plus: (prev?.plus || 0) + ev.plus,
          minus: (prev?.minus || 0) + ev.minus,
          active: true,
          verified: null,
        };
      }
      if (ev.kind === "verify") {
        files = { ...files };
        Object.values(files).forEach((f) => {
          files[f.path] = { ...f, verified: ev.ok, active: false };
        });
      }
      if (ev.kind === "checkpoint") {
        const snap: Checkpoint = {
          id: uid(),
          label: ev.label,
          ts: Date.now(),
          files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, { plus: v.plus, minus: v.minus }])),
        };
        checkpoints = [...checkpoints, snap];
      }
      return { ...s, msgs, files, checkpoints };
    });
  };

  /* ---- the runner: plays a timed script, pausing on gates/questions ---- */

  const play = (sessionId: string, msgId: string, script: TimedEvent[], perm: PermMode) => {
    setRunning(true);
    const step = (rest: TimedEvent[]) => {
      if (!rest.length) {
        setRunning(false);
        return;
      }
      const [head, ...tail] = rest;
      timer.current = setTimeout(() => {
        // plan approval: show the plan, then wait for the user (bypass never waits)
        if (head.ev.kind === "plan" && st.settings.planMode && perm !== "bypass") {
          appendEvent(sessionId, msgId, head.ev);
          setPending({ type: "plan", msgId, resume: tail });
          setRunning(false);
          return;
        }
        // permission gating: in "ask" mode both files and commands gate;
        // in "edits" mode only commands gate; "bypass" never gates.
        const needsGate =
          (head.ev.kind === "file" && perm === "ask") ||
          (head.ev.kind === "cmd" && perm !== "bypass");
        if (needsGate) {
          const what =
            head.ev.kind === "file"
              ? `Edit ${head.ev.path}`
              : `Run: ${(head.ev as any).cmd}`;
          const detail =
            head.ev.kind === "file"
              ? `+${(head.ev as any).plus} / −${(head.ev as any).minus} lines`
              : "Command executes inside your project scope only.";
          setPending({ type: "gate", msgId, gate: { what, detail }, resume: rest });
          setRunning(false);
          return;
        }
        appendEvent(sessionId, msgId, head.ev);
        if (head.ev.kind === "done") {
          setRunning(false);
          return;
        }
        step(tail);
      }, head.delay);
    };
    step(script);
  };

  /* ---- actions ---- */

  const store: Store = {
    ...st,
    running,
    pending,
    restoredTo,
    ramGB,
    liveModel,
    streamText,
    streamThink,
    searching,
    bgTasks,
    lastBrowse,
    active,
    remaining,
    locked,

    async signIn(name, email, license) {
      await new Promise((r) => setTimeout(r, 1400)); // "syncing with veylaro.ai"
      const plan = /^VEY-TEAM-/i.test(license || "")
        ? "team"
        : /^VEY-PRO-/i.test(license || "")
          ? "pro"
          : "free";
      const account: Account = { name: name.trim() || email.split("@")[0], email: email.trim(), plan };
      setSt((p) => ({ ...p, account }));
      return account;
    },

    signOut() {
      setSt((p) => ({ ...p, account: null }));
    },

    setSettings(patch) {
      setSt((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
    },

    setOnboarded() {
      setSt((p) => ({ ...p, onboarded: true }));
    },

    newSession(scope, scopeKind, title) {
      const s: Session = {
        id: uid(),
        title: title || scope.split(/[\\/]/).filter(Boolean).pop() || "New session",
        scope,
        scopeKind,
        msgs: [],
        files: {},
        checkpoints: [],
        term: [],
        createdAt: Date.now(),
      };
      setSt((p) => ({ ...p, sessions: [s, ...p.sessions], activeId: s.id }));
      setPending(null);
      setRestoredTo(null);
    },

    selectSession(id) {
      setSt((p) => ({ ...p, activeId: id }));
      setPending(null);
      setRestoredTo(null);
    },

    deleteSession(id) {
      setSt((p) => ({
        ...p,
        sessions: p.sessions.filter((s) => s.id !== id),
        activeId: p.activeId === id ? (p.sessions.find((s) => s.id !== id)?.id ?? null) : p.activeId,
      }));
    },

    send(text, attachments) {
      if (!active || running || pending) return;
      if (locked) return;

      const userMsg: Msg = { id: uid(), role: "user", text, attachments, ts: Date.now() };
      const agentMsg: Msg = { id: uid(), role: "agent", events: [], ts: Date.now() };
      mutSession(active.id, (s) => ({ ...s, msgs: [...s.msgs, userMsg, agentMsg] }));
      setSt((p) => ({
        ...p,
        usage:
          (p.account?.plan ?? "free") === "free"
            ? { weekKey: weekKey(), used: p.usage.used + 1 }
            : p.usage,
      }));

      const { settings } = st;

      if (settings.engine === "ollama") {
        // live model path — real local inference, streamed token by token
        setRunning(true);
        (async () => {
          let acc = "";
          try {
            const wantsWeb =
              settings.internet &&
              navigator.onLine &&
              /\b(search|look ?up|latest|current|newest|today|docs?|documentation|version|price|news|20\d\d)\b/i.test(text);
            let searchCtx = "";
            if (wantsWeb) {
              const q = text.slice(0, 90);
              setSearching(q);
              const bg = pushBg("Searching the web", q);
              const results = await webSearch(q);
              setSearching(null);
              doneBg(bg, !!results, results ? `${results.length} sources read locally` : "no live results — continuing offline");
              if (results && results.length) {
                appendEvent(active.id, agentMsg.id, { kind: "web", query: q, results });
                searchCtx = resultsToContext(q, results);
              }
            }
            const sys: { role: "system"; content: string }[] = [{ role: "system", content: LARO_SYSTEM_PROMPT }];
            if (searchCtx) sys.push({ role: "system", content: searchCtx });
            setStreamText("");
            let think = "";
            for await (const part of ollamaChat(
              settings.ollamaUrl,
              settings.ollamaModel,
              [...sys, { role: "user", content: `[session scope: ${active.scope}]\n${text}` }],
              settings.model,
              settings.reasoning
            )) {
              if (part.type === "think") {
                think += part.chunk;
                setStreamThink(think);
              } else {
                acc += part.chunk;
                setStreamText(acc);
              }
            }
            if (think.trim()) appendEvent(active.id, agentMsg.id, { kind: "reasoning", text: think.trim() });
            appendEvent(active.id, agentMsg.id, {
              kind: "say",
              plain: acc || "…the model returned an empty reply. Try again — the weights may still be loading.",
              dev: `${settings.ollamaModel} · streamed locally · 0 bytes of code to the cloud`,
            });
          } catch (e: any) {
            appendEvent(active.id, agentMsg.id, {
              kind: "say",
              plain: `I couldn't reach the live Laro engine (${e?.message || e}). Start Ollama, or flip Settings → Engine to Preview.`,
              dev: `error: ${e?.message || e}`,
            });
          }
          setStreamText(null);
          setStreamThink(null);
          setSearching(null);
          appendEvent(active.id, agentMsg.id, { kind: "done", ms: 0 });
          setRunning(false);
        })();
        return;
      }

      // demo engine
      if (needsClarification(text) && attachments.length === 0) {
        const questions = buildQuestions(text, active.scope);
        appendEvent(active.id, agentMsg.id, {
          kind: "say",
          plain: "Quick check before I touch anything — four fast questions, then I'm off.",
          dev: "clarify(4) → constrain plan → execute",
        });
        const resume: TimedEvent[] = []; // built after answers arrive
        setPending({ type: "ask", msgId: agentMsg.id, questions, resume });
        return;
      }

      const laneCount =
        settings.subAgents === "off" ? 0 : settings.subAgents === "duo" ? 2 : subAgentLanes(ramGB);
      const script = buildRun({
        prompt: text,
        scope: active.scope,
        model: settings.model,
        personality: settings.personality,
        perm: settings.permMode,
        internet: settings.internet && navigator.onLine,
        planMode: settings.planMode,
        laneCount,
      });
      play(active.id, agentMsg.id, script, settings.permMode);
    },

    resolveGate(approve) {
      if (!pending || pending.type !== "gate" || !active) return;
      const { msgId, resume } = pending;
      setPending(null);
      if (!approve) {
        appendEvent(active.id, msgId, {
          kind: "say",
          plain: "No problem — skipped that step. Tell me how you'd like to proceed.",
          dev: "step declined by user · run halted cleanly",
        });
        appendEvent(active.id, msgId, { kind: "done", ms: 0 });
        return;
      }
      // approve: emit the gated event immediately, continue with the tail
      const [head, ...tail] = resume;
      appendEvent(active.id, msgId, head.ev);
      play(active.id, msgId, tail, st.settings.permMode);
    },

    resolvePlan(approve) {
      if (!pending || pending.type !== "plan" || !active) return;
      const { msgId, resume } = pending;
      setPending(null);
      if (!approve) {
        appendEvent(active.id, msgId, {
          kind: "say",
          plain: "Plan shelved — nothing was touched. Tell me what to change about the approach and I'll re-plan.",
          dev: "plan rejected · zero side effects · awaiting new constraints",
        });
        appendEvent(active.id, msgId, { kind: "done", ms: 0 });
        return;
      }
      appendEvent(active.id, msgId, {
        kind: "say",
        plain: "Plan approved — executing it step by step. I'll narrate everything as I go.",
        dev: "plan → execute · gates per permission mode",
      });
      play(active.id, msgId, resume, st.settings.permMode);
    },

    answerQuestions(answers) {
      if (!pending || pending.type !== "ask" || !active) return;
      const { msgId } = pending;
      setPending(null);
      const lastUser = [...(active.msgs || [])].reverse().find((m) => m.role === "user");
      const laneCount =
        st.settings.subAgents === "off" ? 0 : st.settings.subAgents === "duo" ? 2 : subAgentLanes(ramGB);
      const script = buildRun({
        prompt: lastUser?.text || "improve",
        scope: active.scope,
        model: st.settings.model,
        personality: st.settings.personality,
        perm: st.settings.permMode,
        internet: st.settings.internet && navigator.onLine,
        planMode: st.settings.planMode,
        laneCount,
        answers,
      });
      play(active.id, msgId, script, st.settings.permMode);
    },

    async runTerminal(cmd) {
      if (!active) return;
      const c = cmd.trim();
      if (!c) return;
      if (c === "clear") {
        mutSession(active.id, (s) => ({ ...s, term: [] }));
        return;
      }
      const bg = pushBg("Terminal", c.length > 42 ? c.slice(0, 42) + "…" : c);
      let res: { out: string; ok: boolean };
      if (window.veylaro?.exec) {
        try {
          res = await window.veylaro.exec(c, active.scope);
        } catch (e: any) {
          res = { out: String(e?.message || e), ok: false };
        }
      } else {
        res = simulateTerminal(c, Object.values(active.files));
      }
      doneBg(bg, res.ok);
      const line: TermLine = { id: uid(), cmd: c, out: res.out, ok: res.ok, ts: Date.now() };
      mutSession(active.id, (s) => ({ ...s, term: [...s.term, line] }));
    },

    saveToVault(item) {
      setSt((p) => ({ ...p, vault: [{ ...item, id: uid(), ts: Date.now() }, ...p.vault].slice(0, 100) }));
    },

    removeVaultItem(id) {
      setSt((p) => ({ ...p, vault: p.vault.filter((v) => v.id !== id) }));
    },

    restoreCheckpoint(cp) {
      if (!active) return;
      mutSession(active.id, (s) => {
        const files: Record<string, FileStat> = {};
        Object.entries(cp.files).forEach(([path, v]) => {
          files[path] = { path, plus: v.plus, minus: v.minus, active: false, verified: null };
        });
        const idx = s.checkpoints.findIndex((c) => c.id === cp.id);
        return { ...s, files, checkpoints: s.checkpoints.slice(0, idx + 1) };
      });
      setRestoredTo(cp.label);
      const lastAgent = [...active.msgs].reverse().find((m) => m.role === "agent");
      if (lastAgent) {
        appendEvent(active.id, lastAgent.id, { kind: "restore", label: cp.label });
      }
    },
  };

  const value = useMemo(
    () => store,
    [st, running, pending, restoredTo, ramGB, liveModel, streamText, streamThink, searching, bgTasks, lastBrowse]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
