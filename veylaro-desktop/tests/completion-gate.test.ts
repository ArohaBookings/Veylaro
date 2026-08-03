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
  // As a change to an existing project this is complete work.
  const edit = assessDeliverable("build an ai receptionist booking ui", [{ path: "index.html", content: good }], { existingProject: true });
  assert.equal(edit.complete, true, `expected complete, missing: ${edit.missing.join(" | ")}`);
  // As a FRESH product build it is still only an outline — the gate must push for depth.
  const fresh = assessDeliverable("build an ai receptionist booking ui", [{ path: "index.html", content: good }]);
  assert.equal(fresh.complete, false, "a ~35 line screen is not a finished interface");
  assert.match(fresh.missing.join(" "), /at least|control|state/i);
});

test("a genuinely deep interface passes the bar", () => {
  const big = `<!doctype html><html><head><style>
${":root{--bg:#0b0b0c;--fg:#eee;--accent:#b06a3a}\n".repeat(2)}
${".row{display:flex;gap:12px;align-items:center;padding:8px 0}\n".repeat(220)}
</style></head><body>
  <main>
    <h1>AI Receptionist</h1>
    <form id="f">
      <input id="name" placeholder="Caller" /><input id="phone" placeholder="Phone" />
      <select id="reason"><option>Booking</option></select>
      <textarea id="notes"></textarea>
      <button id="save">Save</button><button id="clear">Clear</button>
    </form>
    <ul id="list"></ul>
  </main>
  <script>
${"    document.addEventListener('DOMContentLoaded', () => {});\n".repeat(60)}
    let state = []; 
    function render(){ const l=document.getElementById('list'); l.innerHTML=''; state.forEach(s=>{const li=document.createElement('li'); li.textContent=s.name; l.appendChild(li);}); localStorage.setItem('calls', JSON.stringify(state)); }
    document.getElementById('save').addEventListener('click', e => { e.preventDefault(); state.push({name:document.getElementById('name').value}); render(); });
    state = JSON.parse(localStorage.getItem('calls')||'[]'); render();
  </script></body></html>`;
  // The bar for "a real interface" was raised (320 lines/2 files -> 500/3) because
  // the old one let outlines through: the owner's measured complaint was a 57-line
  // "AI receptionist". A genuinely deep interface is markup + styling + behaviour,
  // which is three files and hundreds of lines — so that is what this fixture is.
  const v = assessDeliverable("build a settings screen ui", [
    { path: "index.html", content: big },
    { path: "styles.css", content: ".x{color:red}\n".repeat(60) },
    { path: "app.js", content: "export function save(){ localStorage.setItem('k','v'); }\n".repeat(160) },
  ]);
  assert.equal(v.complete, true, `expected complete, missing: ${v.missing.join(" | ")}`);
});

test("the raised bar still rejects what the owner actually got", () => {
  // Both measured in the wild, both previously accepted or nearly so.
  const stub = assessDeliverable("get started on the ai receptionist ui", [
    { path: "src/App.tsx", content: "export default () => <h1>AI Receptionist</h1>;" },
  ]);
  assert.equal(stub.complete, false, "a 227-byte <h1> is not an AI receptionist");

  const fiftySeven = assessDeliverable("build an ai receptionist ui", [
    { path: "src/App.tsx", content: "<div className=\"x\"><button onClick={f}>go</button></div>\n".repeat(57) },
  ]);
  assert.equal(fiftySeven.complete, false, "57 lines is not an AI receptionist");
  assert.match(fiftySeven.missing.join(" "), /needs roughly 1500\+ lines/);
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

test("the ambition floor scales with the size of the ask", async () => {
  const { ambitionFloor } = await import("../src/engine/completionGate");
  const tweak = ambitionFloor("change the button colour");
  const ui = ambitionFloor("build a settings screen");
  const product = ambitionFloor("build the ai receptionist ui for my saas");
  const everything = ambitionFloor("build my whole saas end to end");
  assert.ok(tweak.lines < ui.lines, "a tweak must not demand a product");
  assert.ok(ui.lines < product.lines, "a product must demand more than one screen");
  assert.ok(product.lines < everything.lines, "a whole product must demand the most");
  assert.ok(everything.lines >= 1000, `a whole SaaS should demand 1000+ lines, got ${everything.lines}`);
});
