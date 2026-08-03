import test from "node:test";
import assert from "node:assert/strict";
import { assessDeliverable, isFillerFile } from "../src/engine/completionGate";
import { nextPart } from "../src/engine/progressGuard";

/** Verbatim from a real run. The gate demanded a file COUNT and the model
    manufactured seventeen of these to satisfy it. */
const MODULE20 = `import React from 'react';

function Module20() {
    return (
        <div>
            <h2>Module 20</h2>
            <p>This module displays a simple heading.</p>
            <h1>A Simple Heading</h1>
        </div>
    );
}

export default Module20;`;

test("a self-describing placeholder is recognised as filler", () => {
  assert.equal(isFillerFile({ path: "src/Module20.tsx", content: MODULE20 }), true);
});

test("real code is never mistaken for filler", () => {
  const real = `import React, { useState } from 'react';
export function BookingList({ bookings, onDelete }) {
  const [query, setQuery] = useState('');
  const shown = bookings.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()));
  return (<div>
    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
    {shown.map((b) => <div key={b.id}>{b.name}<button onClick={() => onDelete(b.id)}>Delete</button></div>)}
  </div>);
}`;
  assert.equal(isFillerFile({ path: "src/BookingList.tsx", content: real }), false);
});

test("filler cannot move the completion gate toward satisfied", () => {
  // Seventeen stubs must not substitute for real work.
  const stubs = Array.from({ length: 17 }, (_, i) => ({
    path: `src/Module${i}.tsx`,
    content: MODULE20.replace(/Module20/g, `Module${i}`).replace(/Module 20/g, `Module ${i}`),
  }));
  const v = assessDeliverable("build a complete ai receptionist saas", stubs);
  assert.equal(v.complete, false);
  assert.match(v.missing.join(" "), /placeholders that only describe themselves/);
  // And the line/file counts must not credit them.
  assert.match(v.missing.join(" "), /across 0 real file\(s\)/);
});

test("nextPart never invents a numbered filler filename", () => {
  // It used to fall through to src/Module{n}.tsx — the source of the slop.
  const everything = [
    "bookings.js", "availability.js", "search.js", "validation.js", "storage.js",
    "calendar.js", "notifications.js", "callLog.js", "settings.js", "admin.js",
    "app.js", "state.js", "ui.js", "api.js", "utils.js",
    "components.js", "styles.css", "config.js", "router.js",
  ];
  const next = nextPart("build an ai receptionist", everything);
  assert.equal(next, null, `must ask for nothing rather than invent a name (got ${next})`);
  // Sanity: it still suggests real parts while real ones remain.
  assert.ok(nextPart("build an ai receptionist", ["index.html"]));
});
