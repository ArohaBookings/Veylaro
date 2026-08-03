/* ============================================================
   DESIGN BRIEF — the difference between "a page" and NOVA.

   Asked for a NOVA landing page with no help, Med produced this:

       <h1>NOVA</h1>
       <p>The high-performance design framework...</p>
       <a class="button primary">Get Started</a>

   Structurally correct. Visually nothing. Default type scale, default
   spacing, a flat button, and a reference to `nova-logo.svg` that doesn't
   exist. That is the slop.

   The good output — the one worth keeping — had a specific visual grammar:
   an enormous tight-tracked headline, ONE word carrying a gradient, a small
   pill badge above it, two buttons of different weight side by side, a soft
   radial glow off-centre, and a lot of black space. None of that is hard. The
   model simply doesn't reach for it unless told, because "make it look good"
   is not an instruction — it's a wish.

   So this is an instruction. Concrete values, not adjectives: exact spacing
   steps, an explicit type scale, the gradient recipe, the glow recipe. The
   model is very capable of executing a spec; it is bad at inventing taste on
   demand. Give it the spec.

   Only injected for visual work. A CLI tool or an API gets none of this.
   ============================================================ */

const VISUAL_ASK =
  /\b(ui|ux|interface|screen|page|landing|dashboard|website|site|app|form|component|design|layout|frontend|front-end|marketing|portfolio|hero|theme|style)\b/i;

/** Is this request going to produce something a person looks at? */
export function wantsVisualDesign(request: string): boolean {
  return VISUAL_ASK.test(request);
}

/**
 * The brief. Deliberately specific — every number here is a decision the model
 * would otherwise leave at the browser default, and browser defaults are what
 * "slop" looks like.
 */
