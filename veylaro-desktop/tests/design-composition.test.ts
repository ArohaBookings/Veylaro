import test from "node:test";
import assert from "node:assert/strict";
import { DESIGN_BRIEF, gradeDesign } from "../src/engine/designSystem";

/** VERBATIM from a real app build that the naive grader scored 86/100 and that
    rendered as a full-bleed purple rectangle with unreadable body text. */
const MEASURED_86 = `
/*
  https://www.landy-ai.com/blog/hero-section-design
  https://landinggo.com/component/hero-marketing-dark
*/
body { margin: 0; font-family: -apple-system, Inter, sans-serif;
       background-color: #0a0a0b; color: #141418; line-height: 1.6; }
.container { max-width: 1100px; margin: 0 auto; padding: 96px 24px; }
.hero { position: relative; background: linear-gradient(135deg, #a78bfa, #6366f1);
        padding: 140px 24px; text-align: center; }
.hero-headline { font-size: clamp(44px, 7vw, 84px); font-weight: 700;
                 line-height: 1.02; letter-spacing: -0.03em; color: #fff; }
.hero-subheadline { font-size: 18px; color: #a1a1aa; }
`;

const NOVA_SHAPED = `
body { margin: 0; font-family: -apple-system, Inter, sans-serif;
       background-color: #0a0a0b; color: #a1a1aa; line-height: 1.6; }
.container { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
.hero { background: #0a0a0b; padding: 120px 0; position: relative; }
.hero::before { content: ""; position: absolute; inset: 0;
  background: radial-gradient(600px circle at 70% 30%, rgba(99,102,241,0.18), transparent 60%); }
.headline { font-size: clamp(44px, 7vw, 84px); font-weight: 800; line-height: 1.02;
            letter-spacing: -0.03em; color: #fff; }
.headline .accent { background: linear-gradient(135deg, #a78bfa, #6366f1);
  -webkit-background-clip: text; background-clip: text; color: transparent; }
.badge { border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 999px; padding: 6px 12px; }
.btn { transition: all .2s ease; }
.btn:hover { transform: translateY(-1px); }
@media (max-width: 640px) { .hero { padding: 64px 0; } }
`;

test("the composition grader rejects the page that scored 86 on token presence", () => {
  const g = gradeDesign(MEASURED_86);
  assert.ok(g.score <= 20, `still scored ${g.score}; it renders as a purple rectangle`);
  assert.ok(g.missing.some((m) => /UNREADABLE/.test(m)), "must catch #141418 text on #0a0a0b");
  assert.ok(g.missing.some((m) => /WASHED OVER A WHOLE SECTION/.test(m)), "must catch the full-bleed gradient");
  assert.ok(g.missing.some((m) => /research links/.test(m)), "must catch URLs left in the file");
});

test("a genuinely Nova-shaped stylesheet scores well", () => {
  const g = gradeDesign(NOVA_SHAPED);
  assert.ok(g.score >= 75, `scored ${g.score}, missing: ${g.missing.join(", ")}`);
  assert.equal(g.missing.filter((m) => /^[A-Z ]{8,}$/.test(m)).length, 0, "no composition failures");
});

test("the two are separated by a wide margin", () => {
  assert.ok(gradeDesign(NOVA_SHAPED).score - gradeDesign(MEASURED_86).score >= 55);
});

test("a dark hero with a clipped gradient word is not penalised", () => {
  const ok = `.hero { background: #0a0a0b; }
    .accent { background: linear-gradient(135deg,#a78bfa,#6366f1); background-clip: text; color: transparent; }`;
  assert.ok(!gradeDesign(ok).missing.some((m) => /WASHED OVER/.test(m)));
});

test("the brief names all four measured failure modes", () => {
  assert.match(DESIGN_BRIEF, /GRADIENT ON THE WHOLE HERO/);
  assert.match(DESIGN_BRIEF, /INVISIBLE TEXT/);
  assert.match(DESIGN_BRIEF, /EVERYTHING CENTRED/);
  assert.match(DESIGN_BRIEF, /NOTES IN THE FILE/);
  assert.match(DESIGN_BRIEF, /#141418 is a SURFACE colour, never a text colour/);
});
