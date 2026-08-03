/* ============================================================
   CONTEXT BUDGET — the fix for the bug that made Laro look broken.

   THE BUG (measured, not theorised): the agent loop appends the model's
   whole raw reply plus every observation (@@READ returns up to 7000 chars,
   @@RUN up to 3500) to `convo` on every step, and NOTHING ever trimmed it.
   llama.cpp does not silently truncate — it refuses:

     HTTP 400 {"type":"exceed_context_size_error",
               "message":"request (20015 tokens) exceeds the available
                          context size (16384 tokens)"}

   The renderer surfaced that as "Laro engine responded 400" and gave up.
   So every genuinely ambitious build died a few steps in, which is exactly
   why a request for an AI receptionist came back as 57 lines: the loop never
   got to step 4. The model was never the ceiling. The plumbing was.

   This module removes the ceiling. It keeps the conversation inside a proven
   budget so the loop can run for as many steps as the task needs, and it does
   so WITHOUT losing the two things that must never be dropped: the system
   contract and the user's original request.

   What survives a trim, in priority order:
     1. every system message (the charter + the file protocol)
     2. the user's original request — the whole point of the run
     3. the most recent turns, newest first, until the budget is spent
     4. a one-line marker where older turns were elided, so the model knows
        history was compacted rather than silently rewritten

   Token counting is a deliberate over-estimate. Guessing high costs a little
   context; guessing low costs the whole run.
   ============================================================ */

import type { ChatMsg } from "./runtime";

/* Chars-per-token is NOT a constant, and pretending otherwise is how the first
   version of this fix shipped a prompt the engine still refused. Measured against
   the real Gemma tokenizer on this machine:

     english prose    4.70      shell output     2.68
     react tsx        3.41      css              2.30
     typescript       3.26      json             1.93
     repetitive code  1.86      minified js      1.06

   A single divisor that is safe for minified JS (1.06) throws away three quarters
   of the window on prose. So the heuristic is only ever the FALLBACK: the primary
   path counts with the engine's own tokenizer (see measureMessages in runtime.ts),
   which is exact, local and cached. 1.9 covers everything except pathological
   minified input, and the squeeze-and-retry loop covers that. */
const CHARS_PER_TOKEN = 1.9;

/** Structural overhead llama.cpp's chat template adds per message
    (<start_of_turn>role\n … <end_of_turn>\n). Measured on gemma-3. */
const PER_MESSAGE_TOKENS = 8;

/** How a caller counts tokens. Defaults to the conservative heuristic; the app
    passes the engine-backed exact counter. */
export type TokenCount = (text: string) => number;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function messageTokens(msg: ChatMsg, count: TokenCount = estimateTokens): number {
  return count(msg.content) + PER_MESSAGE_TOKENS;
}

export function conversationTokens(messages: readonly ChatMsg[], count: TokenCount = estimateTokens): number {
  return messages.reduce((n, m) => n + messageTokens(m, count), 0);
}

export interface Budget {
  /** Total context the engine was started with. */
  numCtx: number;
  /** Tokens the reply is allowed to use. */
  reply: number;
  /** Tokens the prompt may use. */
  prompt: number;
}

/**
 * Split the engine's context between prompt and reply.
 *
 * `safetyPct` exists because our token estimate is an estimate. 8% of a 64k
 * window is ~5k tokens of slack — cheap insurance against the one request that
 * would otherwise land a byte over the line and kill the run.
 */
export function budgetFor(numCtx: number, replyTokens: number, safetyPct = 0.08): Budget {
  const safety = Math.ceil(numCtx * safetyPct);
  // Never let the reply allocation starve the prompt: cap it at 40% of the window.
  const reply = Math.max(256, Math.min(replyTokens, Math.floor(numCtx * 0.4)));
  const prompt = Math.max(512, numCtx - reply - safety);
  return { numCtx, reply, prompt };
}

/* ---- WHY WE TRIM HARD, NOT JUST ENOUGH ----------------------------------
   llama.cpp caches the processed prompt and reprocesses only the tokens that
   changed — but the cache is a PREFIX cache. Drop a message from the middle and
   every token after it is invalidated, so the whole conversation is re-evaluated.

   Measured on this machine: prompt processing runs at roughly 110-145 tok/s, so
   re-evaluating a full window is minutes, not seconds. Trimming to "just under
   the ceiling" would force that on EVERY step once the window filled — a loop
   that appears to hang.

   So when a trim is unavoidable we cut down to a low-water mark instead. One
   expensive compaction buys many cheap steps, because the steps in between only
   append and hit the cache. This single constant is the difference between an
   agent loop that grinds and one that stalls. */
export const LOW_WATER = 0.55;

