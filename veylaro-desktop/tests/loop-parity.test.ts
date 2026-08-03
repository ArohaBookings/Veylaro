import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* The MCP harness is how this product gets benchmarked headlessly. If its loop
   drifts from the app's loop, every measurement taken through it is a claim
   about code the user never runs.

   It HAD drifted, in four ways that all made the product look worse than it is:
     - it `break`ed the moment a step wrote nothing, so one prose reply ended the
       whole build (the app escalates protocol enforcement instead)
     - @@APPEND fell through every branch and was silently discarded, so an
       append-only step looked idle and triggered the break above
     - no regression guard, so a shrinking rewrite went unchallenged
     - no breadth brief, so it never asked for a file that didn't exist yet

   These tests pin the parity. They read the sources rather than executing the
   loop, because the loop needs a live engine — but a missing import here is
   exactly the drift that caused the problem. */

import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mcp = fs.readFileSync(path.join(root, "mcp", "veylaro-code.mts"), "utf8");
const store = fs.readFileSync(path.join(root, "src", "state", "store.tsx"), "utf8");

const SHARED_SYSTEMS = [
  { name: "protocol enforcer", token: "enforcementBrief" },
  { name: "idle detection", token: "isProtocolFailure" },
  { name: "regression guard", token: "detectRegression" },
  { name: "breadth brief", token: "breadthBrief" },
  { name: "completion gate", token: "assessDeliverable" },
  { name: "ambition floor", token: "ambitionFloor" },
];

for (const sys of SHARED_SYSTEMS) {
  test(`the MCP harness uses the same ${sys.name} as the app`, () => {
    assert.ok(store.includes(sys.token), `the app lost ${sys.token}`);
    assert.ok(
      mcp.includes(sys.token),
      `mcp/veylaro-code.mts does not use ${sys.token} — headless benchmarks would ` +
      `measure a weaker loop than the one that ships`,
    );
  });
}

test("neither loop stops the run just because one step wrote nothing", () => {
  // The exact regression: `break` on an idle step, with no enforcement attempt.
  assert.doesNotMatch(
    mcp,
    /filesThisStep\.length === 0\) \{\s*\n\s*break;/,
    "the MCP loop still bails on the first idle step",
  );
  // Both must bound the idle streak instead.
  assert.match(mcp, /idleStreak/);
  assert.match(store, /consecutiveIdle/);
});

test("both loops honour @@APPEND rather than dropping it", () => {
  assert.match(mcp, /ev\.t === "file" \|\| ev\.t === "append"/, "MCP must handle append events");
  assert.match(store, /ev\.t === "append"/, "the app must handle append events");
});

test("neither loop reintroduces a hard-wired ambition ceiling", () => {
  // maxSteps = <literal> anywhere is the pattern that capped real builds at 12-22.
  for (const [label, src] of [["store", store], ["mcp", mcp]] as const) {
    const literalCap = src.match(/maxSteps\s*=\s*\d+\s*[;,]/);
    assert.equal(literalCap, null, `${label} hard-codes a step ceiling: ${literalCap?.[0]}`);
  }
  assert.match(mcp, /stepPolicy\(/, "MCP must derive its budget from the ask");
  assert.match(store, /stepPolicy\(/, "the app must derive its budget from the ask");
});
