/* ============================================================
   WORK PRESERVATION — a rewrite may not destroy finished work.

   MEASURED, live, watching a real build's file sizes step by step:

       3 files / 278 lines
       3 files / 240 lines     <- overwrote a file with a shorter one
       3 files / 242 lines
       3 files / 215 lines     <- again
       3 files / 216 lines

   The project went BACKWARDS, repeatedly, and the user watched it happen:
   "its fucken deleting its own code lines". They were right.

   There was already a regression guard, but it ran AFTER the write — it noticed
   the loss and asked the model to put it back. By then the good version was
   gone from disk, and the model, asked to reproduce 80 lines it no longer had
   in front of it, produced another short one. Detecting destruction is not the
   same as preventing it.

   This refuses the write. An existing file of real size cannot be replaced by a
   substantially shorter one — the good version stays on disk and the model is
   told exactly what it tried to do and what to do instead (@@APPEND). Because
   the file is never lost, the next attempt starts from the full version rather
   than from a stub.

   Deliberately narrow, so genuine work is never blocked:
     - only files that are already substantial (>= 25 non-blank lines)
     - only shrinkage past 60% of the original
     - never blocks creating a file, or growing one, or a modest tidy-up
     - a caller doing a deliberate refactor can pass `force`
   ============================================================ */

export interface ShrinkVerdict {
  /** True when the write would destroy meaningful finished work. */
  destructive: boolean;
  beforeLines: number;
  afterLines: number;
  /** What to tell the model. Empty when the write is fine. */
  brief: string;
}

function codeLines(content: string): number {
  return content.split("\n").filter((l) => l.trim()).length;
}

/** Below this, a file is a stub and churn is harmless. */
const SUBSTANTIAL_LINES = 25;
/** A rewrite may not drop below this fraction of the original. */
const MIN_RETAINED = 0.6;

export function assessShrink(path: string, existing: string | null, next: string): ShrinkVerdict {
  const beforeLines = existing == null ? 0 : codeLines(existing);
  const afterLines = codeLines(next);
  const destructive =
    existing != null &&
    beforeLines >= SUBSTANTIAL_LINES &&
    afterLines < beforeLines * MIN_RETAINED;

  if (!destructive) return { destructive: false, beforeLines, afterLines, brief: "" };

  return {
    destructive: true,
    beforeLines,
    afterLines,
    brief: [
      `That rewrite of ${path} was REFUSED and the existing file is untouched.`,
      `You sent ${afterLines} lines to replace ${beforeLines}. That deletes ${beforeLines - afterLines} lines of work that was already correct.`,
      "",
      `${path} is still exactly as it was. Do not try to reproduce it — you clearly cannot hold all ${beforeLines} lines accurately, and that is what keeps going wrong.`,
      "",
      "To ADD to it, append only the new code:",
      "",
      `@@APPEND ${path}`,
      "<only the new function(s) — nothing already in the file>",
      "@@END",
      "",
      "If you genuinely need to change existing lines, read it first with:",
      `@@READ ${path}`,
    ].join("\n"),
  };
}
