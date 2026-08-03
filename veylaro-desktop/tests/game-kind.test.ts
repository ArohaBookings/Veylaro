import test from "node:test";
import assert from "node:assert/strict";
import { designBriefFor, detectArtifactKind } from "../src/engine/designSystem";

test("a game is recognised even when no UI word appears", () => {
  // "build minecraft" is the entire request. The generic visual check never
  // matched it, so it got no brief at all — the one ask most likely to produce
  // a styled page with a Start button that does nothing.
  for (const r of ["build minecraft", "a snake game on canvas", "make a platformer", "build tetris"]) {
    assert.equal(detectArtifactKind(r), "game", r);
    assert.match(designBriefFor(r), /THIS IS A GAME/, r);
  }
});

test("the game brief demands a real loop, not a picture of a game", () => {
  const b = designBriefFor("build minecraft");
  assert.match(b, /requestAnimationFrame/);
  assert.match(b, /delta time so speed does not depend on frame rate/);
  assert.match(b, /update and render are SEPARATE/i);
  assert.match(b, /win or lose condition that is reachable/);
  assert.match(b, /Never reference a sprite sheet, texture or audio file you have not created/);
});

test("a game never gets landing-page or dashboard grammar", () => {
  const b = designBriefFor("build minecraft");
  assert.doesNotMatch(b, /clamp\(44px, 7vw, 84px\)/, "no hero type scale");
  assert.doesNotMatch(b, /PRODUCT SCREEN/, "not the dashboard brief");
});

test("non-visual work still gets nothing", () => {
  assert.equal(designBriefFor("write a python script to parse csv files"), "");
  assert.equal(designBriefFor("add a retry to the fetch helper"), "");
});

test("every artifact kind routes to exactly one brief", () => {
  const seen = new Map<string, string>();
  for (const [req, kind] of [
    ["build a NOVA landing page", "landing"],
    ["a monday.com project dashboard", "dashboard"],
    ["build minecraft", "game"],
  ] as const) {
    assert.equal(detectArtifactKind(req), kind);
    const b = designBriefFor(req);
    assert.ok(b.length > 200, `${kind} must get a real brief`);
    assert.ok(!seen.has(b), `${kind} must not share a brief with ${seen.get(b)}`);
    seen.set(b, kind);
  }
});
