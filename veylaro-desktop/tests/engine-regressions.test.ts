import assert from "node:assert/strict";
import test from "node:test";

import { StreamParser } from "../src/engine/agentLoop";
import { truthCappedVisualScore } from "../src/engine/functionalGate";
import { cleanAssistantText, collapseReason } from "../src/engine/outputHygiene";
import { extractRepairFiles } from "../src/engine/repairCandidates";
import { synthesizeSemanticRepairs } from "../src/engine/semanticRepair";
import { selectInstalledModel, tierFromModelName } from "../src/engine/runtime";
import { explicitlyRequestsTestEdits, isProtectedTestPath } from "../src/engine/testIntegrity";
import { planForMemory, pressureVerdict } from "../src/engine/memoryGuard";

test("agent protocol returns repository reads and commands as structured events", () => {
  const parser = new StreamParser();
  const events = parser.push("🔎 inspecting first\n@@READ src/App.tsx\n@@RUN npm test\n@@DONE\n");

  assert.deepEqual(events, [
    { t: "narrate", text: "🔎 inspecting first" },
    { t: "read", path: "src/App.tsx" },
    { t: "run", cmd: "npm test" },
    { t: "done" },
  ]);
});

test("repetition collapse is rejected and cleaned output stays bounded", () => {
  const damaged = "</> ".repeat(40);
  assert.match(collapseReason(damaged) || "", /repeat|protocol/i);
  assert.equal(cleanAssistantText(damaged, 120), "");
});

test("model control tokens never leak into chat", () => {
  assert.equal(cleanAssistantText("Hey there! <end_of_turn>"), "Hey there!");
});

test("runtime evidence caps a visually attractive but crashed page", () => {
  const crashed = {
    bodyLen: 900,
    jsErrors: ["ReferenceError: app is not defined"],
    buttons: 4,
    testedButtons: 2,
    skippedButtons: 2,
    deadButtons: [],
    inputs: 0,
    usesStorage: false,
  };
  assert.equal(truthCappedVisualScore(94, crashed), 10);
});

test("runtime evidence caps a facade whose safe controls are all dead", () => {
  const facade = {
    bodyLen: 900,
    jsErrors: [],
    buttons: 5,
    testedButtons: 2,
    skippedButtons: 3,
    deadButtons: ["Open menu", "Next"],
    inputs: 0,
    usesStorage: false,
  };
  assert.equal(truthCappedVisualScore(91, facade), 35);
});

test("repair recovery accepts one unambiguous bare source fence", () => {
  const files = extractRepairFiles("```javascript\nexport const fixed = true;\n```", ["src/cart.js"]);
  assert.deepEqual(files, [{ path: "src/cart.js", content: "export const fixed = true;" }]);
});

test("repair recovery rejects ambiguous fences and unknown paths", () => {
  assert.deepEqual(extractRepairFiles("```js\none()\n```\n```js\ntwo()\n```", ["src/cart.js"]), []);
  assert.deepEqual(extractRepairFiles("@@FILE test/cart.test.js\nchanged\n@@END\n", ["src/cart.js"]), []);
});

test("repair recovery rejects incomplete placeholder replacements", () => {
  assert.deepEqual(extractRepairFiles("```js\nexport function total() {}\n// rest unchanged\n```", ["src/cart.js"]), []);
});

test("semantic repair generates bounded percentage candidates from observed source", () => {
  const source = `export function total(lines, coupon) {\n  const subtotal = lines.reduce((sum, line) => sum + line.price, 0);\n  const discount = coupon?.percent || 0;\n  return subtotal - discount;\n}`;
  const candidates = synthesizeSemanticRepairs("src/cart.js", source, "AssertionError: expected 45, actual 40");
  assert.equal(candidates.length, 2);
  assert.match(candidates[0].content, /subtotal \* \(discount \/ 100\)/);
  assert.ok(candidates.every((candidate) => candidate.path === "src/cart.js"));
});

