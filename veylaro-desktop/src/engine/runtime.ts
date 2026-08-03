/* ============================================================
   Live inference adapter — Veylaro Code's real engine.
   Talks to the local Veylaro engine server. Each product tier is selected
   from an explicit checkpoint family; the runtime never relabels one tier
   as another or silently falls back to an unrelated installed model.

   Speed tuning:
   - think:false        Gemma4 spends its whole budget in the hidden
                        thinking channel otherwise (empty replies).
   - lazy start         the desktop starts MLX only on the first request.
   - keep warm          weights stay hot between active messages.
   - idle stop          the renderer releases the owned engine after idle.
   - num_predict 1024   snappy ceilings; temperature 0.3 for precision.
   ============================================================ */

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Per-tier tuning comes from the tier table so there is exactly one
    source of truth for how each model is driven. Lite trades ceiling for
    snap; Max gets full depth. */
import { runtimeFor, TIER_BY_ID } from "./tiers";
import {
  budgetFor, compactionTarget, conversationTokens, estimateTokens, fitConversation,
  isContextOverflow, normalizeForTemplate,
} from "./contextBudget";
import type { TokenCount } from "./contextBudget";
import type { ModelId } from "../types";

function optsFor(sku: ModelId) {
  const rt = runtimeFor(sku);
  return { temperature: rt.temperature, num_predict: rt.numPredict, num_ctx: rt.numCtx, top_p: 0.9 };
}

type RuntimeOverrides = Partial<ReturnType<typeof optsFor>> & { seed?: number };

export interface EngineReady {
  ok: boolean;
  url: string;
  provider?: string;
  model?: string;
  tier?: ModelId;
  started?: boolean;
  error?: string;
}

type Discovery = { provider: "openai"; models: string[] };

export function tierFromModelName(model: string): ModelId | undefined {
  const value = model.toLowerCase();
  // The self-contained engine serves a GGUF and reports its PATH as the model id
  // (…/models/<tier>/model.gguf). Our own installer writes that path, so the tier
  // segment is authoritative — this is not relabelling an unrelated checkpoint.
  const owned = value.match(/[\\/]models[\\/](lite|med|max)[\\/][^\\/]*\.gguf$/);
  if (owned) return owned[1] as ModelId;
  if (/(?:laro|veylaro)[-_ ]?max|(?:^|[-_/ ])24b(?:$|[-_/ ])/i.test(value)) return "max";
  if (/(?:laro|veylaro)[-_ ]?med|(?:^|[-_/ ])12b(?:$|[-_/ ])/i.test(value)) return "med";
  if (/(?:laro|veylaro)[-_ ]?lite|gemma-4-e2b|(?:^|[-_/ ])4b(?:$|[-_/ ])/i.test(value)) return "lite";
  return undefined;
}

export function selectInstalledModel(models: string[], preferred: string, sku: ModelId): string {
  const exact = models.find((model) => model === preferred || model.replace(/:latest$/, "") === preferred.replace(/:latest$/, ""));
  if (exact && tierFromModelName(exact) === sku) return exact;
  for (const wanted of modelPreference(sku)) {
    const hit = models.find((model) => model === wanted || model.startsWith(`${wanted}:`));
    if (hit && tierFromModelName(hit) === sku) return hit;
  }
  // Self-contained engine: it reports the GGUF path we installed for this tier.
  // Still fails closed — only a model whose identified tier IS the requested sku.
  const owned = models.find((model) => tierFromModelName(model) === sku);
  if (owned) return owned;
  return "";
}

/* ---- the engine's REAL context window ----------------------------------
   Never guess this. The renderer used to compute a context plan of its own and
   never send it, so it had no idea what the server would accept and discovered
   the ceiling as an HTTP 400 in the middle of a build. llama.cpp reports the
   window it was actually started with at /props; that number is the only one
   worth budgeting against. Cached per endpoint, re-probed when the engine
   restarts on a different tier (the cache key includes the reported model). */
const ctxCache = new Map<string, { model: string; numCtx: number }>();

