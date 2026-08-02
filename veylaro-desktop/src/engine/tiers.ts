import type { ModelId } from "../types";

/* ============================================================
   Laro capability tiers — the single source of truth for what
   Lite / Med / Max mean, how much machine each needs, and how
   each is tuned for latency.

   The WEIGHTS change per tier. The SYSTEM scaffolding (grounding,
   retrieval, design kit, verified best-of-N, the adversarial
   ratchet) ships on EVERY tier — that is what lets Lite punch
   far above its parameter count.

   Nothing here loads a model. `modelTag` is the name the app
   asks the Veylaro engine for once the weights are installed; until then the
   app runs the preview engine and every screen still works.
   ============================================================ */

export type CapabilityTier = ModelId; // "lite" | "med" | "max"

export interface TierSystems {
  groundingGate: boolean; // hard_existence_gate — blocks fabricated APIs
  retrievalRAG: boolean; // ground answers in the user's real code
  freshnessWeb: boolean; // live retrieval -> not limited to the weight cutoff
  designSystemKit: boolean; // guaranteed-good UI scaffold
  adversarialRatchet: boolean; // damages the app on purpose; tests must catch it
  contractCompiler: boolean;
  reproductionGate: boolean;
  executionGate: boolean;
  failureLattice: boolean;
  holdoutSentinel: boolean;
  blastRadiusGovernor: boolean;
  counterexampleForge: boolean;
  evidenceBudget: boolean;
  claimCalibration: boolean;
  verifiedPrecedentMemory: boolean;
  reasoningScaffold: string; // plan -> solve -> verify depth
  overdriveSamples: number; // verified best-of-N budget
  subAgentLanes: number;
}

export interface TierProfile {
  id: CapabilityTier;
  name: string;
  tagline: string;
  /** Absolute floor. Below this we refuse to recommend the tier. */
  minRamGB: number;
  /** Where it feels genuinely smooth. */
  recommendedRamGB: number;
  paramsB: number;
  diskGB: number;
  contextTokens: number;
  /** the Veylaro engine model name once the weights are installed. */
  modelTag: string;
  /** Runtime tuning — smaller budgets on small machines keep it snappy. */
  runtime: {
    numPredict: number;
    numCtx: number;
    keepAlive: string;
    temperature: number;
  };
  systems: TierSystems;
}

export const SYSTEM_TIERS: TierProfile[] = [
  {
    id: "lite",
    name: "Laro Lite",
    tagline: "Runs on almost anything. Still a real engineer.",
    minRamGB: 8,
    recommendedRamGB: 8,
    paramsB: 4,
    diskGB: 3.6,
    contextTokens: 16384,
    modelTag: "laro-lite",
    // Gemma 4B (E2B). Temperature is > 0 on purpose: the Lite tier leans on
    // execution-selected best-of-N, and at temperature 0 every sampled candidate
    // is identical, so the tournament can't find a better one. A little variance
    // + keeping the candidate that actually passes is how Lite punches up.
    runtime: { numPredict: 1600, numCtx: 8192, keepAlive: "20m", temperature: 0.2 },
    systems: {
      groundingGate: true, retrievalRAG: true, freshnessWeb: true,
      designSystemKit: true, adversarialRatchet: true,
      contractCompiler: true, reproductionGate: true, executionGate: true,
      failureLattice: true, holdoutSentinel: true, blastRadiusGovernor: true,
      counterexampleForge: true, evidenceBudget: true, claimCalibration: true,
      verifiedPrecedentMemory: true,
      reasoningScaffold: "plan → verify (1 pass)", overdriveSamples: 2, subAgentLanes: 1,
    },
  },
  {
    id: "med",
    name: "Laro Med",
    tagline: "The measured one. Best balance of smart and fast.",
    minRamGB: 12,
    recommendedRamGB: 16,
    paramsB: 12,
    diskGB: 7.6,
    contextTokens: 16384,
    modelTag: "laro-med",
    runtime: { numPredict: 2048, numCtx: 16384, keepAlive: "20m", temperature: 0.1 },
    systems: {
      groundingGate: true, retrievalRAG: true, freshnessWeb: true,
      designSystemKit: true, adversarialRatchet: true,
      contractCompiler: true, reproductionGate: true, executionGate: true,
      failureLattice: true, holdoutSentinel: true, blastRadiusGovernor: true,
      counterexampleForge: true, evidenceBudget: true, claimCalibration: true,
      verifiedPrecedentMemory: true,
      reasoningScaffold: "plan → verify (2 pass)", overdriveSamples: 3, subAgentLanes: 2,
    },
  },
  {
    id: "max",
    name: "Laro Max",
    tagline: "Everything we know how to give it. For big machines.",
    minRamGB: 24,
    recommendedRamGB: 32,
    paramsB: 24,
    diskGB: 14,
    contextTokens: 32768,
    modelTag: "laro-max",
    runtime: { numPredict: 3072, numCtx: 32768, keepAlive: "20m", temperature: 0.1 },
    systems: {
      groundingGate: true, retrievalRAG: true, freshnessWeb: true,
      designSystemKit: true, adversarialRatchet: true,
      contractCompiler: true, reproductionGate: true, executionGate: true,
      failureLattice: true, holdoutSentinel: true, blastRadiusGovernor: true,
      counterexampleForge: true, evidenceBudget: true, claimCalibration: true,
      verifiedPrecedentMemory: true,
      reasoningScaffold: "plan → branch → verify", overdriveSamples: 5, subAgentLanes: 3,
    },
  },
];

