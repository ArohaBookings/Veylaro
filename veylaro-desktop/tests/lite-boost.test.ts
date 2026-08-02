import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceError,
  checkInProcess,
  canSyntaxCheck,
  syntaxCheckCommand,
  candidateBudget,
  liteReinforced,
  candidateSeeds,
  pickBest,
  candidateScore,
  syntaxRepairBrief,
  wroteCodeButNoFile,
  protocolRepairBrief,
  type Candidate,
} from "../src/engine/liteBoost";

test("lite reinforcement is gated to the Lite tier only", () => {
  assert.equal(liteReinforced("lite"), true);
  assert.equal(liteReinforced("med"), false);
  assert.equal(liteReinforced("max"), false);
  assert.equal(candidateBudget("lite"), 3);
  assert.equal(candidateBudget("med"), 1);
  assert.equal(candidateBudget("max"), 1);
});

test("the syntax gate catches the exact measured Lite failure (an extra close paren)", () => {
  const broken =
    "function create(context){\n" +
    "  if (!context || (!context.actor || (context.actor.role !== 'owner' && context.actor.role !== 'admin')))) {\n" +
    "    return null;\n" +
    "  }\n" +
    "}\n";
  const err = balanceError(broken);
  assert.ok(err, "an unbalanced bracket must be reported");
  assert.match(err!, /'\)'|mismatched|unbalanced/i);
});

test("the syntax gate does not false-positive on brackets inside strings, comments, or templates", () => {
  assert.equal(balanceError("function f(a){ return (a && (a.b || (a.c && a.d))); }"), null);
  assert.equal(balanceError("const s = 'a)b(c]'; const t = \")))\"; foo();"), null);
  assert.equal(balanceError("// a ) in a comment (really]\nconst x = (1 + 2);"), null);
  assert.equal(balanceError("const y = `a ${x}`; foo({ a: [1, 2] });"), null);
});

test("the syntax gate reports an unclosed opener", () => {
  const err = balanceError("function g(){ if (x) { return 1; }");
  assert.ok(err && /unclosed/i.test(err));
});

test("JSON is checked authoritatively in-process", () => {
  assert.equal(checkInProcess("data.json", '{"a":1}'), null);
  assert.ok(checkInProcess("data.json", '{"a":1,}'));
});

test("only known file kinds are syntax-checkable, and JS uses node --check", () => {
  assert.equal(canSyntaxCheck("src/x.cjs"), true);
  assert.equal(canSyntaxCheck("src/x.tsx"), true);
  assert.equal(canSyntaxCheck("src/x.py"), false);
  assert.equal(syntaxCheckCommand("src/x.cjs"), "node --check src/x.cjs");
  assert.equal(syntaxCheckCommand("src/x.tsx"), null); // TS is checked in-process
});

test("distinct seeds produce genuinely different candidate samples", () => {
  const s = candidateSeeds(3);
  assert.equal(s.length, 3);
  assert.equal(new Set(s).size, 3);
});

test("best-of-N selects on execution evidence, never on hidden tests", () => {
  const cands: Candidate[] = [
    { seed: 1, files: ["a.cjs"], parses: false, verifyPassed: 0, verifyTotal: 2, crashed: true },
    { seed: 2, files: ["a.cjs"], parses: true, verifyPassed: 1, verifyTotal: 2, crashed: false },
    { seed: 3, files: ["a.cjs"], parses: true, verifyPassed: 2, verifyTotal: 2, crashed: false },
  ];
  assert.equal(pickBest(cands), 2);
  // a parsing candidate always beats a non-parsing one regardless of other signal
  assert.ok(candidateScore(cands[1]) > candidateScore(cands[0]));
});

test("protocol enforcer detects 'wrote code but saved no file' and ignores clean turns", () => {
  // code in a fence but no @@FILE block, nothing written -> must be caught
  assert.equal(wroteCodeButNoFile("Here you go:\n```js\nfunction add(a,b){return a+b}\n```", 0), true);
  // bare prose code, nothing written -> caught
  assert.equal(wroteCodeButNoFile("export const x = () => 1;", 0), true);
  // a file WAS written this turn -> not a protocol failure
  assert.equal(wroteCodeButNoFile("```js\nfoo()\n```", 1), false);
  // plain conversation, no code -> not a protocol failure
  assert.equal(wroteCodeButNoFile("Sure, what should the page look like?", 0), false);
});

test("the protocol repair brief demands exactly the @@FILE shape and forbids prose/fences", () => {
  const b = protocolRepairBrief();
  assert.match(b, /@@FILE/);
  assert.match(b, /@@END/);
  assert.match(b, /No prose|no markdown fences|no diff/i);
});

test("the syntax repair brief is surgical and names the file + error", () => {
  const brief = syntaxRepairBrief("src/projects.cjs", "Mismatched ')' at line 2");
  assert.match(brief, /src\/projects\.cjs/);
  assert.match(brief, /Mismatched/);
  assert.match(brief, /@@FILE/);
});
