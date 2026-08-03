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

const CHECKS: { name: string; test: RegExp; weight: number }[] = [
  { name: "dark base colour", test: /background(?:-color)?\s*:\s*(?:#0[0-9a-f]{2,5}\b|#1[0-4][0-9a-f]{1,4}\b|rgb\(\s*(?:[0-9]|1[0-9]|2[0-5])\s*,)/i, weight: 10 },
  { name: "large fluid headline", test: /font-size\s*:\s*clamp\(|font-size\s*:\s*(?:[4-9]\d|\d{3})px|font-size\s*:\s*[3-9](?:\.\d+)?rem/i, weight: 14 },
  { name: "tightened heading tracking", test: /letter-spacing\s*:\s*-\s*0?\.\d+(?:em|px|rem)/i, weight: 8 },
  { name: "gradient accent", test: /linear-gradient\([^)]*\)/i, weight: 12 },
  { name: "gradient text clip", test: /background-clip\s*:\s*text|-webkit-background-clip\s*:\s*text/i, weight: 8 },
  { name: "soft glow / depth", test: /radial-gradient\(|box-shadow\s*:\s*[^;]*rgba/i, weight: 8 },
  { name: "generous section spacing", test: /padding\s*:\s*(?:[6-9]\d|1\d{2})px|padding(?:-block|-top|-bottom)?\s*:\s*(?:[4-9](?:\.\d+)?rem|\d{2,}(?:\.\d+)?rem)/i, weight: 10 },
  { name: "centred max-width container", test: /max-width\s*:\s*(?:[89]\d{2}|1[0-4]\d{2})px[\s\S]{0,120}margin\s*:\s*0\s+auto|margin\s*:\s*0\s+auto[\s\S]{0,120}max-width\s*:\s*(?:[89]\d{2}|1[0-4]\d{2})px/i, weight: 8 },
  { name: "muted body text", test: /color\s*:\s*(?:#[89ab][0-9a-f]{2,5}\b|rgba?\(\s*(?:1[5-9]\d|2[0-4]\d)\s*,[^)]*0?\.[3-8]\s*\))/i, weight: 6 },
  { name: "hover states", test: /:hover\s*\{/i, weight: 6 },
  { name: "transitions", test: /transition\s*:/i, weight: 4 },
  { name: "responsive breakpoint", test: /@media[^{]*\((?:max|min)-width/i, weight: 6 },
];

/** Grade the visual quality of what was actually written. */
export function gradeDesign(css: string): DesignVerdict {
  const met: string[] = [];
  const missing: string[] = [];
  let score = 0;
  for (const c of CHECKS) {
    if (c.test.test(css)) { score += c.weight; met.push(c.name); }
    else missing.push(c.name);
  }
  return { score, met, missing };
}

/** What to hand back when the design bar wasn't met. */
export function designGaps(verdict: DesignVerdict): string[] {
  if (!verdict.missing.length) return [];
  return [
    `The styling misses ${verdict.missing.length} of the visual bar (scored ${verdict.score}/100): ${verdict.missing.join(", ")}. ` +
    `This currently looks like default browser styling, which is not a finished design. Go back into the stylesheet and add them — real values, not adjectives.`,
  ];
}
