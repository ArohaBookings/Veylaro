/* ============================================================
   COMPLETION GATE — "@@DONE" is a claim, not evidence.

   Small local models habitually write one skeleton file and declare victory.
   Measured on the real engine: asked to "get started on the ai receptionist ui",
   Laro Lite wrote a 227-byte component containing only <h1>AI Receptionist</h1>
   and emitted @@DONE in 5 seconds.

   This gate judges the ARTIFACT, not the model's confidence. When the deliverable
   is obviously thinner than what was asked for, @@DONE is rejected and the loop
   continues with a precise, concrete list of what is still missing. The model
   cannot talk its way past it — the checks read the files that exist on disk.

   Deliberately conservative: it only blocks completion when it can name a
   specific, objective shortfall. It never demands work the user didn't ask for.
   ============================================================ */

export interface DeliverableFile {
  path: string;
  content: string;
}

export interface CompletionVerdict {
  complete: boolean;
  /** Concrete, checkable things the artifact is missing. */
  missing: string[];
  /** One-line honest summary for the run log. */
  reason: string;
}

const UI_REQUEST = /\b(ui|ux|interface|screen|page|dashboard|app|website|site|landing|form|component|frontend|front-end|design|receptionist|portal|panel|admin)\b/i;
const APP_SCALE = /\b(saas|platform|product|system|dashboard|portal|admin|full|whole|complete|end[- ]to[- ]end|multi|several|suite)\b/i;
const API_REQUEST = /\b(api|endpoint|server|backend|back-end|route|rest|graphql|database|db|auth|login|signup)\b/i;

/** Markup/DOM that a user can actually see. */
const HAS_MARKUP = /<\/?[a-z][\s\S]*>|createElement|render\s*\(|innerHTML/i;
/** Something the user can actually operate. */
const INTERACTIVE = /<(?:button|input|textarea|select|form|a\s)|onclick|onClick|onChange|onSubmit|addEventListener|href=|role="button"/i;
/** Evidence of deliberate visual design rather than raw defaults. */
const STYLED = /<style|\.css|className=|class=|styled\.|tailwind|sx=\{|style=\{|:root|--[a-z-]+\s*:/i;
/** Text that admits the work was not actually done. Deliberately specific:
    `placeholder="…"` is a legitimate HTML attribute, not an unfinished marker. */
const PLACEHOLDER =
  /\bTODO\b|\bFIXME\b|\bXXX\b|coming soon|lorem ipsum|placeholder (?:text|content|here)|implement(?:ation)? (?:this |it )?(?:here|later)|your code (?:goes )?here|(?:rest|remainder) of the (?:code|file|component|markup)|(?:code |markup )?(?:omitted|unchanged)(?: for brevity)?|^\s*\.{3,}\s*$/im;

function codeLines(content: string): number {
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(?:\/\/|\/\*|\*|#|<!--)/.test(l)).length;
}

const isStyle = (p: string) => /\.(?:css|scss|less)$/i.test(p);
const isMarkupOrComponent = (p: string) => /\.(?:html?|[cm]?[jt]sx?|vue|svelte)$/i.test(p);

/**
 * Judge whether the work actually satisfies the request.
 *
 * @param request  what the user asked for, verbatim
 * @param files    every file written this run (path + final content)
 * @param opts.existingProject  true when editing a project that already exists —
 *        a small, surgical diff is legitimate there, so scale checks are relaxed.
 */
export function assessDeliverable(
  request: string,
  files: readonly DeliverableFile[],
  opts: { existingProject?: boolean } = {},
): CompletionVerdict {
  const missing: string[] = [];

  if (!files.length) {
    return { complete: false, missing: ["No file was written at all."], reason: "nothing was produced" };
  }

  const totalCode = files.reduce((n, f) => n + codeLines(f.content), 0);
  const joined = files.map((f) => f.content).join("\n");
  const wantsUI = UI_REQUEST.test(request);
  const wantsScale = APP_SCALE.test(request);
  const wantsApi = API_REQUEST.test(request);

  // A placeholder is an explicit admission the work is unfinished.
  const placeholderFile = files.find((f) => PLACEHOLDER.test(f.content));
  if (placeholderFile) {
    missing.push(`${placeholderFile.path} still contains placeholder text — replace it with the real implementation.`);
  }

  // Editing an existing project legitimately produces small diffs; a fresh build
  // that is only a stub does not.
  if (!opts.existingProject) {
    if (totalCode < 25) {
      missing.push(`Only ${totalCode} lines of real code exist — this is a stub, not a working result. Build the actual thing.`);
    }

    if (wantsUI) {
      const viewFiles = files.filter((f) => isMarkupOrComponent(f.path));
      if (!viewFiles.length || !HAS_MARKUP.test(joined)) {
        missing.push("There is no renderable markup — the user cannot see anything yet.");
      }
      if (!INTERACTIVE.test(joined)) {
        missing.push("Nothing is interactive: add the real controls (buttons, inputs, a form) with working handlers.");
      }
      if (!STYLED.test(joined) && !files.some((f) => isStyle(f.path))) {
        missing.push("There is no styling — add the CSS/classes so it looks like a real product, not unstyled HTML.");
      }
    }

    if (wantsScale && files.length < 3 && totalCode < 150) {
      missing.push("A product-scale request needs more than one thin file — build the real screens/sections and wire them together.");
    }

    if (wantsApi && !/\b(?:app\.(?:get|post|put|delete)|router\.|fetch\(|axios|createServer|export (?:async )?function (?:GET|POST)|@app\.route)\b/i.test(joined)) {
      missing.push("The requested API/server behaviour has no implementation — add the actual endpoints/handlers.");
    }
  }

  const complete = missing.length === 0;
  return {
    complete,
    missing,
    reason: complete
      ? `${files.length} file(s), ${totalCode} lines — meets the request`
      : `premature completion: ${missing.length} gap(s) across ${files.length} file(s)/${totalCode} lines`,
  };
}

/** The push-back handed to the model when it declares @@DONE too early. */
export function continuationBrief(verdict: CompletionVerdict): string {
  return [
    "Not done yet — I checked what you actually wrote against what was asked, and it is incomplete:",
    ...verdict.missing.map((m) => `- ${m}`),
    "",
    "Keep building now. Write the COMPLETE files with @@FILE … @@END (full contents, never a diff or an ellipsis).",
    "Make it something a real user could open and use. Only output @@DONE when that is genuinely true.",
  ].join("\n");
}