export async function engineContextWindow(url: string, model = "", timeout = 2000): Promise<number | null> {
  const base = url.replace(/\/$/, "");
  const hit = ctxCache.get(base);
  if (hit && (!model || hit.model === model)) return hit.numCtx;
  try {
    const res = await fetch(`${base}/props`, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    const body = await res.json();
    const n = Number(body?.default_generation_settings?.n_ctx);
    if (!Number.isFinite(n) || n <= 0) return null;
    ctxCache.set(base, { model: model || String(body?.model_path || ""), numCtx: n });
    return n;
  } catch {
    return null;
  }
}

export function forgetContextWindow(url?: string): void {
  if (url) ctxCache.delete(url.replace(/\/$/, ""));
  else ctxCache.clear();
}

/* ---- EXACT token counting -----------------------------------------------
   The chars-per-token heuristic is not good enough to bet a build on. Measured
   against this very tokenizer: english prose is 4.70 chars/token, minified JS is
   1.06 — a 4.4x spread. A single divisor is either wasteful or wrong, and "wrong"
   means the engine refuses the request mid-build.

   llama.cpp exposes /tokenize locally, so exactness is free. Results are cached
   by content: the agent loop is append-mostly, so each message is tokenized once
   no matter how many steps reuse it. */
const tokenCache = new Map<string, number>();
const TOKEN_CACHE_MAX = 4000;

function cacheTokens(text: string, n: number): number {
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    // cheap FIFO eviction — the oldest quarter goes
    let drop = Math.floor(TOKEN_CACHE_MAX / 4);
    for (const k of tokenCache.keys()) { tokenCache.delete(k); if (--drop <= 0) break; }
  }
  tokenCache.set(text, n);
  return n;
}

/** Tokenize with the engine's own vocabulary. Returns null when the endpoint
    isn't a llama.cpp server (or is busy) so the caller can fall back. */
