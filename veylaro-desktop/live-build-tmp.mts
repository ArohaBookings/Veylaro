/* A REAL build against the REAL engine, driven by the SHIPPED loop primitives:
   the same charter, the same @@FILE protocol, the same StreamParser, the same
   completion gate and step budget the desktop app uses. Files are written to disk.
   Nothing is simulated. */
import fs from "node:fs";
import path from "node:path";
import { veylaroChat, type ChatMsg } from "./src/engine/runtime.ts";
import { FILE_PROTOCOL_PROMPT, StreamParser, salvageFences } from "./src/engine/agentLoop.ts";
import { assessDeliverable, continuationBrief } from "./src/engine/completionGate.ts";
import { continuationPressure, stepPolicy, stopReason } from "./src/engine/stepBudget.ts";
import { enforcementBrief, isProtocolFailure } from "./src/engine/protocolEnforcer.ts";
import { laroContext, SOVEREIGN_FORGE_PROMPT } from "./src/engine/charter.ts";

const URL = "http://127.0.0.1:8080";
const SCOPE = process.argv[2];
const TASK = "Build a complete AI receptionist web app: a call-intake form (caller name, phone, reason, notes), a live list of today's bookings with edit and delete, availability slots, a search filter, empty/loading/error states, localStorage persistence, and a polished dark UI. Plain HTML/CSS/JS, no build step, opens straight in a browser.";
const TIER = "med" as const;

const plan = stepPolicy(TASK, TIER);
console.log(`task budget: soft=${plan.soft} hard=${plan.hard} — ${plan.note}`);

const sys: ChatMsg[] = [
  { role: "system", content: laroContext(16) + "\n\n" + SOVEREIGN_FORGE_PROMPT },
  { role: "system", content: FILE_PROTOCOL_PROMPT },
];
const convo: ChatMsg[] = [...sys, { role: "user", content: `[project folder: ${SCOPE}]\n${TASK}` }];

const deliverable = new Map<string, string>();
let step = 0;
let consecutiveIdle = 0;
let done = false;
const t0 = Date.now();

// Cap the wall clock for this test run — the product itself has no such limit.
const DEADLINE_MIN = 18;

while (!done) {
  const stop = stopReason(
    { step, consecutiveIdle, deliverableComplete: false, requestedDone: false, aborted: false },
    plan,
  );
  if (stop) { console.log(`\nstopped: ${stop}`); break; }
  if ((Date.now() - t0) / 60000 > DEADLINE_MIN) { console.log(`\nstopped: test wall-clock cap (${DEADLINE_MIN}m)`); break; }

  step++;
  const parser = new StreamParser();
  let raw = "";
  let wrote = 0;
  let requestedDone = false;
  const stepStart = Date.now();

  try {
    for await (const part of veylaroChat(URL, "", convo, TIER, false, undefined, {})) {
      if (part.type !== "text") continue;
      raw += part.chunk;
      for (const ev of parser.push(part.chunk)) {
        if (ev.t === "file") {
          const abs = path.join(SCOPE, ev.path.replace(/^([./\\])+/, ""));
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, ev.content, "utf8");
          deliverable.set(ev.path, ev.content);
          wrote++;
          console.log(`  wrote ${ev.path} (${ev.content.split("\n").length} lines)`);
        } else if (ev.t === "done") requestedDone = true;
      }
    }
  } catch (e: any) {
    console.log(`  STEP ${step} FAILED: ${String(e?.message).slice(0, 200)}`);
    break;
  }
  for (const ev of parser.flush()) {
    if (ev.t === "file") {
      const abs = path.join(SCOPE, ev.path.replace(/^([./\\])+/, ""));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, ev.content, "utf8");
      deliverable.set(ev.path, ev.content);
      wrote++;
    }
  }
  const salv = salvageFences(parser.liveNarration);
  for (const f of salv.files) {
    const abs = path.join(SCOPE, f.path.replace(/^([./\\])+/, ""));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.content, "utf8");
    deliverable.set(f.path, f.content);
    wrote++;
    console.log(`  salvaged ${f.path}`);
  }

  fs.writeFileSync(`/private/tmp/claude-501/-Volumes-Dev-SSD-Axon-AI--claude-worktrees-laro-training-benchmarks-e5ece7/c71a2e2a-8bc0-4f26-9152-eee76d9542ae/scratchpad/raw-step${step}.txt`, raw);
  const total = [...deliverable.values()].reduce((n, c) => n + c.split("\n").length, 0);
  console.log(`step ${step}: +${wrote} file(s), ${deliverable.size} total, ${total} lines, ${((Date.now() - stepStart) / 1000).toFixed(0)}s`);

  consecutiveIdle = wrote > 0 ? 0 : consecutiveIdle + 1;
  convo.push({ role: "assistant", content: raw });

  const verdict = assessDeliverable(TASK, [...deliverable].map(([p, c]) => ({ path: p, content: c })));
  if (requestedDone && verdict.complete) { done = true; console.log("\nstopped: complete (gate satisfied)"); break; }
  if (isProtocolFailure(wrote, 0)) {
    console.log(`  -> enforcing protocol (attempt ${consecutiveIdle})`);
    convo.push({ role: "user", content: enforcementBrief({
      request: TASK, missing: verdict.missing,
      existingPaths: [...deliverable.keys()], attempt: consecutiveIdle,
    }) });
    continue;
  }
  convo.push({
    role: "user",
    content: verdict.complete
      ? continuationPressure({ step, consecutiveIdle, deliverableComplete: true, requestedDone, aborted: false }, plan)
      : continuationBrief(verdict),
  });
}

const files = [...deliverable].map(([p, c]) => ({ path: p, content: c }));
const total = files.reduce((n, f) => n + f.content.split("\n").length, 0);
const verdict = assessDeliverable(TASK, files);
console.log(`\n=== RESULT after ${step} steps, ${((Date.now() - t0) / 60000).toFixed(1)} min ===`);
console.log(`files: ${files.length}   lines: ${total}`);
console.log(`gate: ${verdict.complete ? "SATISFIED" : "not yet — " + verdict.missing.length + " gap(s)"}`);
for (const m of verdict.missing.slice(0, 4)) console.log(`  - ${m.slice(0, 150)}`);
