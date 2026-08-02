import { test } from "node:test";
import assert from "node:assert/strict";
import { assessDeliverable, continuationBrief } from "../src/engine/completionGate";

/** The exact artifact Laro Lite produced on the real engine when asked to
    "get started on the ai receptionist ui for my saas" — 227 bytes, then @@DONE. */
const MEASURED_STUB = `import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>AI Receptionist</h1>
      </header>
    </div>
  );
}

export default App;`;

test("rejects the exact premature-completion stub measured on the real engine", () => {
  const v = assessDeliverable("get started on the ai receptionist ui for my saas", [
    { path: "src/App.tsx", content: MEASURED_STUB },
  ]);
  assert.equal(v.complete, false, "a heading-only component must not count as done");
  assert.ok(v.missing.length > 0);
  assert.match(v.missing.join(" "), /interactive|stub|lines of real code/i);
});

test("rejects when nothing was written at all", () => {
  const v = assessDeliverable("build me a landing page", []);
  assert.equal(v.complete, false);
  assert.match(v.missing[0], /No file/i);
});

test("rejects placeholder work that admits it is unfinished", () => {
  const v = assessDeliverable("build a booking form", [
    {
      path: "index.html",
      content: `<html><body><form><input id="n"><button onclick="go()">Book</button></form>
      <style>body{font-family:system-ui}</style>
      <script>function go(){ /* TODO: implement submission */ }</script>
      ${"<p>filler line</p>\n".repeat(30)}</body></html>`,
    },
  ]);
  assert.equal(v.complete, false);
  assert.match(v.missing.join(" "), /placeholder/i);
});

test("accepts a genuinely complete, interactive, styled UI", () => {
  const good = `<!doctype html>
<html><head><style>
  :root { --bg:#0f0f10; --fg:#eee; }
  body { background: var(--bg); color: var(--fg); font-family: system-ui; margin:0; }
  .card { padding: 24px; border-radius: 12px; background:#18181b; }
  button { background:#6d4aff; color:#fff; border:0; padding:10px 16px; border-radius:8px; }
</style></head>
<body>
  <main class="card">
    <h1>AI Receptionist</h1>
    <label for="caller">Caller name</label>
    <input id="caller" placeholder="Who's calling?" />
    <select id="reason"><option>New booking</option><option>Reschedule</option></select>
    <button id="book" onclick="book()">Book appointment</button>
    <ul id="log"></ul>
  </main>
  <script>
    const log = document.getElementById('log');
    function book() {
      const who = document.getElementById('caller').value.trim();
      if (!who) return;
      const li = document.createElement('li');
      li.textContent = who + ' — ' + document.getElementById('reason').value;
      log.appendChild(li);
      localStorage.setItem('bookings', log.innerHTML);
    }
    log.innerHTML = localStorage.getItem('bookings') || '';
  </script>
</body></html>`;
  const v = assessDeliverable("build an ai receptionist booking ui", [{ path: "index.html", content: good }]);
  assert.equal(v.complete, true, `expected complete, missing: ${v.missing.join(" | ")}`);
});

test("a small surgical diff on an existing project is legitimately complete", () => {
  const v = assessDeliverable("change the header colour to copper", [
    { path: "src/theme.css", content: ".header { color: #b06a3a; }" },
  ], { existingProject: true });
  assert.equal(v.complete, true);
});

test("an API request with no handlers is incomplete", () => {
  const v = assessDeliverable("add a booking api endpoint", [
    { path: "server.js", content: `${"const x = 1;\n".repeat(40)}` },
  ]);
  assert.equal(v.complete, false);
  assert.match(v.missing.join(" "), /API|endpoint/i);
});

test("the continuation brief lists the gaps and demands complete files", () => {
  const v = assessDeliverable("build a dashboard ui", [{ path: "a.tsx", content: "<div>hi</div>" }]);
  const brief = continuationBrief(v);
  assert.match(brief, /Not done yet/i);
  assert.match(brief, /@@FILE/);
  assert.match(brief, /@@DONE/);
  for (const m of v.missing) assert.ok(brief.includes(m));
});
