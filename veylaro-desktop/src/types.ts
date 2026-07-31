/* ============ Veylaro core types ============ */

export type ModelId = "lite" | "med" | "max";
export type PermMode = "ask" | "edits" | "bypass";
export type Plan = "free" | "pro" | "team";
export type LangPref = "both" | "plain" | "dev";
export type EngineKind = "demo" | "ollama";

/** Mirrors Stripe subscription.status. Drives access with grace so a single
    failed charge never cuts someone off mid-work. */
export type BillingState = "active" | "trialing" | "past_due" | "canceled" | "incomplete";

export interface Account {
  name: string;
  email: string;
  plan: Plan;
  billing?: BillingState;
  /** epoch ms — end of the current paid period (from Stripe). */
  periodEnd?: number;
  /** epoch ms — last time we successfully verified the subscription online.
      Lets a paid plan keep working offline for a generous window. */
  lastVerified?: number;
  /** epoch ms — when a past_due grace window ends (access drops to Free after). */
  graceUntil?: number;
  /** epoch ms — end of the launch "first month unlimited" gift. */
  launchTrialUntil?: number;
  /** this user's own referral code, and how many have converted. */
  referralCode?: string;
  referralsUsed?: number;
}

/** Paid access survives this long fully offline before asking to re-verify —
    a plane flight, a bunker, a dead router never locks a paying user out. */
export const OFFLINE_GRACE_MS = 14 * 24 * 3600 * 1000;
/** A failed payment keeps full access this long while Stripe retries. */
export const PAST_DUE_GRACE_MS = 3 * 24 * 3600 * 1000;

export type SubAgentPref = "off" | "duo" | "auto";

export interface Settings {
  model: ModelId;
  permMode: PermMode;
  lang: LangPref;
  personality: boolean; // self-talk while working
  sounds: boolean;
  engine: EngineKind;
  ollamaUrl: string;
  ollamaModel: string;
  internet: boolean; // web search toggle (only works when online)
  planMode: boolean; // present a plan and wait for approval before acting
  subAgents: SubAgentPref; // auto = 3 lanes on 16GB+ machines, else 2
  overnight: boolean; // private verified-precedent retrieval opt-in
  reasoning: boolean; // stream the model's visible thinking
  voice: boolean; // Laro reads recaps aloud
  deckOpen: boolean; // right-side Viewport/Tasks deck
  deckWidth: number; // px
  viewportUrl: string; // what the Viewport panel points at

  /* ---- safety & access ---- */
  fullDiskAccess: boolean; // DANGEROUS: let Laro read/write outside the session scope
  fullDiskAckAt?: number; // when the user accepted the risk (audit trail)
  confirmDestructive: boolean; // always confirm deletes / rm / force-push
  autoPickModel: boolean; // let Veylaro choose the tier from your hardware

  /* ---- privacy ---- */
  shareImprovementData: boolean; // OFF by default — anonymous counters only
  crashReports: boolean; // OFF by default

  /* ---- learning ---- */
  overnightOnlyWhenPlugged: boolean; // future adapter preparation only on power + idle
  overnightIntensity: "gentle" | "normal"; // local review/retrieval budget

  /* ---- terminal ---- */
  terminalShell: string; // which shell the CLI + terminal mode use
}

export const APP_VERSION = "1.0.0";

export interface Attachment {
  id: string;
  name: string;
  dataUrl: string;
}

export interface FileStat {
  path: string;
  plus: number;
  minus: number;
  active: boolean; // currently being worked on
  verified: boolean | null; // null = untested yet
}

export interface Question {
  id: string;
  q: string;
  options: string[];
  allowOther?: boolean; // shows an "Other" choice with free-text input
  answer?: string;
}

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SubAgentLane {
  name: string;
  role: string;
  task: string;
}

export interface SideMsg {
  id: string;
  role: "you" | "laro";
  text: string;
  ts: number;
}

export interface TermLine {
  id: string;
  cmd: string;
  out: string;
  ok: boolean;
  ts: number;
}

export interface BgTask {
  id: string;
  label: string;
  detail?: string;
  status: "running" | "done" | "failed";
  ts: number;
}

export interface VaultItem {
  id: string;
  title: string;
  commit: string;
  bullets: string[];
  scope: string;
  ts: number;
}

/** A step of Laro driving the Viewport — cursor coords are percentages. */
export interface BrowseStep {
  x: number;
  y: number;
  action: "move" | "click" | "type" | "scroll" | "look";
  note: string;
}

export interface Checkpoint {
  id: string;
  label: string;
  ts: number;
  /** snapshot of per-file counters at this point, for time-machine restore */
  files: Record<string, { plus: number; minus: number }>;
}

