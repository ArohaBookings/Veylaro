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
  if (/(?:laro|veylaro)[-_ ]?max|(?:^|[-_/ ])24b(?:$|[-_/ ])/i.test(value)) return "max";
  if (/(?:laro|veylaro)[-_ ]?med|(?:^|[-_/ ])12b(?:$|[-_/ ])/i.test(value)) return "med";
  if (/(?:laro|veylaro)[-_ ]?lite|qwen2\.?5?[-_. ]?coder[-_. ]?3b|gemma-4-e2b|(?:^|[-_/ ])3b(?:$|[-_/ ])|(?:^|[-_/ ])4b(?:$|[-_/ ])/i.test(value)) return "lite";
  return undefined;
}

export function selectInstalledModel(models: string[], preferred: string, sku: ModelId): string {
  const exact = models.find((model) => model === preferred || model.replace(/:latest$/, "") === preferred.replace(/:latest$/, ""));
  if (exact && tierFromModelName(exact) === sku) return exact;
  for (const wanted of modelPreference(sku)) {
    const hit = models.find((model) => model === wanted || model.startsWith(`${wanted}:`));
    if (hit && tierFromModelName(hit) === sku) return hit;
  }
  return "";
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
  if (sku === "lite") aliases.push("Qwen2.5-Coder-3B-Instruct-Q4_K_M", "mlx-community/Qwen2.5-Coder-3B-Instruct-4bit", "qwen2.5-coder:3b", "mlx-community/gemma-4-e2b-it-4bit");
  if (sku === "med") aliases.push("mlx-community/gemma-4-12B-it-4bit", "gemma4:12b");
  if (sku === "max") aliases.push("mlx-community/Devstral-Small-2-24B-Instruct-2512-OptiQ-4bit", "devstral:24b");
  return aliases;
}
const MODEL_PREFERENCE = [
  "laro-med", "laro-max", "laro-lite", "veylaro-code", "veylaro",
  "mlx-community/Qwen2.5-Coder-3B-Instruct-4bit", "qwen2.5-coder:3b",
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
  const requestBody = JSON.stringify({
    model: selectedModel,
    messages,
    stream: true,
    // mlx-lm 0.29.1's continuous BatchRotatingKVCache can corrupt the
    // second Gemma request when prompt lengths differ. A fixed seed routes
    // the server through its stable single-sequence generator and also
    // makes agent retries reproducible.
    seed: overrides.seed ?? 42,
    max_tokens: overrides.num_predict ?? optsFor(sku).num_predict,
    temperature: overrides.temperature ?? optsFor(sku).temperature,
    top_p: overrides.top_p ?? optsFor(sku).top_p,
  });

  // Reliability: under memory pressure mlx-lm can close the socket before it
  // answers ("Remote end closed connection without response"). That is safe to
  // retry ONLY before any token has streamed — once output has started a retry
  // would duplicate it, so we surface the error instead. Bounded, with backoff.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    let produced = false;
    try {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        signal,
      });
      if (!res.ok || !res.body) throw new Error(`Laro engine responded ${res.status}`);
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
