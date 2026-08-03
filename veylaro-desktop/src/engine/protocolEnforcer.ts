/* ============================================================
   PROTOCOL ENFORCER — the fix for "it just stops".

   Measured on the real engine, Med, mid-build: step 1 wrote index.html (51
   lines). The completion gate correctly rejected it and handed back a prose
   brief listing the gaps. Step 2 replied with PROSE — no @@FILE block, nothing
   written, zero progress. Two more of those and the run ends having produced 51
   lines for a request that needed thousands.

   The old defence had two holes:
     - it only ran for the Lite tier (`liteReinforced`), and
     - it only fired when the reply CONTAINED code that wasn't in a file
       (`wroteCodeButNoFile`). A reply that is pure prose — "Great, next I'll
       add the booking list…" — slipped straight through as an idle step.

   A prose reply to a build instruction is a protocol failure, not a
   conversation. So: every tier, every idle step, and the demand gets narrower
   each time instead of repeating the same paragraph the model just ignored.

     attempt 1  restate the shape and name the exact next file
     attempt 2  one file only, path given, reply must OPEN with @@FILE
     attempt 3  strip everything — first characters of the reply are @@FILE

   Narrowing works where repetition doesn't: each step removes a degree of
   freedom the model used to go off-protocol, until the only legal reply is the
   one we need.
   ============================================================ */

/** Files a general web build needs, in the order they become useful. Used to
    name a concrete next target when the model stalls on "what now?". */
const SCAFFOLD_ORDER = [
  "index.html",
  "styles.css",
  "app.js",
  "src/App.tsx",
  "src/main.tsx",
  "src/styles.css",
];

export interface EnforcementContext {
  /** What the user originally asked for. */
  request: string;
  /** Concrete gaps from the completion gate. */
  missing: readonly string[];
  /** Paths already written this run. */
  existingPaths: readonly string[];
  /** How many consecutive steps have produced nothing. */
  attempt: number;
}

/**
 * Pick the single most useful next file to demand.
 *
 * Preference order: a path the gate explicitly named, then the first standard
 * scaffold file that doesn't exist yet, then a numbered new module so the model
 * is never asked to "write the next file" without being told which one.
 */
export function nextTarget(ctx: EnforcementContext): string {
  const named = ctx.missing
    .join(" ")
    .match(/\b([\w.-]+\/)*[\w.-]+\.(?:html?|css|[cm]?[jt]sx?|json|py|md)\b/);
  if (named && !ctx.existingPaths.includes(named[0])) return named[0];

  for (const candidate of SCAFFOLD_ORDER) {
    if (!ctx.existingPaths.includes(candidate)) {
      // Only suggest a stylesheet/script once there is markup to attach it to.
      if (candidate !== "index.html" && !ctx.existingPaths.length) continue;
      return candidate;
    }
  }
  return `src/Module${ctx.existingPaths.length + 1}.tsx`;
}

/** True when a reply to a build instruction failed to use the protocol at all. */
export function isProtocolFailure(filesThisStep: number, commandsThisStep: number): boolean {
  return filesThisStep === 0 && commandsThisStep === 0;
}

/**
 * The brief to send after an idle step. Narrows with each attempt.
 */
export function enforcementBrief(ctx: EnforcementContext): string {
  const target = nextTarget(ctx);

  if (ctx.attempt <= 1) {
    return [
      "That reply wrote nothing to disk, so no progress was made. Talking about the work is not doing it.",
      "",
      `Write ${target} NOW, in full, using exactly this shape:`,
      "",
      `@@FILE ${target}`,
      "<the entire file contents>",
      "@@END",
      "",
      "The whole file, never a diff, never an ellipsis, never \"rest unchanged\".",
      ctx.missing.length ? `Still missing: ${ctx.missing[0]}` : "",
    ].filter(Boolean).join("\n");
  }

  if (ctx.attempt === 2) {
    return [
      "Still nothing was saved. Stop explaining and stop planning.",
      "",
      `Your reply must contain ONE thing: the complete ${target}.`,
      `Begin your reply with the line "@@FILE ${target}" and end it with "@@END".`,
      "No greeting, no summary, no markdown fences, no commentary before or after.",
    ].join("\n");
  }

  return [
    `The first characters of your reply must be: @@FILE ${target}`,
    "Then the complete file contents. Then @@END. Nothing else at all.",
  ].join("\n");
}
