import test from "node:test";
import assert from "node:assert/strict";
import { breadthBrief, detectRegression, nextPart, regressionBrief } from "../src/engine/progressGuard";

const file = (n: number) => Array.from({ length: n }, (_, i) => `const x${i} = ${i};`).join("\n");

test("catches the measured oscillation: a file replaced by a thinner draft", () => {
  // From a real Med run: 242 lines -> 173 -> 95 across three steps, same 4 files.
  const before = new Map([["app.js", file(120)], ["index.html", file(60)]]);
  const after = new Map([["app.js", file(40)], ["index.html", file(60)]]);
  const r = detectRegression(before, after);
  assert.equal(r.regressed, true);
  assert.equal(r.shrunk.length, 1);
  assert.equal(r.shrunk[0].path, "app.js");
  assert.equal(r.shrunk[0].before, 120);
  assert.equal(r.shrunk[0].after, 40);
});

test("normal growth is never flagged", () => {
  const before = new Map([["app.js", file(50)]]);
  const after = new Map([["app.js", file(90)], ["ui.js", file(40)]]);
  assert.equal(detectRegression(before, after).regressed, false);
});

test("a modest tidy-up is tolerated — only real losses are flagged", () => {
  const before = new Map([["app.js", file(100)]]);
  const after = new Map([["app.js", file(85)]]); // -15%, under the 25% threshold
  assert.equal(detectRegression(before, after).regressed, false);
});

test("tiny files are exempt — churn in a 10-line stub is not a regression", () => {
  const before = new Map([["config.js", file(10)]]);
  const after = new Map([["config.js", file(3)]]);
  assert.equal(detectRegression(before, after).shrunk.length, 0);
});

test("the push-back names the exact loss, not a vague complaint", () => {
  const before = new Map([["app.js", file(120)]]);
  const after = new Map([["app.js", file(30)]]);
  const brief = regressionBrief(detectRegression(before, after));
  assert.match(brief, /app\.js went from 120 lines to 30/);
  assert.match(brief, /complete, LONGER version/);
});

test("breadth suggestions fit the kind of thing being built", () => {
  const receptionist = nextPart("build an ai receptionist with bookings", ["index.html"]);
  assert.ok(receptionist && /booking|availability|search|storage|validation/i.test(receptionist), receptionist ?? "null");
  const game = nextPart("build minecraft", ["index.html"]);
  assert.ok(game && /engine|world|player|input|render/i.test(game), game ?? "null");
});

test("it never suggests a file that already exists", () => {
  const have = ["index.html", "bookings.js", "availability.js", "search.js"];
  const next = nextPart("build an ai receptionist with bookings", have);
  assert.ok(next);
  assert.ok(!have.some((p) => p.toLowerCase() === next!.toLowerCase()));
});

test("the breadth brief tells the model to leave existing files alone", () => {
  const brief = breadthBrief("build an ai receptionist", ["index.html", "style.css"], 15);
  assert.ok(brief);
  assert.match(brief!, /Write a NEW file now/);
  assert.match(brief!, /Do not touch the files that already exist/);
  assert.match(brief!, /needs 15\+ separate parts and currently has 2/);
});

test("breadth returns null once the obvious parts all exist", () => {
  const many = [
    "bookings.js", "availability.js", "search.js", "validation.js", "storage.js",
    "calendar.js", "notifications.js", "callLog.js", "settings.js", "admin.js",
    "app.js", "state.js", "ui.js", "api.js", "utils.js",
    "components.js", "styles.css", "config.js", "router.js",
  ];
  assert.equal(nextPart("build an ai receptionist", many), null);
});
