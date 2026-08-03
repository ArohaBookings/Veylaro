import test from "node:test";
import assert from "node:assert/strict";
import { continuationPressure, stepPolicy, stopReason, shouldPushToClose } from "../src/engine/stepBudget";
import { ambitionFloor, assessDeliverable } from "../src/engine/completionGate";

const idle = (n: number) => ({ step: 5, consecutiveIdle: n, deliverableComplete: false, requestedDone: false, aborted: false });

test("the budget scales with the ask — a SaaS gets far more room than a tweak", () => {
  const tweak = stepPolicy("rename this variable", "med");
  const ui = stepPolicy("build an ai receptionist ui", "med");
  const saas = stepPolicy("build a complete end-to-end saas platform from scratch", "med");

  assert.ok(ui.soft > tweak.soft, "a real interface needs more steps than a rename");
  assert.ok(saas.soft > ui.soft, "a whole product needs more steps than one screen");
  // The owner's stated expectation: "a full saas is prolly 10k plus lines and it
  // should know that". The budget must be able to physically reach that.
  assert.ok(saas.hard * 130 > 10000, `a full product can only reach ${saas.hard * 130} lines`);
});

test("the completion gate knows how big real things are", () => {
  // A full SaaS is five figures of code, a game is thousands, an interface is
  // hundreds. These floors are what stop the model calling an outline "done".
  assert.ok(ambitionFloor("build a complete saas platform from scratch").lines >= 5000);
  assert.ok(ambitionFloor("build minecraft").lines >= 2000);
  assert.ok(ambitionFloor("build an ai receptionist ui").lines >= 500);
  // The measured real-world failure: a 227-byte <h1>AI Receptionist</h1> and a
  // 57-line "receptionist UI" must both be rejected.
  const thin = assessDeliverable("get started on the ai receptionist ui", [
    { path: "src/App.tsx", content: "export default () => <h1>AI Receptionist</h1>;" },
  ]);
  assert.equal(thin.complete, false);
  const fiftySeven = assessDeliverable("build an ai receptionist ui", [
    { path: "src/App.tsx", content: "const a = 1;\n".repeat(57) },
  ]);
  assert.equal(fiftySeven.complete, false, "57 lines is not an AI receptionist");
});

test("the old fixed ceiling is gone — no ask is capped at 22 steps", () => {
  // The shipped loop used maxSteps = 12..22 regardless of the request. That cap
  // ended real builds mid-file. Nothing may reintroduce it.
  for (const req of [
    "build a complete saas platform end to end",
    "build minecraft",
    "build a full ai receptionist product with booking, calendar and admin",
  ]) {
    for (const sku of ["lite", "med", "max"] as const) {
      const p = stepPolicy(req, sku);
      assert.ok(p.hard > 22, `${sku} "${req}" hard ceiling was ${p.hard} — that is still an ambition cap`);
    }
  }
});

test("the budget always allows reaching the completion gate's own floor", () => {
  // Budget and finish line must agree, or the loop can run out of turns while
  // the gate still says "not done" — which is exactly how a build dies mid-way.
  const request = "build a complete saas platform from scratch";
  const p = stepPolicy(request, "med");
  // A step lands ~130 lines on med; the gate wants 1500+ for this ask.
  const bar = ambitionFloor(request);
  const reachable = p.hard * 130;
  // Build exactly what the gate says this ask needs and confirm the budget can
  // physically produce it — budget and finish line must agree.
  const perFile = Math.ceil(bar.lines / bar.files);
  const verdict = assessDeliverable(
    request,
    Array.from({ length: bar.files }, (_, i) => ({ path: `src/Page${i}.tsx`, content: "x\n".repeat(perFile) })),
  );
  assert.ok(reachable >= bar.lines, `budget reaches ${reachable} lines, gate wants ${bar.lines}`);
  assert.ok(
    verdict.missing.every((m) => !/needs roughly/.test(m)),
    `the hard ceiling (${p.hard} steps ~ ${reachable} lines) cannot reach the gate's floor`,
  );
});

test("a run stops when it is genuinely done, not when a counter expires", () => {
  const p = stepPolicy("build a dashboard", "med");
  assert.equal(stopReason({ step: 3, consecutiveIdle: 0, deliverableComplete: true, requestedDone: true, aborted: false }, p), "complete");
  // @@DONE without a satisfying artifact is NOT completion.
  assert.equal(stopReason({ step: 3, consecutiveIdle: 0, deliverableComplete: false, requestedDone: true, aborted: false }, p), null);
  // Deep into a long build, still working -> keep going. Well past the old
  // hard-wired 22-step cap, which is the whole point.
  assert.ok(p.hard > 22);
  assert.equal(stopReason({ step: p.hard - 1, consecutiveIdle: 0, deliverableComplete: false, requestedDone: false, aborted: false }, p), null);
});

test("a stalled run stops instead of spinning forever", () => {
  const p = stepPolicy("build a dashboard", "med");
  assert.equal(stopReason(idle(p.stallLimit - 1), p), null);
  assert.equal(stopReason(idle(p.stallLimit), p), "stalled");
});

test("the user's stop always wins", () => {
  const p = stepPolicy("build a dashboard", "med");
  assert.equal(stopReason({ step: 1, consecutiveIdle: 0, deliverableComplete: true, requestedDone: true, aborted: true }, p), "aborted");
});

test("the runaway backstop still exists", () => {
  const p = stepPolicy("tweak", "lite");
  assert.equal(stopReason({ step: p.hard, consecutiveIdle: 0, deliverableComplete: false, requestedDone: false, aborted: false }, p), "runaway");
});

test("late in a build the pressure steers to closure, not new scope", () => {
  const p = stepPolicy("build a dashboard", "med");
  const early = continuationPressure({ step: 1, consecutiveIdle: 0, deliverableComplete: false, requestedDone: false, aborted: false }, p);
  const late = continuationPressure({ step: p.soft + 1, consecutiveIdle: 0, deliverableComplete: false, requestedDone: false, aborted: false }, p);
  assert.ok(/write the next file/i.test(early));
  assert.ok(/do not start new scope/i.test(late));
  assert.ok(shouldPushToClose({ step: p.soft, consecutiveIdle: 0, deliverableComplete: false, requestedDone: false, aborted: false }, p));
});