/** The target size to compact down to once the ceiling is hit. */
export function compactionTarget(promptBudget: number): number {
  return Math.max(512, Math.floor(promptBudget * LOW_WATER));
}

const ELISION = (n: number) =>
  `[${n} earlier step${n === 1 ? "" : "s"} of this same run were compacted to stay inside the context window. ` +
  `The files you already wrote are on disk and still count as done — do not rewrite them from scratch. ` +
  `Continue from the most recent messages below.]`;

/** Cap one oversized message, keeping its head and tail (the two ends carry the
    signal: what the file/command was, and how it ended). */
export function clampMessage(msg: ChatMsg, maxTokens: number, count: TokenCount = estimateTokens): ChatMsg {
  if (messageTokens(msg, count) <= maxTokens) return msg;
  const notice = (n: number) => `\n\n… [${n} characters elided to fit the context window] …\n\n`;
  // The notice is part of the message, so it has to come out of the same budget —
  // otherwise the clamped result is reliably a few tokens over the line it was
  // asked to stay under, which is exactly the class of off-by-a-bit that turns
  // into an HTTP 400 at the worst possible moment.
  const noticeChars = notice(msg.content.length).length;
  const budgetChars = Math.max(120, (maxTokens - PER_MESSAGE_TOKENS) * CHARS_PER_TOKEN - noticeChars);
  let head = Math.floor(budgetChars * 0.6);
  let tail = Math.floor(budgetChars * 0.4);
  let cut = msg.content.length - head - tail;
  if (cut <= 0) return msg;
  let out: ChatMsg = { ...msg, content: `${msg.content.slice(0, head)}${notice(cut)}${msg.content.slice(-tail)}` };
  // The chars->tokens ratio varies by an order of magnitude across content types
  // (4.70 on prose, 1.06 on minified JS), so a char-budget alone is not a token
  // guarantee. Verify against the caller's counter and shrink until it truly fits.
  for (let guard = 0; guard < 12 && messageTokens(out, count) > maxTokens; guard++) {
    head = Math.floor(head * 0.65);
    tail = Math.floor(tail * 0.65);
    if (head + tail < 40) break;
    cut = msg.content.length - head - tail;
    out = { ...msg, content: `${msg.content.slice(0, head)}${notice(cut)}${msg.content.slice(-tail)}` };
  }
  return out;
}

export interface FitResult {
  messages: ChatMsg[];
  /** How many messages were dropped entirely. */
  dropped: number;
  /** True if anything at all was changed. */
  trimmed: boolean;
  /** Estimated prompt tokens after fitting. */
  tokens: number;
}

/**
 * Fit a conversation into `promptTokens`.
 *
 * Guarantees:
 *   - every system message survives (clamped if individually enormous)
 *   - the first user message (the request) survives
 *   - the result is <= promptTokens by our own estimate
 *   - message order is preserved
 *   - a role sequence that still makes sense: we never leave a dangling
 *     assistant turn as the first non-system message
 */
