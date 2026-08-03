/* ============================================================
   PROGRESS GUARD — stop the build going backwards.

   MEASURED, one real Med build, twelve steps, file count in parentheses:

     step 4   242 lines (4 files)
     step 5   173 lines (4)      <- rewrote a file SHORTER
     step 6    95 lines (4)      <- again; 147 lines of finished work gone
     step 7   193 lines (4)
     step 8   277 lines (4)
     ...
     step 12  314 lines (4)

   Two failures visible in that trace:

   1. REGRESSION. The model re-emits a file it already wrote, shorter, and the
      loop cheerfully overwrites the good version. Work oscillates instead of
      accumulating, so the completion gate is never satisfied and the run burns
      its budget going nowhere.

   2. NO BREADTH. The file count never leaves 4. The gate correctly says "needs
      15+ files", but the continuation brief only ever said "keep building" —
      it never named a file that does not exist yet. A model asked to "keep
      building" edits what is in front of it; a model told "write
      src/BookingList.js" writes a new file.

   The guard fixes both with evidence rather than exhortation: it compares what
   is actually on disk before and after a step, and hands back the specific
   number of lines that were lost and the specific next file to create.
   ============================================================ */

export interface Shrunk {
  path: string;
  before: number;
  after: number;
}

export interface RegressionReport {
  shrunk: Shrunk[];
  linesBefore: number;
  linesAfter: number;
  /** True when this step made the deliverable materially smaller. */
  regressed: boolean;
}

function lineCount(content: string): number {
  return content.split("\n").filter((l) => l.trim()).length;
}

function totalLines(files: ReadonlyMap<string, string>): number {
  let n = 0;
  for (const content of files.values()) n += lineCount(content);
  return n;
}

/**
 * Compare the deliverable before and after one step.
 *
 * A file is "shrunk" when it lost more than 25% of its non-blank lines. That
 * threshold is deliberately forgiving: tightening up a file legitimately removes
 * some lines, and we only want to catch the case where a finished file was
 * replaced by a thinner draft of itself.
 */
export function detectRegression(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): RegressionReport {
  const shrunk: Shrunk[] = [];
  for (const [path, oldContent] of before) {
    const newContent = after.get(path);
    if (newContent === undefined) continue;
    const a = lineCount(oldContent);
    const b = lineCount(newContent);
    if (a >= 20 && b < a * 0.75) shrunk.push({ path, before: a, after: b });
  }
  const linesBefore = totalLines(before);
  const linesAfter = totalLines(after);
  return {
    shrunk,
    linesBefore,
    linesAfter,
    regressed: shrunk.length > 0 || (linesBefore >= 60 && linesAfter < linesBefore * 0.85),
  };
}

/** The push-back for a step that destroyed work. Names the exact loss. */
export function regressionBrief(report: RegressionReport): string {
  const lines: string[] = [
    "You just made the project SMALLER. That is going backwards, not building.",
  ];
  for (const s of report.shrunk) {
    lines.push(`- ${s.path} went from ${s.before} lines to ${s.after}. You replaced finished work with a thinner draft of itself.`);
  }
  if (!report.shrunk.length) {
    lines.push(`- The project went from ${report.linesBefore} lines to ${report.linesAfter}.`);
  }
  lines.push(
    "",
    "Never re-emit a file you have already written unless you are ADDING to it — and then the @@FILE block must contain the complete, LONGER version, with everything that was already there still present.",
    "Prefer writing a file that does not exist yet over rewriting one that does.",
  );
  return lines.join("\n");
}

/* ---- breadth ------------------------------------------------------------
   What to build next, when the gate's complaint is that there are not enough
   distinct parts yet. Ordered so each suggestion is something a real product of
   this kind actually has, not filler. */
const NEXT_PARTS: { match: RegExp; parts: string[] }[] = [
  {
    match: /\b(receptionist|booking|appointment|calendar|schedul)/i,
    parts: [
      "bookings.js", "availability.js", "search.js", "validation.js", "storage.js",
      "calendar.js", "notifications.js", "callLog.js", "settings.js", "admin.js",
    ],
  },
  {
    match: /\b(game|minecraft|voxel|player|render)/i,
    parts: [
      "engine.js", "world.js", "player.js", "input.js", "renderer.js",
      "physics.js", "chunk.js", "inventory.js", "ui.js", "save.js",
    ],
  },
  {
    match: /\b(saas|dashboard|admin|platform|crm)/i,
    parts: [
      "auth.js", "api.js", "dashboard.js", "table.js", "filters.js",
      "settings.js", "billing.js", "users.js", "charts.js", "storage.js",
    ],
  },
];

const GENERIC_PARTS = [
  "app.js", "state.js", "ui.js", "api.js", "utils.js",
  "components.js", "styles.css", "config.js", "storage.js", "router.js",
];

/**
 * Name the next file that does not exist yet, chosen for the KIND of thing
 * being built. Returns null once there is nothing obvious left to suggest —
 * at that point the model knows the project better than a static list does.
 */
export function nextPart(request: string, existingPaths: readonly string[]): string | null {
  const have = new Set(existingPaths.map((p) => p.split("/").pop()!.toLowerCase()));
  const table = NEXT_PARTS.find((t) => t.match.test(request));
  for (const candidate of [...(table?.parts ?? []), ...GENERIC_PARTS]) {
    if (!have.has(candidate.toLowerCase())) return candidate;
  }
  // NOTHING MEANINGFUL LEFT TO NAME -> ASK FOR NOTHING.
  //
  // This used to fall through to `src/Module${n}.tsx`, and the model dutifully
  // produced them: Module12 "displays a list of items", Module20 "displays a
  // simple heading", all the way to Module28. Seventeen meaningless files,
  // generated purely to satisfy a file COUNT. That is slop, and this function
  // was manufacturing it.
  //
  // A number is not a design. When there is no real part left to suggest, the
  // caller must ask for DEPTH in what exists, never another file.
  return null;
}

/**
 * The brief that grows a project sideways instead of in place.
 *
 * Used when the deliverable has real content but too few distinct parts — the
 * exact state the measured run got stuck in (4 files, oscillating, for 8 steps).
 */
export function breadthBrief(request: string, existingPaths: readonly string[], filesWanted: number): string | null {
  const target = nextPart(request, existingPaths);
  if (!target) return null;
  return [
    `This needs ${filesWanted}+ separate parts and currently has ${existingPaths.length}.`,
    `Existing files: ${existingPaths.join(", ") || "(none)"}.`,
    "",
    `Write a NEW file now: ${target}`,
    `Do not touch the files that already exist. Emit exactly one @@FILE ${target} … @@END block containing real, working code that the existing files can use.`,
  ].join("\n");
}
