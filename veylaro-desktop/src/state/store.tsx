import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import {
  Account, AgentEvent, Attachment, BgTask, BrowseStep, Checkpoint, FileStat, FREE_WEEKLY_LIMIT, Msg, MODELS,
  LAUNCH_FREE_MONTH_MS, OFFLINE_GRACE_MS, PAST_DUE_GRACE_MS, PermMode, Plan, Question, REFERRAL_MAX,
  Session, Settings, SideMsg, SideThread, TermLine, Usage, VaultItem, APP_VERSION,
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
        ? { tone: "info", title: `Your free launch month ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, body: "After that you drop to the free tier — 50 messages a week, still unlimited privacy. Go Pro any time to keep it uncapped.", cta: "resubscribe" }
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
import { detectLiveModel, ensureLocalEngine, tierFromModelName, veylaroChat, ChatMsg } from "../engine/runtime";
import { isFastInteraction, looksLikeBuild, looksLikeDebug, wantsToRunApp } from "../engine/intentRouter";
import { calibrateCasualReply, runtimeFactReply, verifiedArithmeticReply, VerifiedActivity } from "../engine/claimCalibration";
import {
  FILE_PROTOCOL_PROMPT, StreamParser, salvageFences, resolveInScope, diffCounts,
} from "../engine/agentLoop";
import { recordMilestone, timelineForPrompt } from "../engine/projectTimeline";
import { planForMemory, pressureVerdict } from "../engine/memoryGuard";
import { GROUNDING_NOTE, LARO_SIDE_CHARTER, SOVEREIGN_FORGE_PROMPT, laroContext } from "../engine/charter";
import { evidenceBudget, EXECUTION_LATTICE_PROMPT } from "../engine/executionLattice";
import { cleanAssistantText, collapseReason, isPresentableNarration } from "../engine/outputHygiene";
import { extractRepairFiles } from "../engine/repairCandidates";
import { liteReinforced, canSyntaxCheck, checkInProcess } from "../engine/liteBoost";
import { ambitionFloor, assessDeliverable, continuationBrief, isFillerFile } from "../engine/completionGate";
import { continuationPressure, stepPolicy, stopReason } from "../engine/stepBudget";
import { enforcementBrief, isProtocolFailure } from "../engine/protocolEnforcer";
import { breadthBrief, detectRegression, regressionBrief } from "../engine/progressGuard";
import { findBrokenReferences, referenceGaps, repairReferences } from "../engine/referenceGate";
import { designBriefFor, designGaps, gradeDesign, wantsVisualDesign } from "../engine/designSystem";
import { assessShrink } from "../engine/workPreservation";
import { synthesizeSemanticRepairs } from "../engine/semanticRepair";
import { explicitlyRequestsTestEdits, isProtectedTestPath } from "../engine/testIntegrity";
import { classifyModelCommand } from "../engine/commandPolicy";
import { compactFailureEvidence, failureRepairBrief } from "../engine/failureKernel";
import { reproductionCommand, verificationCommands } from "../engine/verificationPlan";
import { compileExecutionContract } from "../engine/contractCompiler";

/** The maker's account — signing in as this unlocks the developer build. */
export const OWNER_EMAIL = "leoanthonybons@gmail.com";

/** When the local model is warm in RAM until (epoch ms). Set after the first
    token streams; keep_alive holds the weights ~20m. While warm, we DON'T show
    the "Loading Laro into memory…" state — the load only happens once. */
let modelWarmUntil = 0;
const isModelWarm = () => Date.now() < modelWarmUntil;
const modelWasLoaded = () => modelWarmUntil > 0;
const markModelWarm = () => { modelWarmUntil = Date.now() + 19 * 60 * 1000; };
const markModelCold = () => { modelWarmUntil = 0; };
import { privacySafeSearchQuery, resultsToContext, webSearch } from "../engine/search";
import { recommendModel, subAgentLanes } from "../engine/tiers";
import { precedentsAsPrompt, recordVerifiedPrecedent } from "../engine/localLearning";

/* ============ helpers ============ */

export const uid = () => Math.random().toString(36).slice(2, 10);

/** Ensure the side-chat has at least one thread, migrating the legacy single
    `sideChat` list into a thread the first time. Pure — safe inside setSt. */
function ensureSideThreads(p: { sideThreads?: SideThread[]; activeSideThread?: string; sideChat?: SideMsg[] }): {
  threads: SideThread[];
  activeId: string;
} {
  let threads = p.sideThreads && p.sideThreads.length ? p.sideThreads : [];
  if (!threads.length) {
    const migrated = p.sideChat && p.sideChat.length ? p.sideChat : [];
    threads = [{ id: uid(), title: migrated.length ? (migrated[0].text.slice(0, 42) || "Chat") : "New chat", msgs: migrated, createdAt: Date.now() }];
  }
  const activeId = threads.some((t) => t.id === p.activeSideThread) ? (p.activeSideThread as string) : threads[threads.length - 1].id;
  return { threads, activeId };
}

/** True when `latest` is a strictly newer dotted version than `current`
    (e.g. "1.1.0" > "1.0.3"). Used to surface the auto-update prompt only when a
    genuinely newer build has been published. */
export function isNewerVersion(latest: string, current: string): boolean {
  const p = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
  const a = p(latest);
  const b = p(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** Only reach for the web on clearly current/factual questions — general chat
    and coding talk answer straight from the model (and stay fast). */
const WEB_HINT = /\b(today|tonight|latest|current|right now|news|price|cost|weather|release[ds]?|version|update[ds]?|score|won|winner|result|202[4-9]|stock|rate|who is|when is|how much|deadline|schedule)\b/i;
function needsWeb(t: string): boolean {
  return t.length > 6 && WEB_HINT.test(t);
}

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
  sideChat?: SideMsg[]; // legacy single companion chat — migrated into sideThreads
  sideThreads?: SideThread[]; // the Viewport "Chat" tab — one or more chat threads
  activeSideThread?: string; // id of the thread shown in the Chat tab
  autoEngineDone?: boolean; // live-weights auto-switch runs once, ever
}

const DEFAULT_SETTINGS: Settings = {
  model: "lite",
  permMode: "edits",
  lang: "both",
  personality: true,
  sounds: false,
  engine: "veylaro",
  engineUrl: "http://127.0.0.1:8080",
  engineModel: "mlx-community/gemma-4-e2b-it-4bit",
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
  // Veylaro runs its OWN engine. Any profile still pointing at a third-party
  // runtime's stock address is migrated to the app-owned engine — there is no
  // external runtime in the product any more, so leaving it there would just
  // fail to connect. A genuinely custom endpoint the user typed is preserved.
  if (p.settings.engineUrl === "http://127.0.0.1:11434") {
    p.settings.engineUrl = "http://127.0.0.1:8080";
  }
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
  launchUsageFree: boolean; // launch-month promo: usage uncapped for free users (usage only, not Pro features)
  updateReady: boolean; // a newer app version has been published — surface a download prompt
  latestVersion: string; // the latest published app version from remote config
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
  newSideChat(): void;
  selectSideChat(id: string): void;
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
  const runEpochRef = useRef(0);
  const liveGateRef = useRef<((approved: boolean) => void) | null>(null);

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

  // Smart Load lifecycle: while the app is merely open, no model is resident.
  // Activity refreshes the engine's 20-minute window. Once idle, or once the OS
  // reports critical free memory, the app-owned process is released.
  const criticalStreak = useRef(0);
  useEffect(() => {
    if (!window.veylaro?.engineStop) return;
    const tick = async () => {
      if (!modelWasLoaded()) return;
      const expired = !isModelWarm();
      let critical = false;
      try {
        const mem = await window.veylaro?.memoryState?.();
        // macOS keeps useful memory in inactive/compressed caches, so os.freemem()
        // alone often reports <0.6 GB on a healthy machine and used to unload Laro
        // every 30 seconds. memory_pressure is the authoritative reclaimability
        // signal on Mac; raw free bytes remain the fallback elsewhere.
        // NEVER fall back to raw free bytes on macOS. os.freemem() reads ~4% on a
        // healthy Mac because the OS caches aggressively, and that number used to
        // stand in whenever memory_pressure was unreadable — which happens exactly
        // when the machine is busy running a build. The result was healthy machines
        // aborting their own runs. An unreadable pressure signal is UNKNOWN, and
        // unknown must never destroy work in progress.
        const pressurePct = typeof mem?.pressureFreePct === "number" ? mem.pressureFreePct : null;
        const freeGB = mem && Number.isFinite(mem.freeGB) ? mem.freeGB : null;
        const isMac = navigator.platform?.toLowerCase().includes("mac");
        critical = !!mem
          && (pressurePct !== null || !isMac)
          && pressureVerdict(isMac ? null : freeGB, pressurePct) === "critical";
      } catch { /* best effort */ }
      // ONE BAD READING IS NOT A CRISIS.
      //
      // Loading a 7.3 GB model legitimately drives free memory down for a few
      // seconds. The watchdog used to abort the run on the FIRST critical
      // reading, which meant that on a 16 GB Mac — the exact machine Med is
      // recommended for — a build could be killed by its own model loading.
      // Observed twice in a row on the packaged app: the run died seconds after
      // starting, rolled back its work, and reported "run aborted by user"
      // when the user had done nothing.
      //
      // Two consecutive readings 30s apart means memory is genuinely gone, not
      // that we are mid-load. The engine is still released promptly when idle.
      if (critical && running) {
        criticalStreak.current += 1;
        if (criticalStreak.current < 2) return;
        markModelCold();
        criticalStreak.current = 0;
        abortRef.current?.abort();
        await window.veylaro?.engineStop?.();
        return;
      }
      criticalStreak.current = 0;
      if ((expired || critical) && !running) {
        markModelCold();
        await window.veylaro?.engineStop?.();
      }
    };
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [running]);

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
    const recommended = tierFromModelName(liveModel || "") || recommendModel(ramGB);
    if (st.settings.model === recommended) return;
    setSt((p) => ({
      ...p,
      settings: { ...p.settings, model: recommended },
    }));
  }, [liveModel, ramGB, st.settings.autoPickModel, st.settings.model]);

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
      const found = await detectLiveModel(st.settings.engineUrl);
      if (cancelled) return;
      setLiveModel(found);
      if (found) {
        const detectedTier = tierFromModelName(found);
        // A responsive local endpoint already has its checkpoint resident. Keep
        // the UI's warm-state clock in sync so a renderer reload does not show a
        // fake cold-load message on every conversation.
        markModelWarm();
        setSt((p) => {
          // The browser preview has no desktop Settings surface on narrow
          // viewports. When a real local endpoint is present, route chat to it
          // instead of showing a misleading "live weights" badge over demo text.
          if (p.autoEngineDone && window.veylaro?.isDesktop) return p;
          return {
            ...p,
            autoEngineDone: true,
            settings: {
              ...p.settings,
              engine: "veylaro",
              engineModel: found.replace(/:latest$/, ""),
              // The checkpoint that actually answered wins over a RAM-based
              // recommendation. Otherwise a 16 GB machine can display Med
              // while every token is still coming from Lite.
              ...(detectedTier ? { model: detectedTier, autoPickModel: false } : {}),
            },
          };
        });
        // Smart-load: DON'T pre-load the weights at startup. The app stays light
        // in RAM until the first real message, which is when the model loads (with
        // a visible "Loading Laro into memory…" state). After that it's kept warm.
      } else if (window.veylaro?.isDesktop) {
        // Self-contained desktop app: nothing is serving on the endpoint yet, but
        // the app BUNDLES its own llama.cpp engine and starts it on the first
        // message (ensureLocalEngine → engineEnsure). Force the real path so the
        // shipped app never sits in demo / preview-brain mode replaying scripted
        // output instead of actually running the model. Demo mode is only ever for
        // the browser preview, which has no window.veylaro to start an engine.
        setSt((p) => (p.settings.engine === "veylaro"
          ? p
          : { ...p, settings: { ...p.settings, engine: "veylaro" } }));
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
  //
  // Launch promo: while Leo's "launch month" switch is ON on the website, a free
  // user inside their launch-month window gets unlimited USAGE — the message
  // meter is uncapped. This is USAGE ONLY: it does not grant any Pro feature and
  // it does not change effectivePlan, so everything else in Pro still needs Pro.
  // Flip the switch off on the website and every client re-caps on the next poll.
  // Launch month is ON: while the website switch is set, every free user gets
  // unlimited USAGE (messages/chats). It is usage only — no Pro feature is
  // unlocked and effectivePlan stays "free", so everything else in Pro is still
  // paid. Flip launch_month_on off on the website and caps return on the next poll.
  const launchUsageFree = remoteCfg.launch_month_on && effectivePlan === "free";
  const uncapped = remoteCfg.unlimited_for_all || effectivePlan !== "free" || launchUsageFree;
  const remaining = uncapped ? Infinity : Math.max(0, FREE_WEEKLY_LIMIT - st.usage.used);
  const locked = !uncapped && remaining <= 0;
  // Auto-update: the 5-minute config poll carries the latest published app
  // version. The moment Leo bumps latest_app_version in the admin panel, every
  // running client sees a newer build here and surfaces a one-tap download
  // prompt — no store listing, no manual "check for updates".
  const latestVersion = remoteCfg.latest_app_version || APP_VERSION;
  const updateReady = isNewerVersion(latestVersion, APP_VERSION);

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
    launchUsageFree,
    updateReady,
    latestVersion,
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

      if (settings.engine === "veylaro") {
        // live model path — real local inference, real file writes.
        setRunning(true);
        const controller = new AbortController();
        abortRef.current = controller;
        const runEpoch = ++runEpochRef.current;
        const signal = controller.signal;
        const sess = active;
        const requestedSku = settings.model;
        let memPlan = planForMemory(requestedSku, ramGB);
        let runSku = memPlan.model;
        let modelName = MODELS[runSku].name;
        let activeEngineModel = settings.engineModel;
        const scopeName = sess.scope.split(/[\\/]/).pop() || "the project";
        const canWrite = !!window.veylaro?.writeFile;
        const writtenPaths: string[] = []; // everything Laro wrote, for the auto-Viewport
        const deliverable = new Map<string, string>(); // path -> final content, for the completion gate
        const writeFeedback: string[] = [];
        const runSnapshots = new Map<string, string | null>();
        let runRolledBack = false;
        // Memory Guard: right-size the context to this machine so it never swaps.
        // On the target configs (Lite/8GB, Med/16GB) this returns the FULL context —
        // no change, no performance loss. It only shrinks when RAM is genuinely tight.
        let editsApproved = settings.permMode !== "ask";
        const testEditsExplicit = explicitlyRequestsTestEdits(text);
        const lockExistingTests = looksLikeDebug(text) && !testEditsExplicit;
        const isTestFile = (rel: string) => isProtectedTestPath(rel);
        const scopedCtx = {
          scope: sess.scope,
          scopeKind: sess.scopeKind,
          fullDisk: settings.fullDiskAccess,
        } as const;

        const requestLiveApproval = (what: string, detail: string): Promise<boolean> => {
          if (settings.permMode === "bypass") return Promise.resolve(true);
          return new Promise((resolve) => {
            liveGateRef.current = resolve;
            setPending({ type: "gate", msgId: agentMsg.id, gate: { what, detail }, resume: [] });
            setRunning(false);
          });
        };

        // write one file through the guarded bridge; emit a compact row, not code
        /** Append to an existing file WITHOUT the model retyping it.
            Generation is memory-bandwidth-bound at ~11.5 tok/s here, so re-emitting
            200 correct lines to add 20 is the single biggest waste in a long build.
            This resolves to an ordinary guarded write of (existing + new), so the
            Guard, the .veylaro-bak backup and the rollback path are all unchanged.
            Falls back to a plain create when the file doesn't exist yet. */
        const appendOne = async (rel: string, addition: string): Promise<boolean> => {
          if (!rel || !canWrite) return false;
          const abs = resolveInScope(sess.scope, sess.scopeKind, rel);
          const seen = await window.veylaro?.readFile?.(abs, scopedCtx);
          const existing = seen?.ok ? String(seen.content ?? "") : "";
          if (!existing) return writeOne(rel, addition);
          const joined = existing.replace(/\s*$/, "") + "\n\n" + addition.replace(/^\s*\n/, "");
          return writeOne(rel, joined);
        };

        const writeOne = async (rel: string, content: string, opts: { silent?: boolean } = {}): Promise<boolean> => {
          if (!rel || !canWrite) return false;
          if (lockExistingTests && isTestFile(rel)) {
            const reason = `EDIT ${rel}: rejected by the test-integrity gate; repair source code, not the failing test`;
            writeFeedback.push(reason);
            appendEvent(sess.id, agentMsg.id, { kind: "step", text: `⛔ refused to rewrite ${rel} — failing tests are evidence, not the fix` });
            return false;
          }
          if (!editsApproved) {
            editsApproved = await requestLiveApproval(
              `Edit files inside ${scopeName}`,
              "This approval covers in-scope file edits for the current run only."
            );
            if (!editsApproved) {
              appendEvent(sess.id, agentMsg.id, { kind: "say", plain: "I left the files unchanged because edit permission was declined.", dev: "write gate declined" });
              return false;
            }
            setRunning(true);
          }
          const abs = resolveInScope(sess.scope, sess.scopeKind, rel);
          let old: string | null = null;
          try {
            const r = await window.veylaro!.readFile?.(abs, scopedCtx);
            if (r?.ok) old = r.content ?? "";
            else if (r?.exists) {
              const reason = `EDIT ${rel}: rejected because the existing file could not be snapshotted (${r.error || "read failed"})`;
              writeFeedback.push(reason);
              appendEvent(sess.id, agentMsg.id, { kind: "step", text: `⛔ refused to overwrite ${rel} — I could not capture a rollback snapshot` });
              return false;
            }
          } catch { /* new file */ }
          // No-op guard: a rewrite that's identical to what's already on disk isn't
          // progress. Skip it so Laro can't spin re-saving the same file ("adding a
          // border", "adding padding"…) burning steps, time and RAM for nothing.
          if (old !== null && old.trim() === content.trim()) return false;
          // WORK PRESERVATION — refuse a rewrite that destroys finished work.
          // Measured: a build went 278 -> 240 -> 215 lines as the model kept
          // replacing good files with shorter ones. The old regression guard ran
          // AFTER the write, so it could only complain about work already gone —
          // and the model, asked to restore 80 lines it no longer had, produced
          // another stub. Refusing keeps the full version on disk, so the next
          // attempt starts from it. `opts.silent` writes are ours (the reference
          // repair), never the model's, so they bypass this.
          // NO FILLER ON DISK. A component that renders its own name and a
          // sentence describing itself is not work — it is the model satisfying a
          // file count. Observed: Module12…Module28, seventeen of them. Refuse the
          // write so the project never accumulates them in the first place.
          if (!opts.silent && isFillerFile({ path: rel, content })) {
            writeFeedback.push(
              `EDIT ${rel}: refused — that file only describes itself. Do not create a file to have another file. ` +
              `Build real functionality into the files that already exist, or write something the project actually needs.`,
            );
            appendEvent(sess.id, agentMsg.id, { kind: "step", text: `🚫 refused ${rel} — placeholder file, not real work` });
            return false;
          }
          if (!opts.silent) {
            const shrink = assessShrink(rel, old, content);
            if (shrink.destructive) {
              writeFeedback.push(shrink.brief);
              appendEvent(sess.id, agentMsg.id, { kind: "step", text: `🛡️ refused to shrink ${rel} (${shrink.beforeLines} → ${shrink.afterLines} lines) — kept your finished work` });
              return false;
            }
          }
          // Lite Syntax Gate (Lite tier only): Gemma-4B sometimes emits code that
          // doesn't parse — an extra ')' in a conditional was the exact failure on
          // the SaaS-auth fixture. Catch it before it's written or run, and hand back
          // the precise location so the next turn is a surgical fix, not a wasted
          // repair cycle running cryptic test errors. Med/Max skip this entirely.
          if (liteReinforced(requestedSku) && canSyntaxCheck(rel)) {
            const syn = checkInProcess(rel, content);
            if (syn) {
              writeFeedback.push(`EDIT ${rel}: rejected before write — it does not parse. ${syn} Return the COMPLETE corrected file; count your brackets and keep the intended logic.`);
              appendEvent(sess.id, agentMsg.id, { kind: "step", text: `⛔ ${rel} didn't parse (${syn}) — asked Laro for a clean version` });
              return false;
            }
          }
          if (!runSnapshots.has(rel)) runSnapshots.set(rel, old);
          const res = await window.veylaro!.writeFile!(abs, content, { ...scopedCtx, confirmed: editsApproved });
          if (!res.ok) {
            appendEvent(sess.id, agentMsg.id, {
              kind: "say",
              plain: `⛔ I couldn't write ${rel} — ${res.error || "the guard blocked it (it's outside this project's scope)"}.`,
              dev: "guarded write refused",
            });
            writeFeedback.push(`EDIT ${rel}: rejected (${res.error || "write guard blocked it"})`);
            return false;
          }
          const { plus, minus, op } = diffCounts(old, content);
          deliverable.set(rel, content); // what the completion gate judges
          if (!opts.silent) {
            writtenPaths.push(rel);
            appendEvent(sess.id, agentMsg.id, {
              kind: "file",
              path: rel,
              op,
              plus,
              minus,
              snippet: { del: [], add: content.split("\n").slice(0, 3) },
            });
          }
          return true;
        };

        /** Restore the repository to the exact state before this run. Failed
            execution-gated work never survives on disk. A null snapshot means
            the model created that file, so the rollback bridge removes it. */
        /* NEW WORK IS NEVER DELETED.
         *
         * runSnapshots stores `null` for a file the run CREATED, and restoring
         * `null` deletes it. So a rollback wiped out everything the run had
         * written. The user watched Laro write App.tsx, App.css and a package.json,
         * stop, and delete all three:
         *
         *     rewound to "Stopped run — restored unverified edits"
         *     Stopped — unverified edits from this run were rolled back
         *
         * That is not a rollback, it is throwing away the work. Rollback exists to
         * protect a repository that ALREADY existed from a half-applied broken
         * edit — it was never meant to destroy new files, and pressing Stop
         * certainly does not mean "undo everything you just did for me".
         *
         * So: files created during the run are always kept. Only modifications to
         * pre-existing files are reverted, and only when verification actually
         * failed. Stopping keeps everything. */
        const rollbackRun = async (reason: string, opts: { revertModified?: boolean } = {}): Promise<boolean> => {
          if (!runSnapshots.size || runRolledBack) return true;
          const created = [...runSnapshots.entries()].filter(([, original]) => original === null);
          const modified = [...runSnapshots.entries()].filter(([, original]) => original !== null);

          if (!opts.revertModified) {
            runRolledBack = true;
            if (created.length || modified.length) {
              appendEvent(sess.id, agentMsg.id, {
                kind: "step",
                text: `${reason} — your files were left exactly as they are (${created.length} new, ${modified.length} edited). Nothing was deleted.`,
              });
            }
            return true;
          }

          const failures: string[] = [];
          for (const [rel, original] of modified.reverse()) {
            const abs = resolveInScope(sess.scope, sess.scopeKind, rel);
            const result = await window.veylaro?.restoreFile?.(abs, original, { ...scopedCtx, confirmed: true, rollback: true });
            if (!result?.ok) failures.push(`${rel}: ${result?.error || "restore bridge unavailable"}`);
          }
          if (failures.length) {
            appendEvent(sess.id, agentMsg.id, { kind: "step", text: `⛔ could not restore ${failures.slice(0, 2).join("; ")}` });
            return false;
          }
          runRolledBack = true;
          appendEvent(sess.id, agentMsg.id, {
            kind: "restore",
            label: `${reason} — reverted ${modified.length} edited file(s); the ${created.length} new file(s) were kept`,
          });
          return true;
        };

        const scopeBase = sess.scopeKind === "folder" ? sess.scope : sess.scope.replace(/[\\/][^\\/]*$/, "");
        const openInViewport = (url: string, label: string) => {
          setSt((p) => ({ ...p, settings: { ...p.settings, viewportUrl: url, deckOpen: true } }));
          appendEvent(sess.id, agentMsg.id, {
            kind: "browse",
            url,
            summary: `loaded ${label} in the Viewport; visual and functional checks remain separate evidence`,
            steps: [
              { x: 50, y: 20, action: "look", note: "👀 opening it to see it for myself" },
              { x: 38, y: 42, action: "move", note: "scanning the layout" },
              { x: 62, y: 55, action: "move", note: "checking the key pieces" },
              { x: 50, y: 60, action: "scroll", note: "reading it top to bottom" },
              { x: 50, y: 30, action: "look", note: "page loaded — checking the rendered result" },
            ],
          });
        };

        // Laro opens its own work in the Viewport and looks at it. A project with a
        // dev script gets the dev server started and localhost opened; a plain HTML
        // file loads over file://. This is the "go run localhost and see it" behaviour.
        const openLiveApp = async (announce = true): Promise<boolean> => {
          if (!canWrite) return false;
          // 1) dev-server project?
          let pkg: any = null;
          try { const r = await window.veylaro!.readFile?.(`${scopeBase}/package.json`, scopedCtx); if (r?.ok && r.content) pkg = JSON.parse(r.content); } catch { /* none */ }
          const scripts = pkg?.scripts || {};
          const dev = scripts.dev ? "dev" : scripts.start ? "start" : scripts.serve ? "serve" : null;
          if (dev && window.veylaro!.serve) {
            if (announce) appendEvent(sess.id, agentMsg.id, { kind: "step", text: "🚀 starting the dev server and opening it in the Viewport…" });
            const res = await window.veylaro!.serve(`npm run ${dev}`, scopeBase, { ...scopedCtx, confirmed: editsApproved });
            if (res.ok && res.url) { openInViewport(res.url, `the dev server (${res.url})`); return true; }
            appendEvent(sess.id, agentMsg.id, { kind: "step", text: `⚠️ couldn't start the dev server: ${(res.error || "unknown").slice(0, 140)}` });
          }
          // 2) static HTML — find one written this run, or scan the folder
          let html = writtenPaths.find((p) => /(^|\/)index\.html$/i.test(p)) || writtenPaths.find((p) => /\.html$/i.test(p));
          if (!html) {
            try {
              const d = await window.veylaro!.listDir?.(scopeBase, scopedCtx);
              const hit = d?.entries?.find((e) => /^index\.html$/i.test(e.name)) || d?.entries?.find((e) => /\.html$/i.test(e.name));
              if (hit) html = hit.name;
            } catch { /* none */ }
          }
          if (html) {
            const abs = resolveInScope(sess.scope, sess.scopeKind, html);
            openInViewport(`file://${encodeURI(abs)}`, html);
            return true;
          }
          return false;
        };

        // Command policy: Laro runs commands autonomously — it never stops to ask.
        // The Guard is the only gate. Catastrophic commands (rm -rf /, mkfs, dd to a
        // disk, fork bombs, sudo rm…) are hard-blocked and NEVER run, in any mode.
        // Merely destructive ones (rm -r, git reset --hard, drop table…) are skipped
        // unless the user has explicitly switched on full-auto (bypass).
        const runOne = async (
          cmd: string,
          policyOverride?: "repair" | "build",
        ): Promise<{ ok: boolean; out: string; blocked?: boolean }> => {
          if (!window.veylaro?.exec) return { ok: false, out: "no shell in this environment" };
          const policy = policyOverride ?? (looksLikeBuild(text) && !lockExistingTests ? "build" : "repair");
          const decision = classifyModelCommand(cmd, { mode: policy });
          if (!decision.allowed) {
            appendEvent(sess.id, agentMsg.id, { kind: "cmd", cmd, out: `⛔ blocked by the model-command policy — ${decision.reason}`, ok: false });
            return { ok: false, out: `blocked (${decision.classification})`, blocked: true };
          }
          // confirmed:true lets destructive-but-not-catastrophic commands through only
          // in bypass; otherwise the guard returns needsConfirm and we skip cleanly.
          let r = await window.veylaro.exec(cmd, scopeBase, {
            ...scopedCtx,
            confirmed: settings.permMode === "bypass",
            modelInitiated: true,
            policy,
          });
          if (r.blocked) {
            appendEvent(sess.id, agentMsg.id, { kind: "cmd", cmd, out: "⛔ blocked — this command can damage the machine and is never run.", ok: false });
            return { ok: false, out: "blocked (dangerous command)", blocked: true };
          }
          if (r.needsConfirm) {
            const approved = await requestLiveApproval(
              `Run a destructive command: ${cmd}`,
              "Veylaro's hard blocklist still applies even when you approve."
            );
            if (!approved) {
              appendEvent(sess.id, agentMsg.id, { kind: "cmd", cmd, out: "Skipped — permission declined.", ok: false });
              return { ok: false, out: "skipped (permission declined)", blocked: true };
            }
            setRunning(true);
            r = await window.veylaro.exec(cmd, scopeBase, { ...scopedCtx, confirmed: true, modelInitiated: true, policy });
          }
          appendEvent(sess.id, agentMsg.id, { kind: "cmd", cmd, out: (r.out || "").slice(0, 1200), ok: !!r.ok });
          return { ok: !!r.ok, out: r.out || "", blocked: false };
        };

        (async () => {
          const fastPath = isFastInteraction(text) && attachments.length === 0;
          try {
            // "run the localhost / show me / open it" → open the Viewport on the live
            // app instead of building. Laro looks at its OWN work; it never tells you
            // to open a browser yourself.
            if (canWrite && wantsToRunApp(text)) {
              appendEvent(sess.id, agentMsg.id, { kind: "step", text: "🚀 opening it in the Viewport for you…" });
              const opened = await openLiveApp(false);
              appendEvent(sess.id, agentMsg.id, {
                kind: "say",
                plain: opened
                  ? "Opened it in the Viewport — you can see it running on the right. I'll keep it live while you look."
                  : "I couldn't find a page or dev server to open here yet. Tell me to build one first, or point the session at a project that has one.",
                dev: opened ? `${modelName} · Viewport live` : `${modelName} · nothing to serve`,
              });
              finishRun();
              return;
            }

            // These are deterministic product facts, not inference jobs. They
            // must stay instant even when the model is cold, and a runtime
            // identity answer must come from the detected endpoint rather than
            // a configured alias.
            // EVERYTHING THE USER SAYS GOES THROUGH THE MODEL.
            // The scripted greeting ("Hey. What are we working on?", tagged
            // "no generation needed") made Laro feel like a phone tree. It is gone:
            // say hello and the model answers you.
            // Two things stay deterministic on purpose, and neither is conversation:
            // which model is loaded (a local checkpoint cannot know its own product
            // name, so asking it invites a confident lie) and arithmetic (verified,
            // never guessed). Both are facts about the runtime, not chat.
            if (fastPath) {
              const detectedTier = tierFromModelName(liveModel || "");
              const instant = runtimeFactReply(
                text,
                liveModel,
                detectedTier ? MODELS[detectedTier].name : modelName,
              ) || verifiedArithmeticReply(text);
              if (instant) {
                appendEvent(sess.id, agentMsg.id, { kind: "say", plain: instant, dev: "deterministic verified path · no generation needed" });
                finishRun();
                return;
              }
            }

            // Lazy engine start. The app shell stays light; only the first real
            // model turn launches MLX and loads weights. Every later turn reuses
            // that resident process until the idle/memory guard releases it.
            const wasWarm = isModelWarm();
            if (!wasWarm) setStreamText("Loading Laro into memory — this happens once, then replies stay warm…");
            const ready = await ensureLocalEngine(settings.engineUrl, settings.engineModel, runSku);
            if (!ready.ok) throw new Error(ready.error || "the local engine did not start");
            // The engine may have moved: if another program held the configured
            // port, main starts Laro's own engine on a free one and reports where.
            // Every later call in this run must follow it, or we'd keep talking to
            // the foreign process we just stepped around.
            const engineUrl = ready.url || settings.engineUrl;
            if (engineUrl !== settings.engineUrl) {
              setSt((prev) => ({ ...prev, settings: { ...prev.settings, engineUrl } }));
            }
            // An MLX endpoint only becomes reachable after the checkpoint is loaded.
            // Mark it warm now, not after token one, so this same request never shows
            // a second fake loading phase and later turns reuse the resident model.
            markModelWarm();
            activeEngineModel = ready.model || (await detectLiveModel(engineUrl)) || settings.engineModel;
            if (ready.tier) runSku = ready.tier;
            modelName = MODELS[runSku].name;
            memPlan = planForMemory(runSku, ramGB);
            setLiveModel(activeEngineModel);
            setSt((previous) => ({
              ...previous,
              settings: {
                ...previous.settings,
                engine: "veylaro",
                engineModel: activeEngineModel,
                ...(ready.tier ? { model: ready.tier } : {}),
              },
            }));

            // optional live web grounding (query only ever leaves the machine)
            const wantsWeb =
              settings.internet &&
              navigator.onLine &&
              /\b(search|look ?up|latest|current|newest|today|docs?|documentation|version|price|news|20\d\d)\b/i.test(text);
            let searchCtx = "";
            if (wantsWeb) {
              const q = privacySafeSearchQuery(text);
              if (q) {
                setSearching(q);
                const bg = pushBg("Searching the web", q);
                const results = await webSearch(q);
                setSearching(null);
                doneBg(bg, !!results, results ? `${results.length} public sources read` : "no live results — continuing offline");
                if (results && results.length) {
                  appendEvent(sess.id, agentMsg.id, { kind: "web", query: q, results });
                  searchCtx = resultsToContext(q, results);
                }
              } else {
                appendEvent(sess.id, agentMsg.id, { kind: "step", text: "🔒 live search withheld — the request looked like code, credentials, a local path, or personal data" });
              }
            }

            // ---- casual chat: one short reply, no build machinery ----
            if (fastPath) {
              const verifiedEvents = sess.msgs
                .flatMap((message) => message.events || [])
                .filter((event): event is Extract<AgentEvent, { kind: "verify" }> => event.kind === "verify");
              const latestVerified = verifiedEvents[verifiedEvents.length - 1];
              const verifiedActivity: VerifiedActivity | undefined = latestVerified
                ? { target: latestVerified.target, ok: latestVerified.ok, detail: latestVerified.detail }
                : undefined;
              const sys: ChatMsg[] = [{
                role: "system",
                content: `You are Laro inside Veylaro Code. Reply to casual conversation naturally in one or two short sentences. Be warm, sharp, lightly playful when it fits, and specific to what the person said. No plan, preamble, generic sales pitch, or technical footer. Never invent facts, freshness, actions, or provenance. Runtime evidence: ${verifiedActivity ? `${verifiedActivity.target} ${verifiedActivity.ok ? "passed" : "failed"}; ${verifiedActivity.detail || "no further detail"}` : "no verified task or command result is recorded"}.`,
              }];
              if (searchCtx) sys.push({ role: "system", content: `${GROUNDING_NOTE}\n\n${searchCtx}` });
              setStreamText("");
              let acc = "";
              let first = false;
              for await (const part of veylaroChat(engineUrl, activeEngineModel, [...sys, { role: "user", content: text }], runSku, false, signal, { num_predict: 120, num_ctx: 2048, temperature: 0.35 })) {
                if (part.type === "text") { if (!first) { first = true; markModelWarm(); acc = ""; } acc += part.chunk; setStreamText(acc); }
              }
              const clean = calibrateCasualReply(text, cleanAssistantText(acc, 500), verifiedActivity);
              appendEvent(sess.id, agentMsg.id, {
                kind: "say",
                plain: clean || "I couldn't produce a reliable reply on that pass. The output was empty or repetitive, so I discarded it instead of showing garbage.",
                dev: `${modelName} · on your machine`,
              });
              finishRun();
              return;
            }

            // ---- build / agent path: keeps going until the job is done ----
            const readVerificationInput = async (): Promise<{ packageJson?: string; rootEntries?: string[] }> => {
              let packageJson: string | undefined;
              try {
                const r = await window.veylaro!.readFile?.(`${scopeBase}/package.json`, scopedCtx);
                if (r?.ok && r.content) packageJson = r.content;
              } catch { /* no package.json */ }
              let rootEntries: string[] | undefined;
              try {
                const listed = await window.veylaro!.listDir?.(scopeBase, scopedCtx);
                rootEntries = (listed?.entries || []).map((item) => item.name);
              } catch { /* no supported repository shape */ }
              return { packageJson, rootEntries };
            };
            const detectVerificationCmds = async (): Promise<string[]> => verificationCommands(await readVerificationInput());
            const detectTestCmd = async (): Promise<string | null> => reproductionCommand(await readVerificationInput());

            // LEAN prompt on purpose: a small local model builds fast from short,
            // direct instructions and gets chatty/slow under a heavy prompt stack.
            // So the build path is just: identity+directive + the file protocol.
            const isOwner = (st.account?.email || "").trim().toLowerCase() === OWNER_EMAIL;
            const sys: ChatMsg[] = [
              { role: "system", content: laroContext(ramGB) + "\n\n" + SOVEREIGN_FORGE_PROMPT + "\n\n" + EXECUTION_LATTICE_PROMPT + (isOwner ? "\n\nDEVELOPER BUILD: you're talking to the owner. Full engineering depth and no beginner framing." : "") },
            ];
            if (canWrite) {
              sys.push({ role: "system", content: `${FILE_PROTOCOL_PROMPT}\n\nProject folder for this session: ${sess.scope}\nEvery path you write is relative to that folder.` });
            }
            if (searchCtx) sys.push({ role: "system", content: `${GROUNDING_NOTE}\n\n${searchCtx}` });
            if (settings.overnight) {
              const precedents = precedentsAsPrompt(text);
              if (precedents) sys.push({ role: "system", content: precedents });
            }
            // give Laro the project's own history so it keeps the thread across sessions
            const history = timelineForPrompt(sess.scope);
            if (history) sys.push({ role: "system", content: history });

            const verificationInput = await readVerificationInput();
            sys.push({
              role: "system",
              content: compileExecutionContract({
                request: text,
                scope: sess.scope,
                existingProject: !!verificationInput.rootEntries?.length,
                testEditsLocked: lockExistingTests,
                verification: verificationCommands(verificationInput),
              }),
            });
            // Visual work gets a concrete spec. "Make it look good" is a wish;
            // exact spacing steps, a type scale and the gradient recipe are an
            // instruction. Measured: without this Med produces <h1>NOVA</h1> on a
            // default body — structurally right, visually nothing.
            const designBrief = designBriefFor(text);
            if (designBrief) sys.push({ role: "system", content: designBrief });
            const convo: ChatMsg[] = [...sys, { role: "user", content: `[project folder: ${sess.scope}]\n${text}` }];
            try {
              const root = await window.veylaro!.listDir?.(scopeBase, scopedCtx);
              if (root?.ok && root.entries?.length) {
                const map = root.entries.slice(0, 80).map((entry) => `${entry.dir ? "dir" : "file"}: ${entry.name}`).join("\n");
                convo.push({ role: "user", content: `Observed project root (real filesystem listing):\n${map}\n\nInspect relevant existing files with @@READ before changing them.` });
              }
            } catch { /* root map is best effort */ }
            // Memory Guard note — only when it actually had to intervene on a tight machine.
            if (memPlan.fits === "downshift" || memPlan.fits === "tight") {
              appendEvent(sess.id, agentMsg.id, { kind: "step", text: `💾 ${memPlan.note}` });
            }
            // NO AMBITION CEILING. The old fixed 12-22 step cap ended real builds
            // mid-file with a cheerful recap. The budget now scales with what was
            // actually asked for, and the loop stops on evidence (done / stalled /
            // aborted) rather than on a turn counter. See engine/stepBudget.ts.
            const stepPlan = stepPolicy(text, runSku);
            const maxSteps = stepPlan.hard;
            let consecutiveIdle = 0;
            let filesWritten = 0;
            let lastNarration = "";
            let done = false;
            let step = 0;
            let sawFirstToken = false;
            let lastStep = "";
            let nudgedToBuild = false;
            let commandFailures = 0;
            let verification: "passed" | "failed" | "not-run" = "not-run";
            let verificationPlan: string[] = [];
            const stepLine = (t: string) => {
              const line = t.slice(0, 180).trim();
              if (line && line !== lastStep) {
                appendEvent(sess.id, agentMsg.id, { kind: "step", text: line });
                lastStep = line;
              }
            };

            // REALITY CLUSTER — the contract above and this final plan are both
            // compiled from repository evidence rather than model claims.
            const normalizeRel = (value: string): string => {
              const out: string[] = [];
              for (const part of value.replace(/\\/g, "/").split("/")) {
                if (!part || part === ".") continue;
                if (part === "..") out.pop();
                else out.push(part);
              }
              return out.join("/");
            };
            const readEvidenceFile = async (rel: string): Promise<{ rel: string; content: string } | null> => {
              const safe = normalizeRel(rel);
              if (!safe || safe.startsWith("../")) return null;
              const variants = /\.[a-z0-9]+$/i.test(safe)
                ? [safe]
                : [safe, `${safe}.ts`, `${safe}.tsx`, `${safe}.js`, `${safe}.jsx`, `${safe}/index.ts`, `${safe}/index.js`];
              for (const candidate of variants) {
                const result = await window.veylaro!.readFile?.(resolveInScope(sess.scope, sess.scopeKind, candidate), scopedCtx);
                if (result?.ok) return { rel: candidate, content: (result.content || "").slice(0, 7000) };
              }
              return null;
            };
            const collectFailureEvidence = async (output: string): Promise<string> => {
              const decoded = (() => { try { return decodeURIComponent(output.replace(/file:\/\//g, "")); } catch { return output; } })();
              const scope = scopeBase.replace(/\\/g, "/").replace(/\/$/, "");
              const paths = new Set<string>();
              for (const line of decoded.split("\n")) {
                const normalized = line.replace(/\\/g, "/");
                const at = normalized.indexOf(scope + "/");
                if (at >= 0) {
                  const tail = normalized.slice(at + scope.length + 1);
                  const hit = tail.match(/^([^:\s)]+\.(?:[cm]?[jt]sx?|py|rb|rs|go))/i);
                  if (hit) paths.add(normalizeRel(hit[1]));
                }
                for (const match of normalized.matchAll(/(?:^|[\s(])((?:src|test|tests|__tests__)[/][^:\s)]+\.(?:[cm]?[jt]sx?|py|rb|rs|go))/gi)) paths.add(normalizeRel(match[1]));
              }

              const evidence: Array<{ rel: string; content: string }> = [];
              for (const rel of [...paths].slice(0, 4)) {
                const file = await readEvidenceFile(rel);
                if (file && !evidence.some((item) => item.rel === file.rel)) evidence.push(file);
              }
              // Resolve local imports from the observed failure files. This turns a
              // stack trace into the smallest real source window before the model
              // gets a chance to invent a repository shape.
              for (const file of [...evidence]) {
                const dir = file.rel.includes("/") ? file.rel.slice(0, file.rel.lastIndexOf("/")) : "";
                const imports = [...file.content.matchAll(/(?:from\s*|require\s*\()\s*["'](\.[^"']+)["']/g)].map((match) => match[1]);
                for (const spec of imports.slice(0, 4)) {
                  const imported = await readEvidenceFile(normalizeRel(`${dir}/${spec}`));
                  if (imported && !evidence.some((item) => item.rel === imported.rel)) evidence.push(imported);
                  if (evidence.length >= 7) break;
                }
                if (evidence.length >= 7) break;
              }
              return evidence.map((file) => `OBSERVED FILE ${file.rel}:\n${file.content}`).join("\n\n");
            };
            const verifyAndRepair = async (baseSys: ChatMsg[], testCmd?: string): Promise<"passed" | "failed" | "not-run"> => {
              if (!testCmd || signal.aborted) return "not-run";
              stepLine(`🧪 running verification: ${testCmd}`);
              let r = await runOne(testCmd, "build");
              if (r.ok) { appendEvent(sess.id, agentMsg.id, { kind: "verify", target: testCmd, ok: true, detail: "command passed — verified by execution, not assumed" }); return "passed"; }
              const budget = evidenceBudget(runSku);
              const seeds = [1, 7, 19, 42, 97].slice(0, budget.candidates);
              let failureOutput = r.out;

              // Bounded semantic lane: before spending more model tokens, derive a
              // few auditable arithmetic alternatives from the observed source.
              // Every proposal still lives or dies by the unchanged project tests.
              const semanticEvidence = await collectFailureEvidence(failureOutput);
              const semanticPaths = [...new Set([...semanticEvidence.matchAll(/^OBSERVED FILE\s+([^:]+):/gm)]
                .map((match) => normalizeRel(match[1]))
                .filter((rel) => rel && !isTestFile(rel)))];
              let semanticIndex = 0;
              for (const rel of semanticPaths) {
                const observed = await window.veylaro!.readFile?.(resolveInScope(sess.scope, sess.scopeKind, rel), scopedCtx);
                if (!observed?.ok || !observed.content) continue;
                const candidates = synthesizeSemanticRepairs(rel, observed.content, failureOutput);
                for (const candidate of candidates) {
                  semanticIndex++;
                  stepLine(`🧮 executing semantic repair candidate ${semanticIndex}…`);
                  if (!(await writeOne(candidate.path, candidate.content, { silent: true }))) continue;
                  const result = await runOne(testCmd, "build");
                  if (result.ok) {
                    const { plus, minus, op } = diffCounts(observed.content, candidate.content);
                    writtenPaths.push(candidate.path);
                    filesWritten++;
                    appendEvent(sess.id, agentMsg.id, { kind: "file", path: candidate.path, op, plus, minus, snippet: { del: [], add: candidate.content.split("\n").slice(0, 3) } });
                    appendEvent(sess.id, agentMsg.id, {
                      kind: "verify",
                      target: testCmd,
                      ok: true,
                      detail: `semantic candidate ${semanticIndex} survived unchanged tests — verified by execution`,
                    });
                    return "passed";
                  }
                  failureOutput = result.out;
                  const undo = await window.veylaro?.restoreFile?.(resolveInScope(sess.scope, sess.scopeKind, rel), observed.content, { ...scopedCtx, confirmed: true, rollback: true });
                  if (!undo?.ok) {
                    stepLine("⛔ semantic candidate failed and rollback could not be proven");
                    appendEvent(sess.id, agentMsg.id, { kind: "verify", target: testCmd, ok: false, detail: "repair rollback failed; the run cannot be credited" });
                    return "failed";
                  }
                  const baseline = await runOne(testCmd, "build");
                  if (baseline.ok) {
                    appendEvent(sess.id, agentMsg.id, { kind: "verify", target: testCmd, ok: true, detail: "the restored baseline passed after rejecting a flaky candidate" });
                    return "passed";
                  }
                  failureOutput = baseline.out;
                  stepLine(`semantic candidate ${semanticIndex} failed real tests and was rolled back`);
                }
              }

              for (let index = 0; index < seeds.length && !signal.aborted; index++) {
                const seed = seeds[index];
                const evidence = await collectFailureEvidence(failureOutput);
                const observedPaths = [...evidence.matchAll(/^OBSERVED FILE\s+([^:]+):/gm)]
                  .map((match) => normalizeRel(match[1]))
                  .filter((rel) => rel && !isTestFile(rel));
                const expectedPaths = [...new Set(observedPaths.length
                  ? observedPaths
                  : writtenPaths.filter((rel) => !isTestFile(rel)).slice(-4))];
                if (!expectedPaths.length) {
                  stepLine("⛔ repair tournament stopped — the failure did not identify an observed source file");
                  break;
                }

                stepLine(`🧪 testing repair candidate ${index + 1}/${seeds.length} against unchanged tests…`);
                const repairBrief = failureRepairBrief(failureOutput, expectedPaths);
                const conv: ChatMsg[] = [...baseSys, {
                  role: "user",
                  content: `Original task: ${text}\nProject folder: ${sess.scope}\n\n${repairBrief}\n\n${evidence ? `${evidence}\n\n` : ""}Return only complete replacements for the smallest necessary allowed source files using @@FILE … @@END. Never edit tests, invent a path, weaken an assertion, or claim success. The runtime will execute unchanged checks and automatically discard losing candidates.`,
                }];

                const collectTurn = async (messages: ChatMsg[]): Promise<string> => {
                  let output = "";
                  for await (const part of veylaroChat(engineUrl, activeEngineModel, messages, runSku, false, signal, {
                    num_ctx: memPlan.numCtx,
                    num_predict: 900,
                    temperature: 0.2,
                    seed,
                  })) {
                    if (part.type === "text") output += part.chunk;
                  }
                  return output;
                };

                let output = await collectTurn(conv);
                let files = extractRepairFiles(output, expectedPaths);
                if (!files.length) {
                  const parser = new StreamParser();
                  const events = [...parser.push(output.endsWith("\n") ? output : `${output}\n`), ...parser.flush()];
                  const observations: string[] = [];
                  for (const event of events) {
                    if (event.t !== "read") continue;
                    const seen = await window.veylaro!.readFile?.(resolveInScope(sess.scope, sess.scopeKind, event.path), scopedCtx);
                    observations.push(seen?.ok
                      ? `FILE ${event.path}:\n${(seen.content || "").slice(0, 7000)}`
                      : `FILE ${event.path}: read failed (${seen?.error || "unknown"})`);
                  }
                  if (observations.length) {
                    const follow = await collectTurn([...conv, { role: "assistant", content: output }, {
                      role: "user",
                      content: `Real read results:\n${observations.join("\n\n")}\n\nNow return the smallest complete source repair. Only these paths may be edited: ${expectedPaths.join(", ")}.`,
                    }]);
                    output += `\n${follow}`;
                    files = extractRepairFiles(follow, expectedPaths);
                  }
                }

                files = files.filter((file) => !isTestFile(file.path));
                if (!files.length) {
                  stepLine(`candidate ${index + 1} rejected — no complete, in-scope source replacement`);
                  continue;
                }

                const candidateBaseline = new Map<string, string | null>();
                let candidateValid = true;
                for (const file of files) {
                  const seen = await window.veylaro!.readFile?.(resolveInScope(sess.scope, sess.scopeKind, file.path), scopedCtx);
                  if (!seen?.ok) { candidateValid = false; break; }
                  candidateBaseline.set(file.path, seen.content ?? null);
                }
                if (!candidateValid) {
                  stepLine(`candidate ${index + 1} rejected — it targeted a source file not observed on disk`);
                  continue;
                }

                let applied = 0;
                for (const file of files) if (await writeOne(file.path, file.content, { silent: true })) applied++;
                if (applied !== files.length) {
                  let partialRestored = true;
                  for (const [rel, original] of [...candidateBaseline.entries()].reverse()) {
                    const undo = await window.veylaro?.restoreFile?.(resolveInScope(sess.scope, sess.scopeKind, rel), original, { ...scopedCtx, confirmed: true, rollback: true });
                    if (!undo?.ok) partialRestored = false;
                  }
                  stepLine(partialRestored
                    ? `candidate ${index + 1} rejected — its complete multi-file edit did not apply`
                    : `⛔ candidate ${index + 1} partially applied and rollback could not be proven`);
                  if (!partialRestored) break;
                  continue;
                }

                const result = await runOne(testCmd, "build");
                if (result.ok) {
                  for (const file of files) {
                    const original = candidateBaseline.get(file.path);
                    const { plus, minus, op } = diffCounts(original ?? null, file.content);
                    writtenPaths.push(file.path);
                    filesWritten++;
                    appendEvent(sess.id, agentMsg.id, { kind: "file", path: file.path, op, plus, minus, snippet: { del: [], add: file.content.split("\n").slice(0, 3) } });
                  }
                  appendEvent(sess.id, agentMsg.id, {
                    kind: "verify",
                    target: testCmd,
                    ok: true,
                    detail: `candidate ${index + 1}/${seeds.length} survived unchanged tests — verified by execution`,
                  });
                  return "passed";
                }

                let restored = true;
                for (const [rel, original] of [...candidateBaseline.entries()].reverse()) {
                  const undo = await window.veylaro?.restoreFile?.(resolveInScope(sess.scope, sess.scopeKind, rel), original, { ...scopedCtx, confirmed: true, rollback: true });
                  if (!undo?.ok) restored = false;
                }
                stepLine(restored
                  ? `candidate ${index + 1} failed real tests and was rolled back`
                  : `⛔ candidate ${index + 1} failed and its rollback could not be proven`);
                if (!restored) break;
                const baseline = await runOne(testCmd, "build");
                if (baseline.ok) {
                  appendEvent(sess.id, agentMsg.id, { kind: "verify", target: testCmd, ok: true, detail: "the restored baseline passed after rejecting a flaky candidate" });
                  return "passed";
                }
                failureOutput = baseline.out;
              }
              appendEvent(sess.id, agentMsg.id, { kind: "verify", target: testCmd, ok: false, detail: `verification still failing — I'm not claiming this works. Last error: ${compactFailureEvidence(failureOutput, 180)}` });
              return "failed";
            };

            // Reproduction-first debugging: a repair prompt gets the actual failing
            // output before the model proposes a patch. This is the highest-leverage
            // difference between blind code generation and real repository repair.
            if (looksLikeDebug(text) && !signal.aborted) {
              const reproductionCmd = await detectTestCmd();
              if (reproductionCmd) {
                stepLine("🔎 reproducing the failure before touching the fix…");
                const reproduced = await runOne(reproductionCmd);
                if (!reproduced.ok) {
                  const evidence = await collectFailureEvidence(reproduced.out);
                  convo.push({ role: "user", content: `Observed reproduction before editing:\n$ ${reproductionCmd}\n${compactFailureEvidence(reproduced.out, 1800)}\n\n${evidence ? `${evidence}\n\n` : ""}Use only this real repository evidence. Preserve passing behavior, make the smallest source repair, and do not edit tests. If a needed file is not shown, request it with @@READ instead of inventing it.` });
                } else {
                  convo.push({ role: "user", content: `The existing test command passed before editing ($ ${reproductionCmd}). Do not claim the reported bug is reproduced. Inspect repository evidence and add a focused regression check only if the user's contract makes the missing behavior clear.` });
                }
              }
            }

            while (!done && !signal.aborted) {
              const stop = stopReason(
                { step, consecutiveIdle, deliverableComplete: false, requestedDone: false, aborted: signal.aborted },
                stepPlan,
              );
              if (stop === "stalled") { stepLine(`stopping — ${stepPlan.stallLimit} steps in a row produced nothing new`); break; }
              if (stop === "runaway") { stepLine(`stopping at the ${stepPlan.hard}-step safety limit`); break; }
              if (stop === "aborted") break;
              step++;
              // Snapshot so a step that SHRINKS the project is caught by evidence
              // rather than hope. Measured: a run oscillated 242 -> 173 -> 95 lines
              // across three steps, silently destroying finished work.
              const beforeStep = new Map(deliverable);
              const parser = new StreamParser();
              let raw = "";
              let wroteThisStep = 0;
              let ranThisStep = 0;
              let failedCmd: { cmd: string; out: string } | null = null;
              let requestedDone = false;
              const observations: string[] = [];
              // Smart-load: only the genuine cold load (model not warm in RAM) shows
              // "Loading…". Once warm, subsequent messages skip straight to "Working…".
              setStreamText(sawFirstToken || isModelWarm() ? "Working…" : "⏳ Loading Laro into memory — first reply takes a moment, then it's fast…");

              for await (const part of veylaroChat(engineUrl, activeEngineModel, convo, runSku, false, signal, { num_ctx: memPlan.numCtx })) {
                if (part.type !== "text") continue;
                if (!sawFirstToken) { sawFirstToken = true; markModelWarm(); setStreamText("Working…"); }
                raw += part.chunk;
                for (const ev of parser.push(part.chunk)) {
                  if (ev.t === "file") { if (await writeOne(ev.path, ev.content)) { wroteThisStep++; filesWritten++; } }
                  else if (ev.t === "append") { if (await appendOne(ev.path, ev.content)) { wroteThisStep++; filesWritten++; } }
                  else if (ev.t === "read") {
                    const abs = resolveInScope(sess.scope, sess.scopeKind, ev.path);
                    const seen = await window.veylaro!.readFile?.(abs, scopedCtx);
                    const result = seen?.ok
                      ? `FILE ${ev.path}:\n${(seen.content || "").slice(0, 7000)}`
                      : `FILE ${ev.path}: read failed (${seen?.error || "unknown error"})`;
                    observations.push(result);
                    stepLine(seen?.ok ? `🔎 read ${ev.path}` : `⚠️ couldn't read ${ev.path}`);
                  }
                  else if (ev.t === "run") {
                    const r = await runOne(ev.cmd);
                    ranThisStep++;
                    observations.push(`COMMAND $ ${ev.cmd}\n${r.out.slice(0, 3500)}\nexit: ${r.ok ? "success" : "failure"}`);
                    if (!r.ok && !r.blocked) { failedCmd = { cmd: ev.cmd, out: r.out.slice(0, 400) }; commandFailures++; }
                  }
                  else if (ev.t === "done") { requestedDone = true; }
                  // Code that leaked out of a file block is protocol drift, not
                  // commentary. The file rows already report what was written; raw
                  // source must never appear in the conversation.
                  else if (ev.t === "narrate") { if (isPresentableNarration(ev.text)) stepLine(ev.text); }
                }
                const w = parser.writing;
                if (w) setStreamText(`✍️ Writing ${w}…`);
              }
              // close out any trailing block, then salvage stray fenced code
              for (const ev of parser.flush()) {
                if (ev.t === "file") { if (await writeOne(ev.path, ev.content)) { wroteThisStep++; filesWritten++; } }
              }
              const salv = canWrite ? salvageFences(parser.liveNarration) : { files: [], rest: parser.liveNarration };
              for (const f of salv.files) { if (await writeOne(f.path, f.content)) { wroteThisStep++; filesWritten++; } }
              const narration = (salv.files.length ? salv.rest : parser.liveNarration).trim();
              const cleanNarration = cleanAssistantText(narration);
              if (cleanNarration) lastNarration = cleanNarration;
              observations.push(...writeFeedback.splice(0));

              // REFERENCE RESOLUTION GATE — runs on EVERY step, before any of the
              // branches below can `continue` past it. A page whose stylesheet and
              // script don't load is dead however good the code inside them is:
              // measured, a build produced three correct files and a blank page
              // because index.html, living inside receptionist/, referenced
              // "receptionist/style.css". Unambiguous fixes are applied here rather
              // than spending a model turn at ~11 tok/s on the model's own typo.
              if (deliverable.size && canWrite) {
                const fix = repairReferences([...deliverable].map(([p, c]) => ({ path: p, content: c })));
                for (const file of fix.files) {
                  if (deliverable.get(file.path) !== file.content) {
                    await writeOne(file.path, file.content, { silent: true });
                  }
                }
                for (const note of fix.repaired) stepLine(`🔗 fixed a broken reference — ${note}`);
                if (fix.unresolved.length) {
                  observations.push(
                    "These references do not resolve, so the page will not work:\n" +
                    referenceGaps(fix.unresolved).map((g) => `- ${g}`).join("\n"),
                  );
                }
              }

              convo.push({ role: "assistant", content: raw });
              if (wroteThisStep > 0 || ranThisStep > 0) consecutiveIdle = 0;
              if (signal.aborted) break;

              const collapsed = collapseReason(raw);
              if (collapsed && step < maxSteps) {
                stepLine("output collapsed into repetition — discarding it and retrying cleanly");
                convo.push({ role: "user", content: `Your previous output was rejected for ${collapsed}. Do not repeat markup or protocol tokens. Continue with one valid @@FILE block or one necessary @@RUN command.` });
                continue;
              }

              // Recovery cluster: a command failed — feed the real error back and let
              // Laro fix it, rather than stopping. This is what "don't give up" means.
              if (failedCmd && step < maxSteps) {
                stepLine(`⚠️ that command failed — trying another way`);
                convo.push({ role: "user", content: `That command failed:\n$ ${failedCmd.cmd}\n${failedCmd.out}\n\nRecover: either fix it, use a different approach, or write the files directly without that command. Keep going until the task is done, then output @@DONE.` });
                continue;
              }
              // Successful reads and commands are evidence, not transcript-only
              // decoration. Return them to the next model turn so repository work is
              // an observe → edit → execute loop rather than blind generation.
              if (observations.length && step < maxSteps) {
                convo.push({
                  role: "user",
                  content: `Real tool results from this machine:\n\n${observations.join("\n\n")}\n\nContinue from this evidence. Do not repeat a read or command unless the state changed. ${requestedDone ? "You requested completion before seeing these results; verify them first, then output @@DONE only if the contract is satisfied." : ""}`,
                });
                continue;
              }
              // COMPLETION GATE — "@@DONE" is a claim, not evidence. Small models
              // habitually write one skeleton file and declare victory (measured:
              // a 227-byte <h1>AI Receptionist</h1> in 5s). Judge what's actually on
              // disk against what was asked; when it falls short, refuse the claim
              // and hand back the specific gaps so the next turn closes them. The
              // gap list drives the loop instead of a vague "keep going".
              const verdict = deliverable.size
                ? assessDeliverable(text, [...deliverable].map(([p, c]) => ({ path: p, content: c })), {
                    existingProject: !!verificationInput.rootEntries?.length,
                  })
                : null;

              // AN IDLE STEP IS A PROTOCOL FAILURE, NOT A CONVERSATION.
              // This must be judged BEFORE the completion gate's prose brief.
              // Measured on Med: step 1 wrote index.html, the gate correctly
              // rejected it, and the prose brief that followed was answered with
              // more prose — twice — until the run stalled at 51 lines. The gate
              // explains WHAT is missing; it does not compel the model back into
              // the file protocol. When a step produced nothing, the narrowing
              // enforcement brief wins.
              if (isProtocolFailure(wroteThisStep, ranThisStep)) {
                consecutiveIdle++;
                if (!looksLikeBuild(text)) break;
                if (consecutiveIdle > stepPlan.stallLimit) break;
                nudgedToBuild = true;
                const brief = enforcementBrief({
                  request: text,
                  missing: verdict?.missing ?? [],
                  existingPaths: [...deliverable.keys()],
                  attempt: consecutiveIdle,
                });
                stepLine(consecutiveIdle === 1
                  ? "nothing was saved that step — forcing the file protocol"
                  : `still nothing saved (${consecutiveIdle}) — narrowing to a single file`);
                convo.push({ role: "user", content: brief });
                continue;
              }

              // Going backwards is its own failure mode and needs its own answer:
              // "keep building" is what produced the shrink in the first place.
              const regression = detectRegression(beforeStep, deliverable);
              if (regression.regressed) {
                stepLine(`that step made the project smaller (${regression.linesBefore} → ${regression.linesAfter} lines) — asking for it back`);
                convo.push({ role: "user", content: regressionBrief(regression) });
                continue;
              }

              // DESIGN GRADE — the same spec, checked against what was written.
              // Every check is a concrete decision, not a taste judgement.
              if (wantsVisualDesign(text) && deliverable.size && step < maxSteps) {
                const styling = [...deliverable]
                  .filter(([p]) => /\.(?:css|s[ac]ss|html?|[cm]?[jt]sx)$/i.test(p))
                  .map(([, c]) => c).join("\n");
                if (styling.trim()) {
                  const design = gradeDesign(styling);
                  if (design.score < 60) {
                    stepLine(`Styling scores ${design.score}/100 against the visual bar — missing ${design.missing.slice(0, 3).join(", ")}. Sending it back.`);
                    convo.push({ role: "user", content: designGaps(design).join("\n") });
                    continue;
                  }
                }
              }

              if (verdict && !verdict.complete) {
                if (requestedDone) stepLine(`not done yet — ${verdict.missing.length} gap${verdict.missing.length === 1 ? "" : "s"} left, keeping going`);
                // When the shortfall is BREADTH, name a file that does not exist
                // yet. A model told "keep building" edits what is in front of it;
                // a model told "write bookings.js" writes bookings.js.
                const wantsMoreFiles = /across \d+\+ files|several real screens|product surface/i.test(verdict.missing.join(" "));
                const breadth = wantsMoreFiles
                  ? breadthBrief(text, [...deliverable.keys()], ambitionFloor(text).files)
                  : null;
                convo.push({ role: "user", content: breadth ?? continuationBrief(verdict) });
                continue;
              }
              if (requestedDone) { done = true; break; }
              convo.push({
                role: "user",
                content: continuationPressure(
                  { step, consecutiveIdle, deliverableComplete: false, requestedDone, aborted: false },
                  stepPlan,
                ),
              });
            }

            if (signal.aborted) throw new DOMException("run stopped", "AbortError");

            // Reality Cluster: execute every repository-declared check in a fixed,
            // bounded order. After any repairs, rerun the complete plan once more so
            // a lint/build fix cannot silently regress an earlier passing test.
            if (filesWritten > 0 && !signal.aborted) {
              verificationPlan = await detectVerificationCmds();
              if (verificationPlan.length) {
                verification = "passed";
                for (const command of verificationPlan) {
                  verification = await verifyAndRepair(sys, command);
                  if (verification !== "passed") break;
                }
                if (verification === "passed") {
                  stepLine("🧪 rerunning the complete verification plan for regression proof…");
                  for (const command of verificationPlan) {
                    const proof = await runOne(command, "build");
                    appendEvent(sess.id, agentMsg.id, {
                      kind: "verify",
                      target: command,
                      ok: proof.ok,
                      detail: proof.ok ? "final regression proof passed" : "final regression proof failed",
                    });
                    if (!proof.ok) { verification = "failed"; break; }
                  }
                }
              }
            }
            if (verification === "failed") {
              await rollbackRun("Verification failed", { revertModified: true });
            }

            // Open the result before the recap so the summary never claims a Viewport
            // check that has not actually happened yet.
            const viewportOpened = !signal.aborted && filesWritten > 0 && !runRolledBack
              ? await openLiveApp(true)
              : false;

            // Clean recap derived from observed file/command/test evidence. Model prose
            // never decides whether the run says "done" or "verified".
            if (filesWritten > 0) {
              const names = [...new Set(writtenPaths)];
              const list = names.slice(0, 6).join(", ") + (names.length > 6 ? `, +${names.length - 6} more` : "");
              const title = runRolledBack
                ? "Stopped — your files were kept"
                : verification === "passed"
                ? "Completed and verified"
                : verification === "failed"
                  ? "Built, but verification is still failing"
                  : viewportOpened
                    ? "Built and opened for review"
                    : "Built; automated verification was unavailable";
              const bullets = [
                runRolledBack
                  ? `Rejected the attempted changes to ${list}; the original files were restored.`
                  : `Updated ${filesWritten} file${filesWritten === 1 ? "" : "s"} in ${scopeName}: ${list}.`,
                runRolledBack
                  ? "The unchanged project tests did not pass, so no candidate was promoted or left on disk."
                  : verification === "passed"
                  ? `All ${verificationPlan.length} repository verification command${verificationPlan.length === 1 ? "" : "s"} passed after the changes.`
                  : verification === "failed"
                    ? "At least one repository verification command still fails, so this run is not marked complete."
                    : "No usable repository verification command was found; the changes are not claimed as verified.",
              ];
              if (viewportOpened) bullets.push("The running result was loaded in the Viewport; its visual score is reported separately.");
              if (commandFailures > 0) bullets.push(`${commandFailures} command failure${commandFailures === 1 ? " was" : "s were"} encountered and kept in the transcript.`);
              appendEvent(sess.id, agentMsg.id, {
                kind: "recap",
                title,
                bullets,
                commit: `${verification === "passed" && !runRolledBack ? "feat" : "rejected"}: update ${scopeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project"}`,
              });
            } else {
              const answer = cleanAssistantText(lastNarration, 1200);
              appendEvent(sess.id, agentMsg.id, {
                kind: "say",
                plain: answer || (looksLikeBuild(text)
                  ? "I didn't complete this run: no valid file edit or command survived the output gate. I discarded the damaged output instead of pretending work was done."
                  : "I couldn't produce a reliable answer on this pass; the output was empty or repetitive and was rejected."),
                dev: `${modelName} · no verified change`,
              });
            }
            if (!canWrite && !fastPath) {
              appendEvent(sess.id, agentMsg.id, {
                kind: "say",
                plain: "Heads up: file-writing needs the desktop app — in this preview I can plan and explain, but I can't write to your disk.",
                dev: "no file bridge in this environment",
              });
            }
            // remember what got built here, so next session Laro has continuity
            if (filesWritten > 0 && !runRolledBack) {
              recordMilestone(sess.scope, { task: text, files: writtenPaths, kind: "build" });
            }
            if (
              verification === "passed" &&
              !runRolledBack &&
              settings.overnight &&
              window.veylaro?.isDesktop
            ) {
              recordVerifiedPrecedent({
                prompt: text,
                scopeLabel: scopeName,
                check: verificationPlan.join("; ") || "repository verification",
                evidence: "Recorded only after the complete repository verification plan passed twice and the run completed without rollback.",
                model: activeEngineModel,
              });
            }
          } catch (e: any) {
            // Stopping is not undoing. Keep everything on abort; on a genuine
            // error, revert edits to files that already existed but keep new work.
            const restored = await rollbackRun(
              signal.aborted ? "Stopped" : "Run hit an error",
              { revertModified: !signal.aborted },
            );
            if (signal.aborted) {
              appendEvent(sess.id, agentMsg.id, { kind: "say", plain: restored ? "Stopped. Everything written so far is still on disk — nothing was deleted." : "Stopped. Your files are unchanged from where the run got to.", dev: "run stopped" });
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
          if (runEpochRef.current !== runEpoch) return;
          setStreamText(null);
          setStreamThink(null);
          setSearching(null);
          appendEvent(sess.id, agentMsg.id, { kind: "done", ms: 0 });
          setRunning(false);
          if (abortRef.current === controller) abortRef.current = null;
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
      const liveController = abortRef.current;
      liveController?.abort();
      liveGateRef.current?.(false);
      liveGateRef.current = null;
      // the demo runner uses a timer chain, not a stream — clear that too
      if (timer.current) clearTimeout(timer.current);
      setPending(null);
      if (liveController) {
        // Keep the run locked until its asynchronous rollback and finally path
        // complete. This prevents a new run racing with an old rollback.
        setStreamText("Stopping and restoring unverified edits…");
      } else {
        setStreamText(null);
        setStreamThink(null);
        setRunning(false);
      }
      // Stop cancels the mission, not the resident model. Smart Load keeps the
      // checkpoint warm for the next turn and releases it after idle/pressure.
    },

    resolveGate(approve) {
      if (!pending || pending.type !== "gate" || !active) return;
      const { msgId, resume } = pending;
      setPending(null);
      if (liveGateRef.current) {
        const resolve = liveGateRef.current;
        liveGateRef.current = null;
        resolve(approve);
        return;
      }
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
      if (!head) return;
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
          const cwd = active.scopeKind === "folder" ? active.scope : active.scope.replace(/[\\/][^\\/]*$/, "");
          res = await window.veylaro.exec(c, cwd, {
            scope: active.scope,
            scopeKind: active.scopeKind,
            fullDisk: st.settings.fullDiskAccess,
          });
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
            model: st.settings.engine === "veylaro" ? st.settings.engineModel : "manual-terminal",
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

    newSideChat() {
      const thread: SideThread = { id: uid(), title: "New chat", msgs: [], createdAt: Date.now() };
      setSt((p) => {
        const { threads } = ensureSideThreads(p);
        return { ...p, sideThreads: [...threads, thread].slice(-12), activeSideThread: thread.id };
      });
    },

    selectSideChat(id) {
      setSt((p) => ({ ...p, activeSideThread: id }));
    },

    /* The Viewport "Chat" tab: a pure conversational Laro. It can talk and
       search the web — it never writes files or runs builds (that's the main
       chat). It streams live from whatever local model is actually up, so it
       uses real AI even when the main build engine is in preview mode. */
    sendSideChat(text) {
      const t = text.trim();
      if (!t) return;
      const youId = uid();
      const replyId = uid();

      // Add the user turn + an empty streaming reply into the active thread.
      let activeId = "";
      setSt((p) => {
        const { threads, activeId: aid } = ensureSideThreads(p);
        activeId = aid;
        const you: SideMsg = { id: youId, role: "you", text: t, ts: Date.now() };
        const reply: SideMsg = { id: replyId, role: "laro", text: "", ts: Date.now(), streaming: true };
        return {
          ...p,
          sideThreads: threads.map((th) =>
            th.id === aid
              ? {
                  ...th,
                  title: th.title === "New chat" || !th.msgs.length ? t.slice(0, 42) : th.title,
                  msgs: [...th.msgs, you, reply].slice(-120),
                }
              : th,
          ),
          activeSideThread: aid,
        };
      });

      const setReply = (patch: Partial<SideMsg>) =>
        setSt((p) => ({
          ...p,
          sideThreads: (p.sideThreads || []).map((th) =>
            th.id === activeId
              ? { ...th, msgs: th.msgs.map((m) => (m.id === replyId ? { ...m, ...patch } : m)) }
              : th,
          ),
        }));

      (async () => {
        // START the engine, don't just look for one.
        //
        // This used to probe /v1/models and, finding nothing, tell the user to
        // "Start Veylaro's engine" — inside Veylaro. The app owns that engine and
        // starts it on demand everywhere else; the side chat was the one place
        // that gave up and blamed the user. It also meant the panel claimed the
        // model was unreachable while the main agent was happily using it.
        let url = "";
        let model = "";
        let startError = "";
        try {
          const ready = await ensureLocalEngine(st.settings.engineUrl, st.settings.engineModel, st.settings.model);
          if (ready.ok) {
            url = ready.url || st.settings.engineUrl;
            model = ready.model || st.settings.engineModel;
          } else {
            startError = ready.error || "";
          }
        } catch (e: any) {
          startError = String(e?.message || e);
        }
        // Fall back to a plain probe for an endpoint we don't own (browser
        // preview has no bridge to start anything).
        if (!url) {
          for (const u of [...new Set([st.settings.engineUrl, "http://127.0.0.1:8080"])].filter(Boolean)) {
            try {
              const m = await detectLiveModel(u);
              if (m) { url = u; model = m; break; }
            } catch { /* try next */ }
          }
        }
        if (!url) {
          setReply({
            text: startError
              ? `I couldn't start Laro just now, so I won't fake an answer. ${startError}`
              : "I couldn't start Laro just now, so I won't fake an answer. Check Settings → Models that a tier is downloaded, and that this Mac has memory free.",
            streaming: false,
          });
          return;
        }

        // Internet: only for clearly current/factual asks, and only what the
        // privacy filter allows off the machine.
        let grounding = "";
        if (st.settings.internet && navigator.onLine && needsWeb(t)) {
          try {
            const q = privacySafeSearchQuery(t);
            if (q) {
              const results = await webSearch(q);
              if (results?.length) grounding = `\n\n${GROUNDING_NOTE}\n\n${resultsToContext(q, results)}`;
            }
          } catch { /* chat without grounding */ }
        }

        const active = (stRef.current.sideThreads || []).find((th) => th.id === activeId);
        const history = (active?.msgs || [])
          .filter((m) => m.id !== replyId && m.id !== youId && m.text.trim())
          .slice(-12)
          .map((m) => ({ role: (m.role === "laro" ? "assistant" : "user") as "assistant" | "user", content: m.text }));

        try {
          let acc = "";
          for await (const part of veylaroChat(
            url, model,
            [{ role: "system", content: `${laroContext(ramGB)}\n\n${LARO_SIDE_CHARTER}${grounding}` },
             ...history,
             { role: "user", content: t }],
            tierFromModelName(model) || st.settings.model, false,
          )) {
            if (part.type === "text") { acc += part.chunk; setReply({ text: acc, streaming: true }); }
          }
          setReply({ text: acc.trim() || "The model came back empty — it may be loading or busy. Give it a second and ask again.", streaming: false });
        } catch {
          setReply({ text: "Couldn't reach the engine just now — it might be starting up or busy. Try again in a moment.", streaming: false });
        }
      })();
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
