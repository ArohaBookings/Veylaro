import test from "node:test";
import assert from "node:assert/strict";
import { findBrokenReferences, referenceGaps, repairReferences, resolveRef } from "../src/engine/referenceGate";

/** The EXACT output of a real Laro build, driven through the shipped app and
    then opened in a browser. Three good files; a completely dead page. */
const MEASURED_BUILD = [
  {
    path: "receptionist/index.html",
    content: `<!doctype html>
<html><head>
  <link rel="stylesheet" href="receptionist/style.css">
</head><body>
  <form id="call-form"><input id="name"><button type="submit">Submit</button></form>
  <ul id="booking-list"></ul>
  <script src="receptionist/app.js"></script>
</body></html>`,
  },
  { path: "receptionist/style.css", content: "body { background: #121212; }" },
  { path: "receptionist/app.js", content: "function displayBookings() {}" },
];

test("catches the measured dead page: a folder name applied twice", () => {
  const broken = findBrokenReferences(MEASURED_BUILD);
  assert.equal(broken.length, 2, `expected both refs broken, got ${JSON.stringify(broken)}`);
  assert.deepEqual(
    broken.map((b) => b.reference).sort(),
    ["receptionist/app.js", "receptionist/style.css"],
  );
  for (const b of broken) {
    assert.equal(b.reason, "wrong-path");
    assert.ok(b.suggestion && !b.suggestion.includes("receptionist/"), `bad suggestion: ${b.suggestion}`);
  }
});

test("repairs it deterministically, without a model turn", () => {
  const { files, repaired, unresolved } = repairReferences(MEASURED_BUILD);
  assert.equal(unresolved.length, 0);
  assert.equal(repaired.length, 2);
  const html = files.find((f) => f.path === "receptionist/index.html")!.content;
  assert.match(html, /href="style\.css"/);
  assert.match(html, /src="app\.js"/);
  assert.doesNotMatch(html, /receptionist\/style\.css/);
  assert.doesNotMatch(html, /receptionist\/app\.js/);
  // And the repaired project is clean.
  assert.deepEqual(findBrokenReferences(files), []);
});

test("a correct project is left completely alone", () => {
  const good = [
    { path: "index.html", content: `<link href="style.css"><script src="js/app.js"></script>` },
    { path: "style.css", content: "body{}" },
    { path: "js/app.js", content: "//" },
  ];
  assert.deepEqual(findBrokenReferences(good), []);
  const { files, repaired } = repairReferences(good);
  assert.equal(repaired.length, 0);
  assert.deepEqual(files, good);
});

test("external and absolute references are never touched", () => {
  const files = [{
    path: "index.html",
    content: `<link href="https://fonts.googleapis.com/css2?family=Inter">
      <script src="//cdn.example.com/x.js"></script>
      <a href="#top">top</a><a href="mailto:a@b.c">mail</a>
      <img src="data:image/png;base64,iVBOR">
      <link href="/absolute.css">`,
  }];
  assert.deepEqual(findBrokenReferences(files), []);
});

test("a genuinely missing file is reported, never invented", () => {
  const files = [
    { path: "index.html", content: `<script src="missing.js"></script>` },
  ];
  const broken = findBrokenReferences(files);
  assert.equal(broken.length, 1);
  assert.equal(broken[0].reason, "missing");
  assert.equal(broken[0].suggestion, null);
  const { repaired, unresolved } = repairReferences(files);
  assert.equal(repaired.length, 0, "must not fabricate a target");
  assert.equal(unresolved.length, 1);
});

test("an ambiguous basename is reported, never guessed", () => {
  const files = [
    { path: "index.html", content: `<script src="wrong/app.js"></script>` },
    { path: "a/app.js", content: "//" },
    { path: "b/app.js", content: "//" },
  ];
  const broken = findBrokenReferences(files);
  assert.equal(broken[0].suggestion, null, "two candidates must not produce a guess");
  assert.equal(repairReferences(files).repaired.length, 0);
});

test("css url() and @import are checked too", () => {
  const files = [
    { path: "css/main.css", content: `@import "css/base.css"; body { background: url(css/bg.png); }` },
    { path: "css/base.css", content: "" },
    { path: "css/bg.png", content: "" },
  ];
  const broken = findBrokenReferences(files);
  assert.equal(broken.length, 2, "both the @import and the url() are wrong from inside css/");
  const { files: fixed } = repairReferences(files);
  assert.deepEqual(findBrokenReferences(fixed), []);
});

test("relative traversal resolves correctly", () => {
  assert.equal(resolveRef("a/b/index.html", "../style.css"), "a/style.css");
  assert.equal(resolveRef("a/b/index.html", "./x.js"), "a/b/x.js");
  assert.equal(resolveRef("index.html", "js/app.js"), "js/app.js");
  const files = [
    { path: "pages/index.html", content: `<link href="../style.css">` },
    { path: "style.css", content: "" },
  ];
  assert.deepEqual(findBrokenReferences(files), [], "a correct ../ reference must pass");
});

test("the gap text explains why a dead page is dead", () => {
  const gaps = referenceGaps(findBrokenReferences(MEASURED_BUILD));
  assert.equal(gaps.length, 2);
  assert.match(gaps.join(" "), /does not resolve from that file's own location/);
  assert.match(gaps.join(" "), /dead page/);
});
