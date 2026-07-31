/* ============================================================
   PROJECT TIMELINE — Laro's memory of what it did, and when.

   Every build appends a dated milestone, keyed by project folder.
   So Laro can answer "what did we do last Tuesday?" and, more
   importantly, carry context between sessions instead of starting
   cold every time.

   It compresses to stay small: entries from the last 7 days are
   kept verbatim; anything older collapses into one summary line per
   day (task count + files touched), so a project worked on for a
   year is still a few KB, not a wall of logs.

   Stored locally (localStorage). Never leaves the machine.
   ============================================================ */

export interface Milestone {
  ts: number;            // epoch ms
  task: string;          // the prompt, trimmed
  files: string[];       // relative paths written/edited
  kind: "build" | "note";
}

interface DaySummary {
  day: string;           // YYYY-MM-DD
  tasks: number;
  files: number;
  headline: string;      // shortest useful description
}

interface TimelineDoc {
  recent: Milestone[];   // verbatim, last ~7 days
  archive: DaySummary[]; // compressed, older
}

const KEY = (scope: string) => `veylaro.timeline.${hash(scope)}`;
const RECENT_DAYS = 7;
const MAX_RECENT = 40;

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function load(scope: string): TimelineDoc {
  try {
    const raw = localStorage.getItem(KEY(scope));
    if (raw) return JSON.parse(raw) as TimelineDoc;
  } catch { /* corrupt / unavailable */ }
  return { recent: [], archive: [] };
}

function save(scope: string, doc: TimelineDoc) {
  try { localStorage.setItem(KEY(scope), JSON.stringify(doc)); } catch { /* quota / private mode */ }
}

const dayOf = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** Fold everything older than the recent window into one line per day. */
function compress(doc: TimelineDoc, now = Date.now()): TimelineDoc {
  const cutoff = now - RECENT_DAYS * 86_400_000;
  const staying: Milestone[] = [];
  const byDay = new Map<string, Milestone[]>();
  for (const m of doc.recent) {
    if (m.ts >= cutoff && staying.length < MAX_RECENT) staying.push(m);
    else {
      const d = dayOf(m.ts);
      (byDay.get(d) || byDay.set(d, []).get(d)!).push(m);
    }
  }
  const newSummaries: DaySummary[] = [...byDay.entries()].map(([day, ms]) => {
    const files = new Set<string>();
    ms.forEach((m) => m.files.forEach((f) => files.add(f)));
    return {
      day,
      tasks: ms.length,
      files: files.size,
      headline: ms[ms.length - 1].task.slice(0, 80),
    };
  });
  // merge with any existing archive for the same day
  const merged = new Map<string, DaySummary>();
  for (const s of [...doc.archive, ...newSummaries]) {
    const prev = merged.get(s.day);
    if (prev) merged.set(s.day, { day: s.day, tasks: prev.tasks + s.tasks, files: Math.max(prev.files, s.files), headline: s.headline || prev.headline });
    else merged.set(s.day, s);
  }
  const archive = [...merged.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-120);
  return { recent: staying, archive };
}

/** Record a completed build (or a note) into the project's timeline. */
export function recordMilestone(scope: string, m: Omit<Milestone, "ts"> & { ts?: number }) {
  if (!scope) return;
  const doc = load(scope);
  doc.recent.push({ ts: m.ts ?? Date.now(), task: m.task.slice(0, 200), files: m.files.slice(0, 40), kind: m.kind });
  save(scope, compress(doc));
}

/** A compact, human timeline string to inject into Laro's context so it knows
    the project's history and doesn't lose the thread between sessions. */
export function timelineForPrompt(scope: string, now = Date.now()): string {
  const doc = load(scope);
  if (!doc.recent.length && !doc.archive.length) return "";
  const lines: string[] = [];
  for (const s of doc.archive.slice(-6)) {
    lines.push(`- ${s.day}: ${s.tasks} task${s.tasks === 1 ? "" : "s"}, ${s.files} file${s.files === 1 ? "" : "s"} — ${s.headline}`);
  }
  for (const m of doc.recent.slice(-8)) {
    lines.push(`- ${ago(m.ts, now)}: ${m.task.slice(0, 80)}${m.files.length ? ` (${m.files.slice(0, 4).join(", ")}${m.files.length > 4 ? "…" : ""})` : ""}`);
  }
  return `PROJECT HISTORY — what you've already done here (most recent last). Use it for continuity; don't redo finished work:\n${lines.join("\n")}`;
}

/** For a "what have we done?" answer in the UI. */
export function timelineSummary(scope: string): { recent: Milestone[]; archive: DaySummary[] } {
  const doc = load(scope);
  return { recent: [...doc.recent].reverse(), archive: [...doc.archive].reverse() };
}

export function clearTimeline(scope: string) {
  try { localStorage.removeItem(KEY(scope)); } catch { /* ignore */ }
}

function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 90) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}