export const DESIGN_BRIEF = `VISUAL BAR — this is not decoration, it is the job.

Default browser styling is a failed result. A 16px heading on a white body with a blue link is not a design, and shipping it wastes the user's time. Build to this spec:

SPACE
- Page sections breathe: 96–140px of vertical padding, never 20px.
- Content sits in a max-width container (1100–1200px) centred, with 24px side gutters.
- Related things are close, unrelated things are far. Use a consistent step: 8 / 16 / 24 / 40 / 64 / 96.

TYPE
- One display face for headings, one text face for body. System stack is fine: -apple-system, "Segoe UI", Inter, sans-serif.
- The hero headline is genuinely large: clamp(44px, 7vw, 84px), font-weight 700–800, line-height 1.02, letter-spacing -0.03em.
- Body copy is 16–18px, line-height 1.6, and never pure white on black — use a muted tone (#a1a1aa or similar) so the headline stays dominant.
- Never centre long paragraphs. Left-align body text.

COLOUR
- Commit to a dark base: #0a0a0b or #0b0b0f for the page, #141418 for raised surfaces.
- Pick ONE accent and use it sparingly. A gradient on a single word or a single button is striking; a gradient on everything is noise.
- Gradient text recipe:
    background: linear-gradient(135deg, #a78bfa, #6366f1);
    -webkit-background-clip: text; background-clip: text; color: transparent;
- Borders are barely-there: 1px solid rgba(255,255,255,0.08).

DEPTH
- One soft radial glow behind the hero, off-centre, low opacity:
    background: radial-gradient(600px circle at 70% 30%, rgba(99,102,241,0.18), transparent 60%);
- Buttons: primary is solid and high-contrast, secondary is a quiet outline. Different weights, side by side.
- Small pill badge above the headline for a version or status, 12–13px, rounded-full, subtle border.

MOTION
- Transitions on interactive things only: transition: all .2s ease. Hover states on every button and link.

RULES
- No lorem ipsum. Write real copy for this specific product.
- Never reference an image, font, logo or icon file you have not created. If you want a logo, draw it with inline SVG or CSS.
- Ship the styling in a real stylesheet, not a handful of inline styles.
- Responsive: it must not break at 390px wide.

THE FOUR WAYS THIS GOES WRONG — all four have been measured, do not repeat them:

1. GRADIENT ON THE WHOLE HERO. Putting the gradient on .hero / section / body paints a big purple rectangle and instantly looks generated. The hero background stays DARK. The gradient goes on ONE WORD of the headline, clipped:
     .hero { background: #0a0a0b; }                     /* right */
     .headline .accent { background: linear-gradient(135deg,#a78bfa,#6366f1);
       -webkit-background-clip: text; background-clip: text; color: transparent; }
   Not:
     .hero { background: linear-gradient(135deg,#a78bfa,#6366f1); }   /* wrong */

2. INVISIBLE TEXT. #141418 is a SURFACE colour, never a text colour. On a #0a0a0b page that is dark grey on near-black and cannot be read. Body text is #a1a1aa, headings are #ffffff. Check every colour pair you write.
   This includes SECTION headings: h2 and h3 must be given the heading colour explicitly. If you only set the muted colour on body, every h2 silently inherits that muted tone and the page reads as one flat grey wash with no hierarchy.

3. EVERYTHING CENTRED. Centre the hero headline if you like. Body paragraphs, feature cards and footers are LEFT-aligned. Three or more "text-align: center" rules means you centred things that should not be.

4. NOTES IN THE FILE. Never leave research links, URLs, TODOs or "here's what I'm thinking" comments in a stylesheet you ship.

WORKED EXAMPLE — copy this structure exactly, change the colours/copy to suit the product.
This is the shape that works. Do not deviate from where the gradient goes.

:root {
  --bg: #0a0a0b;
  --surface: #141418;
  --text: #a1a1aa;
  --heading: #ffffff;
  --accent-a: #a78bfa;
  --accent-b: #6366f1;
  --line: rgba(255,255,255,.08);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);            /* DARK. never a gradient here */
  color: var(--text);               /* muted, so headings dominate */
  font: 400 17px/1.6 -apple-system, "Segoe UI", Inter, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px; }

.hero { position: relative; padding: 128px 0 112px; overflow: hidden; background: var(--bg); }
.hero::after {                       /* the glow — this is the ONLY background gradient */
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(620px circle at 72% 28%, rgba(99,102,241,.20), transparent 62%);
}
.hero .wrap { position: relative; z-index: 1; }

.badge {
  display: inline-block; margin-bottom: 24px;
  padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px;
  font-size: 12px; letter-spacing: .01em; color: var(--heading);
  background: rgba(255,255,255,.03);
}

h1 {
  margin: 0 0 20px;
  font-size: clamp(44px, 7vw, 84px); font-weight: 800;
  line-height: 1.02; letter-spacing: -.03em; color: var(--heading);
  max-width: 15ch;
}
h1 .accent {                          /* THE GRADIENT LIVES HERE — one word */
  background: linear-gradient(135deg, var(--accent-a), var(--accent-b));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.sub { margin: 0 0 40px; max-width: 46ch; font-size: 18px; }  /* left-aligned */

.cta { display: flex; gap: 12px; flex-wrap: wrap; }
.btn { padding: 13px 22px; border-radius: 10px; font-weight: 600; font-size: 15px;
       text-decoration: none; transition: all .2s ease; border: 1px solid transparent; }
.btn-primary { background: var(--heading); color: #0a0a0b; }
.btn-primary:hover { transform: translateY(-1px); opacity: .92; }
.btn-ghost { background: transparent; color: var(--heading); border-color: var(--line); }
.btn-ghost:hover { background: rgba(255,255,255,.05); }

.features { padding: 112px 0; }
h2 { margin: 0 0 40px; font-size: clamp(28px, 3.4vw, 40px); font-weight: 700;
     line-height: 1.1; letter-spacing: -.02em; color: var(--heading); }  /* headings are NEVER the muted body colour */
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; }
.card { padding: 28px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.card h3 { margin: 0 0 8px; color: var(--heading); font-size: 18px; letter-spacing: -.01em; }
.card p { margin: 0; font-size: 15px; }

footer { padding: 56px 0; border-top: 1px solid var(--line); font-size: 14px; }

@media (max-width: 640px) {
  .hero { padding: 80px 0 64px; }
  h1 { font-size: 40px; }
}

Before you finish, look at what you wrote and ask: does this look like a product someone paid for, or like an unstyled form? If it's the second one, it isn't done.`;

