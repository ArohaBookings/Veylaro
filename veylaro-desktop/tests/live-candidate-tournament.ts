import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { extractRepairFiles } from "../src/engine/repairCandidates";
import { synthesizeSemanticRepairs } from "../src/engine/semanticRepair";

const root = resolve("tests/fixtures/debug-project");
const source = resolve(root, "src/cart.js");
const testFile = resolve(root, "test/cart.test.js");
const original = readFileSync(source, "utf8");
const endpoint = process.env.VEYLARO_ENGINE_URL || "http://127.0.0.1:8080";
const model = process.env.VEYLARO_ENGINE_MODEL || "mlx-community/gemma-3-text-4b-it-4bit";

function runTests() {
  try {
    return { ok: true, out: execFileSync("npm", ["test"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (error: any) {
    return { ok: false, out: `${error?.stdout || ""}\n${error?.stderr || ""}`.trim() };
  }
}

function fileFrom(output: string): string | null {
  return extractRepairFiles(output, ["src/cart.js"])[0]?.content || null;
}

const failure = runTests();
if (failure.ok) throw new Error("fixture must fail before the tournament");

const seeds = [1, 7, 19, 42, 97];
let winner: string | null = null;
try {
  for (const seed of seeds) {
    const response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        seed,
        temperature: 0.25,
        max_tokens: 320,
        messages: [
          {
            role: "system",
            content: "You repair existing JavaScript from execution evidence. Never edit tests or invent files. Return exactly one complete source file as @@FILE src/cart.js, then code, then @@END. No explanation.",
          },
          {
            role: "user",
            content: `Failing test output:\n${failure.out.slice(0, 2400)}\n\nUNCHANGED TEST:\n${readFileSync(testFile, "utf8")}\n\nCURRENT SOURCE:\n${original}\n\nFind the smallest source-only repair. Check the percentage arithmetic and return a number, not a string.`,
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`engine HTTP ${response.status}`);
    const body: any = await response.json();
    const output = String(body?.choices?.[0]?.message?.content || "");
    const candidate = fileFrom(output);
    if (!candidate) {
      console.log(`seed ${seed}: protocol rejected`);
      continue;
    }
    writeFileSync(source, candidate, "utf8");
    const result = runTests();
    console.log(`seed ${seed}: ${result.ok ? "PASS" : "fail"}`);
    if (!result.ok && process.env.VEYLARO_DEBUG_CANDIDATES === "1") {
      console.log(candidate.slice(0, 1200));
      console.log(result.out.slice(0, 900));
    }
    if (result.ok) {
      winner = `model-seed-${seed}`;
      break;
    }
    writeFileSync(source, original, "utf8");
  }
  if (winner === null) {
    const semantic = synthesizeSemanticRepairs("src/cart.js", original, failure.out);
    for (let index = 0; index < semantic.length; index++) {
      writeFileSync(source, semantic[index].content, "utf8");
      const result = runTests();
      console.log(`semantic ${index + 1}: ${result.ok ? "PASS" : "fail"}`);
      if (result.ok) {
        winner = `semantic-${index + 1}`;
        break;
      }
      writeFileSync(source, original, "utf8");
    }
  }
  console.log(JSON.stringify({ modelCandidates: seeds.length, winner, passed: winner !== null }, null, 2));
  if (winner === null) process.exitCode = 1;
} finally {
  writeFileSync(source, original, "utf8");
}
