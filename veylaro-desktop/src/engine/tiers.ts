/* ============================================================
   Laro capability tiers — the app-side mirror of
   training/config/laro_system_tiers.json (single source of truth
   for what "Lite / Plus / Max" means). The WEIGHTS shrink per
   tier; the SYSTEM scaffolding (grounding, retrieval, design-kit,
   verified best-of-N) ships on every tier. That is what lets a
   1.5B Lite build punch far above its parameter count.

   Keep this in sync with the JSON. laro_tier.py validates the
   canonical file; this file powers the desktop hardware-fit UI.
   ============================================================ */
import type { ModelId } from "../types";

export type CapabilityTier = "lite" | "plus" | "max";

export interface TierSystems {
  groundingVGL: boolean;      // anti-hallucination verification layer
  retrievalRAG: boolean;      // ground answers in the user's real code/docs
  freshnessWeb: boolean;      // live facts -> no knowledge cutoff
  designSystemKit: boolean;   // guaranteed-good UI scaffold
  reasoningScaffold: string;  // plan -> solve -> verify depth
  overdriveSamples: number;   // verified best-of-N test-time-compute budget
  toolLoop: boolean;
  subAgentLanes: number;
}

export interface TierProfile {
  id: CapabilityTier;
  name: string;
  minRamGB: number;
  recommendedRamGB: number;
  baseParamsB: number;
  contextTokens: number;
  systems: TierSystems;
}

export const SYSTEM_TIERS: TierProfile[] = [
  {
    id: "lite",
    name: "Laro Lite",
    minRamGB: 4,
    recommendedRamGB: 6,
    baseParamsB: 1.5,
    contextTokens: 4096,
    systems: {
      groundingVGL: true, retrievalRAG: true, freshnessWeb: true,
      designSystemKit: true, reasoningScaffold: "plan-verify-1pass",
      overdriveSamples: 2, toolLoop: true, subAgentLanes: 1,
    },
  },
  {
    id: "plus",
    name: "Laro Plus",
    minRamGB: 8,
    recommendedRamGB: 10,
    baseParamsB: 4,
    contextTokens: 8192,
    systems: {
      groundingVGL: true, retrievalRAG: true, freshnessWeb: true,
      designSystemKit: true, reasoningScaffold: "plan-verify-2pass",
      overdriveSamples: 3, toolLoop: true, subAgentLanes: 2,
    },
  },
  {
    id: "max",
    name: "Laro Max",
    minRamGB: 16,
    recommendedRamGB: 24,
    baseParamsB: 4,
    contextTokens: 16384,
    systems: {
      groundingVGL: true, retrievalRAG: true, freshnessWeb: true,
      designSystemKit: true, reasoningScaffold: "plan-verify-branch",
      overdriveSamples: 5, toolLoop: true, subAgentLanes: 3,
    },
  },
];

/** Highest capability tier this machine's RAM supports. */
export function capabilityTier(ramGB: number): TierProfile {
  const eligible = SYSTEM_TIERS.filter((t) => ramGB >= t.minRamGB);
  if (eligible.length) return eligible.reduce((a, b) => (b.minRamGB > a.minRamGB ? b : a));
  return SYSTEM_TIERS[0];
}

/** Number of parallel sub-agent lanes the hardware can drive. */
export function subAgentLanes(ramGB: number): number {
  return capabilityTier(ramGB).systems.subAgentLanes;
}

/** Which purchasable SKU (Lite 1.5B vs Max 4B) to recommend for this machine. */
export function recommendModel(ramGB: number): ModelId {
  return ramGB < 8 ? "lite" : "max";
}

export type FitStatus = "great" | "ok" | "insufficient";

/** Fit a chosen SKU against the machine. Max needs 16 GB; Lite runs on 4. */
export function fitCheck(model: ModelId, ramGB: number): { status: FitStatus; note: string } {
  const floor = model === "max" ? 16 : 4;
  const rec = model === "max" ? 16 : 6;
  if (ramGB >= rec) return { status: "great", note: `${ramGB} GB comfortably runs ${model === "max" ? "Laro Max" : "Laro Lite"}.` };
  if (ramGB >= floor) return { status: "ok", note: `${ramGB} GB meets the floor; close other apps for headroom.` };
  return { status: "insufficient", note: `${ramGB} GB is below the ${floor} GB floor — Laro Lite is the better fit here.` };
}
