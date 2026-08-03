const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("net");
const path = require("path");

// The port-conflict logic lives in main.cjs, which can't load outside Electron.
// Re-implement the two pure pieces here against the SAME behaviour and assert it,
// so a regression in the concept is caught even though main.cjs isn't importable.
function portIsFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

test("a held port is detected as unavailable and a neighbour is found", async () => {
  // Bind an ephemeral port so this test can never collide with a real Veylaro
  // engine (or anything else) that happens to be running on the dev machine.
  const blocker = net.createServer();
  await new Promise((r) => blocker.listen(0, "127.0.0.1", r));
  const held = blocker.address().port;
  try {
    assert.equal(await portIsFree(held), false, `${held} is held, must report unavailable`);
    let found = 0;
    for (let p = held; p < held + 12; p++) { if (await portIsFree(p)) { found = p; break; } }
    assert.ok(found > held, `must step around the held port (found ${found})`);
  } finally {
    await new Promise((r) => blocker.close(r));
  }
});

test("main.cjs contains the recovery path, not the old surrender", () => {
  const fs = require("fs");
  const src = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
  // The exact string the user saw on screen must no longer be an unconditional
  // dead end — it may only fire for an engine WE own.
  assert.match(src, /if \(engineProcess && engineStartedByApp\) \{\s*\n\s*return \{ \.\.\.verified, error: `Laro's engine is running but not answering/);
  assert.match(src, /usablePort/);
  assert.match(src, /is held by another program; starting Laro's own engine on/);
});
