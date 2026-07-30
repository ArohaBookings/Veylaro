import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import {
  Account, AgentEvent, Attachment, BgTask, BrowseStep, Checkpoint, FileStat, FREE_WEEKLY_LIMIT, Msg, MODELS,
  LAUNCH_FREE_MONTH_MS, OFFLINE_GRACE_MS, PAST_DUE_GRACE_MS, PermMode, Plan, Question, REFERRAL_MAX,
  Session, Settings, SideMsg, TermLine, Usage, VaultItem,
} from "../types";
import { refreshRemoteConfig, remoteConfig, RemoteConfig } from "../engine/remoteConfig";

/* ============ billing state machine ============ */

export interface BillingBanner {
  tone: "amber" | "info";
  title: string;
  body: string;
  cta: "fix" | "resubscribe" | "verify" | "finish";
}
export interface BillingInfo {
  plan: Plan; // effective access
  label: string; // short status for the UI
  daysLeft?: number;
  banner: BillingBanner | null;
}

const DAY = 86400000;

/** The single source of truth for "what can this account do right now".
    Pure + deterministic so it's trivially testable. */
export function deriveBilling(account: Account | null, now: number, online: boolean): BillingInfo {
  // Launch gift: every new account gets a full month of unlimited, no card.
  if (account?.launchTrialUntil && now < account.launchTrialUntil && account.plan === "free") {
    const daysLeft = Math.max(1, Math.ceil((account.launchTrialUntil - now) / DAY));
    return {
      plan: "pro",
      label: "Launch month",
      daysLeft,
      banner: daysLeft <= 7
        ? { tone: "info", title: `Your free launch month ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, body: "After that you drop to the free tier — 200 messages a week, still unlimited privacy. Go Pro any time to keep it uncapped.", cta: "resubscribe" }
        : null,
    };
  }
  if (!account || account.plan === "free") return { plan: "free", label: "Free", banner: null };
  const paid = account.plan;
  const b = account.billing ?? "active";

  // offline / stale: a paid plan works offline for OFFLINE_GRACE_MS since the
  // last successful verification; past that we can't trust it → Free + reconnect.
  const verifiedAgo = now - (account.lastVerified ?? now);
  if (verifiedAgo > OFFLINE_GRACE_MS) {
    return {
      plan: "free",
      label: "Verify plan",
      banner: { tone: "amber", title: "Reconnect to verify your plan", body: `It's been over ${Math.round(OFFLINE_GRACE_MS / DAY)} days since we could confirm your subscription. Go online and re-verify to restore unlimited.`, cta: "verify" },
    };
  }

  if (b === "active") return { plan: paid, label: paid === "team" ? "Team" : "Pro", banner: null };

  if (b === "trialing") {
    const daysLeft = account.periodEnd ? Math.max(0, Math.ceil((account.periodEnd - now) / DAY)) : undefined;
    return { plan: paid, label: "Trial", daysLeft, banner: { tone: "info", title: `Free trial${daysLeft != null ? ` — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : ""}`, body: "Add a payment method before it ends to keep unlimited usage.", cta: "fix" } };
  }

  if (b === "past_due") {
    const graceUntil = account.graceUntil ?? now + PAST_DUE_GRACE_MS;
    if (now < graceUntil) {
      const daysLeft = Math.max(0, Math.ceil((graceUntil - now) / DAY));
      return { plan: paid, label: "Payment retrying", daysLeft, banner: { tone: "amber", title: `Payment failed — full access for ${daysLeft} more day${daysLeft === 1 ? "" : "s"}`, body: "Stripe is retrying your card. Fix it now and nothing changes; otherwise you drop to Free when the grace period ends.", cta: "fix" } };
    }
    return { plan: "free", label: "Plan paused", banner: { tone: "amber", title: "Plan paused — payment failed", body: "Nothing is deleted. Fix your payment and unlimited turns back on instantly.", cta: "fix" } };
  }

  if (b === "canceled") {
    if (account.periodEnd && now < account.periodEnd) {
      const daysLeft = Math.max(0, Math.ceil((account.periodEnd - now) / DAY));
      return { plan: paid, label: "Canceled — active", daysLeft, banner: { tone: "info", title: `Subscription ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, body: "You keep unlimited until then. Resubscribe anytime to stay on.", cta: "resubscribe" } };
    }
    return { plan: "free", label: "Canceled", banner: { tone: "info", title: "Subscription ended", body: "You're on Free now. Everything you made is still here — resubscribe whenever you want unlimited back.", cta: "resubscribe" } };
  }

  // incomplete / unknown → treat as Free until checkout completes
  return { plan: "free", label: "Checkout incomplete", banner: { tone: "amber", title: "Finish checkout to activate", body: "Your subscription hasn't completed. Finish payment to switch on unlimited.", cta: "finish" } };
}
import { buildQuestions, buildRun, needsClarification, sideChatReply, simulateTerminal, TimedEvent } from "../engine/demo";
import { detectLiveModel, ollamaChat, warmup, unloadModel, ChatMsg } from "../engine/ollama";
import {
  FILE_PROTOCOL_PROMPT, StreamParser, salvageFences, resolveInScope, diffCounts,
} from "../engine/agentLoop";
import { GROUNDING_NOTE, LARO_CHARTER, LARO_SIDE_CHARTER, laroContext } from "../engine/charter";
import { resultsToContext, webSearch } from "../engine/search";
import { recommendModel, subAgentLanes } from "../engine/tiers";
import { EXECUTION_LATTICE_PROMPT } from "../engine/executionLattice";
import { precedentsAsPrompt, recordVerifiedPrecedent } from "../engine/localLearning";

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
const LS_BAK = "veylaro.v1.bak"; // rolling backup — survives a corrupted main record
const LS_USAGE = "veylaro.usage"; // double-booked meter so the free limit survives anything

