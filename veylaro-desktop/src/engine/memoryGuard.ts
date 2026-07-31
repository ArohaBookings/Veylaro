/* ============================================================
   MEMORY GUARD — the Speed & RAM Cluster, made real.

   Goal (Leo's spec): Laro Lite runs perfectly on 8 GB, Laro Med
   on 16 GB, Max on a workstation — and the app NEVER pushes the
   machine into heavy swap.

   It does three things:
     1. Right model for the RAM. Picks the biggest tier that runs
        WELL on this machine; downshifts if you asked for one that
        won't fit, instead of swapping to a crawl.
     2. Right context for the RAM. The KV-cache scales with the
        context window, so on tighter machines we shrink num_ctx —
        big RAM saving, small quality cost.
     3. Live pressure guard. During a run we watch memory pressure;
        if it goes critical we unload after the current step rather
        than let the machine thrash.

   Pure functions here (fully unit-tested); the store wires them to
   the real RAM reading and the model runner.
   ============================================================ */

import { ModelId } from "../types";
import { TIER_BY_ID } from "./tiers";

/** Fixed headroom to leave for the OS, Electron, and the user's own build
    processes (node/vite/next) that run DURING a task. Without this the model
    fits but the build it's running tips the machine into swap. */
const APP_RESERVE_GB = 2.5;
/** Rough KV-cache cost per 8k tokens of context for these Q4 tiers. */
const KV_PER_8K_GB = 0.6;

export interface MemPlan {
  model: ModelId;        // the model to actually run (may be downshifted from `want`)
  numCtx: number;        // right-sized context window
  fits: "great" | "ok" | "tight" | "downshift";
  downshifted: boolean;  // true if we dropped below the requested tier
  note: string;          // one honest line for the UI
  estGB: number;         // estimated resident footprint incl. reserve
}

const ORDER: ModelId[] = ["max", "med", "lite"];

/** Estimated resident memory for a tier at a given context (weights + KV + reserve). */
export function residentCost(model: ModelId, numCtx: number): number {
  const t = TIER_BY_ID[model];
  const weights = t.diskGB * 1.05;              // Q4 weights ≈ on-disk size
  const kv = (numCtx / 8192) * KV_PER_8K_GB;
  return Math.round((weights + kv + APP_RESERVE_GB) * 10) / 10;
}

/**
 * Decide the best model + context that runs WELL on this machine without swapping.
 *
 * Key rule (Leo's constraint): DON'T alter performance when it isn't needed. We
 * always try the requested model at its FULL context first — on the configs that
 * matter (Lite on 8 GB, Med on 16 GB) that fits, so nothing is dialled back and
 * output is identical. We only shrink the context, and only then downshift the
 * model, when the machine genuinely can't hold it — because a slightly smaller
 * context beats swapping to a crawl, and a smaller model beats not running at all.
 */
export function planForMemory(want: ModelId, totalGB: number): MemPlan {
  const SAFETY = 0.5; // don't plan to use literally 100% of RAM
  const wantParams = TIER_BY_ID[want].paramsB;
  const chain = [want, ...ORDER.filter((m) => m !== want && TIER_BY_ID[m].paramsB < wantParams)];

  for (const m of chain) {
    const full = TIER_BY_ID[m].runtime.numCtx;
    // Full context first (no perf change); only step down if it won't fit.
    const ctxOptions = [full, 16384, 8192, 4096, 2048].filter((c, i, a) => c <= full && a.indexOf(c) === i);
    for (const numCtx of ctxOptions) {
      const est = residentCost(m, numCtx);
      if (est <= totalGB - SAFETY) {
        const t = TIER_BY_ID[m];
        const headroom = totalGB - est;
        const downshifted = m !== want;
        const ctxReduced = numCtx < full;
        const fits: MemPlan["fits"] = downshifted ? "downshift" : ctxReduced ? "tight" : headroom >= 3 ? "great" : "ok";
        const note = downshifted
          ? `Not enough memory for ${TIER_BY_ID[want].name} on ${totalGB} GB — running ${t.name} instead so it stays fast and never swaps.`
          : ctxReduced
            ? `${t.name} at a ${numCtx / 1024}k context to stay off swap on ${totalGB} GB (full quality, shorter memory window).`
            : `${t.name} fits comfortably on ${totalGB} GB (~${est} GB used, full context, no compromises).`;
        return { model: m, numCtx, fits, downshifted, note, estGB: est };
      }
    }
  }
  const numCtx = 2048;
  return {
    model: "lite",
    numCtx,
    fits: "tight",
    downshifted: want !== "lite",
    note: `Only ${totalGB} GB detected — running the smallest model at a minimal context. It works, but may be slow.`,
    estGB: residentCost("lite", numCtx),
  };
}

/** Live pressure verdict from the OS reading, for the during-run guard.
    `freeGB` is best-effort (macOS underreports); `pct` is memory_pressure free%
    if we have it. We only act on a CLEAR danger signal. */
export function pressureVerdict(freeGB: number | null, freePct: number | null): "ok" | "watch" | "critical" {
  if (freePct != null) {
    if (freePct <= 8) return "critical";
    if (freePct <= 20) return "watch";
    return "ok";
  }
  if (freeGB != null) {
    if (freeGB < 0.7) return "critical";
    if (freeGB < 1.5) return "watch";
  }
  return "ok";
}
