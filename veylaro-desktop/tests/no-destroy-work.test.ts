import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = fs.readFileSync(path.join(root, "src", "state", "store.tsx"), "utf8");
/** Strip comments — the fix's own commentary quotes the old strings verbatim. */
const store = raw
  .split("\n")
  .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
  .join("\n");

test("stopping a run never deletes what it wrote", () => {
  // MEASURED, and the user watched it: Laro wrote App.tsx, App.css and a
  // package.json, the run stopped, and all three were deleted —
  //   "rewound to 'Stopped run — restored unverified edits'"
  //   "Stopped — unverified edits from this run were rolled back"
  // runSnapshots stores null for a CREATED file, and restoring null deletes it.
  // Pressing Stop does not mean "undo everything you just did for me".
  assert.match(
    store,
    /signal\.aborted \? "Stopped" : "Run hit an error",\s*\n\s*\{ revertModified: !signal\.aborted \},/,
    "an aborted run must not revert anything",
  );
  assert.doesNotMatch(store, /Stopped run — restored unverified edits/);
  assert.doesNotMatch(store, /unverified edits from this run were rolled back/);
});

test("rollback only ever touches files that already existed", () => {
  // Created files (original === null) must be excluded from the restore loop,
  // because restoring null is a delete.
  assert.match(store, /const created = \[\.\.\.runSnapshots\.entries\(\)\]\.filter\(\(\[, original\]\) => original === null\)/);
  assert.match(store, /const modified = \[\.\.\.runSnapshots\.entries\(\)\]\.filter\(\(\[, original\]\) => original !== null\)/);
  const loop = store.slice(store.indexOf("for (const [rel, original] of modified"));
  assert.match(loop.slice(0, 400), /restoreFile/, "the restore loop must iterate `modified`, never `created`");
});

test("a verification failure reverts edits but keeps new work", () => {
  assert.match(store, /rollbackRun\("Verification failed", \{ revertModified: true \}\)/);
});

test("greetings are answered by the model, not a script", () => {
  // "ANYTHING I FUCKEN SAY SHOULD GO THROUGH THE MODEL". The canned
  // "Hey. What are we working on?" — tagged "no generation needed" — is gone.
  assert.doesNotMatch(store, /instantGreetingReply/);
  // Runtime facts stay deterministic: a local checkpoint cannot know its own
  // product name, and asking it invites a confident lie.
  assert.match(store, /runtimeFactReply/);
  assert.match(store, /verifiedArithmeticReply/);
});