export const TIER_BY_ID: Record<CapabilityTier, TierProfile> = Object.fromEntries(
  SYSTEM_TIERS.map((t) => [t.id, t])
) as Record<CapabilityTier, TierProfile>;

/** Highest tier this machine can actually run well. */
export function capabilityTier(ramGB: number): TierProfile {
  const eligible = SYSTEM_TIERS.filter((t) => ramGB >= t.minRamGB);
  return eligible.length ? eligible[eligible.length - 1] : SYSTEM_TIERS[0];
}

/** Which tier to recommend. Conservative: we'd rather feel instant than clever. */
export function recommendModel(ramGB: number): CapabilityTier {
  if (ramGB >= 24) return "max";
  if (ramGB >= 12) return "med";
  return "lite";
}

/** Parallel sub-agent lanes the hardware can drive. */
export function subAgentLanes(ramGB: number): number {
  return capabilityTier(ramGB).systems.subAgentLanes;
}

export type FitStatus = "great" | "ok" | "tight" | "insufficient";

export interface FitResult {
  status: FitStatus;
  note: string;
}

export function recommendedName(ramGB: number): string {
  return TIER_BY_ID[recommendModel(ramGB)].name;
}

/** Honest fit check — tells the truth about what this machine will feel like. */
export function fitCheck(model: CapabilityTier, ramGB: number): FitResult {
  const t = TIER_BY_ID[model];
  if (ramGB >= t.recommendedRamGB)
    return { status: "great", note: `${ramGB} GB runs ${t.name} comfortably. Cold load still takes a moment; warm turns are the fast path.` };
  if (ramGB >= t.minRamGB + 2)
    return { status: "ok", note: `${ramGB} GB runs ${t.name} well. Close a couple of browser tabs on big jobs.` };
  if (ramGB >= t.minRamGB)
    return {
      status: "tight",
      note: `${ramGB} GB meets ${t.name}'s floor but it will feel tight. ${
        t.id === "max" ? "Laro Med" : "Laro Lite"
      } will feel faster on this machine.`,
    };
  return {
    status: "insufficient",
    note: `${ramGB} GB is below ${t.name}'s ${t.minRamGB} GB floor — it would swap and crawl. Use ${recommendedName(ramGB)} instead.`,
  };
}

/** Runtime options for the live adapter, tuned per tier. */
export function runtimeFor(model: CapabilityTier) {
  return TIER_BY_ID[model].runtime;
}
