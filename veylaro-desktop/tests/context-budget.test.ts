import test from "node:test";
import assert from "node:assert/strict";
import {
  budgetFor,
  clampMessage,
  conversationTokens,
  estimateTokens,
  fitConversation,
  isContextOverflow,
} from "../src/engine/contextBudget";
import type { ChatMsg } from "../src/engine/runtime";

const sys = (n: number): ChatMsg => ({ role: "system", content: "S".repeat(n) });
const usr = (n: number, tag = "U"): ChatMsg => ({ role: "user", content: tag + "u".repeat(n) });
const asst = (n: number): ChatMsg => ({ role: "assistant", content: "a".repeat(n) });

test("a conversation that already fits is returned untouched", () => {
  const convo: ChatMsg[] = [sys(400), usr(200), asst(300)];
  const r = fitConversation(convo, 10000);
  assert.equal(r.trimmed, false);
  assert.equal(r.dropped, 0);
  assert.deepEqual(r.messages, convo);
});

test("the system contract and the original request always survive a trim", () => {
  const convo: ChatMsg[] = [
    sys(2000),
    usr(3000, "ORIGINAL-REQUEST"),
    ...Array.from({ length: 40 }, (_, i) => (i % 2 ? asst(9000) : usr(9000, `step${i}`))),
  ];
  const r = fitConversation(convo, 4000);
  assert.ok(r.trimmed);
  assert.ok(r.dropped > 0);
  assert.equal(r.messages.filter((m) => m.role === "system").length, 1);
  const joined = r.messages.map((m) => m.content).join("\n");
  assert.ok(joined.includes("ORIGINAL-REQUEST"), "the user's actual task must never be dropped");
});

test("the fitted result respects the budget for realistic agent-loop growth", () => {
  // Reproduces the shipped failure: the loop appended the model's full reply plus
  // @@READ output (7000 chars) and @@RUN output (3500 chars) every step, forever.
  const convo: ChatMsg[] = [sys(6000), usr(500, "build me an AI receptionist")];
  for (let step = 0; step < 25; step++) {
    convo.push(asst(8000));
    convo.push(usr(7000, "FILE src/App.tsx:"));
    convo.push(usr(3500, "COMMAND $ npm test"));
  }
  const raw = conversationTokens(convo);
  assert.ok(raw > 100_000, `precondition: unbounded growth is huge (was ${raw})`);

  for (const numCtx of [8192, 16384, 32768, 65536, 131072]) {
    const budget = budgetFor(numCtx, 2048);
    const r = fitConversation(convo, budget.prompt);
    assert.ok(
      r.tokens <= budget.prompt,
      `n_ctx=${numCtx}: fitted to ${r.tokens} tokens, budget was ${budget.prompt}`,
    );
    assert.ok(r.tokens + budget.reply < numCtx, `n_ctx=${numCtx}: prompt+reply must leave headroom`);
  }
});

test("budget never lets the reply allocation starve the prompt", () => {
  const b = budgetFor(4096, 999999);
  assert.ok(b.reply <= Math.floor(4096 * 0.4));
  assert.ok(b.prompt >= 512);
  assert.ok(b.prompt + b.reply < 4096);
});

test("a single oversized message is clamped, not dropped", () => {
  const huge = usr(500_000, "HEAD-MARKER");
  const clamped = clampMessage(huge, 1000);
  assert.ok(clamped.content.length < huge.content.length);
  assert.ok(clamped.content.startsWith("HEAD-MARKER"), "the head identifies what this was");
  assert.ok(/elided to fit the context window/.test(clamped.content));
  assert.ok(estimateTokens(clamped.content) <= 1000);
});

test("history never opens with a dangling assistant turn", () => {
  const convo: ChatMsg[] = [sys(200), asst(60000), asst(60000), usr(200, "latest")];
  const r = fitConversation(convo, 500);
  const firstNonSystem = r.messages.find((m) => m.role !== "system");
  assert.notEqual(firstNonSystem?.role, "assistant");
});

test("a trim leaves a marker so the model knows history was compacted", () => {
  const convo: ChatMsg[] = [sys(100), usr(100, "task"), ...Array.from({ length: 30 }, () => asst(9000)), usr(100, "now")];
  const r = fitConversation(convo, 1500);
  const joined = r.messages.map((m) => m.content).join("\n");
  assert.ok(/were compacted to stay inside the context window/.test(joined));
  assert.ok(/still count as done/.test(joined), "must stop the model rewriting finished files");
});

test("llama.cpp's real overflow refusal is recognised as recoverable", () => {
  // Verbatim from the shipped engine — this is the error users actually saw.
  const real = new Error(
    'Laro engine responded 400: {"error":{"code":400,"message":"request (20015 tokens) exceeds the available context size (16384 tokens), try increasing it","type":"exceed_context_size_error","n_prompt_tokens":20015,"n_ctx":16384}}',
  );
  assert.equal(isContextOverflow(real), true);
  assert.equal(isContextOverflow(new Error("Laro engine responded 500")), false);
  assert.equal(isContextOverflow(new Error("socket hang up")), false);
});

test("token estimate over-counts rather than under-counts on real source", () => {
  const code = `export function hello(name: string): string {\n  return \`hi \${name}\`;\n}\n`.repeat(50);
  // Gemma tokenises source at roughly 3.6-4.2 chars/token; we must not guess above that.
  const actualLowerBound = code.length / 4.2;
  assert.ok(estimateTokens(code) >= actualLowerBound, "estimate must be conservative");
});
