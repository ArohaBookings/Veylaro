/* ============================================================
   VISION JUDGE — the auto, brutal UI critic.

   The objective audit (uiCritique.ts) measures what's countable —
   contrast, overflow, type-scale, dead space. But taste is visual:
   "the glow is amateurish", "this is the generic template", "the
   right half is dead". A text model can't see that. A VISION model
   can. So this closes the loop: screenshot the render → ask a
   multimodal model to critique it like a brutal senior designer →
   parse a score + concrete fixes → hand them to Laro to apply.

   It's model-agnostic: it uses whatever vision model is installed
   (moondream is small/fast; llava / qwen2.5-vl / a future Laro-Vision
   are sharper). No vision model present → it no-ops and the objective
   audit still runs. Honest ceiling: a SMALL local VLM gives a decent
   second opinion, not a world-class eye — a bigger judge = sharper.
   ============================================================ */

/** Vision models we'll use as the taste critic, best first. */
export const VISION_MODELS = [
  "laro-vision",
  "mlx-community/Qwen2-VL-2B-Instruct-4bit",
  "qwen2.5vl",
  "llava:13b",
  "llava",
  "bakllava",
  "moondream",
];

/** Pick the sharpest installed vision model, or null if none. */
export function pickVisionModel(installed: string[]): string | null {
  for (const want of VISION_MODELS) {
    const hit = installed.find((n) => n === want || n.startsWith(`${want}:`));
    if (hit) return hit;
  }
  return null;
}

/** The brutal-designer prompt. Asks for a strict JSON verdict so we can act on it. */
export const VISION_CRITIQUE_PROMPT = `You are the most demanding product designer alive — Fable-5 / Linear / Vercel bar. Judge THIS UI screenshot with zero mercy. Reply ONLY with strict JSON:
{"score": <0-10 integer, where 8+ means genuinely world-class>, "issues": ["concrete fix", "concrete fix", "concrete fix"]}
Judge: composition and use of space (empty/dead areas are a serious fault), visual hierarchy, spacing rhythm, colour and depth, typography, and polish. Each issue must be specific and actionable ("the hero's right half is empty — add a product mockup", not "improve layout"). No prose, JSON only.`;

export interface VisionVerdict { score: number; issues: string[]; raw?: string }

/** Parse the model's reply into a verdict (tolerant of a stray sentence around the JSON). */
export function parseVerdict(reply: string): VisionVerdict {
  const m = reply.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      const score = Math.max(0, Math.min(10, Math.round(Number(j.score))));
      const issues = Array.isArray(j.issues) ? j.issues.map((s: any) => String(s)).filter(Boolean).slice(0, 6) : [];
      if (!Number.isNaN(score)) return { score, issues, raw: reply };
    } catch { /* fall through */ }
  }
  // no JSON — salvage a rough score + treat the prose as one issue
  const sm = reply.match(/\b([0-9](?:\.[0-9])?)\s*\/\s*10\b/);
  return { score: sm ? Math.round(Number(sm[1])) : 5, issues: reply.trim() ? [reply.trim().slice(0, 200)] : [], raw: reply };
}

/** Turn a verdict into the repair critique fed to Laro (only when it's not good enough). */
export function verdictToCritique(v: VisionVerdict): string {
  if (v.score >= 8 || !v.issues.length) return "";
  return `A brutal design review of the rendered page scored it ${v.score}/10. Raise it toward 9+ by fixing exactly these — rewrite the affected file(s) with @@FILE … @@END, keep the content, lift the craft:\n${v.issues.map((i) => `- ${i}`).join("\n")}`;
}