export type AgentEvent =
  | { kind: "say"; plain: string; dev: string }
  | { kind: "step"; text: string } // a short "what I'm doing" line that persists as it streams
  | { kind: "think"; text: string }
  | {
      kind: "file";
      path: string;
      op: "create" | "edit";
      plus: number;
      minus: number;
      snippet?: { del: string[]; add: string[] };
    }
  | { kind: "cmd"; cmd: string; out: string; ok: boolean }
  | { kind: "verify"; target: string; ok: boolean; detail: string }
  | { kind: "ask"; questions: Question[] }
  | { kind: "plan"; goal: string; steps: string[] }
  | { kind: "web"; query: string; results: WebResult[] }
  | { kind: "agents"; lanes: SubAgentLane[] }
  | { kind: "browse"; url: string; steps: BrowseStep[]; summary: string }
  | { kind: "reasoning"; text: string }
  | { kind: "radar"; items: { path: string; issue: string; sev: "low" | "med" | "high" }[] }
  | { kind: "sim"; files: string[]; plus: number; minus: number; pros: string[]; cons: string[] }
  | { kind: "checkpoint"; label: string }
  | { kind: "recap"; title: string; bullets: string[]; commit: string }
  | { kind: "gate"; what: string; detail: string }
  | { kind: "restore"; label: string }
  | { kind: "done"; ms: number };

export interface Msg {
  id: string;
  role: "user" | "agent";
  text?: string;
  attachments?: Attachment[];
  events?: AgentEvent[];
  ts: number;
}

export interface Session {
  id: string;
  title: string;
  scope: string; // the file/folder the agent is locked to
  scopeKind: "file" | "folder";
  msgs: Msg[];
  files: Record<string, FileStat>;
  checkpoints: Checkpoint[];
  term: TermLine[]; // terminal mode history
  draft?: string; // unsent composer text — survives crashes and restarts
  createdAt: number;
}

export interface Usage {
  weekKey: string;
  used: number;
}

/** Free tier: enough to genuinely build ~two solid websites, every single
    week (a full agent-built site runs ~60–90 messages incl. iterations).
    Resets every Monday (ISO week). Enforced locally, so it works offline. */
export const FREE_WEEKLY_LIMIT = 200;

export const MODELS: Record<
  ModelId,
  { name: string; tag: string; disk: string; ram: string; tps: [number, number]; blurb: string }
> = {
  lite: {
    name: "Laro Lite",
    tag: "Featherweight",
    disk: "2.6 GB",
    ram: "4 GB RAM and up",
    tps: [58, 90],
    blurb: "Runs on almost anything — old laptops welcome. Same agent brain, feather footprint.",
  },
  med: {
    name: "Laro Med",
    tag: "The sweet spot",
    disk: "7.6 GB",
    ram: "12 GB RAM and up",
    tps: [30, 48],
    blurb: "The measured one. Best balance of smart and fast — our default recommendation.",
  },
  max: {
    name: "Laro Max",
    tag: "Flagship",
    disk: "14 GB",
    ram: "24 GB+ RAM",
    tps: [18, 30],
    blurb: "Everything we know how to give it. For big machines that want the deepest reasoning.",
  },
};

/** Every new install gets a full month of unlimited, no card. */
export const LAUNCH_FREE_MONTH_MS = 30 * 24 * 3600 * 1000;
/** How many people one user can refer for a free month each. */
export const REFERRAL_MAX = 5;

/** Guard context passed with every write/exec so the main-process Guard can
    decide: which folder the session is scoped to, and whether the user has
    switched on full-disk access. `confirmed` acknowledges a needsConfirm. */
export interface GuardCtx {
  scope?: string;
  scopeKind?: "file" | "folder";
  fullDisk?: boolean;
  confirmed?: boolean;
}

/** Electron bridge (present only in the desktop build). */
export interface VeylaroBridge {
  pickFile: () => Promise<string | null>;
  pickFolder: () => Promise<string | null>;
  newProject: (name: string) => Promise<string | { error: string } | null>;
  powerState?: () => Promise<{ idleSec: number; onBattery: boolean; ok: boolean }>;
  sysinfo: () => Promise<{ ramGB: number; platform: string; arch: string; cpus: number; version: string }>;
  exec: (cmd: string, cwd?: string, opts?: { confirmed?: boolean; shell?: string }) => Promise<{ out: string; ok: boolean; blocked?: boolean; needsConfirm?: boolean }>;
  readFile?: (p: string) => Promise<{ ok: boolean; content?: string; error?: string }>;
  writeFile?: (p: string, content: string, ctx?: GuardCtx) => Promise<{ ok: boolean; path?: string; blocked?: boolean; needsConfirm?: boolean; error?: string }>;
  listDir?: (p: string) => Promise<{ ok: boolean; entries?: { name: string; dir: boolean }[]; error?: string }>;
  checkWrite?: (p: string, ctx?: GuardCtx) => Promise<{ allow: boolean; needsConfirm?: boolean; reason?: string }>;
  search: (query: string) => Promise<{ ok: boolean; results: { title: string; url: string; snippet: string }[] }>;
  isDesktop: boolean;
}

declare global {
  interface Window {
    veylaro?: VeylaroBridge;
    webkitSpeechRecognition?: any;
  }
}
