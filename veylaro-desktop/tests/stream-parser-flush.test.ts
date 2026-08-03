import test from "node:test";
import assert from "node:assert/strict";
import { StreamParser } from "../src/engine/agentLoop";

/** Feed a reply through the parser exactly as the stream does, in odd-sized
    chunks, and collect every event including the flush. */
function parse(reply: string, chunkSize = 17) {
  const p = new StreamParser();
  const events = [];
  for (let i = 0; i < reply.length; i += chunkSize) {
    events.push(...p.push(reply.slice(i, i + chunkSize)));
  }
  events.push(...p.flush());
  return { events, parser: p };
}

test("a file whose reply ends exactly at @@END is written, not discarded", () => {
  // MEASURED on Med, three consecutive steps of one real build: the model ended
  // its reply at "@@END" with no trailing newline. push() only processes text up
  // to a newline, so the terminator sat unprocessed in the buffer and flush()
  // threw the whole file away as "unterminated". A complete stylesheet and a
  // complete app.js were lost, and the run reported 51 lines.
  const reply = [
    "🎨 Adding the styles",
    "@@FILE styles.css",
    "body { background: #121212; }",
    ".card { padding: 24px; }",
    "@@END",
  ].join("\n"); // NOTE: no trailing newline — this is the bug's exact shape

  const { events } = parse(reply);
  const files = events.filter((e) => e.t === "file");
  assert.equal(files.length, 1, "the file must survive a reply with no trailing newline");
  assert.equal(files[0].path, "styles.css");
  assert.match(files[0].content, /background: #121212/);
  assert.match(files[0].content, /padding: 24px/);
  assert.doesNotMatch(files[0].content, /@@END/);
});

test("the trailing-newline form still works (it always did)", () => {
  const reply = "@@FILE index.html\n<h1>hi</h1>\n@@END\n";
  const files = parse(reply).events.filter((e) => e.t === "file");
  assert.equal(files.length, 1);
  assert.equal(files[0].content, "<h1>hi</h1>");
});

test("both forms produce identical content", () => {
  const body = "@@FILE a.js\nconst a = 1;\nconst b = 2;\n@@END";
  const withNl = parse(body + "\n").events.filter((e) => e.t === "file");
  const withoutNl = parse(body).events.filter((e) => e.t === "file");
  assert.deepEqual(withoutNl[0], withNl[0]);
});

test("a reply ending at @@DONE with no newline still completes the run", () => {
  const reply = "@@FILE a.txt\nx\n@@END\n✅ finished\n@@DONE";
  const { events } = parse(reply);
  assert.equal(events.filter((e) => e.t === "file").length, 1);
  assert.equal(events.filter((e) => e.t === "done").length, 1, "@@DONE must survive too");
});

test("a reply ending at @@RUN with no newline still runs the command", () => {
  const reply = "checking\n@@RUN npm test";
  const runs = parse(reply).events.filter((e) => e.t === "run");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].cmd, "npm test");
});

test("a genuinely truncated file block is still discarded, and reported", () => {
  // Cut off mid-file (reply hit the token budget). Writing that to disk would
  // replace a real file with half a file — never acceptable.
  const reply = "@@FILE src/App.tsx\nexport default function App() {\n  return (\n";
  const { events, parser } = parse(reply);
  assert.equal(events.filter((e) => e.t === "file").length, 0);
  assert.equal(parser.truncatedMidFile, false, "flush resets the state");
  assert.match(parser.liveNarration, /unterminated file block was discarded/);
});

test("chunk boundaries never change the outcome", () => {
  const reply = "🧱 go\n@@FILE styles.css\nbody{color:red}\n@@END";
  for (const size of [1, 2, 3, 5, 8, 13, 64, 4096]) {
    const files = parse(reply, size).events.filter((e) => e.t === "file");
    assert.equal(files.length, 1, `lost the file at chunk size ${size}`);
    assert.equal(files[0].content, "body{color:red}");
  }
});