/**
 * The brief, only when it applies.
 *
 * Returns "" for non-visual work so a CLI tool or a parser doesn't get a
 * lecture about radial gradients.
 */
export function designBriefFor(request: string): string {
  return wantsVisualDesign(request) ? DESIGN_BRIEF : "";
}

/* ---- grading -------------------------------------------------------------
   The same spec, checked against what was actually produced. This is not a
   taste judgement — every one of these is a concrete, checkable decision that
   separates the two outputs above. */

export interface DesignVerdict {
  /** 0-100, how much of the spec the artifact actually meets. */
  score: number;
  met: string[];
  missing: string[];
}

/* PRESENCE IS NOT COMPOSITION.

   The first version of this grader scored token presence and gave 86/100 to a
   page that was visibly wrong: the gradient washed across the ENTIRE hero as a
   purple background instead of clipping to one word, and body text was set to
   #141418 on a #0a0a0b page — dark grey on near-black, effectively invisible.
   It contained `linear-gradient`, `clamp()` and `letter-spacing:-0.03em`, so it
   scored well while looking nothing like the target.

   A grader that rewards the right tokens in the wrong places teaches the model
   to produce exactly that. So these checks are about WHERE things are and
   whether the result is legible — the failures are worth more than the wins. */

/* CSS custom properties are the correct way to write this, and the first
   grader punished them: it looked for a literal hex in `body { background: … }`
   and saw `var(--bg)`, so the worked example scored 72 against its own spec.
   A grader that penalises good practice teaches bad practice. Resolve the
   variables first. */
function resolveVars(css: string): string {
  const vars = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
    vars.set(m[1].trim(), m[2].trim());
  }
  let out = css;
  // Two passes: a variable may be defined in terms of another.
  for (let i = 0; i < 2; i++) {
    out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (whole, name) => vars.get(name) ?? whole);
  }
  return out;
}

