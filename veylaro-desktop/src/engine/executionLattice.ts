import type { ModelId } from "../types";

export type ProductionSystem = {
  id: string;
  name: string;
  purpose: string;
};

export const PRODUCTION_SYSTEMS: ProductionSystem[] = [
  { id: "contract", name: "Contract compiler", purpose: "Defines requested behavior and invariants before edits." },
  { id: "reproduce", name: "Reproduction gate", purpose: "Requires a failing check before a repair is credited." },
  { id: "retrieve", name: "Scoped retrieval", purpose: "Uses repository evidence and verified local precedents." },
  { id: "blast", name: "Blast-radius governor", purpose: "Biases toward the smallest correct change." },
  { id: "counterexample", name: "Counterexample forge", purpose: "Creates edge probes from the public contract." },
  { id: "execute", name: "Execution gate", purpose: "Accepts only observed test, lint, build, and browser evidence." },
  { id: "failure", name: "Failure lattice", purpose: "Retrieves prior failed strategies so they are not repeated." },
  { id: "holdout", name: "Holdout sentinel", purpose: "Keeps grader material and evaluation answers out of prompts." },
  { id: "budget", name: "Evidence scheduler", purpose: "Bounds candidates and parallel work to available memory." },
  { id: "claims", name: "Claim calibration", purpose: "Separates measured facts, sources, inference, and uncertainty." },
];

export const EXECUTION_LATTICE_PROMPT = `UNIVERSAL EXECUTION LATTICE
For software work, follow this order:
1. Write a compact contract: requested behavior, invariants, acceptance checks, and explicit non-goals.
2. Inspect repository evidence before proposing an edit. Never invent files, symbols, APIs, or command output.
3. Reproduce the failure when tools are available. A plausible explanation is not a reproduction.
4. Prefer the smallest additive repair. Preserve working behavior and avoid unrelated cleanup.
5. Derive edge cases from the contract, then select checks that can falsify the repair.
6. Treat execution as law. Only say a check passed when the runtime returned observed pass output.
7. If execution is unavailable, label commands as proposed and the result as unverified.
8. Report evidence separately: observed, source-attributed, inferred, uncertain, or unknown.
9. Do not use benchmark answers, hidden tests, grader feedback, or memorized patches to solve an evaluation.
10. A prior verified local precedent is a hint, never proof that the current task is solved.

The model proposes. The runtime and evidence gates decide what survives.`;

export function evidenceBudget(model: ModelId) {
  if (model === "max") return { candidates: 5, lanes: 3, verificationPasses: 3 };
  if (model === "med") return { candidates: 3, lanes: 2, verificationPasses: 2 };
  return { candidates: 2, lanes: 1, verificationPasses: 1 };
}

