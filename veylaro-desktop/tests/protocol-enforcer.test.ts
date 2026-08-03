import test from "node:test";
import assert from "node:assert/strict";
import { enforcementBrief, isProtocolFailure, nextTarget } from "../src/engine/protocolEnforcer";

test("a step that wrote nothing and ran nothing is a protocol failure", () => {
  assert.equal(isProtocolFailure(0, 0), true);
  assert.equal(isProtocolFailure(1, 0), false);
  assert.equal(isProtocolFailure(0, 1), false);
});

test("the demand narrows with each failed attempt instead of repeating itself", () => {
  // Measured: Med answered the same prose brief with prose three times running
  // and the build stalled at 51 lines. Repetition is what failed; each attempt
  // must remove a degree of freedom.
  const ctx = { request: "build an ai receptionist", missing: ["Only 42 lines across 1 file(s)."], existingPaths: ["index.html"], attempt: 1 };
  const a = enforcementBrief({ ...ctx, attempt: 1 });
  const b = enforcementBrief({ ...ctx, attempt: 2 });
  const c = enforcementBrief({ ...ctx, attempt: 3 });

  assert.notEqual(a, b);
  assert.notEqual(b, c);
  assert.ok(b.length < a.length, "attempt 2 must be tighter than attempt 1");
  assert.ok(c.length < b.length, "attempt 3 must be tighter than attempt 2");
  // Every attempt names a concrete file and the exact protocol tokens.
  for (const brief of [a, b, c]) {
    assert.match(brief, /@@FILE/);
    assert.match(brief, /\.(?:html?|css|[cm]?[jt]sx?)/);
  }
  assert.match(c, /^The first characters of your reply must be: @@FILE/);
});

test("it always names a concrete next file — never 'the next file'", () => {
  // Nothing written yet -> start with markup.
  assert.equal(nextTarget({ request: "build a ui", missing: [], existingPaths: [], attempt: 1 }), "index.html");
  // Markup exists -> move to styling.
  assert.equal(nextTarget({ request: "build a ui", missing: [], existingPaths: ["index.html"], attempt: 1 }), "styles.css");
  // The gate named a path -> use it.
  assert.equal(
    nextTarget({ request: "x", missing: ["src/Booking.tsx is missing"], existingPaths: ["index.html"], attempt: 1 }),
    "src/Booking.tsx",
  );
  // Everything standard exists -> a fresh, numbered module, never a repeat.
  const all = ["index.html", "styles.css", "app.js", "src/App.tsx", "src/main.tsx", "src/styles.css"];
  const next = nextTarget({ request: "x", missing: [], existingPaths: all, attempt: 1 });
  assert.ok(!all.includes(next), `must not re-demand an existing file (got ${next})`);
});

test("it never demands a file that was already written", () => {
  const written = ["index.html", "styles.css"];
  const target = nextTarget({ request: "build a ui", missing: [], existingPaths: written, attempt: 2 });
  assert.ok(!written.includes(target));
});

test("a stylesheet is not demanded before there is any markup to attach it to", () => {
  const target = nextTarget({ request: "build a ui", missing: [], existingPaths: [], attempt: 1 });
  assert.equal(target, "index.html");
});