interface Persisted {
  account: Account | null;
  settings: Settings;
  sessions: Session[];
  activeId: string | null;
  usage: Usage;
  onboarded: boolean;
  vault: VaultItem[];
  sideChat?: SideMsg[]; // the featherweight companion chat
  autoEngineDone?: boolean; // live-weights auto-switch runs once, ever
}

const DEFAULT_SETTINGS: Settings = {
  model: "lite",
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
  fullDiskAccess: false,
  confirmDestructive: true,
  autoPickModel: true,
  shareImprovementData: false,
  crashReports: false,
  overnightOnlyWhenPlugged: true,
  overnightIntensity: "gentle",
  terminalShell: "",
};

function isFastInteraction(text: string): boolean {
  const clean = text.trim();
  if (clean.length > 80) return false;
  return /^(?:(?:hi|hello|hey|yo)(?:\s+(?:there|laro|veylaro|axon(?:\s+ai)?))?|thanks|thank you|good (?:morning|afternoon|evening)|who are you|what are you)[!?.\s]*$/i.test(clean);
}

function readUsageMirror(): Usage | null {
  try {
    const raw = localStorage.getItem(LS_USAGE);
    if (!raw) return null;
    return JSON.parse(atob(raw)) as Usage;
  } catch {
    return null;
  }
}

export function writeUsageMirror(u: Usage) {
  try {
    localStorage.setItem(LS_USAGE, btoa(JSON.stringify(u)));
  } catch { /* storage full — main record still has it */ }
}

function hydrate(p: Persisted): Persisted {
  if (p.usage.weekKey !== weekKey()) p.usage = { weekKey: weekKey(), used: 0 };
  // the meter is double-booked: whichever record survived, the higher count wins
  const mirror = readUsageMirror();
  if (mirror && mirror.weekKey === p.usage.weekKey && mirror.used > p.usage.used) {
    p.usage = mirror;
  }
  p.settings = { ...DEFAULT_SETTINGS, ...p.settings };
  p.sessions = p.sessions.map((s) => ({ ...s, term: s.term || [] }));
  p.vault = p.vault || [];
  return p;
}

