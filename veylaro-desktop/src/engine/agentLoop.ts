/* ============================================================
   THE AGENT LOOP — the thing that makes "build me X" actually
   write files instead of pasting code into the chat.

   The old live path streamed the model's tokens and dropped the
   whole reply — code and all — into one chat bubble. Nothing was
   ever written to disk. This module fixes that at the root:

     1. A tiny, parseable file protocol the model emits.
     2. A streaming parser that pulls file/command/done events out
        of the token stream as they close.
     3. A salvage pass so that even when the model forgets the
        protocol and pastes a ```fenced block, we still recover the
        file and write it (this is the exact failure in the wild).

   The store consumes the parser events and calls the guarded
   window.veylaro.writeFile / exec bridge. Chat then shows compact
   "wrote src/App.tsx +142" rows, never a wall of code.
   ============================================================ */

/** The protocol, spelled out for the model. Kept deliberately small —
    a 4B model has to follow it, so it's line-based and unmistakable. */
export const FILE_PROTOCOL_PROMPT = `HOW YOU ACTUALLY BUILD — READ THIS CAREFULLY
You have real hands on this machine. You do not paste code into the chat. You write it into files using this exact format:

@@FILE relative/path/from/the/project.ext
<the complete contents of the file go here>
@@END

Rules that matter:
- One @@FILE block per file. Put the WHOLE file between @@FILE and @@END — never a diff, never "// rest unchanged", never "...". If you're changing a file, output the full new version.
- The path is relative to the project folder you were given. Use real paths like src/App.tsx or index.html. Do not wrap the path in quotes or backticks.
- Do NOT put the file's code anywhere else in your reply. The only place code goes is between @@FILE and @@END.
- Before each file, write ONE short human line saying what you're doing, starting with an emoji: "✍️ Writing the dashboard layout" then the @@FILE block. Keep it to one line.
- In an existing project, inspect before editing. Read a file with: @@READ src/App.tsx
- To run a bounded verification command, put it on its own line: @@RUN npm test
- Dependency installs and shell-composed commands are blocked. Work with the project's observed dependency set.
- @@READ and @@RUN results are returned to you on the next turn. Use those real results; never guess what a file or command contains.
- React to what you find, briefly, like a real engineer: "🔎 no package.json yet — scaffolding one first". Short lines, no headers, no restating the plan.
- When the ENTIRE task is finished and every file is written, output @@DONE on its own line. Do not output @@DONE while there is still work left — if the app isn't complete, keep writing files.

Worked example — the user says "make a hello page":
🧱 Scaffolding the page
@@FILE index.html
<!doctype html>
<html><body><h1>Hello</h1></body></html>
@@END
✅ Done — one file, opens straight in a browser.
@@DONE

That is the only way to build. Narrate in the chat, write the code into files.`;

/** Only appended for the owner/dev build — nothing extra needed here, the
    charter handles it. Exported for symmetry with charter.ts. */

export type ParseEvent =
  | { t: "narrate"; text: string }
  | { t: "file"; path: string; content: string }
  | { t: "read"; path: string }
  | { t: "run"; cmd: string }
  | { t: "done" };

const FILE_OPEN = /^@@FILE\s+(.+?)\s*$/;
const FILE_END = /^@@END\s*$/;
const READ_LINE = /^@@READ\s+(.+?)\s*$/;
const RUN_LINE = /^@@RUN\s+(.+?)\s*$/;
const DONE_LINE = /^@@DONE\s*$/;

/**
 * Incremental, line-based parser. Feed it streamed chunks; it returns the
 * protocol events that have fully closed so far. Call flush() at the end for
 * any trailing narration. Unterminated file blocks are discarded: replacing a
 * repository file with token-truncated output is never a safe recovery mode.
 */
export class StreamParser {
  private buf = "";
  private inFile = false;
  private filePath = "";
  private fileLines: string[] = [];
  private narration: string[] = [];

  /** live narration accumulated so far — for the streaming status line */
  get liveNarration(): string {
    return this.narration.join("\n").trim();
  }
  /** true while we're inside a file block — used to show "writing…" status */
  get writing(): string | null {
    return this.inFile ? this.filePath : null;
  }