export function fitConversation(
  messages: readonly ChatMsg[],
  promptTokens: number,
  count: TokenCount = estimateTokens,
): FitResult {
  const original = conversationTokens(messages, count);
  if (original <= promptTokens) {
    return { messages: [...messages], dropped: 0, trimmed: false, tokens: original };
  }

  const systems: { i: number; msg: ChatMsg }[] = [];
  const rest: { i: number; msg: ChatMsg }[] = [];
  messages.forEach((msg, i) => (msg.role === "system" ? systems : rest).push({ i, msg }));

  // 1. Systems are the contract. Clamp any single monster, but never drop one.
  //    Reserve at most 45% of the window for them so history always has room.
  const systemCap = Math.floor(promptTokens * 0.45);
  let systemTotal = systems.reduce((n, s) => n + messageTokens(s.msg, count), 0);
  const keptSystems = systems.map((s) => ({ ...s }));
  if (systemTotal > systemCap) {
    const perMessage = Math.max(256, Math.floor(systemCap / Math.max(1, systems.length)));
    for (const s of keptSystems) s.msg = clampMessage(s.msg, perMessage, count);
    systemTotal = keptSystems.reduce((n, s) => n + messageTokens(s.msg, count), 0);
  }

  let remaining = promptTokens - systemTotal;

  // 2. The user's original request is the job. It is never dropped, only clamped.
  const firstUserIdx = rest.findIndex((r) => r.msg.role === "user");
  const keep = new Map<number, ChatMsg>();
  if (firstUserIdx >= 0) {
    const requestCap = Math.max(512, Math.floor(remaining * 0.35));
    const clamped = clampMessage(rest[firstUserIdx].msg, requestCap, count);
    keep.set(rest[firstUserIdx].i, clamped);
    remaining -= messageTokens(clamped, count);
  }

  // 3. Fill backwards from the newest turn — recent state is what the next step
  //    reasons from. Reserve room for the elision marker if we will need one.
  const markerCost = count(ELISION(99)) + PER_MESSAGE_TOKENS;
  let budget = remaining - markerCost;
  const recentCap = Math.max(512, Math.floor(promptTokens * 0.3));
  for (let k = rest.length - 1; k >= 0; k--) {
    if (k === firstUserIdx) continue;
    const entry = rest[k];
    let msg = entry.msg;
    if (messageTokens(msg, count) > recentCap) msg = clampMessage(msg, recentCap, count);
    const cost = messageTokens(msg, count);
    if (cost > budget) break;
    budget -= cost;
    keep.set(entry.i, msg);
  }

  // 4. Reassemble in original order, inserting the elision marker at the first gap.
  const out: ChatMsg[] = [];
  let dropped = 0;
  let markerPlaced = false;
  for (let i = 0; i < messages.length; i++) {
    const sys = keptSystems.find((s) => s.i === i);
    if (sys) { out.push(sys.msg); continue; }
    const kept = keep.get(i);
    if (kept) {
      if (dropped && !markerPlaced) {
        out.push({ role: "user", content: ELISION(dropped) });
        markerPlaced = true;
      }
      out.push(kept);
    } else {
      dropped++;
    }
  }
  if (dropped && !markerPlaced) out.push({ role: "user", content: ELISION(dropped) });

  // 5. Never open the history with a dangling assistant turn — some chat
  //    templates reject it, and it reads as if the model spoke unprompted.
  const firstNonSystem = out.findIndex((m) => m.role !== "system");
  if (firstNonSystem >= 0 && out[firstNonSystem].role === "assistant") {
    out.splice(firstNonSystem, 1);
    dropped++;
  }

  return { messages: out, dropped, trimmed: true, tokens: conversationTokens(out, count) };
}

/* ============================================================
   ROLE NORMALISATION — the second 400.

   Gemma's own chat template (which we opt into with --jinja) does not merely
   prefer alternating turns, it REFUSES anything else:

     raise_exception("Conversation roles must alternate user/assistant/user/…")
     -> HTTP 400 "Unable to generate parser for this template"

   The agent loop legitimately produces runs of same-role messages: a step can
   append reproduction evidence, then tool observations, then a continuation
   brief — three user turns in a row, no assistant turn between them. Every one
   of those runs was a 400 waiting to happen, and it looked identical to the
   context-overflow 400 from the outside.

   Merging is lossless — the content is concatenated, nothing is discarded — and
   it makes the whole class of failure impossible regardless of what the caller
   does upstream. Normalising here, at the single choke point every request
   passes through, is deliberate: a fix in the store would only cover the paths
   we happened to think of.
   ============================================================ */
export function normalizeForTemplate(messages: readonly ChatMsg[]): ChatMsg[] {
  const systems = messages.filter((m) => m.role === "system").map((m) => m.content.trim()).filter(Boolean);
  const turns = messages.filter((m) => m.role !== "system");

  const out: ChatMsg[] = [];
  // One system message, not several — templates that accept a system turn accept
  // exactly one, and it must come first.
  if (systems.length) out.push({ role: "system", content: systems.join("\n\n") });

  for (const msg of turns) {
    const content = msg.content;
    const prev = out[out.length - 1];
    if (prev && prev.role === msg.role) {
      prev.content = `${prev.content}\n\n${content}`;
    } else {
      out.push({ role: msg.role, content });
    }
  }

  // The first turn after the system must be the user's. An assistant opening is
  // both template-invalid and semantically wrong (the model did not speak first).
  const firstTurn = out.findIndex((m) => m.role !== "system");
  if (firstTurn >= 0 && out[firstTurn].role === "assistant") out.splice(firstTurn, 1);

  // A trailing assistant turn would ask the model to continue its own message
  // rather than answer; the loop always wants a fresh assistant turn.
  if (out.length && out[out.length - 1].role === "assistant") {
    out.push({ role: "user", content: "Continue." });
  }
  return out;
}

/**
 * Recognise the engine's own "too long" refusal.
 *
 * llama.cpp reports it as HTTP 400 with type `exceed_context_size_error`; other
 * OpenAI-compatible servers phrase it in prose. Either way it is RECOVERABLE —
 * trim harder and retry — not a reason to end the run, which is what the app
 * used to do.
 */
export function isContextOverflow(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return /exceed_context_size|exceeds the available context|context size|too many tokens|maximum context length|prompt is too long|n_ctx/.test(m);
}