/** Parse `#rgb`/`#rrggbb` to relative luminance (WCAG). */
function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a), lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The page background and the body text colour, as declared. */
function bodyColours(css: string): { bg: string | null; fg: string | null } {
  const block = /body\s*\{([^}]*)\}/i.exec(css)?.[1] ?? "";
  const bg = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})/i.exec(block)?.[1] ?? null;
  const fg = /(?:^|[;{])\s*color\s*:\s*(#[0-9a-f]{3,8})/i.exec(block)?.[1] ?? null;
  return { bg, fg };
}

/** A gradient applied to a whole page/hero/section rather than to text or a
    button. This is the single biggest "looks generated" tell. */
function gradientOnLargeSurface(css: string): boolean {
  const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  for (const [, selRaw, body] of blocks) {
    if (!/linear-gradient|radial-gradient/i.test(body)) continue;
    // A radial glow is depth, not a wash — allowed.
    if (/radial-gradient/i.test(body) && !/linear-gradient/i.test(body)) continue;
    // Clipped to text is exactly what we want.
    if (/background-clip\s*:\s*text/i.test(body)) continue;
    const sel = selRaw.trim().toLowerCase();
    // `\b` does not match before a leading ".", so class selectors were slipping
    // through — which is exactly how a full-bleed purple hero scored 86/100.
    if (/(?:^|[\s,>+~])(?:body|html|header|section|main|\.hero\b|\.header\b|\.container\b|\.page\b|\.wrapper\b|\.banner\b)/.test(sel)) return true;
  }
  return false;
}

const CHECKS: { name: string; test: (css: string) => boolean; weight: number }[] = [
  { name: "dark base colour", weight: 8, test: (c) => {
      const { bg } = bodyColours(c);
      const l = bg ? luminance(bg) : null;
      return l !== null && l < 0.06;
    } },
  { name: "large fluid headline", weight: 12, test: (c) => /font-size\s*:\s*clamp\(|font-size\s*:\s*(?:[4-9]\d|\d{3})px|font-size\s*:\s*[3-9](?:\.\d+)?rem/i.test(c) },
  { name: "tightened heading tracking", weight: 6, test: (c) => /letter-spacing\s*:\s*-\s*0?\.\d+(?:em|px|rem)/i.test(c) },
  { name: "gradient CLIPPED TO TEXT", weight: 14, test: (c) => /background-clip\s*:\s*text|-webkit-background-clip\s*:\s*text/i.test(c) },
  { name: "soft glow for depth", weight: 8, test: (c) => /radial-gradient\(/i.test(c) },
  { name: "generous section spacing", weight: 8, test: (c) => /padding[^:;]*:\s*(?:[6-9]\d|1\d{2})px|padding[^:;]*:\s*(?:[4-9](?:\.\d+)?rem)/i.test(c) },
  { name: "centred max-width container", weight: 8, test: (c) => /max-width\s*:\s*(?:[89]\d{2}|1[0-4]\d{2})px/i.test(c) && /margin\s*:\s*0\s+auto/i.test(c) },
  { name: "hover states", weight: 6, test: (c) => /:hover\s*\{/i.test(c) },
  { name: "transitions", weight: 4, test: (c) => /transition\s*:/i.test(c) },
  { name: "responsive breakpoint", weight: 6, test: (c) => /@media[^{]*\((?:max|min)-width/i.test(c) },
  { name: "subtle borders", weight: 4, test: (c) => /border\s*:\s*1px\s+solid\s+rgba\(255,\s*255,\s*255,\s*0?\.\d+\)/i.test(c) },
  // Section headings must be given a colour of their own. Without this they
  // inherit the muted body tone and the page reads as one flat grey wash —
  // measured: .features h2 came out rgb(161,161,170) on a real build because
  // the worked example never set it.
  { name: "section headings (h2) given a heading colour", weight: 6, test: (c) => {
      // Must be h2 specifically. The first version accepted ANY h2/h3 rule with a
      // colour, so a page passed on `.card h3 { color: … }` while every section
      // h2 still inherited the muted body tone — measured rgb(161,161,170) on a
      // real build that then scored 90. Nearly accepted it.
      const h2Blocks = [...c.matchAll(/([^{}]*\bh2\b[^{}]*)\{([^}]*)\}/gi)];
      if (!h2Blocks.length) return false;
      return h2Blocks.some(([, , body]) => /(?:^|[;{])\s*color\s*:/i.test(body));
    } },
];

/* Failures. These are worth more than any single win, because each one is
   visible from across the room and no amount of correct tokens compensates. */
const FAILURES: { name: string; test: (css: string) => boolean; penalty: number }[] = [
  { name: "BODY TEXT IS UNREADABLE ON THE BACKGROUND", penalty: 45, test: (c) => {
      const { bg, fg } = bodyColours(c);
      if (!bg || !fg) return false;
      const ratio = contrastRatio(bg, fg);
      return ratio !== null && ratio < 3;
    } },
  { name: "GRADIENT WASHED OVER A WHOLE SECTION INSTEAD OF ONE WORD", penalty: 30, test: gradientOnLargeSurface },
  { name: "research links or URLs left in the stylesheet", penalty: 10, test: (c) => /^\s*\/\*[\s\S]{0,400}https?:\/\//m.test(c) },
  { name: "everything centred, including body copy", penalty: 10, test: (c) =>
      (c.match(/text-align\s*:\s*center/gi) || []).length >= 3 },
];

/** Grade what was actually written. Wins add, composition failures subtract —
    and a failure outweighs several wins, because it is visible from across the
    room and no amount of correct tokens compensates for it. */
export function gradeDesign(rawCss: string): DesignVerdict {
  const css = resolveVars(rawCss);
  const met: string[] = [];
  const missing: string[] = [];
  let score = 0;
  for (const c of CHECKS) {
    if (c.test(css)) { score += c.weight; met.push(c.name); }
    else missing.push(c.name);
  }
  for (const f of FAILURES) {
    if (f.test(css)) { score -= f.penalty; missing.unshift(f.name); }
  }
  return { score: Math.max(0, Math.min(100, score)), met, missing };
}

/** What to hand back when the design bar wasn't met. */
export function designGaps(verdict: DesignVerdict): string[] {
  if (!verdict.missing.length) return [];
  return [
    `The styling misses ${verdict.missing.length} of the visual bar (scored ${verdict.score}/100): ${verdict.missing.join(", ")}. ` +
    `This currently looks like default browser styling, which is not a finished design. Go back into the stylesheet and add them — real values, not adjectives.`,
  ];
}
