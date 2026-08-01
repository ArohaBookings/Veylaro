import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";

import { FILE_PROTOCOL_PROMPT, StreamParser } from "../src/engine/agentLoop";

const root = resolve("tests/fixtures/debug-project");
const sourcePath = resolve(root, "src/cart.js");
const original = readFileSync(sourcePath, "utf8");
const endpoint = process.env.VEYLARO_ENGINE_URL || "http://127.0.0.1:8080";
const model = process.env.VEYLARO_ENGINE_MODEL || "mlx-community/gemma-3-text-4b-it-4bit";

function tests(): { ok: boolean; output: string } {
  try {
    const output = execFileSync("npm", ["test"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, output };
  } catch (error: any) {
    return { ok: false, output: `${error?.stdout || ""}\n${error?.stderr || ""}`.trim() };
  }
}

async function ask(messages: Array<{ role: string; content: string }>): Promise<string> {
  const started = performance.now();
  const response = await fetch(`${endpoint}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, seed: 42, temperature: 0, max_tokens: 700 }),
  });
  if (!response.ok) throw new Error(`engine HTTP ${response.status}: ${await response.text()}`);
  const body: any = await response.json();
  const content = String(body?.choices?.[0]?.message?.content || "");
  console.log(`model turn ${Math.round(performance.now() - started)}ms, ${content.length} chars`);
  return content;
}

function events(output: string) {
  const parser = new StreamParser();
  return [...parser.push(output.endsWith("\n") ? output : output + "\n"), ...parser.flush()];
}

const before = tests();
if (before.ok) throw new Error("fixture is not broken; the smoke test is invalid");

const messages = [
  {
    role: "system",
    content: `You are Laro in a strict repository-repair evaluation. ${FILE_PROTOCOL_PROMPT}\n\nContract: fix source code only; never edit tests; inspect unknown files with @@READ; make the smallest correct change.`,
  },
  {
    role: "user",
    content: `Fix the failing test in this existing project. Root entries: package.json, src/, test/.\n\nObserved reproduction:\n${before.output.slice(0, 3500)}\n\nOBSERVED FILE test/cart.test.js:\n${readFileSync(resolve(root, "test/cart.test.js"), "utf8")}\n\nOBSERVED FILE src/cart.js:\n${original}\n\nUse only these real files. Make the smallest source repair and do not edit tests.`,
  },
];

let wrote = false;
let sourceObserved = true;
try {
  for (let turn = 0; turn < 4 && !wrote; turn++) {
    const output = await ask(messages);
    console.log(output.slice(0, 1800));
    messages.push({ role: "assistant", content: output });
    const observed: string[] = [];
    let sawSourceThisTurn = false;
    for (const event of events(output)) {
      if (event.t === "read") {
        const target = resolve(root, event.path);
        if (target !== root && !target.startsWith(root + sep)) {
          observed.push(`FILE ${event.path}: read blocked (outside project)`);
        } else if (!existsSync(target)) {
          observed.push(`FILE ${event.path}: read failed (file does not exist)`);
        } else {
          observed.push(`FILE ${event.path}:\n${readFileSync(target, "utf8").slice(0, 7000)}`);
          if (target === sourcePath) sawSourceThisTurn = true;
        }
      }
      if (event.t === "file") {
        if (event.path !== "src/cart.js") {
          observed.push(`EDIT ${event.path || "(missing path)"}: rejected by the test-integrity/blast-radius gate`);
          continue;
        }
        if (!sourceObserved) {
          observed.push("EDIT src/cart.js: rejected because the source had not been observed on an earlier turn");
          continue;
        }
        if (!event.content.includes("orderTotal")) throw new Error("smoke harness rejected malformed source replacement");
        writeFileSync(sourcePath, event.content, "utf8");
        wrote = true;
      }
    }
    if (!wrote) {
      if (!observed.length) throw new Error("model neither inspected nor repaired the source");
      messages.push({ role: "user", content: `Real tool result:\n${observed.join("\n\n")}\n\nContinue from the evidence. Read src/cart.js if you have not observed it. Only then write the smallest complete source repair with @@FILE src/cart.js ... @@END.` });
      if (sawSourceThisTurn) sourceObserved = true;
    }
  }

  let after = tests();
  let repairs = 0;
  while (wrote && !after.ok && repairs < 2) {
    repairs++;
    messages.push({
      role: "user",
      content: `Reality check failed after your patch:\n${after.output.slice(0, 3500)}\n\nCURRENT OBSERVED SOURCE src/cart.js:\n${readFileSync(sourcePath, "utf8")}\n\nRepair the source from this exact evidence. Do not edit tests. Output one complete @@FILE src/cart.js block.`,
    });
    const repair = await ask(messages);
    console.log(repair.slice(0, 1800));
    messages.push({ role: "assistant", content: repair });
    let applied = false;
    for (const event of events(repair)) {
      if (event.t === "file" && event.path === "src/cart.js" && event.content.includes("orderTotal")) {
        writeFileSync(sourcePath, event.content, "utf8");
        applied = true;
      }
    }
    if (!applied) break;
    after = tests();
  }
  console.log(JSON.stringify({ reproduced: !before.ok, sourceEdit: wrote, repairPasses: repairs, testsPass: after.ok }, null, 2));
  if (!wrote || !after.ok) {
    console.error(after.output);
    process.exitCode = 1;
  }
} finally {
  writeFileSync(sourcePath, original, "utf8");
}
