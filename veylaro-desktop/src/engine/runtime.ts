/* ============================================================
   Live inference adapter — Veylaro Code's real engine.
   Talks to the local the Veylaro engine server; the shipped model identity
   is "veylaro-code" (see model/Modelfile.veylaro-code — fully
   plug-and-play: retrain the base, re-run `veylaro create`, done).

   Speed tuning:
   - think:false        Gemma4 spends its whole budget in the hidden
                        thinking channel otherwise (empty replies).
   - keep_alive 30m     weights stay hot between messages → no reload.
   - warmup()           pre-loads the model at app start so the first
                        real message streams instantly.
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

type RuntimeOverrides = Partial<ReturnType<typeof optsFor>>;

/** Preferred shipped model names per tier, best first. The tier's own
    modelTag wins; the legacy names keep older installs working. */
export function modelPreference(sku: ModelId): string[] {
  return [TIER_BY_ID[sku].modelTag, `veylaro-${sku}`, "veylaro-code", "veylaro"];
}
const MODEL_PREFERENCE = ["laro-med", "laro-max", "laro-lite", "veylaro-code", "veylaro"];

export async function engineAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Find the best installed Veylaro model, or null if none. */
export async function detectLiveModel(url: string): Promise<string | null> {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const j = await res.json();
    const names: string[] = (j?.models || []).map((m: any) => String(m?.name || ""));
    for (const want of MODEL_PREFERENCE) {
      const hit = names.find((n) => n === want || n.startsWith(`${want}:`));
      if (hit) return hit;
    }
    return null;
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
    await fetch(`${url.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "", stream: false, keep_alive: "10m", options: { num_predict: 1 } }),
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
    await fetch(`${url.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "", stream: false, keep_alive: 0 }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* best effort — if the engine's already gone, nothing to unload */
  }
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
  const res = await fetch(`${url.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      think: reasoning,
      keep_alive: runtimeFor(sku).keepAlive,
      options: { ...optsFor(sku), ...overrides },
    }),
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
        const j = JSON.parse(line);
        const think = j?.message?.thinking;
        if (think) yield { type: "think", chunk: think };
        const chunk = j?.message?.content;
        if (chunk) yield { type: "text", chunk };
        if (j?.done) return;
      } catch {
        /* partial line — keep buffering */
      }
    }
  }
}

export const LARO_SYSTEM_PROMPT = `You are Laro, the engine inside Veylaro Code — a local AI coding agent. Inference and project work run on the user's machine; optional search and account services are disclosed separately. Be sharp, warm and honest. Narrate what you do like a great pair-programmer: one plain-English line, then precise dev detail. Never invent file contents, command output, test results or benchmarks. When a task is ambiguous, ask at most four crisp questions, one at a time, then act. Lead with the answer; be fast.`;
