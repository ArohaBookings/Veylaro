import test from "node:test";
import assert from "node:assert/strict";
import { hasActionableSubstance, isFastInteraction } from "../src/engine/intentRouter";

test("a bare filler word never starts a build", () => {
  // MEASURED: the user typed "testing" and Laro scaffolded a whole React app in
  // their project. Their words: "i said testing not continue".
  for (const noise of ["testing", "test", "hmm", "wait", "ok", "yo", "testing 123", "hey", "...", "k"]) {
    assert.equal(isFastInteraction(noise), true, `"${noise}" must stay conversation`);
  }
});

test("anything with real substance still builds — the default is work", () => {
  // The other half of the requirement: "i should be able to say anything and it
  // does what i say". Two words with a verb or an object is a job.
  for (const ask of [
    "build minecraft",
    "receptionist ui",
    "fix the header",
    "make the header copper and add a search box",
    "src/App.tsx is broken",
    "can you add a login page",
    "the booking form looks wrong",
    "add a dark theme",
  ]) {
    assert.equal(isFastInteraction(ask), false, `"${ask}" must reach the agent`);
  }
});

test("substance is verb, or object, or length, or a path", () => {
  assert.equal(hasActionableSubstance("build"), true, "a verb alone is intent");
  assert.equal(hasActionableSubstance("testing"), false);
  assert.equal(hasActionableSubstance("login page"), true, "naming a thing counts");
  assert.equal(hasActionableSubstance("page"), false, "a lone noun does not");
  assert.equal(hasActionableSubstance("src/App.tsx"), true, "a path is unambiguous");
  assert.equal(hasActionableSubstance("i was thinking about the whole thing"), true, "a real sentence counts");
});

test("greetings and questions are unaffected", () => {
  assert.equal(isFastInteraction("hey"), true);
  assert.equal(isFastInteraction("what should we build?"), true);
  assert.equal(isFastInteraction("who made you"), true);
});
