/* ============================================================
   REFERENCE RESOLUTION GATE — the page that renders dead.

   MEASURED on a real build, driven through the shipped app and then opened in a
   browser. Laro was asked to create a folder called `receptionist` and build the
   app in it. It produced three correct, working files:

     receptionist/index.html   49 lines
     receptionist/style.css    76 lines
     receptionist/app.js      118 lines   (form handler, localStorage, edit,
                                           delete, search — all genuinely fine)

   And the page was completely dead. index.html, which itself lives INSIDE
   receptionist/, referenced:

     <link rel="stylesheet" href="receptionist/style.css">
     <script src="receptionist/app.js"></script>

   The folder name was applied twice. Nothing loaded: no styling, no behaviour,
   `typeof displayBookings === "undefined"`, localStorage untouched. Every
   existing gate passed it — the completion gate saw markup, styling, interactive
   controls and state code, because all of that WAS there. It just wasn't wired
   together.

   This is the most common way generated web output fails, and it is completely
   deterministic to detect: resolve every local reference relative to the file
   that makes it, and see if the target exists. No model, no heuristic, no cost.

   When the fix is unambiguous — exactly one file in the project has that
   basename — we correct it rather than spending a whole turn at 11 tok/s asking
   the model to notice. Anything ambiguous is reported instead, never guessed.
   ============================================================ */

export interface ProjectFile {
  path: string;
  content: string;
}

export interface BrokenReference {
  /** The file containing the bad reference. */
  file: string;
  /** The reference exactly as written. */
  reference: string;
  /** The path that would work, when there is exactly one candidate. */
  suggestion: string | null;
  /** Why it's broken. */
  reason: "missing" | "wrong-path";
}

/** src="…" / href="…" in HTML, plus url(…) and @import in CSS. */
const HTML_REF = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
const CSS_REF = /url\(\s*["']?([^"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/gi;

const isExternal = (ref: string) =>
  /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:|mailto:|tel:)/i.test(ref) || ref.startsWith("/");

function dirOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

function baseOf(p: string): string {
  return p.split("/").pop() ?? p;
}

/** Resolve `ref` against the directory of `from`, normalising ./ and ../ */
export function resolveRef(from: string, ref: string): string {
  const base = dirOf(from);
  const parts = (base ? `${base}/${ref}` : ref).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") { out.pop(); continue; }
    out.push(part);
  }
  return out.join("/");
}

function referencesIn(file: ProjectFile): string[] {
  const refs: string[] = [];
  const isHtml = /\.html?$/i.test(file.path);
  const isCss = /\.css$/i.test(file.path);
  if (isHtml) {
    for (const m of file.content.matchAll(HTML_REF)) refs.push(m[1]);
  }
  if (isCss || isHtml) {
    for (const m of file.content.matchAll(CSS_REF)) refs.push(m[1] || m[2]);
  }
  return refs.filter((r) => r && !isExternal(r)).map((r) => r.split(/[?#]/)[0]);
}

/**
 * Every local reference that does not resolve to a file in the project.
 *
 * `suggestion` is filled only when exactly one project file has that basename —
 * a guess with two candidates is worse than saying "this is broken".
 */
export function findBrokenReferences(files: readonly ProjectFile[]): BrokenReference[] {
  const paths = new Set(files.map((f) => f.path.replace(/^\.\//, "")));
  const byBase = new Map<string, string[]>();
  for (const p of paths) {
    const b = baseOf(p);
    byBase.set(b, [...(byBase.get(b) ?? []), p]);
  }

  const broken: BrokenReference[] = [];
  for (const file of files) {
    for (const ref of referencesIn(file)) {
      const resolved = resolveRef(file.path, ref);
      if (paths.has(resolved)) continue;
      const candidates = byBase.get(baseOf(ref)) ?? [];
      let suggestion: string | null = null;
      if (candidates.length === 1) {
        // Express the single candidate relative to the referencing file.
        const fromDir = dirOf(file.path);
        const target = candidates[0];
        suggestion = fromDir && target.startsWith(`${fromDir}/`)
          ? target.slice(fromDir.length + 1)
          : target;
      }
      broken.push({
        file: file.path,
        reference: ref,
        suggestion,
        reason: candidates.length ? "wrong-path" : "missing",
      });
    }
  }
  return broken;
}

export interface RepairResult {
  files: ProjectFile[];
  /** Human-readable note per repair, for the run log. */
  repaired: string[];
  /** Still broken after repair — needs the model. */
  unresolved: BrokenReference[];
}

/**
 * Fix every unambiguously-wrong reference in place.
 *
 * Only exact-basename, single-candidate matches are rewritten. This cannot
 * invent a file or pick between two, so it cannot make a project worse — and it
 * turns a dead page into a working one without spending a model turn.
 */
export function repairReferences(files: readonly ProjectFile[]): RepairResult {
  const broken = findBrokenReferences(files);
  if (!broken.length) return { files: [...files], repaired: [], unresolved: [] };

  const edits = new Map<string, ProjectFile>();
  const repaired: string[] = [];
  const unresolved: BrokenReference[] = [];

  for (const b of broken) {
    if (!b.suggestion || b.suggestion === b.reference) { unresolved.push(b); continue; }
    const current = edits.get(b.file) ?? files.find((f) => f.path === b.file);
    if (!current) { unresolved.push(b); continue; }
    // Replace only inside a quoted attribute/url so we can't corrupt prose.
    const quoted = new RegExp(
      `(["'\\(])${b.reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(["'\\)])`,
      "g",
    );
    const next = current.content.replace(quoted, `$1${b.suggestion}$2`);
    if (next === current.content) { unresolved.push(b); continue; }
    edits.set(b.file, { path: b.file, content: next });
    repaired.push(`${b.file}: "${b.reference}" → "${b.suggestion}"`);
  }

  return {
    files: files.map((f) => edits.get(f.path) ?? f),
    repaired,
    unresolved,
  };
}

/** The gap list handed to the completion gate / the model. */
export function referenceGaps(broken: readonly BrokenReference[]): string[] {
  return broken.map((b) =>
    b.reason === "missing"
      ? `${b.file} references "${b.reference}", which does not exist anywhere in the project. Create it, or remove the reference.`
      : `${b.file} references "${b.reference}", which does not resolve from that file's own location.${
          b.suggestion ? ` It should be "${b.suggestion}".` : ""
        } A page whose stylesheet and script do not load is a dead page, however good the code inside them is.`,
  );
}
