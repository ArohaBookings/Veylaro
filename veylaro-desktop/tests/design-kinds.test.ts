import test from "node:test";
import assert from "node:assert/strict";
import { designBriefFor, detectArtifactKind, gradeDesign } from "../src/engine/designSystem";

test("a dashboard is recognised as a product screen, not a landing page", () => {
  for (const r of [
    "build a project management dashboard like monday.com",
    "an admin panel with a sidebar",
    "a kanban board for tasks",
    "a CRM console",
  ]) assert.equal(detectArtifactKind(r), "dashboard", r);

  assert.equal(detectArtifactKind("build a NOVA landing page"), "landing");
  assert.equal(detectArtifactKind("a marketing homepage with a hero"), "landing");
});

test("the dashboard brief forbids the landing-page grammar that leaked in", () => {
  // MEASURED: with only the landing brief, "a monday.com-style dashboard" came
  // back with a giant "Welcome Back" hero, a gradient accent word and a version
  // badge. monday.com has no hero.
  const b = designBriefFor("build a project management dashboard like monday.com");
  assert.match(b, /PRODUCT SCREEN, not a marketing page/);
  assert.match(b, /no hero, no giant headline, no gradient accent word/);
  assert.match(b, /"Welcome Back" at 84px you have built the wrong thing/);
  // And it must NOT be the landing brief.
  assert.doesNotMatch(b, /GRADIENT ON THE WHOLE HERO/);
});

test("a landing page still gets the landing brief", () => {
  const b = designBriefFor("build a NOVA landing page");
  assert.match(b, /clamp\(44px, 7vw, 84px\)/);
  assert.doesNotMatch(b, /PRODUCT SCREEN/);
});

test("a dashboard is graded on density and surfaces, not hero grammar", () => {
  const dash = `
    body { background: #0a0a0b; color: #a1a1aa; font-size: 15px; }
    .sidebar { width: 240px; background: #141418; }
    .sidebar a.active { background: rgba(167,139,250,.14); }
    .card { background: #141418; border: 1px solid rgba(255,255,255,.08);
            border-radius: 12px; padding: 14px; transition: all .15s ease; }
    .card:hover { background: #17171c; }
    .row:hover { background: rgba(255,255,255,.03); }
    .pill { border-radius: 999px; padding: 3px 10px; }
    .pill.high { background: rgba(239,68,68,.14); color: #fca5a5; }
  `;
  const asDash = gradeDesign(dash, "dashboard");
  const asLanding = gradeDesign(dash, "landing");
  assert.ok(asDash.score >= 75, `dashboard rubric scored ${asDash.score}: ${asDash.missing.join(", ")}`);
  assert.ok(asDash.score > asLanding.score + 25,
    "the same dashboard must score far better under its own rubric than under the landing one");
});

test("placeholder services are penalised on every kind of screen", () => {
  // The real build used https://via.placeholder.com/50 for the user avatar.
  const withPlaceholder = `.avatar { background: url(https://via.placeholder.com/50); }`;
  for (const kind of ["landing", "dashboard"] as const) {
    assert.ok(
      gradeDesign(withPlaceholder, kind).missing.some((m) => /placeholder service/.test(m)),
      `${kind} must penalise placeholder services`,
    );
  }
});
