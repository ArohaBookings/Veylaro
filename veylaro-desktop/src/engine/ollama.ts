/* ============================================================
   Live inference adapter — Veylaro Code's real engine.
   Talks to the local Ollama server; the shipped model identity
   is "veylaro-code" (see model/Modelfile.veylaro-code — fully
   plug-and-play: retrain the base, re-run `ollama create`, done).

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

/** Per-SKU tuning: Lite trades ceiling for snap; Max gets full depth.
    When a dedicated veylaro-code-lite model ships, MODEL_PREFERENCE
    picks it up automatically — until then Lite runs the same weights
    with a tighter budget so it *feels* featherweight. */
const SKU_OPTS = {
  lite: { temperature: 0.3, num_predict: 512, top_p: 0.9, num_ctx: 4096 },
  max: { temperature: 0.3, num_predict: 1024, top_p: 0.9 },
} as const;
const KEEP_ALIVE = "30m";

/** Preferred shipped model names, best first. */
const MODEL_PREFERENCE = ["veylaro-code", "veylaro"];
export const LITE_MODEL_PREFERENCE = ["veylaro-code-lite", "veylaro-lite"];

export async function ollamaAlive(url: string): Promise<boolean> {
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

/** Pre-load the weights so the first user message streams instantly. */
export async function warmup(url: string, model: string): Promise<void> {
  try {
    await fetch(`${url.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "", stream: false, keep_alive: KEEP_ALIVE, options: { num_predict: 1 } }),
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    /* warmup is best-effort */
  }
}

export type StreamChunk = { type: "think" | "text"; chunk: string };

/**
 * Stream a chat reply. When `reasoning` is true the model's thinking
 * channel is streamed too (type "think") before the answer — the
 * frontier-style visible reasoning. Off = maximum speed.
 */
export async function* ollamaChat(
  url: string,
  model: string,
  messages: ChatMsg[],
  sku: "lite" | "max" = "max",
  reasoning = false,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const res = await fetch(`${url.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      think: reasoning,
      keep_alive: KEEP_ALIVE,
      options: SKU_OPTS[sku],
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

export const LARO_SYSTEM_PROMPT = `You are Laro, the engine inside Veylaro Code — a local AI coding agent that runs entirely on the user's machine. Private by physics. Be sharp, warm and honest. Narrate what you do like a great pair-programmer: one plain-English line, then precise dev detail. Never invent file contents, command output, test results or benchmarks. When a task is ambiguous, ask at most four crisp questions, one at a time, then act. Lead with the answer; be fast.`;
