/* ============================================================
   COLLAPSE ESCAPE — repeating the same instruction gets the same collapse.

   MEASURED, live, in the shipped app. A build had produced three working files
   (index.html 55, style.css 81, app.js 80) and was asked to add edit-save
   behaviour. The transcript then read, five times:

       output collapsed into repetition — discarding it and retrying cleanly
       📁 Refining the edit functionality
       output collapsed into repetition — discarding it and retrying cleanly
       📁 Adding save functionality to edits
       output collapsed into repetition — discarding it and retrying cleanly
       ...

   Five collapses, zero writes, no progress. The detector was working perfectly;
   the RECOVERY was the problem. It sent the same instruction every time — "do
   not repeat, continue with one valid @@FILE block" — so the model faced the
   identical task and degenerated the identical way.

   And the task itself was the trap. Under a file-only protocol, "add a save
   handler" means re-emitting all 80 lines of app.js plus the change. Reproducing
   a long file you just wrote is the classic trigger for small-model repetition:
   the model starts copying itself, loses its place, and loops.

   So the escape changes the TASK, not the wording:

     1st collapse   stop rewriting — @@APPEND only the new code. A 15-line
                    append is a fundamentally easier generation than an 80-line
                    faithful reproduction, and it cannot lose what's already there.
     2nd collapse   abandon this file entirely and write a different one that
                    does not exist yet. Progress elsewhere beats grinding here.
     3rd            treat as stalled; the caller stops.

   Each step removes the thing that caused the collapse instead of asking the
   model to try harder at it.
   ============================================================ */

export interface CollapseContext {
  /** Why the output was rejected (from collapseReason). */
  reason: string;
  /** How many times in a row output has collapsed. */
  attempt: number;
  /** The file the model was working on, if we can tell. */
  target: string | null;
  /** Does that file already exist with real content? */
  targetExists: boolean;
  /** A file that does not exist yet, to pivot to. */
  alternative: string | null;
}

export type CollapseAction = "append-instead" | "switch-target" | "stall";

export function collapseAction(ctx: CollapseContext): CollapseAction {
  if (ctx.attempt >= 3) return "stall";
  // Rewriting an existing file is the trap; appending is the escape.
  if (ctx.attempt === 1 && ctx.target && ctx.targetExists) return "append-instead";
  if (ctx.alternative) return "switch-target";
  return ctx.attempt >= 2 ? "stall" : "append-instead";
}

/** The file the model was mid-way through, from its own protocol tokens. */
export function collapseTarget(raw: string): string | null {
  const opens = [...raw.matchAll(/^@@(?:FILE|APPEND)\s+(.+?)\s*$/gm)];
  const last = opens[opens.length - 1];
  return last ? last[1].trim().replace(/^["'`]|["'`]$/g, "") : null;
}

/**
 * The instruction that escapes the loop. Never repeats the previous wording,
 * because repeating the instruction is what produced the repeated collapse.
 */
export function collapseEscapeBrief(ctx: CollapseContext): string {
  switch (collapseAction(ctx)) {
    case "append-instead":
      return [
        `That reply collapsed (${ctx.reason}) and was discarded. Nothing was saved.`,
        "",
        `You were re-emitting ${ctx.target} in full. Stop doing that — reproducing a long file you already wrote is what made it repeat.`,
        "",
        `Write ONLY the new code, appended:`,
        "",
        `@@APPEND ${ctx.target}`,
        "<just the new function(s) — nothing that is already in the file>",
        "@@END",
        "",
        "Do not restate the existing contents. Do not summarise. Begin your reply with the @@APPEND line.",
      ].join("\n");

    case "switch-target":
      return [
        `That reply collapsed again (${ctx.reason}). ${ctx.target ?? "That file"} is not working out right now.`,
        "",
        `Leave it exactly as it is and build something else instead. Write ${ctx.alternative} — a file that does not exist yet — complete and working:`,
        "",
        `@@FILE ${ctx.alternative}`,
        "<the whole file>",
        "@@END",
        "",
        "You can come back to the other file later. Make progress somewhere else now.",
      ].join("\n");

    case "stall":
    default:
      return [
        `Output has collapsed ${ctx.attempt} times in a row (${ctx.reason}).`,
        "Write one small, complete, NEW file that does not exist yet. Nothing else.",
      ].join("\n");
  }
}