test("semantic repair stays off without percentage semantics or execution evidence", () => {
  assert.deepEqual(synthesizeSemanticRepairs("src/cart.js", "return total - discount;", "expected 3 actual 2"), []);
  assert.deepEqual(synthesizeSemanticRepairs("src/cart.js", "const discount = coupon?.percent; return total - discount;", "looks odd"), []);
});

test("semantic repair derives a bounded error-message candidate from real assertion evidence", () => {
  const source = `function move() { throw new Error("Invalid move: Game already finished."); }`;
  const failure = `The input did not match the regular expression /Game finished/. Input:\n\n'Error: Invalid move: Game already finished.'`;
  assert.deepEqual(synthesizeSemanticRepairs("src/game.cjs", source, failure), [
    { path: "src/game.cjs", content: `function move() { throw new Error("Game finished"); }` },
  ]);
});

test("semantic repair will not turn arbitrary regex assertions into source rewrites", () => {
  const source = `throw new Error("actual value");`;
  const failure = `The input did not match the regular expression /.*danger.*/. Input:\n'Error: actual value'`;
  assert.deepEqual(synthesizeSemanticRepairs("src/game.cjs", source, failure), []);
});

test("the live checkpoint name determines the truthful product tier", () => {
  assert.equal(tierFromModelName("mlx-community/gemma-3-text-4b-it-4bit"), "lite");
  assert.equal(tierFromModelName("mlx-community/gemma-4-e2b-it-4bit"), "lite");
  assert.equal(tierFromModelName("laro-med-12b-q4"), "med");
  assert.equal(tierFromModelName("veylaro-max-24b"), "max");
  assert.equal(tierFromModelName("unknown-model"), undefined);
});

test("the runtime never silently routes a tier to another installed checkpoint", () => {
  const installed = [
    "mlx-community/Qwen2-VL-2B-Instruct-4bit",
    "mlx-community/gemma-4-e2b-it-4bit",
    "mlx-community/gemma-3-text-4b-it-4bit",
    "mlx-community/gemma-4-12B-it-4bit",
    "mlx-community/Devstral-Small-2-24B-Instruct-2512-OptiQ-4bit",
  ];
  assert.equal(selectInstalledModel(installed, "veylaro-code", "lite"), "mlx-community/gemma-4-e2b-it-4bit");
  assert.equal(selectInstalledModel(installed, "mlx-community/gemma-3-text-4b-it-4bit", "lite"), "mlx-community/gemma-3-text-4b-it-4bit");
  assert.equal(selectInstalledModel(installed, installed[1], "med"), installed[3]);
  assert.equal(selectInstalledModel(installed, installed[1], "max"), installed[4]);
  assert.equal(selectInstalledModel([installed[1]], installed[1], "med"), "");
});

test("memory planning actually downshifts oversized tiers on a 16 GB Mac", () => {
  assert.equal(planForMemory("max", 16).model, "med");
  assert.equal(planForMemory("lite", 8).model, "lite");
});

test("live pressure verdict reaches a hard stop only on clear danger", () => {
  assert.equal(pressureVerdict(2, 52), "ok");
  assert.equal(pressureVerdict(1, 15), "watch");
  assert.equal(pressureVerdict(0.5, 7), "critical");
});

test("negated test instructions keep the test-integrity lock enabled", () => {
  assert.equal(explicitlyRequestsTestEdits("Fix the bug but do not change tests."), false);
  assert.equal(explicitlyRequestsTestEdits("Fix the failing test by changing source only."), false);
  assert.equal(explicitlyRequestsTestEdits("Add tests for the new retry behavior."), true);
});

test("test-integrity paths include common runners and naming conventions", () => {
  for (const path of [
    "tests/cart.test.js", "src/cart.spec.ts", "test_math.py", "pkg/order_test.go",
    "conftest.py", "vitest.config.ts", "package.json", "pnpm-lock.yaml",
  ]) assert.equal(isProtectedTestPath(path), true, path);
  assert.equal(isProtectedTestPath("src/cart.ts"), false);
});

test("an unterminated file block never becomes a filesystem event", () => {
  const parser = new StreamParser();
  assert.deepEqual([...parser.push("@@FILE src/cart.js\nexport const broken ="), ...parser.flush()], []);
});
