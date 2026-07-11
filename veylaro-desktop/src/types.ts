/* ============ Veylaro core types ============ */

export type ModelId = "lite" | "max";
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
  overnight: boolean; // overnight personal-LoRA training opt-in
  reasoning: boolean; // stream the model's visible thinking
  voice: boolean; // Laro reads recaps aloud
  deckOpen: boolean; // right-side Viewport/Tasks deck
  deckWidth: number; // px
  viewportUrl: string; // what the Viewport panel points at
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
    disk: "1.9 GB",
    ram: "runs on 4 GB RAM and below",
    tps: [58, 84],
    blurb: "Half the footprint, all the agent. Runs on as little as 4 GB RAM — old laptops welcome.",
  },
  max: {
    name: "Laro Max",
    tag: "Flagship",
    disk: "9.4 GB",
    ram: "16 GB+ RAM",
    tps: [34, 52],
    blurb: "The full weights. The most powerful local coding model in the world.",
  },
};

/** Electron bridge (present only in the desktop build). */
export interface VeylaroBridge {
  pickFile: () => Promise<string | null>;
  pickFolder: () => Promise<string | null>;
  sysinfo: () => Promise<{ ramGB: number; platform: string; arch: string; cpus: number; version: string }>;
  exec: (cmd: string, cwd?: string) => Promise<{ out: string; ok: boolean }>;
  search: (query: string) => Promise<{ ok: boolean; results: { title: string; url: string; snippet: string }[] }>;
  isDesktop: boolean;
}

declare global {
  interface Window {
    veylaro?: VeylaroBridge;
    webkitSpeechRecognition?: any;
  }
}
