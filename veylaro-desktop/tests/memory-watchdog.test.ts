import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pressureVerdict } from "../src/engine/memoryGuard";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const store = fs.readFileSync(path.join(root, "src", "state", "store.tsx"), "utf8");

test("a single critical reading must not abort a running build", () => {
  // MEASURED on the packaged app, twice in a row: a build died seconds after
  // starting and reported "run aborted by user" when the user had done nothing.
  // Loading a 7.3 GB model legitimately drops free memory for a few seconds, and
  // the watchdog aborted on the FIRST critical sample — so on a 16 GB Mac, the
  // exact machine Laro Med is recommended for, a run could be killed by its own
  // model loading.
  assert.match(store, /criticalStreak/, "the watchdog must debounce critical readings");
  assert.match(
    store,
    /criticalStreak\.current \+= 1;\s*\n\s*if \(criticalStreak\.current < 2\) return;/,
    "it must require at least two consecutive critical readings before aborting",
  );
});

test("the streak resets when memory recovers, so it can never accumulate", () => {
  // Without a reset, two unrelated dips minutes apart would eventually abort a
  // healthy run.
  const abortBlock = store.slice(store.indexOf("if (critical && running)"));
  assert.match(
    abortBlock.slice(0, 900),
    /criticalStreak\.current = 0;/,
    "the streak must be cleared on a non-critical reading",
  );
});

test("the pressure thresholds themselves are unchanged and still honest", () => {
  // The fix is debouncing, not moving the goalposts — genuine exhaustion must
  // still stop the run.
  assert.equal(pressureVerdict(null, 5), "critical");
  assert.equal(pressureVerdict(null, 8), "critical");
  assert.equal(pressureVerdict(null, 20), "watch");
  assert.equal(pressureVerdict(null, 21), "ok");
  assert.equal(pressureVerdict(0.5, null), "critical");
  assert.equal(pressureVerdict(2.0, null), "ok");
});

test("a run is still aborted when memory is genuinely, persistently gone", () => {
  // Two consecutive criticals 30s apart is real exhaustion, and must still abort.
  const abortBlock = store.slice(store.indexOf("if (critical && running)"), store.indexOf("if (critical && running)") + 900);
  assert.match(abortBlock, /abortRef\.current\?\.abort\(\)/);
  assert.match(abortBlock, /engineStop/);
});

test("an unreadable pressure signal is UNKNOWN, never critical", () => {
  // THE bug that aborted real runs. main.cjs used to fall back to raw free bytes
  // when /usr/bin/memory_pressure failed — and it fails precisely when the machine
  // is busy, i.e. mid-build. Measured live on a healthy 16 GB Mac while generating:
  //     pressureFreePct: 79   (authoritative -> fine)
  //     freePct:          4.3 (raw free bytes -> "critical")
  // The fallback made the app abort its own work and report "run aborted by user".
  const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
  assert.match(main, /if \(error\) return resolve\(null\);/, "an unreadable signal must report null, not raw free bytes");
  assert.doesNotMatch(main, /if \(error\) return resolve\(pressureFreePct\);/, "the raw-free-bytes fallback must be gone");

  // And the renderer must not substitute freePct for a missing pressure reading.
  assert.doesNotMatch(
    store,
    /typeof mem\.pressureFreePct === "number" \? mem\.pressureFreePct : mem\.freePct/,
    "the renderer must not fall back to raw free bytes either",
  );
  assert.match(store, /pressurePct !== null \|\| !isMac/, "unknown pressure on macOS must not be treated as critical");
});

test("raw macOS free-bytes readings would have been fatal — proving why the fallback was wrong", () => {
  // A healthy Mac genuinely reports these numbers.
  assert.equal(pressureVerdict(null, 4.3), "critical", "raw free% on a healthy Mac looks critical");
  assert.equal(pressureVerdict(null, 79), "ok", "the authoritative signal says the same machine is fine");
});
