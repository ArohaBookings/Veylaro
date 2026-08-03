import test from "node:test";
import assert from "node:assert/strict";
import { assessShrink } from "../src/engine/workPreservation";
import { isPresentableNarration, looksLikeCode } from "../src/engine/outputHygiene";

const lines = (n: number) => Array.from({ length: n }, (_, i) => `const x${i} = ${i};`).join("\n");

test("refuses the measured destruction: 278 -> 215 lines of finished work", () => {
  // Watched live, step by step, on a real build. The user saw it too:
  // "its fucken deleting its own code lines".
  const v = assessShrink("app.js", lines(118), lines(40));
  assert.equal(v.destructive, true);
  assert.equal(v.beforeLines, 118);
  assert.equal(v.afterLines, 40);
  assert.match(v.brief, /REFUSED and the existing file is untouched/);
  assert.match(v.brief, /deletes 78 lines/);
  assert.match(v.brief, /@@APPEND app\.js/);
});

test("creating a file is never blocked", () => {
  assert.equal(assessShrink("new.js", null, lines(3)).destructive, false);
});

test("growing a file is never blocked", () => {
  assert.equal(assessShrink("app.js", lines(40), lines(90)).destructive, false);
});

test("a modest tidy-up is allowed — only real destruction is refused", () => {
  // -20%: a legitimate cleanup.
  assert.equal(assessShrink("app.js", lines(100), lines(80)).destructive, false);
  // -60%: that is not a cleanup.
  assert.equal(assessShrink("app.js", lines(100), lines(40)).destructive, true);
});

test("churn in a small stub is not destruction", () => {
  assert.equal(assessShrink("config.js", lines(10), lines(2)).destructive, false);
});

test("code that leaked out of a file block never reaches the chat", () => {
  // The user: "why tf is it pasting the code its doing in veylaro code chat".
  for (const codeLine of [
    "const bookings = JSON.parse(localStorage.getItem('bookings') || '[]');",
    "}",
    "</div>",
    "  .booking-item { display: flex; }",
    "function displayBookings() {",
    "document.getElementById('x').addEventListener('click', () => {});",
    "return res.json({ ok: true });",
    "```html",
    "// save the booking",
    "  background-color: #121212;",
  ]) {
    assert.equal(looksLikeCode(codeLine), true, `should be hidden: ${codeLine}`);
    assert.equal(isPresentableNarration(codeLine), false, `should be hidden: ${codeLine}`);
  }
});

test("real narration is still shown", () => {
  for (const line of [
    "🔎 no package.json yet — scaffolding one first",
    "✍️ Writing the dashboard layout",
    "Adding the search filter next",
    "🧱 Scaffolding the page",
    "That command failed, trying another way",
  ]) {
    assert.equal(isPresentableNarration(line), true, `should be shown: ${line}`);
  }
});
