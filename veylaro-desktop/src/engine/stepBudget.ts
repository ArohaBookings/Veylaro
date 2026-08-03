/* ============================================================
   STEP BUDGET — why the agent used to stop before the job was done.

   The loop ran `while (step < maxSteps)` with maxSteps hard-wired to 12-22.
   That is a ceiling on AMBITION, not on safety: a request for a full SaaS got
   the same 18 steps as "rename this variable", and when the counter ran out the
   run simply ended — mid-build, with a cheerful recap. Combined with the context
   overflow (which killed most runs by step 4 anyway) it is why an AI receptionist
   came back as 57 lines.

   A coding agent should stop for exactly three reasons:
     1. the work is DONE and the deliverable proves it (completionGate),
     2. it is STALLED — repeated steps producing nothing new,
     3. the user stopped it.

   "I have used N turns" is not one of them. So the budget here is advisory: it
   sets when to start pushing for closure, while the hard ceiling exists only to
   stop a genuinely runaway loop and scales with what was actually asked for.
   A 10,000-line SaaS is allowed to take hundreds of steps and hours of wall time;
   a one-line tweak is not.
   ============================================================ */

import type { ModelId } from "../types";
import { ambitionFloor } from "./completionGate";

export interface StepPolicy {
  /** Where we start nudging toward closure rather than expansion. */
  soft: number;
  /** Absolute stop. Not an ambition limit — a runaway-loop backstop. */
  hard: number;
  /** Consecutive no-progress steps tolerated before we call it stalled. */
  stallLimit: number;
  /** One honest line for the run log. */
  note: string;
}

/** Roughly how much finished code one step of this tier lands, measured against
    the per-step reply budget in tiers.ts (a 2048-token reply is ~120-160 lines
    of real source once protocol overhead and narration are removed). */
const LINES_PER_STEP: Record<ModelId, number> = { lite: 90, med: 130, max: 160 };

/**
 * Decide how long this run is allowed to go.
 *
 * The floor comes from the same ambition model the completion gate judges
 * against, so the budget and the finish line agree with each other — the loop
 * can no longer run out of turns while the gate still says "not done".
 */
export function stepPolicy(request: string, sku: ModelId): StepPolicy {
  const bar = ambitionFloor(request);
  const perStep = LINES_PER_STEP[sku] ?? 120;
  // Steps needed to reach the floor, then generous headroom: the floor is a
  // minimum, real builds overshoot it, and rewrites/repairs cost steps too.
  const needed = Math.ceil(bar.lines / perStep);
  // The floor is low (a trivial ask still gets a handful of steps to inspect,
  // edit and verify) but must not swallow the scaling — with a floor of 12 a
  // rename and a whole product both came out at 12, which is the flat ceiling
  // this module exists to remove.
  const soft = Math.max(8, needed * 2);
  const hard = Math.max(40, needed * 8);
  return {
    soft,
    hard,
    stallLimit: 3,
    note: `${bar.label}: ~${bar.lines}+ lines expected, budgeting ~${soft} steps (hard stop ${hard}).`,
  };
}

export interface LoopState {
  step: number;
  /** Steps in a row that wrote no file and ran no command. */
  consecutiveIdle: number;
  /** True when the completion gate is satisfied by what's on disk. */
  deliverableComplete: boolean;
  /** The model asked to finish. */
  requestedDone: boolean;
  aborted: boolean;
}

export type StopReason =
  | "complete"
  | "stalled"
  | "aborted"
  | "runaway"
  | null;

/**
 * Should the loop take another step? Returns null to continue, or the reason
 * to stop. Deliberately ordered: user intent first, then evidence of
 * completion, then failure modes.
 */
export function stopReason(state: LoopState, policy: StepPolicy): StopReason {
  if (state.aborted) return "aborted";
  // @@DONE only ends the run when the artifact actually backs it up. The gate,
  // not the model's confidence, is the authority.
  if (state.requestedDone && state.deliverableComplete) return "complete";
  if (state.consecutiveIdle >= policy.stallLimit) return "stalled";
  if (state.step >= policy.hard) return "runaway";
  return null;
}

/** True once we should start steering toward closure instead of new scope. */
export function shouldPushToClose(state: LoopState, policy: StepPolicy): boolean {
  return state.step >= policy.soft;
}

/** The message that keeps a long build moving without inviting new scope. */
export function continuationPressure(state: LoopState, policy: StepPolicy): string {
  if (shouldPushToClose(state, policy)) {
    return "You are deep into this build. Do NOT start new scope. Finish what is " +
      "already begun: complete every partially-written file, wire the pieces together, " +
      "and make it actually run. When it genuinely works end to end, output @@DONE.";
  }
  return "Keep going until the task is genuinely complete and would actually run. " +
    "Write the next file now with @@FILE … @@END — full contents, never a diff or an " +
    "ellipsis. Don't stop early and don't ask whether to continue.";
}
