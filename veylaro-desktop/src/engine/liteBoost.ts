/* ============================================================
   LITE REINFORCEMENT — systems that run ONLY for the Lite tier.

   Measured on the execution-graded production course, Laro Lite (Gemma 4B)
   fails in two ways Med (12B) does not:
     1. It emits code that does not even parse (unbalanced parens, stray tokens).
     2. Its first solution is frequently logically wrong, though a *different*
        sample of the same model is sometimes right — the model has the ability
        but high variance at 4B.

   These two systems attack exactly those failure modes and are gated on the
   Lite tier so Med/Max pay zero latency cost:

     • Syntax Gate — never trust a file that doesn't parse. Catch it before it
       counts as an attempt and re-prompt surgically with the real parser error.
     • Best-of-N execution selection — draw N candidates at different seeds,
       run the real verification on each, and keep the one with the strongest
       execution evidence. This is honest: the winner is chosen by what actually
       passed, never by peeking at hidden tests.

   Pure logic only — the caller (the app agent loop or the MCP build tool)
   supplies generation, file I/O and command execution.
   ============================================================ */

import type { ModelId } from "../types";

/** How many independent candidates to draw for a tier. Lite trades a little
    time for a large reliability gain; Med/Max are single-shot. */
export function candidateBudget(tier: ModelId): number {
  return tier === "lite" ? 3 : 1;
}

/** Lite-only reinforcement is active only for the Lite tier. */
export function liteReinforced(tier: ModelId): boolean {
  return tier === "lite";
}

/** Distinct seeds so each candidate is a genuinely different sample rather than
    the same deterministic generation. */
export function candidateSeeds(count: number): number[] {
  const base = [42, 7, 101, 2027, 13];
  return Array.from({ length: count }, (_, i) => base[i] ?? 42 + i * 97);
}

const JS_FAMILY = /\.(?:c|m)?jsx?$/i;
const TS_FAMILY = /\.tsx?$/i;
const JSON_FILE = /\.json$/i;

/** Files whose syntax we can cheaply verify. */
export function canSyntaxCheck(path: string): boolean {
  return JS_FAMILY.test(path) || TS_FAMILY.test(path) || JSON_FILE.test(path);
}

/** The command that proves a JS-family file parses (run by the caller, cwd =
    the file's directory). Returns null for files we check in-process instead. */
export function syntaxCheckCommand(relPath: string): string | null {
  if (JS_FAMILY.test(relPath)) return `node --check ${relPath}`;
  return null; // TS/JSON are checked in-process by checkInProcess()
}

/** In-process syntax check for the files `node --check` can't take (JSON, and a
    best-effort structural check for TS). Returns an error string or null. */
export function checkInProcess(path: string, content: string): string | null {
  if (JSON_FILE.test(path)) {
    try { JSON.parse(content); return null; } catch (e) { return `JSON parse error: ${(e as Error).message}`; }
  }
  // Cheap brace/paren/bracket balance check — catches the exact Lite failure
  // (an extra ')') without a full TS parser. Ignores delimiters inside strings
  // and line/block comments.
  return balanceError(content);
}

/** Report the first unbalanced bracket, ignoring strings/comments/templates. */
export function balanceError(src: string): string | null {
  const stack: { ch: string; line: number }[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let line = 1;
  let i = 0;
  const n = src.length;
  let mode: "code" | "line" | "block" | "'" | '"' | "`" = "code";
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === "\n") line++;
    if (mode === "line") { if (c === "\n") mode = "code"; i++; continue; }
    if (mode === "block") { if (c === "*" && c2 === "/") { mode = "code"; i += 2; continue; } i++; continue; }
    if (mode === "'" || mode === '"' || mode === "`") {
      if (c === "\\") { i += 2; continue; }
      if (c === mode) mode = "code";
      i++; continue;
    }
    // code mode
    if (c === "/" && c2 === "/") { mode = "line"; i += 2; continue; }
    if (c === "/" && c2 === "*") { mode = "block"; i += 2; continue; }
    if (c === "'" || c === '"' || c === "`") { mode = c; i++; continue; }
    if (c === "(" || c === "[" || c === "{") stack.push({ ch: c, line });
    else if (c === ")" || c === "]" || c === "}") {
      const top = stack.pop();
      if (!top) return `Unbalanced '${c}' at line ${line}: closing bracket with nothing open.`;
      if (top.ch !== pairs[c]) return `Mismatched '${c}' at line ${line}: expected to close '${top.ch}' from line ${top.line}.`;
    }
    i++;
  }
  if (stack.length) {
    const t = stack[stack.length - 1];
    return `Unclosed '${t.ch}' opened at line ${t.line}.`;
  }
  return null;
}

/** The surgical re-prompt after a syntax failure — no full repair turn, just
    "your file doesn't parse, here's exactly where, return the corrected file". */
export function syntaxRepairBrief(path: string, error: string): string {
  return [
    `Your file ${path} does not parse and was rejected before it could run.`,
    `Parser error: ${error}`,
    `Return the COMPLETE corrected file in one @@FILE ${path} ... @@END block.`,
    `Change only what is needed to make it parse; keep the intended logic.`,
    `Count your brackets. Do not add commentary.`,
  ].join("\n");
}

export interface Candidate {
  seed: number;
  files: string[];
  parses: boolean;
  verifyPassed: number; // verification commands that exited 0
  verifyTotal: number; // verification commands attempted
  crashed: boolean; // threw / non-zero on the reproduction command
}

/** Score a candidate by execution evidence only. Higher is better.
    Priority: it parses > more verification passed > it didn't crash > it wrote
    at least one file. Never inspects hidden tests. */
export function candidateScore(c: Candidate): number {
  let s = 0;
  if (c.parses) s += 1000;
  if (c.verifyTotal > 0) s += Math.round((c.verifyPassed / c.verifyTotal) * 500) + c.verifyPassed * 10;
  if (!c.crashed) s += 50;
  if (c.files.length) s += 5;
  return s;
}

/** Index of the best candidate by execution evidence; -1 if none. */
export function pickBest(cands: Candidate[]): number {
  let best = -1;
  let bestScore = -1;
  cands.forEach((c, i) => {
    const s = candidateScore(c);
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return best;
}

/** One-line, honest summary of what the reinforcement did, for the recap. */
export function reinforcementNote(cands: Candidate[], chosen: number): string {
  if (cands.length <= 1) return "";
  const c = cands[chosen];
  const parsed = cands.filter((x) => x.parses).length;
  return `Lite reinforcement: drew ${cands.length} candidates (${parsed} parsed), kept the one with the strongest execution evidence (${c?.verifyPassed}/${c?.verifyTotal} checks passed).`;
}
