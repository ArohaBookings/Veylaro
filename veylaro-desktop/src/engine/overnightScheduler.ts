/* ============================================================
   OVERNIGHT LEARNING SCHEDULER (Leo's spec)

   The safe, bulletproof version: it never trains weights and never
   touches the GPU. All it does while you're away is CONSOLIDATE the
   verified precedents you accumulated during real work — dedupe,
   re-rank, and index them so tomorrow's retrieval is sharper. Zero
   crash risk, zero thermal load, and it can tell you exactly what it
   did.

   Hard gates, exactly as specified:
     • Only when the machine is IDLE (no input for `idleStartSec`).
     • Only on AC POWER — never on battery.
     • The instant you touch the machine, it STOPS…
     • …and won't resume for a full hour (a cool-down), so it never
       fights you for the machine right after you sit back down.

   The gating is pure and deterministic (see decide()), so it's unit-
   tested offline. The only thing the main process provides is the two
   facts the renderer can't see: idle seconds and on-battery.
   ============================================================ */

export type LearnStatus =
  | "off"            // feature disabled
  | "learning"      // actively consolidating
  | "paused-active" // you're using the machine
  | "paused-battery"// on battery, plugged-only is on
  | "cooldown"      // within the 1h cool-down after activity
  | "idle-waiting"; // enabled, plugged, but not idle long enough yet

export interface LearnConfig {
  enabled: boolean;
  onlyWhenPlugged: boolean;
  idleStartSec: number;    // how long idle before we start (default 300 = 5 min)
  cooldownMs: number;      // wait this long after activity before resuming (default 1h)
}

export const DEFAULT_LEARN_CONFIG: LearnConfig = {
  enabled: false,
  onlyWhenPlugged: true,
  idleStartSec: 300,
  cooldownMs: 60 * 60 * 1000,
};

export interface Power { idleSec: number; onBattery: boolean; ok: boolean }

export interface LearnState {
  status: LearnStatus;
  pausedUntil: number;   // epoch ms; 0 = not in cooldown
  consolidated: number;  // total precedents processed to date
  sessions: number;      // number of overnight sessions run
  lastRunAt: number;
  lastSummary: string;   // human sentence Laro can report
}

export const INITIAL_STATE: LearnState = {
  status: "off", pausedUntil: 0, consolidated: 0, sessions: 0,
  lastRunAt: 0, lastSummary: "",
};

/** PURE decision function — no side effects, fully unit-testable. Given the
 *  config, the current power reading, the previous status and any active
 *  cooldown, decide what the scheduler should do right now. */
export function decide(
  cfg: LearnConfig, power: Power, prev: LearnStatus, pausedUntil: number, now: number,
): { status: LearnStatus; pausedUntil: number; runStep: boolean } {
  if (!cfg.enabled) return { status: "off", pausedUntil: 0, runStep: false };

  // Any input at all -> stop immediately AND arm the 1h cool-down.
  const userActive = power.idleSec < cfg.idleStartSec;
  if (userActive) {
    return { status: "paused-active", pausedUntil: now + cfg.cooldownMs, runStep: false };
  }
  // Never run on battery when plugged-only is set.
  if (cfg.onlyWhenPlugged && power.onBattery) {
    return { status: "paused-battery", pausedUntil, runStep: false };
  }
  // Still inside the cool-down window after the last activity.
  if (pausedUntil && now < pausedUntil) {
    return { status: "cooldown", pausedUntil, runStep: false };
  }
  // Idle long enough, on power, past cool-down -> learn.
  return { status: "learning", pausedUntil: 0, runStep: true };
}

type StepFn = () => number;            // returns # precedents consolidated this step
type Emit = (s: LearnState) => void;

export class OvernightScheduler {
  private cfg: LearnConfig;
  private state: LearnState;
  private timer: any = null;
  private step: StepFn;
  private emit: Emit;
  private power: () => Promise<Power>;

  constructor(opts: {
    config: LearnConfig; initial?: LearnState;
    consolidateStep: StepFn; onChange: Emit; readPower: () => Promise<Power>;
  }) {
    this.cfg = opts.config;
    this.state = opts.initial ? { ...opts.initial } : { ...INITIAL_STATE };
    this.step = opts.consolidateStep;
    this.emit = opts.onChange;
    this.power = opts.readPower;
  }

  setConfig(cfg: Partial<LearnConfig>) { this.cfg = { ...this.cfg, ...cfg }; }
  getState() { return { ...this.state }; }

  start(intervalMs = 30_000) {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), intervalMs);
  }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  async tick(now = Date.now()) {
    let power: Power;
    try { power = await this.power(); }
    catch { power = { idleSec: 0, onBattery: false, ok: false }; }

    const d = decide(this.cfg, power, this.state.status, this.state.pausedUntil, now);
    this.state.status = d.status;
    this.state.pausedUntil = d.pausedUntil;

    if (d.runStep) {
      let n = 0;
      try { n = this.step() || 0; } catch { n = 0; }
      if (n > 0) {
        this.state.consolidated += n;
        this.state.sessions += 1;
        this.state.lastRunAt = now;
        this.state.lastSummary =
          `Consolidated ${n} verified precedent${n === 1 ? "" : "s"} from your recent work ` +
          `(${this.state.consolidated} total across ${this.state.sessions} overnight sessions).`;
      }
    }
    this.emit(this.getState());
  }
}

/** One-line status Laro can say if the user asks "what did you learn overnight?" */
export function reportLine(s: LearnState): string {
  if (s.status === "off") return "Overnight learning is off — turn it on in Settings → Overnight learning.";
  if (!s.consolidated) return "I haven't consolidated anything overnight yet — I only learn from checks that actually passed on your machine.";
  return s.lastSummary || `I've consolidated ${s.consolidated} verified precedents from your work so far.`;
}
