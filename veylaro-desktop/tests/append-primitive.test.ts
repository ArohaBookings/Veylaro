import test from "node:test";
import assert from "node:assert/strict";
import { StreamParser, FILE_PROTOCOL_PROMPT } from "../src/engine/agentLoop";

function parse(reply: string, chunkSize = 19) {
  const p = new StreamParser();
  const events = [];
  for (let i = 0; i < reply.length; i += chunkSize) events.push(...p.push(reply.slice(i, i + chunkSize)));
  events.push(...p.flush());
  return events;
}

test("@@APPEND produces an append event, not a full-file overwrite", () => {
  const reply = "➕ Adding the filter\n@@APPEND app.js\nfunction filter(q) { return rows; }\n@@END";
  const events = parse(reply);
  const appends = events.filter((e) => e.t === "append");
  const files = events.filter((e) => e.t === "file");
  assert.equal(appends.length, 1);
  assert.equal(files.length, 0, "an append must never be treated as a whole-file write");
  assert.equal(appends[0].path, "app.js");
  assert.equal(appends[0].content, "function filter(q) { return rows; }");
});

test("append and full-file blocks interleave correctly in one reply", () => {
  const reply = [
    "@@FILE index.html",
    "<h1>hi</h1>",
    "@@END",
    "➕ behaviour",
    "@@APPEND app.js",
    "const a = 1;",
    "@@END",
    "@@FILE styles.css",
    "body{}",
    "@@END",
  ].join("\n");
  const events = parse(reply);
  assert.deepEqual(
    events.filter((e) => e.t === "file" || e.t === "append").map((e) => [e.t, e.path]),
    [["file", "index.html"], ["append", "app.js"], ["file", "styles.css"]],
  );
});

test("an append whose reply ends at @@END with no newline still lands", () => {
  // Same class of bug that was silently eating whole files.
  const events = parse("@@APPEND notes.md\n- one more line\n@@END");
  assert.equal(events.filter((e) => e.t === "append").length, 1);
});

test("a truncated append is discarded like a truncated file", () => {
  const events = parse("@@APPEND app.js\nfunction half(){\n");
  assert.equal(events.filter((e) => e.t === "append").length, 0);
});

test("append state never leaks into the next block", () => {
  const reply = "@@APPEND a.js\nx\n@@END\n@@FILE b.js\ny\n@@END";
  const events = parse(reply);
  const kinds = events.filter((e) => e.t === "file" || e.t === "append").map((e) => e.t);
  assert.deepEqual(kinds, ["append", "file"], "the second block must be a full file, not an append");
});

test("chunk boundaries never change an append's outcome", () => {
  const reply = "@@APPEND app.js\nline one\nline two\n@@END";
  for (const size of [1, 3, 7, 40, 4096]) {
    const appends = parse(reply, size).filter((e) => e.t === "append");
    assert.equal(appends.length, 1, `lost the append at chunk size ${size}`);
    assert.equal(appends[0].content, "line one\nline two");
  }
});

test("the protocol actually teaches append and multi-file turns", () => {
  assert.match(FILE_PROTOCOL_PROMPT, /@@APPEND/);
  assert.match(FILE_PROTOCOL_PROMPT, /Do NOT retype it/i);
  assert.match(FILE_PROTOCOL_PROMPT, /SEVERAL files in one reply/i);
  // The old blanket ban on partial output must not contradict the new primitive.
  assert.doesNotMatch(FILE_PROTOCOL_PROMPT, /never a diff.*If you're changing a file, output the full new version/s);
});