function load(): Persisted {
  // main record, then the rolling backup — a corrupted write never loses your work
  for (const key of [LS_KEY, LS_BAK]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return hydrate(JSON.parse(raw) as Persisted);
    } catch { /* try the next copy */ }
  }
  return hydrate({
    account: null,
    settings: DEFAULT_SETTINGS,
    sessions: [],
    activeId: null,
    usage: { weekKey: weekKey(), used: 0 },
    onboarded: false,
    vault: [],
  });
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
  stopRun(): void; // Stop button — aborts the live run cleanly, mid-stream
  resolveGate(approve: boolean): void;
  resolvePlan(approve: boolean): void;
  answerQuestions(answers: Record<string, string>): void;
  restoreCheckpoint(cp: Checkpoint): void;
  runTerminal(cmd: string): Promise<void>;
  saveToVault(item: Omit<VaultItem, "id" | "ts">): void;
  removeVaultItem(id: string): void;
  setDraft(sessionId: string, draft: string): void;
  sendSideChat(text: string): void;
  setFullDiskAccess(on: boolean): void;
  redeemReferral(code: string): { ok: boolean; msg: string };
  previewPlan(): void; // Future Simulator: predicted outcome of the pending plan
  setOnboarded(): void;
  lastSaved: number; // autosave heartbeat for the titlebar chip
  effectivePlan: Plan; // billing-aware: past_due → free until payment is fixed
  billingStatus: BillingInfo; // full status + any banner to show
  verifyBilling(): void; // re-check subscription (refreshes offline grace)
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("store missing");
  return s;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<Persisted>(load);
  const [remoteCfg, setRemoteCfg] = useState<RemoteConfig>(remoteConfig());
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
  // live run cancellation — the Stop button aborts this, halting the stream
  // and the agent loop cleanly wherever it is.
  const abortRef = useRef<AbortController | null>(null);

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

  // Poll the website's live switches (downloads / unlimited-for-all / launch
  // month). First read on mount, then every 5 min, so an admin flip reaches
  // running clients without a restart.
  useEffect(() => {
    let alive = true;
    const tick = () => refreshRemoteConfig().then((c) => alive && setRemoteCfg(c)).catch(() => {});
    tick();
    const iv = setInterval(tick, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  useEffect(() => {
    if (!st.settings.autoPickModel) return;
    const recommended = recommendModel(ramGB);
    if (st.settings.model === recommended) return;
    setSt((p) => ({
      ...p,
      settings: { ...p.settings, model: recommended },
    }));
  }, [ramGB, st.settings.autoPickModel, st.settings.model]);

  // self-watch: Laro notices when its own UI glitches and logs it honestly
  useEffect(() => {
    const onErr = (e: ErrorEvent) => pushBg("I hit a glitch in my own UI", String(e.message).slice(0, 80)) && undefined;
    const onRej = (e: PromiseRejectionEvent) => pushBg("Something in me misfired — logged it", String(e.reason).slice(0, 80)) && undefined;
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep paid plans fresh: any time we're genuinely online, stamp the verify
  // clock so an active subscriber never trips the offline-grace lapse.
  useEffect(() => {
    const reverify = () => {
      if (navigator.onLine && stRef.current.account && stRef.current.account.plan !== "free") {
        setSt((p) => (p.account ? { ...p, account: { ...p.account, lastVerified: Date.now() } } : p));
      }
    };
    window.addEventListener("online", reverify);
    window.addEventListener("focus", reverify);
    reverify();
    return () => {
      window.removeEventListener("online", reverify);
      window.removeEventListener("focus", reverify);
    };
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
          const bg = pushBg("Waking Laro up", found);
          warmup(st.settings.ollamaUrl, found).then(() => doneBg(bg, true, `${found} hot — first token is instant`));
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [lastSaved, setLastSaved] = useState(Date.now());
  const stRef = useRef(st);
  stRef.current = st;

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(st));
        writeUsageMirror(st.usage);
        setLastSaved(Date.now());
      } catch { /* storage full — keep running, retry next change */ }
    }, 120);
    return () => clearTimeout(t);
  }, [st]);

  // crash armour: rolling backup every 20s + hard flush when the window
  // hides, loses focus, or closes — a kernel panic mid-run loses ≤120ms.
  useEffect(() => {
    const flush = () => {
      try {
        const raw = JSON.stringify(stRef.current);
        localStorage.setItem(LS_KEY, raw);
        localStorage.setItem(LS_BAK, raw);
        writeUsageMirror(stRef.current.usage);
      } catch { /* best effort */ }
    };
    const backup = setInterval(flush, 20000);
    const onHide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(backup);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const active = st.sessions.find((s) => s.id === st.activeId) || null;
  // payment failed? nothing is deleted — the account simply behaves as Free
  // (limits re-apply) until Stripe confirms payment again.
  const billingStatus = deriveBilling(st.account, Date.now(), navigator.onLine);
  const effectivePlan: Plan = billingStatus.plan;
  // Global admin kill-switch: when Leo flips "Unlimited for everyone" on the
  // website, every client uncaps on its next config poll — free or paid.
  const uncapped = remoteCfg.unlimited_for_all || effectivePlan !== "free";
  const remaining = uncapped ? Infinity : Math.max(0, FREE_WEEKLY_LIMIT - st.usage.used);
  const locked = !uncapped && remaining <= 0;

  /* ---- session mutation helpers ---- */

  const mutSession = (id: string, fn: (s: Session) => Session) =>
    setSt((p) => ({ ...p, sessions: p.sessions.map((s) => (s.id === id ? fn({ ...s }) : s)) }));

  const appendEvent = (sessionId: string, msgId: string, evIn: AgentEvent) => {
    const ev = evIn;
    if (ev.kind === "browse") {
      setLastBrowse({ url: ev.url, steps: ev.steps, summary: ev.summary, ts: Date.now() });
      const bg = pushBg("Testing your app — clicking through it", ev.summary);
      setTimeout(() => doneBg(bg), ev.steps.length * 700 + 800);
      setSt((p) => (p.settings.deckOpen ? p : { ...p, settings: { ...p.settings, deckOpen: true } }));
    }
    if (ev.kind === "recap" && st.settings.voice && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(`${ev.title}. ${ev.bullets[0] || ""}`);
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    }
    if (
      ev.kind === "verify" &&
      ev.ok &&
      st.settings.overnight &&
      st.settings.engine === "ollama" &&
      window.veylaro?.isDesktop
    ) {
      const session = st.sessions.find((item) => item.id === sessionId);
      const prompt = [...(session?.msgs || [])].reverse().find((msg) => msg.role === "user")?.text;
      if (prompt) {
        recordVerifiedPrecedent({
          prompt,
          scopeLabel: session?.scope.split(/[\\/]/).pop() || "project",
          check: ev.target,
          evidence: ev.detail,
          model: st.settings.ollamaModel,
        });
      }
    }
    return mutSession(sessionId, (s) => {
      // const snapshot keeps TypeScript narrowing intact after the ms stamp
      const m0 = s.msgs.find((m) => m.id === msgId);
      const e: AgentEvent =
        ev.kind === "done" && ev.ms === 0 && m0 ? { kind: "done", ms: Date.now() - m0.ts } : ev;
      const msgs = s.msgs.map((m) => (m.id === msgId ? { ...m, events: [...(m.events || []), e] } : m));
      let files = s.files;
      let checkpoints = s.checkpoints;
      if (e.kind === "file") {
        files = { ...files };
        Object.values(files).forEach((f) => (f.active = false));
        const prev = files[e.path];
        files[e.path] = {
          path: e.path,
          plus: (prev?.plus || 0) + e.plus,
          minus: (prev?.minus || 0) + e.minus,
          active: true,
          verified: null,
        };
      }
      if (e.kind === "verify") {
        files = { ...files };
        Object.values(files).forEach((f) => {
          files[f.path] = { ...f, verified: e.ok, active: false };
        });
      }
      if (e.kind === "checkpoint") {
        const snap: Checkpoint = {
          id: uid(),
          label: e.label,
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
    lastSaved,
    effectivePlan,
    billingStatus,

    async signIn(name, email, license) {
      await new Promise((r) => setTimeout(r, 1400)); // "syncing with your Veylaro account"
      const lic = license || "";
      const now = Date.now();
      // license shape decides plan + billing state. Real builds get this from
      // the backend / Stripe; the VEY-* prefixes double as QA hooks for every state.
      const plan: Plan = /^VEY-TEAM-/i.test(lic) ? "team"
        : /^VEY-(PRO|TRIAL|PASTDUE|CANCEL)-/i.test(lic) ? "pro" : "free";
      let billing: Account["billing"] = "active";
      let periodEnd: number | undefined = plan === "free" ? undefined : now + 30 * DAY;
      let graceUntil: number | undefined;
      if (/^VEY-TRIAL-/i.test(lic)) { billing = "trialing"; periodEnd = now + 14 * DAY; }
      else if (/^VEY-PASTDUE-/i.test(lic)) { billing = "past_due"; graceUntil = now + PAST_DUE_GRACE_MS; }
      else if (/^VEY-CANCEL-/i.test(lic)) { billing = "canceled"; periodEnd = now + 5 * DAY; }
      const seed = (email.trim().toLowerCase() + "veylaro").split("").reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
      const account: Account = {
        name: name.trim() || email.split("@")[0], email: email.trim(),
        plan, billing, periodEnd, graceUntil, lastVerified: now,
        // every new account starts with the launch month of unlimited
        launchTrialUntil: st.account?.launchTrialUntil ?? now + LAUNCH_FREE_MONTH_MS,
        referralCode: st.account?.referralCode ?? `LARO-${seed.toString(36).toUpperCase().slice(0, 6)}`,
        referralsUsed: st.account?.referralsUsed ?? 0,
      };
      setSt((p) => ({ ...p, account }));
      return account;
    },

    verifyBilling() {
      // re-confirm the subscription online. With the backend this re-fetches
      // Stripe status; here it refreshes the offline-grace clock.
      setSt((p) => (p.account ? { ...p, account: { ...p.account, lastVerified: Date.now() } } : p));
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
      mutSession(active.id, (s) => {
        // first message names the chat — short form of the prompt
        let title = s.title;
        if (s.msgs.length === 0 && text.trim()) {
          const clean = text.trim().replace(/\s+/g, " ");
          title = clean.length > 34 ? clean.slice(0, 34).replace(/\s+\S*$/, "") + "…" : clean;
        }
        return { ...s, title, msgs: [...s.msgs, userMsg, agentMsg] };
      });
      setSt((p) => {
        if (effectivePlan !== "free") return p;
        const usage = { weekKey: weekKey(), used: p.usage.used + 1 };
        writeUsageMirror(usage); // meter survives even if main storage is cleared
        return { ...p, usage };
      });

      const { settings } = st;

      if (settings.engine === "ollama") {
        // live model path — real local inference, real file writes.
        setRunning(true);
        const controller = new AbortController();
        abortRef.current = controller;
        const signal = controller.signal;
        const sess = active;
        const modelName = MODELS[settings.model].name;
        const scopeName = sess.scope.split(/[\\/]/).pop() || "the project";
        const canWrite = !!window.veylaro?.writeFile;

        // write one file through the guarded bridge; emit a compact row, not code
        const writeOne = async (rel: string, content: string): Promise<boolean> => {
          if (!rel || !canWrite) return false;
          const abs = resolveInScope(sess.scope, sess.scopeKind, rel);
          let old: string | null = null;
          try {
            const r = await window.veylaro!.readFile?.(abs);
            if (r?.ok) old = r.content ?? null;
          } catch { /* new file */ }
          const res = await window.veylaro!.writeFile!(abs, content, {
            scope: sess.scope,
            scopeKind: sess.scopeKind,
            fullDisk: settings.fullDiskAccess,
            confirmed: settings.permMode !== "ask",
          });
          if (!res.ok) {
            appendEvent(sess.id, agentMsg.id, {
              kind: "say",
              plain: `⛔ I couldn't write ${rel} — ${res.error || "the guard blocked it (it's outside this project's scope)"}.`,
              dev: "guarded write refused",
            });
            return false;
          }
          const { plus, minus, op } = diffCounts(old, content);
          appendEvent(sess.id, agentMsg.id, {
            kind: "file",
            path: rel,
            op,
            plus,
            minus,
            snippet: { del: [], add: content.split("\n").slice(0, 3) },
          });
          return true;
        };

        // run one shell command through the guard, show the result compactly
        const runOne = async (cmd: string): Promise<void> => {
          if (!window.veylaro?.exec) return;
          const r = await window.veylaro.exec(cmd, sess.scope, { confirmed: settings.permMode === "bypass" });
          appendEvent(sess.id, agentMsg.id, { kind: "cmd", cmd, out: (r.out || "").slice(0, 1200), ok: !!r.ok && !r.blocked });
        };

        (async () => {
          const fastPath = isFastInteraction(text) && attachments.length === 0;
          try {
            // optional live web grounding (query only ever leaves the machine)
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
                appendEvent(sess.id, agentMsg.id, { kind: "web", query: q, results });
                searchCtx = resultsToContext(q, results);
              }
            }

            // ---- casual chat: one short reply, no build machinery ----
            if (fastPath) {
              const sys: ChatMsg[] = [{
                role: "system",
                content: laroContext(ramGB) + "\n\nYou are Laro, built by Veylaro Labs — never say another company made you, and never claim a knowledge cutoff. This is casual conversation: reply naturally in a sentence or two, with real personality and opinions. No plan, no preamble, no technical footer.",
              }];
              if (searchCtx) sys.push({ role: "system", content: `${GROUNDING_NOTE}\n\n${searchCtx}` });
              setStreamText("");
              let acc = "";
              for await (const part of ollamaChat(settings.ollamaUrl, settings.ollamaModel, [...sys, { role: "user", content: text }], settings.model, false, signal, { num_predict: 220, num_ctx: 2048, temperature: 0.4 })) {
                if (part.type === "text") { acc += part.chunk; setStreamText(acc); }
              }
              appendEvent(sess.id, agentMsg.id, {
                kind: "say",
                plain: acc.trim() || "…the model returned an empty reply. Give me one more go — the weights may still be warming up.",
                dev: `${modelName} · on your machine`,
              });
              finishRun();
              return;
            }

            // ---- build / agent path: keeps going until the job is done ----
            const sys: ChatMsg[] = [
              { role: "system", content: laroContext(ramGB) + "\n\n" + LARO_CHARTER },
              { role: "system", content: EXECUTION_LATTICE_PROMPT },
            ];
            if (canWrite) {
              sys.push({ role: "system", content: `${FILE_PROTOCOL_PROMPT}\n\nProject folder for this session: ${sess.scope}\nEvery path you write is relative to that folder.` });
            }
            if (settings.reasoning) {
              sys.push({ role: "system", content: "Expose only a concise work summary as you go: what you're doing and what you find. Do not reveal private chain-of-thought." });
            }
            if (searchCtx) sys.push({ role: "system", content: `${GROUNDING_NOTE}\n\n${searchCtx}` });
            if (settings.overnight) {
              const precedents = precedentsAsPrompt(text);
              if (precedents) sys.push({ role: "system", content: precedents });
            }

            const convo: ChatMsg[] = [...sys, { role: "user", content: `[project folder: ${sess.scope}]\n${text}` }];
            const maxSteps = settings.model === "lite" ? 4 : settings.model === "max" ? 8 : 6;
            const narrationAll: string[] = [];
            let filesWritten = 0;
            let done = false;
            let step = 0;

            while (!done && step < maxSteps && !signal.aborted) {
              step++;
              const parser = new StreamParser();
              let raw = "";
              let wroteThisStep = 0;
              let ranThisStep = 0;
              setStreamText(step === 1 ? "Reading the task…" : "Continuing…");

              for await (const part of ollamaChat(settings.ollamaUrl, settings.ollamaModel, convo, settings.model, false, signal)) {
                if (part.type !== "text") continue;
                raw += part.chunk;
                for (const ev of parser.push(part.chunk)) {
                  if (ev.t === "file") { if (await writeOne(ev.path, ev.content)) { wroteThisStep++; filesWritten++; } }
                  else if (ev.t === "run") { await runOne(ev.cmd); ranThisStep++; }
                  else if (ev.t === "done") { done = true; }
                }
                const w = parser.writing;
                const lastLine = parser.liveNarration.split("\n").filter(Boolean).slice(-1)[0];
                setStreamText(w ? `✍️ Writing ${w}…` : (lastLine || "Working…"));
              }
              // close out any trailing block, then salvage stray fenced code
              for (const ev of parser.flush()) {
                if (ev.t === "file") { if (await writeOne(ev.path, ev.content)) { wroteThisStep++; filesWritten++; } }
              }
              const salv = canWrite ? salvageFences(parser.liveNarration) : { files: [], rest: parser.liveNarration };
              for (const f of salv.files) { if (await writeOne(f.path, f.content)) { wroteThisStep++; filesWritten++; } }
              const narration = (salv.files.length ? salv.rest : parser.liveNarration).trim();
              if (narration) narrationAll.push(narration);

              convo.push({ role: "assistant", content: raw });
              if (signal.aborted || done) break;
              // a pure answer/question with no file ops: nothing to build — stop here
              if (wroteThisStep === 0 && ranThisStep === 0) break;
              if (step < maxSteps) {
                convo.push({ role: "user", content: "Keep going. If every file is written and the whole task is genuinely finished, reply with @@DONE on its own line. Otherwise write the next file now — do not stop early and do not ask me whether to continue." });
              }
            }

            const summary = narrationAll.join("\n").replace(/\n{3,}/g, "\n\n").trim();
            const closing = filesWritten
              ? `Wrote ${filesWritten} file${filesWritten === 1 ? "" : "s"} into ${scopeName}.`
              : "";
            appendEvent(sess.id, agentMsg.id, {
              kind: "say",
              plain: summary || closing || "…the model returned an empty reply. Try again — the weights may still be loading.",
              dev: filesWritten ? `${modelName} · ${filesWritten} file${filesWritten === 1 ? "" : "s"} written on your machine` : `${modelName} · on your machine`,
            });
            if (!canWrite && !fastPath) {
              appendEvent(sess.id, agentMsg.id, {
                kind: "say",
                plain: "Heads up: file-writing needs the desktop app — in this preview I can plan and explain, but I can't write to your disk.",
                dev: "no file bridge in this environment",
              });
            }
          } catch (e: any) {
            if (signal.aborted) {
              appendEvent(sess.id, agentMsg.id, { kind: "say", plain: "Stopped — I left everything exactly where it was.", dev: "run aborted by user" });
            } else {
              appendEvent(sess.id, agentMsg.id, {
                kind: "say",
                plain: `I couldn't reach the local Laro engine (${e?.message || e}). Make sure Laro's engine is running, or switch Settings → Engine to Preview.`,
                dev: `error: ${e?.message || e}`,
              });
            }
          }
          finishRun();
        })();

        function finishRun() {
          setStreamText(null);
          setStreamThink(null);
          setSearching(null);
          appendEvent(sess.id, agentMsg.id, { kind: "done", ms: 0 });
          setRunning(false);
          abortRef.current = null;
        }
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
        images: attachments.length,
      });
      play(active.id, agentMsg.id, script, settings.permMode);
    },

    stopRun() {
      // abort the live stream + agent loop wherever it is; the run's own
      // catch/finally emits the "Stopped" line and clears running state.
      abortRef.current?.abort();
      // the demo runner uses a timer chain, not a stream — clear that too
      if (timer.current) clearTimeout(timer.current);
      setPending(null);
      setStreamText(null);
      setStreamThink(null);
      setRunning(false);
      // free the weights from RAM now — you stopped, so nothing should linger
      if (st.settings.engine === "ollama") {
        unloadModel(st.settings.ollamaUrl, st.settings.ollamaModel);
      }
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
      const bg = pushBg("Running your command", c.length > 42 ? c.slice(0, 42) + "…" : c);
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
      if (res.ok && st.settings.overnight && window.veylaro?.isDesktop) {
        const prompt = [...active.msgs].reverse().find((msg) => msg.role === "user")?.text;
        if (prompt) {
          recordVerifiedPrecedent({
            prompt,
            scopeLabel: active.scope.split(/[\\/]/).pop() || "project",
            check: c,
            evidence: res.out.slice(0, 600),
            model: st.settings.engine === "ollama" ? st.settings.ollamaModel : "manual-terminal",
          });
        }
      }
    },

    setFullDiskAccess(on) {
      // Recorded with a timestamp so there's an audit trail of the moment
      // a human — not the model — opened the whole disk.
      setSt((p) => ({
        ...p,
        settings: { ...p.settings, fullDiskAccess: on, fullDiskAckAt: on ? Date.now() : undefined },
      }));
      pushBg(on ? "Full-disk access ON — you accepted the risk" : "Full-disk access off — back to scope only");
    },

    redeemReferral(code) {
      const c = code.trim().toUpperCase();
      if (!c) return { ok: false, msg: "Enter a code first." };
      if (!st.account) return { ok: false, msg: "Sign in before redeeming a code." };
      if (c === (st.account.referralCode || "").toUpperCase())
        return { ok: false, msg: "That's your own code — nice try." };
      if (st.account.launchTrialUntil && Date.now() < st.account.launchTrialUntil)
        return { ok: false, msg: "You're already on free unlimited — save the code for later." };
      setSt((p) => ({
        ...p,
        account: p.account ? { ...p.account, launchTrialUntil: Date.now() + LAUNCH_FREE_MONTH_MS } : p.account,
      }));
      return { ok: true, msg: "Applied — a free month is on your account, and 10% off your first paid month." };
    },

    sendSideChat(text) {
      const t = text.trim();
      if (!t) return;
      const you: SideMsg = { id: uid(), role: "you", text: t, ts: Date.now() };
      setSt((p) => ({ ...p, sideChat: [...(p.sideChat || []), you].slice(-60) }));
      const respond = (reply: string) =>
        setSt((p) => ({ ...p, sideChat: [...(p.sideChat || []), { id: uid(), role: "laro" as const, text: reply, ts: Date.now() }].slice(-60) }));
      if (st.settings.engine === "ollama") {
        (async () => {
          try {
            let acc = "";
            // give the side chat real memory: the last ~12 turns as history, so
            // it stops repeating itself and can reference what was already said.
            const history = (st.sideChat || []).slice(-12).map((m) => ({
              role: (m.role === "laro" ? "assistant" : "user") as "assistant" | "user",
              content: m.text,
            }));
            for await (const part of ollamaChat(
              st.settings.ollamaUrl, st.settings.ollamaModel,
              [{ role: "system", content: laroContext(ramGB) + "\n\n" + LARO_SIDE_CHARTER },
               ...history,
               { role: "user", content: t }],
              "lite", false
            )) if (part.type === "text") acc += part.chunk;
            respond(acc || sideChatReply(t));
          } catch { respond(sideChatReply(t)); }
        })();
      } else {
        setTimeout(() => respond(sideChatReply(t)), 600 + Math.random() * 700);
      }
    },

    previewPlan() {
      // Future Simulator: read the pending plan's actual future and show it
      if (!pending || pending.type !== "plan" || !active) return;
      const fileEvs = pending.resume.map((t) => t.ev).filter((e): e is Extract<AgentEvent, { kind: "file" }> => e.kind === "file");
      const files = [...new Set(fileEvs.map((f) => f.path))];
      const plus = fileEvs.reduce((n, f) => n + f.plus, 0);
      const minus = fileEvs.reduce((n, f) => n + f.minus, 0);
      appendEvent(active.id, pending.msgId, {
        kind: "sim",
        files, plus, minus,
        pros: ["Small, reviewable diff — easy to undo via the time machine", "Everything stays inside the scope lock", "Verified by an actual run before handback"],
        cons: [files.length > 1 ? "Touches more than one file — review both" : "Single-file change — low blast radius", "Estimates come from the plan; reality can drift a little"],
      });
    },

    setDraft(sessionId, draft) {
      mutSession(sessionId, (s) => (s.draft === draft ? s : { ...s, draft }));
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
    [st, running, pending, restoredTo, ramGB, liveModel, streamText, streamThink, searching, bgTasks, lastBrowse, lastSaved]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
