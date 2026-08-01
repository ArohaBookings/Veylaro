const test = require("node:test");
const assert = require("node:assert/strict");
const loadSubmission = require("./load-submission.cjs");

const { addLine, removeLine, totalCents } = loadSubmission("src/cart.cjs");

test("adds and merges lines immutably", () => {
  const original = { lines: [{ sku: "A", unitPriceCents: 250, quantity: 1 }] };
  const snapshot = JSON.parse(JSON.stringify(original));
  const merged = addLine(original, "A", 999, 2);
  assert.deepEqual(original, snapshot);
  assert.notStrictEqual(merged, original);
  assert.notStrictEqual(merged.lines, original.lines);
  assert.deepEqual(JSON.parse(JSON.stringify(merged.lines)), [{ sku: "A", unitPriceCents: 250, quantity: 3 }]);
  const added = addLine(merged, "B", 125, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(added.lines[1])), { sku: "B", unitPriceCents: 125, quantity: 4 });
});

test("removes lines and totals exact cents without mutation", () => {
  const original = { lines: [
    { sku: "A", unitPriceCents: 250, quantity: 3 },
    { sku: "B", unitPriceCents: 125, quantity: 4 },
  ] };
  assert.equal(totalCents(original), 1250);
  const removed = removeLine(original, "A");
  assert.deepEqual(original.lines.map((line) => line.sku), ["A", "B"]);
  assert.deepEqual(removed.lines.map((line) => line.sku), ["B"]);
});

test("rejects malformed operations", () => {
  const cart = { lines: [] };
  for (const args of [[cart, "", 100, 1], [cart, "A", -1, 1], [cart, "A", 1.5, 1], [cart, "A", 10, 0]]) {
    assert.throws(() => addLine(...args), /Invalid/);
  }
  assert.throws(() => totalCents({ lines: [{ sku: "A", unitPriceCents: 10, quantity: -1 }] }), /Invalid/);
});