  push(chunk: string): ParseEvent[] {
    this.buf += chunk;
    const out: ParseEvent[] = [];
    let nl: number;
    // process every complete line; keep the partial tail in buf
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      this.line(line, out);
    }
    return out;
  }

  private line(raw: string, out: ParseEvent[]) {
    const line = raw.replace(/\r$/, "");
    if (this.inFile) {
      if (FILE_END.test(line)) {
        out.push({ t: "file", path: this.filePath, content: stripFence(this.fileLines).join("\n") });
        this.inFile = false;
        this.filePath = "";
        this.fileLines = [];
      } else {
        this.fileLines.push(line);
      }
      return;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(FILE_OPEN))) {
      this.inFile = true;
      this.filePath = cleanPath(m[1]);
      this.fileLines = [];
    } else if ((m = line.match(READ_LINE))) {
      out.push({ t: "read", path: cleanPath(m[1]) });
    } else if ((m = line.match(RUN_LINE))) {
      out.push({ t: "run", cmd: m[1].trim() });
    } else if (DONE_LINE.test(line)) {
      out.push({ t: "done" });
    } else {
      // ordinary narration — keep it, and emit it as a completed line so the UI
      // can persist it (the "leave the text there as it works" behaviour). We
      // only emit lines with real content, so stray blank/punctuation lines don't
      // clutter the log.
      this.narration.push(line);
      const t = line.trim();
      if (t.length > 2 && !/^[-*_=•>#`]+$/.test(t)) out.push({ t: "narrate", text: t });
    }
  }

  flush(): ParseEvent[] {
    const out: ParseEvent[] = [];

    // THE RESIDUAL LINE IS A REAL LINE.
    //
    // push() only processes text up to a newline; anything after the last \n
    // stays in `buf`. A model that ends its reply exactly at "@@END" — with no
    // trailing newline, which is the most natural way to finish — left that
    // terminator sitting in the buffer, unprocessed. flush() then saw inFile
    // still true, called it an abandoned block, and threw the ENTIRE file away.
    //
    // Measured on Med, one build, three steps in a row: a complete stylesheet
    // and a complete app.js, both perfectly formed, both silently discarded.
    // The run then "stalled" having written 51 lines. This one missing newline
    // is a large part of why output looked impossibly thin.
    //
    // So: process the tail as the final line before judging anything.
    if (this.buf.length) {
      const tail = this.buf;
      this.buf = "";
      this.line(tail, out);
    }

    // Only NOW is an unterminated block genuinely unterminated. Those are still
    // discarded on purpose: replacing a real file with token-truncated output is
    // never a safe recovery mode.
    const abandonedFile = this.inFile;
    this.inFile = false;
    this.filePath = "";
    this.fileLines = [];
    if (abandonedFile) this.narration.push("(an unterminated file block was discarded)");
    return out;
  }

  /** True when the stream ended inside a file block — i.e. the reply was cut off
      mid-file (usually the reply token budget). The caller can ask for the rest
      instead of treating the step as if the model simply refused to work. */
  get truncatedMidFile(): boolean {
    return this.inFile;
  }
}

/** Drop a wrapping ```lang / ``` fence if the model added one inside the block. */
function stripFence(lines: string[]): string[] {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === "") a++;
  while (b > a && lines[b - 1].trim() === "") b--;
  if (a < b && /^```/.test(lines[a].trim())) a++;
  if (b > a && /^```$/.test(lines[b - 1].trim())) b--;
  return lines.slice(a, b);
}

function cleanPath(p: string): string {
  return p.trim().replace(/^["'`]|["'`]$/g, "").replace(/^\.\//, "").trim();
}

/**
 * SALVAGE — when the model ignores the protocol and pastes a fenced code
 * block anyway (the exact thing in the screenshots), try to recover a file
 * from it. We only claim a block as a file when we can name it: either the
 * fence carries a path (```tsx src/App.tsx) or the first line is a path
 * comment (// src/App.tsx  ·  # app.py  ·  <!-- index.html -->).
 *
 * Returns the files found and the narration with those blocks removed, so the
 * chat shows the human lines but not the dumped code.
 */
export function salvageFences(text: string): { files: { path: string; content: string }[]; rest: string } {
  const files: { path: string; content: string }[] = [];
  const fence = /```([^\n`]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let rest = text;
  const kill: string[] = [];
  while ((m = fence.exec(text))) {
    const info = m[1].trim();
    let body = m[2].replace(/\n$/, "");
    let path = "";
    // path on the fence line: ```tsx src/App.tsx   or   ```src/App.tsx
    const onFence = info.replace(/^[a-zA-Z0-9]+\s+/, "").trim();
    if (looksLikePath(onFence)) path = onFence;
    else if (looksLikePath(info)) path = info;
    // else path as a leading comment on the first body line
    if (!path) {
      const firstNl = body.indexOf("\n");
      const first = (firstNl === -1 ? body : body.slice(0, firstNl)).trim();
      const cm = first.match(/^(?:\/\/|#|<!--|\/\*)\s*([\w./-]+\.\w+)\s*(?:-->|\*\/)?$/);
      if (cm && looksLikePath(cm[1])) {
        path = cm[1];
        body = firstNl === -1 ? "" : body.slice(firstNl + 1);
      }
    }
    if (path) {
      files.push({ path: cleanPath(path), content: body });
      kill.push(m[0]);
    }
  }
  for (const k of kill) rest = rest.replace(k, "").trim();
  return { files, rest };
}

function looksLikePath(s: string): boolean {
  if (!s || /\s/.test(s)) return false;
  return /^[\w./-]+\.\w{1,6}$/.test(s) && !s.startsWith(".") === true;
}

/** Resolve a model-supplied relative path against the session scope.
    Scope may be a folder (write inside it) or a single file (write beside it). */
export function resolveInScope(scope: string, scopeKind: "file" | "folder", rel: string): string {
  const sep = scope.includes("\\") ? "\\" : "/";
  const base = scopeKind === "folder" ? scope : scope.split(sep).slice(0, -1).join(sep);
  const clean = rel.replace(/^([./\\])+/, "");
  // if the model already handed us an absolute-looking path, respect it
  if (/^(\/|[A-Za-z]:\\)/.test(rel)) return rel;
  return `${base.replace(/[\\/]$/, "")}${sep}${clean}`;
}

/** Count added/removed lines for the compact file row. */
export function diffCounts(oldContent: string | null, next: string): { plus: number; minus: number; op: "create" | "edit" } {
  const nextLines = next.split("\n");
  if (oldContent == null) return { plus: nextLines.length, minus: 0, op: "create" };
  const oldLines = oldContent.split("\n");
  // cheap line-set diff — good enough for the +/- badge, not a real patch
  const oldSet = new Map<string, number>();
  for (const l of oldLines) oldSet.set(l, (oldSet.get(l) || 0) + 1);
  let plus = 0;
  for (const l of nextLines) {
    const c = oldSet.get(l);
    if (c && c > 0) oldSet.set(l, c - 1);
    else plus++;
  }
  let minus = 0;
  for (const c of oldSet.values()) minus += c;
  return { plus, minus, op: "edit" };
}
