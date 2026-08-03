import test from "node:test";
import assert from "node:assert/strict";
import { designBriefFor, gradeDesign, wantsVisualDesign } from "../src/engine/designSystem";

/** What Med produced for "NOVA landing page, dark theme" with no brief. */
const SLOP = `
body { background: #111; color: #fff; font-family: sans-serif; }
.hero { padding: 20px; text-align: center; }
.hero h1 { font-size: 48px; }
.button { background: blue; color: white; padding: 10px; }
`;

/** The shape of the output actually worth shipping. */
const GOOD = `
body { background: #0a0a0b; color: #a1a1aa; font-family: -apple-system, Inter, sans-serif; }
.container { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
.hero { padding: 120px 0; position: relative; }
.hero::before { content: ""; position: absolute; inset: 0;
  background: radial-gradient(600px circle at 70% 30%, rgba(99,102,241,0.18), transparent 60%); }
.hero h1 { font-size: clamp(44px, 7vw, 84px); font-weight: 800; line-height: 1.02; letter-spacing: -0.03em; color: #fff; }
.hero h1 .accent { background: linear-gradient(135deg, #a78bfa, #6366f1);
  -webkit-background-clip: text; background-clip: text; color: transparent; }
.badge { font-size: 12px; border: 1px solid rgba(255,255,255,0.08); border-radius: 999px; padding: 6px 12px; }
.btn { transition: all .2s ease; }
.btn:hover { transform: translateY(-1px); }
@media (max-width: 640px) { .hero { padding: 64px 0; } }
`;

test("the grader separates the slop from the good output", () => {
  const slop = gradeDesign(SLOP);
  const good = gradeDesign(GOOD);
  assert.ok(slop.score < 60, `slop scored ${slop.score}, should be under the bar`);
  assert.ok(good.score >= 75, `good output scored ${good.score}, missing: ${good.missing.join(", ")}`);
  assert.ok(good.score - slop.score > 35, "the two must be clearly separated");
});

test("it names what is actually missing, not vibes", () => {
  const { missing } = gradeDesign(SLOP);
  // Check names track the composition-aware grader: it is not enough to HAVE a
  // gradient, it has to be clipped to text rather than washed over a section.
  assert.ok(missing.includes("gradient CLIPPED TO TEXT"), missing.join(", "));
  assert.ok(missing.includes("soft glow for depth"), missing.join(", "));
  assert.ok(missing.includes("responsive breakpoint"));
  assert.ok(missing.includes("hover states"));
});

test("the brief is only injected for visual work", () => {
  assert.ok(wantsVisualDesign("build a landing page"));
  assert.ok(wantsVisualDesign("an ai receptionist ui"));
  assert.equal(wantsVisualDesign("write a python script to parse csv files"), false);
  assert.equal(designBriefFor("write a csv parser"), "");
  // A dashboard now gets the DASHBOARD brief — asserting it gets the hero type
  // scale is the exact bug that pushed a "Welcome Back" hero into a task board.
  assert.match(designBriefFor("build a landing page"), /clamp\(44px, 7vw, 84px\)/);
  assert.match(designBriefFor("build a dashboard"), /PRODUCT SCREEN, not a marketing page/);
});

test("the brief bans referencing assets that don't exist", () => {
  // Med referenced nova-logo.svg, which it never created.
  assert.match(designBriefFor("build a landing page"), /Never reference an image, font, logo or icon file you have not created/);
});