async function tokenizeExact(base: string, text: string, timeout = 4000): Promise<number | null> {
  const hit = tokenCache.get(text);
  if (hit !== undefined) return hit;
  try {
    const res = await fetch(`${base}/tokenize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const n = Array.isArray(body?.tokens) ? body.tokens.length : NaN;
    if (!Number.isFinite(n)) return null;
    return cacheTokens(text, n);
  } catch {
    return null;
  }
}

/**
 * Build an exact token counter for this conversation.
 *
 * Every message is measured against the real vocabulary up front (cached, so
 * repeat steps are free); the returned function is synchronous so the fitting
 * logic stays pure and testable. If the endpoint can't tokenize, the caller
 * silently gets the conservative heuristic instead.
 */
export async function exactCounter(url: string, messages: readonly ChatMsg[]): Promise<TokenCount> {
  const base = url.replace(/\/$/, "");
  const unique = [...new Set(messages.map((m) => m.content))];
  const measured = await Promise.all(unique.map((text) => tokenizeExact(base, text)));
  if (measured.some((n) => n === null)) return estimateTokens; // endpoint can't tokenize

  // Clamping produces text that was never measured. Rather than fall back to a
  // global guess, calibrate on THIS conversation: take the densest observed
  // chars-per-token and shave 10%. A run full of minified bundles gets a tight
  // ratio; a run of prose gets a generous one. Both stay on the safe side.
  let densest = Infinity;
  unique.forEach((text, i) => {
    const n = measured[i] as number;
    if (text.length >= 200 && n > 0) densest = Math.min(densest, text.length / n);
  });
  const fallbackRatio = Number.isFinite(densest) ? Math.max(0.5, densest * 0.9) : 1.9;

  return (text: string) => {
    const known = tokenCache.get(text);
    if (known !== undefined) return known;
    return Math.ceil(text.length / fallbackRatio);
  };
}

async function discover(url: string, timeout = 2500): Promise<Discovery | null> {
  const base = url.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(timeout) });
    if (res.ok) {
      const body = await res.json();
      return { provider: "openai", models: (body?.data || []).map((item: any) => String(item?.id || "")).filter(Boolean) };
    }
  } catch { /* offline */ }
  return null;
}

/** Start the app-owned engine on demand. Browser preview builds can only use an
    already-running endpoint; the desktop bridge owns the real process. */
export async function ensureLocalEngine(url: string, preferredModel = "", sku: ModelId = "lite"): Promise<EngineReady> {
  // Desktop readiness is execution-verified in the main process. A model name
  // in /v1/models is metadata, not proof that its tokenizer and weights work.
  if (window.veylaro?.engineEnsure) {
    return window.veylaro.engineEnsure(url, preferredModel, sku);
  }
  const already = await discover(url, 900);
  if (already) {
    const model = selectInstalledModel(already.models, preferredModel, sku);
    if (!model) {
      return { ok: false, url, provider: already.provider, error: `The running endpoint does not provide Laro ${sku}.` };
    }
    return { ok: true, url, provider: already.provider, model, tier: model ? tierFromModelName(model) : undefined, started: false };
  }
  return { ok: false, url, error: "The local Veylaro engine is not running." };
}

/** Preferred shipped model names per tier, best first. The tier's own
    modelTag wins; the legacy names keep older installs working. */
export function modelPreference(sku: ModelId): string[] {
  const aliases = [
    TIER_BY_ID[sku].modelTag,
    `veylaro-${sku}`,
  ];
  if (sku === "lite") aliases.push("mlx-community/gemma-4-e2b-it-4bit", "mlx-community/gemma-3-text-4b-it-4bit");
  if (sku === "med") aliases.push("mlx-community/gemma-4-12B-it-4bit", "gemma4:12b");
  if (sku === "max") aliases.push("mlx-community/Devstral-Small-2-24B-Instruct-2512-OptiQ-4bit", "devstral:24b");
  return aliases;
}
const MODEL_PREFERENCE = [
  "laro-med", "laro-max", "laro-lite", "veylaro-code", "veylaro",
  "mlx-community/gemma-4-e2b-it-4bit", "mlx-community/gemma-3-text-4b-it-4bit",
];

export async function engineAlive(url: string): Promise<boolean> {
  return !!(await discover(url));
}

/** Find the best installed Veylaro model, or null if none. */
export async function detectLiveModel(url: string): Promise<string | null> {
  try {
    const found = await discover(url);
    if (!found) return null;
    const names = found.models;
    for (const want of MODEL_PREFERENCE) {
      const hit = names.find((n) => n === want || n.startsWith(`${want}:`));
      if (hit) return hit;
    }
    return names[0] || null;
  } catch {
    return null;
  }
}

/** Pre-load the weights so the first user message streams instantly.
    keep_alive is short (10m) on purpose: it covers the gap between opening the
    app and the first message, then releases the RAM if you never send one — no
    30-minute memory hang sitting there doing nothing. */
export async function warmup(url: string, model: string): Promise<void> {
  try {
    await fetch(`${url.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply only OK." }],
        stream: false,
        max_tokens: 2,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    /* warmup is best-effort */
  }
}

/** Release the weights from memory now. Called when you hit Stop, so the RAM
    frees the moment you're done rather than lingering for the keep-alive window. */
export async function unloadModel(url: string, model: string): Promise<void> {
  try {
    const stopped = await window.veylaro?.engineStop?.();
    if (stopped?.stopped) return;
  } catch { /* external engine: fall through to protocol unload */ }
  // The OpenAI-compatible local protocol has no standard unload operation.
  // External runtimes remain under the process owner's control.
  void url;
  void model;
}

export type StreamChunk = { type: "think" | "text"; chunk: string };

/**
 * Stream a chat reply. When `reasoning` is true the model's thinking
 * channel is streamed too (type "think") before the answer — the
 * frontier-style visible reasoning. Off = maximum speed.
 */
export async function* veylaroChat(
  url: string,
  model: string,
  messages: ChatMsg[],
  sku: ModelId = "med",
  reasoning = false,
  signal?: AbortSignal,
  overrides: RuntimeOverrides = {}
): AsyncGenerator<StreamChunk> {
  const base = url.replace(/\/$/, "");
  const found = await discover(url, 1800);
  if (!found) throw new Error("the local engine is not ready");
  const selectedModel = selectInstalledModel(found.models, model, sku);
  if (!selectedModel) throw new Error(`the local endpoint does not provide Laro ${sku}`);

  const replyTokens = overrides.num_predict ?? optsFor(sku).num_predict;
  // The engine's REAL window wins over anything the caller believes. A caller's
  // hint is only a floor-of-last-resort for endpoints that don't report /props.
  const probed = await engineContextWindow(base, selectedModel);
  const numCtx = probed ?? overrides.num_ctx ?? optsFor(sku).num_ctx;
  const budget = budgetFor(numCtx, replyTokens);

  // THE FIX. llama.cpp does not truncate an over-long prompt, it refuses it with
  // HTTP 400 exceed_context_size_error — and for Gemma's sliding-window attention
  // it also refuses to enable KV cache shifting, so there is no server-side safety
  // net at all. Fitting here is what lets a long build run for as many steps as
  // the task needs instead of dying a few steps in.
  // Count with the engine's own vocabulary, not a divisor. This is what makes the
  // fit trustworthy enough to run a 20-step build against.
  const count = await exactCounter(base, messages);
  // Under the ceiling: send as-is, so the engine's prefix cache hits and only the
  // newly appended tokens are processed. Over it: compact well BELOW the ceiling
  // (see LOW_WATER) so the next several steps are cache hits again, instead of
  // paying a full multi-minute re-evaluation on every single step.
  const fitted = conversationTokens(messages, count) <= budget.prompt
    ? fitConversation(messages, budget.prompt, count)
    : fitConversation(messages, compactionTarget(budget.prompt), count);
  const body = (msgs: ChatMsg[]) => JSON.stringify({
    model: selectedModel,
    // Gemma's template REFUSES non-alternating roles with its own 400. Normalise
    // last, after fitting, because dropping messages can itself create a run of
    // same-role turns that did not exist in the original conversation.
    messages: normalizeForTemplate(msgs),
    stream: true,
    // A fixed seed makes agent retries reproducible.
    seed: overrides.seed ?? 42,
    max_tokens: budget.reply,
    temperature: overrides.temperature ?? optsFor(sku).temperature,
    top_p: overrides.top_p ?? optsFor(sku).top_p,
  });

  let sending = fitted.messages;
  let requestBody = body(sending);

  // Reliability: under memory pressure the engine can close the socket before it
  // answers ("Remote end closed connection without response"). That is safe to
  // retry ONLY before any token has streamed — once output has started a retry
  // would duplicate it, so we surface the error instead. Bounded, with backoff.
  //
  // A context overflow is retried differently: our token estimate was optimistic,
  // so we re-fit against a harder budget rather than backing off and repeating
  // the identical over-long request.
  const MAX_ATTEMPTS = 4;
  let squeeze = 1;
  for (let attempt = 1; ; attempt++) {
    let produced = false;
    try {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        signal,
      });
      if (!res.ok || !res.body) {
        let detail = "";
        try { detail = (await res.text()).slice(0, 400); } catch { /* body already consumed */ }
        throw new Error(`Laro engine responded ${res.status}${detail ? `: ${detail}` : ""}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
            if (!payload || payload === "[DONE]") return;
            const j = JSON.parse(payload);
            const think = j?.choices?.[0]?.delta?.reasoning_content || j?.choices?.[0]?.delta?.reasoning;
            if (think) { produced = true; yield { type: "think", chunk: think }; }
            const chunk = j?.choices?.[0]?.delta?.content;
            if (chunk) { produced = true; yield { type: "text", chunk }; }
            if (j?.choices?.[0]?.finish_reason) return;
          } catch {
            /* partial line — keep buffering */
          }
        }
      }
      return; // stream ended cleanly
    } catch (err) {
      if (!produced && attempt < MAX_ATTEMPTS && !signal?.aborted && isContextOverflow(err)) {
        // Our estimate under-counted. Halve the prompt allowance and re-fit; the
        // system contract and the user's request survive every squeeze.
        squeeze *= 2;
        const tighter = Math.max(512, Math.floor(budget.prompt / squeeze));
        const refit = fitConversation(sending, tighter, count);
        // No further reduction possible — surface it rather than spin.
        if (refit.tokens >= conversationTokens(sending, count)) throw err;
        sending = refit.messages;
        requestBody = body(sending);
        continue;
      }
      if (!produced && attempt < MAX_ATTEMPTS && !signal?.aborted && isTransientEngineError(err)) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
        continue;
      }
      throw err;
    }
  }
}

/** A connection that drops before answering is a transient engine hiccup (memory
    pressure, cold weights); a 4xx/5xx status or a real abort is not. */
function isTransientEngineError(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return /remote end closed|econnreset|connection (?:reset|closed|refused|aborted)|socket hang up|network error|fetch failed|load failed|terminated|premature close/.test(m);
}

export const LARO_SYSTEM_PROMPT = `You are Laro, the engine inside Veylaro Code — a local AI coding agent. Inference and project work run on the user's machine; optional search and account services are disclosed separately. Be sharp, warm and honest. Narrate what you do like a great pair-programmer: one plain-English line, then precise dev detail. Never invent file contents, command output, test results or benchmarks. When a task is ambiguous, ask at most four crisp questions, one at a time, then act. Lead with the answer; be fast.`;
