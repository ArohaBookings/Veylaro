import { AgentEvent, ModelId, PermMode, Question, SubAgentLane, WebResult } from "../types";

/* ============================================================
   DemoBrain — generates a believable agentic run as a timed
   event script. This is the stand-in engine that exercises the
   full UI until the real Laro weights are wired in via the
   Ollama adapter (engine/ollama.ts).
   ============================================================ */

export interface TimedEvent {
  delay: number; // ms after the previous event
  ev: AgentEvent;
}

const rnd = (a: number, b: number) => Math.floor(a + Math.random() * (b - a));
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const SELF_TALK = [
  "silly me — that import was pointing at the old path. fixing…",
  "hmm, this function's doing three jobs. let's not make it four.",
  "ooh, tidy file. i'll keep it that way.",
  "wait — off-by-one right there. classic. caught it.",
  "note to self: don't touch what isn't broken.",
  "that variable name lied to me. renaming it so it can't lie to you.",
  "okay okay, the test told me exactly where it hurts.",
  "one more pass… i want this diff to read like a story.",
  "hah, found the sneaky mutation. not on my watch.",
  "double-checking myself before you have to.",
];

const EDIT_VERBS = ["Now editing", "Opening up", "Moving into", "Next up:", "Over to"];

function base(scope: string): string {
  const parts = scope.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || scope || "project";
}

function stem(scope: string): string {
  return base(scope).replace(/\.[a-z0-9]+$/i, "");
}

/** Clarifying questions — asked ONE at a time in the UI, max 4, each with an "Other" free-text option. */
export function buildQuestions(prompt: string, scope: string): Question[] {
  const s = stem(scope);
  return [
    {
      id: "q1",
      q: `Should I keep the current look of ${base(scope)} and only change behavior, or am I free to restyle?`,
      options: ["Keep the look", "Free to restyle", "Only tiny visual tweaks"],
      allowOther: true,
    },
    {
      id: "q2",
      q: "How should I handle edge cases I find along the way?",
      options: ["Fix them as I go", "List them, don't touch", "Ask me each time"],
      allowOther: true,
    },
    {
      id: "q3",
      q: `Do you want tests for the ${s} changes?`,
      options: ["Yes, add tests", "No tests", "Only if something breaks"],
      allowOther: true,
    },
    {
      id: "q4",
      q: "Speed or polish on this one?",
      options: ["Fast and rough", "Take your time, make it perfect"],
      allowOther: true,
    },
  ];
}

/** Should this prompt trigger clarifying questions first? */
export function needsClarification(prompt: string): boolean {
  const p = prompt.trim();
  if (/\b(make it better|improve|redesign|clean ?up|modernize)\b/i.test(p)) return true;
  return p.length > 0 && p.length < 18 && !/fix|test|bug/i.test(p);
}

/* ---- fake-but-plausible web results for the internet toggle ---- */
function webResults(prompt: string): { query: string; results: WebResult[] } {
  const topic = /dark ?mode|theme/i.test(prompt)
    ? "dark mode best practices css"
    : /rate ?limit/i.test(prompt)
      ? "token bucket rate limiting node"
      : /test/i.test(prompt)
        ? "testing edge cases patterns"
        : /bug|fix|error/i.test(prompt)
          ? prompt.slice(0, 40) + " site:stackoverflow.com"
          : prompt.slice(0, 44) + " docs";
  return {
    query: topic,
    results: [
      { title: "MDN Web Docs — current reference", url: "https://developer.mozilla.org", snippet: "Checked the up-to-date API surface so nothing I write is deprecated." },
      { title: "Latest release notes for your stack", url: "https://github.com", snippet: "Confirmed behavior against the most recent version, not my training data." },
      { title: "Community consensus (Stack Overflow)", url: "https://stackoverflow.com", snippet: "Cross-checked the approach against what actually works in production." },
    ],
  };
}

type Template = {
  match: RegExp;
  goal: string;
  planSteps: (s: string) => string[];
  files: (s: string) => { path: string; op: "create" | "edit"; plus: number; minus: number; reason: string; snippet?: { del: string[]; add: string[] } }[];
  cmd: (s: string) => { cmd: string; out: string };
  recap: (s: string) => { title: string; bullets: string[]; commit: string };
};

const TEMPLATES: Template[] = [
  {
    match: /bug|fix|broken|error|crash|fail/i,
    goal: "Find the fault, repair it, prove the fix",
    planSteps: (s) => [
      `Read ${base(s)} and trace the failing path`,
      "Patch the root cause — smallest correct diff",
      "Add a guard so it can't regress silently",
      "Run the related tests and verify end-to-end",
    ],
    files: (s) => [
      {
        path: s,
        op: "edit",
        plus: rnd(6, 18),
        minus: rnd(2, 9),
        reason: "patching the root cause",
        snippet: {
          del: ["if (items.length > 1) submit(items)"],
          add: ["if (items.length >= 1) submit(items)", "// guard: empty carts never reach submit()"],
        },
      },
      { path: s, op: "edit", plus: rnd(3, 8), minus: rnd(0, 3), reason: "adding the regression guard" },
    ],
    cmd: (s) => ({ cmd: `node --check ${s} && npm test -- --related ${s}`, out: "✓ syntax OK · 6 passed, 0 failed (1.8s)" }),
    recap: (s) => ({
      title: "Bug fixed and verified",
      bullets: [
        `Root cause: a boundary condition in ${base(s)} skipped the single-item path.`,
        "Patched the condition and added a guard so it can't regress silently.",
        "Ran the related tests — all green.",
      ],
      commit: `fix(${stem(s)}): handle single-item path and guard empty input`,
    }),
  },
  {
    match: /dark ?mode|theme|style|color|design|ui|polish/i,
    goal: "Ship the new look behind a clean toggle",
    planSteps: (s) => [
      `Extract design tokens from ${base(s)}`,
      "Add prefers-color-scheme + a manual toggle",
      "Re-skin surfaces from one source of truth",
      "Audit contrast on every text style",
    ],
    files: (s) => [
      {
        path: s,
        op: "edit",
        plus: rnd(24, 60),
        minus: rnd(4, 14),
        reason: "wiring the token layer",
        snippet: { del: ["background: #ffffff;"], add: ["background: var(--surface);", ":root[data-theme='dark'] { --surface: #12100e; }"] },
      },
      { path: `${stem(s)}.theme.css`, op: "create", plus: rnd(30, 80), minus: 0, reason: "the theme itself" },
    ],
    cmd: () => ({ cmd: `npx serve . --no-request-logging`, out: "✓ rendered both themes · no layout shift · contrast AA passed" }),
    recap: (s) => ({
      title: "Theme shipped",
      bullets: [
        `Added a token-driven theme layer to ${base(s)} — light and dark from one source of truth.`,
        "Respects the system setting, with a manual override toggle.",
        "Checked contrast on every text style — all AA or better.",
      ],
      commit: `feat(${stem(s)}): token-driven dark mode with system + manual toggle`,
    }),
  },
  {
    match: /test|spec|coverage/i,
    goal: "Cover the risky paths first, then the happy ones",
    planSteps: (s) => [
      `Rank ${base(s)}'s paths by risk`,
      "Write edge-case tests first (empty, bad types, races)",
      "Fill in happy-path coverage",
      "Run the suite and report coverage",
    ],
    files: (s) => [
      { path: `${stem(s)}.test.ts`, op: "create", plus: rnd(60, 130), minus: 0, reason: "the new test suite" },
      { path: s, op: "edit", plus: rnd(2, 6), minus: rnd(0, 2), reason: "a tiny refactor to make one branch testable" },
    ],
    cmd: () => ({ cmd: "npm test", out: "✓ 14 passed, 0 failed · coverage 91% lines (2.9s)" }),
    recap: (s) => ({
      title: "Test suite in place",
      bullets: [
        `Covered ${base(s)}'s edge cases first — empty input, bad types, race on double-submit.`,
        "14 tests, all passing, 91% line coverage.",
        "One tiny refactor to make an untestable branch testable.",
      ],
      commit: `test(${stem(s)}): cover edge cases and happy paths (91% lines)`,
    }),
  },
  {
    match: /.*/,
    goal: "Small, reviewable steps — verified as I go",
    planSteps: (s) => [
      `Read ${base(s)} and map what the change touches`,
      "Make the smallest correct diff",
      "Run it to confirm behavior",
      "Recap with a ready-to-use commit message",
    ],
    files: (s) => [
      {
        path: s,
        op: "edit",
        plus: rnd(12, 40),
        minus: rnd(3, 12),
        reason: "the main change",
        snippet: { del: ["// TODO: implement"], add: ["const result = compute(input);", "return format(result);"] },
      },
      { path: s, op: "edit", plus: rnd(4, 12), minus: rnd(1, 5), reason: "tidying the seams" },
    ],
    cmd: (s) => ({ cmd: `node --check ${s}`, out: "✓ parses clean · quick smoke run OK" }),
    recap: (s) => ({
      title: "Done and checked",
      bullets: [
        `Implemented your request inside ${base(s)} — nothing outside the scope was touched.`,
        "Kept the diff small and readable.",
        "Smoke-tested the result before handing it back.",
      ],
      commit: `feat(${stem(s)}): implement requested change`,
    }),
  },
];

/** Sub-agent lanes: 2 by default, 3 on 16 GB+ machines ("auto"). */
export function buildLanes(prompt: string, scope: string, count: number): SubAgentLane[] {
  const lanes: SubAgentLane[] = [
    { name: "Scout", role: "recon", task: `map ${base(scope)} + everything that imports it` },
    { name: "Builder", role: "edits", task: "draft the diff while Scout confirms blast radius" },
    { name: "Verifier", role: "checks", task: "prepare the run-and-prove step in parallel" },
  ];
  return lanes.slice(0, Math.max(0, Math.min(3, count)));
}

/**
 * Build the full timed event script for a run.
 * The runner inserts permission gates and the plan-approval pause.
 */
export function buildRun(opts: {
  prompt: string;
  scope: string;
  model: ModelId;
  personality: boolean;
  perm: PermMode;
  internet?: boolean;
  planMode?: boolean;
  laneCount?: number;
  answers?: Record<string, string>;
}): TimedEvent[] {
  const { prompt, scope, model, personality } = opts;
  const t = TEMPLATES.find((tp) => tp.match.test(prompt)) || TEMPLATES[TEMPLATES.length - 1];
  const speed = model === "max" ? 1 : 0.72; // Lite feels snappier
  const d = (ms: number) => Math.round(ms * speed);
  const s = scope || "src/app.ts";
  const out: TimedEvent[] = [];

  out.push({
    delay: d(500),
    ev: {
      kind: "say",
      plain: `On it. First, let me read ${base(s)} so I know exactly what I'm working with.`,
      dev: `read ${s} · scope-locked · 0 bytes of code leave this machine`,
    },
  });

  if (opts.answers && Object.keys(opts.answers).length) {
    out.push({
      delay: d(700),
      ev: {
        kind: "say",
        plain: "Thanks for the answers — that settles how I'll approach it.",
        dev: `constraints: ${Object.values(opts.answers).join(" · ").toLowerCase()}`,
      },
    });
  }

  if (opts.internet) {
    const w = webResults(prompt);
    out.push({
      delay: d(800),
      ev: {
        kind: "say",
        plain: "You've got internet on, so I'll check the live web for anything newer than my training.",
        dev: `web.search("${w.query}") · results read locally, your code stays here`,
      },
    });
    out.push({ delay: d(1100), ev: { kind: "web", query: w.query, results: w.results } });
  }

  // the plan — runner pauses here for approval when plan mode is on
  out.push({ delay: d(900), ev: { kind: "plan", goal: t.goal, steps: t.planSteps(s) } });

  if (opts.laneCount && opts.laneCount > 1) {
    out.push({
      delay: d(700),
      ev: {
        kind: "say",
        plain: `Splitting the work — ${opts.laneCount} of me is faster than one of me.`,
        dev: `spawn ${opts.laneCount} sub-agents · shared memory · same scope lock`,
      },
    });
    out.push({ delay: d(500), ev: { kind: "agents", lanes: buildLanes(prompt, s, opts.laneCount) } });
  }

  if (personality) out.push({ delay: d(900), ev: { kind: "think", text: pick(SELF_TALK) } });
  out.push({ delay: d(600), ev: { kind: "checkpoint", label: "Before any edits" } });

  const files = t.files(s);
  files.forEach((f, i) => {
    // Claude-Code-style narration before every single change
    out.push({
      delay: d(700),
      ev: {
        kind: "say",
        plain: `${pick(EDIT_VERBS)} ${base(f.path)} — ${f.reason}.`,
        dev: `${f.op === "create" ? "create" : "apply diff"} → ${f.path}`,
      },
    });
    const { reason, ...fileEv } = f;
    out.push({ delay: d(900), ev: { kind: "file", ...fileEv } });
    if (personality && i === 0) out.push({ delay: d(800), ev: { kind: "think", text: pick(SELF_TALK) } });
    if (i < files.length - 1) out.push({ delay: d(500), ev: { kind: "checkpoint", label: `After ${base(f.path)}` } });
  });

  out.push({
    delay: d(700),
    ev: {
      kind: "say",
      plain: "Edits are in. Now let me actually run it — I don't hand back unproven code.",
      dev: "verify: execute → observe → confirm",
    },
  });
  const c = t.cmd(s);
  out.push({ delay: d(700), ev: { kind: "cmd", cmd: c.cmd, out: c.out, ok: true } });
  out.push({
    delay: d(900),
    ev: { kind: "verify", target: base(s), ok: true, detail: "Ran it end-to-end after the change — behavior confirmed, not assumed." },
  });

  const r = t.recap(s);
  out.push({ delay: d(800), ev: { kind: "recap", title: r.title, bullets: r.bullets, commit: r.commit } });
  out.push({ delay: d(400), ev: { kind: "done", ms: 0 } });
  return out;
}

/* ============ terminal mode (preview shell) ============
   In the desktop build, commands run for real through the
   Electron bridge. In browser preview, this simulator answers. */

export function simulateTerminal(cmd: string, files: { path: string; plus: number; minus: number }[]): { out: string; ok: boolean } {
  const c = cmd.trim();
  const hash = () => Math.random().toString(16).slice(2, 9);
  if (/^git status/.test(c)) {
    if (!files.length) return { out: "On branch main\nnothing to commit, working tree clean", ok: true };
    return {
      out: `On branch main\nChanges not staged for commit:\n${files.map((f) => `  modified:   ${f.path}  (+${f.plus} −${f.minus})`).join("\n")}`,
      ok: true,
    };
  }
  if (/^git add/.test(c)) return { out: `staged ${files.length || "all"} file(s)`, ok: true };
  if (/^git commit/.test(c)) {
    const m = c.match(/-m\s+["'](.+?)["']/);
    return {
      out: `[main ${hash()}] ${m ? m[1] : "update"}\n ${files.length || 1} file(s) changed, ${files.reduce((n, f) => n + f.plus, 0) || 12} insertions(+), ${files.reduce((n, f) => n + f.minus, 0) || 3} deletions(-)`,
      ok: true,
    };
  }
  if (/^git log/.test(c)) return { out: `${hash()} (HEAD -> main) latest work by Laro\n${hash()} previous commit`, ok: true };
  if (/^git (push|pull)/.test(c)) return { out: "Everything up-to-date", ok: true };
  if (/^(ls|dir)\b/.test(c)) return { out: files.map((f) => f.path.split(/[\\/]/).pop()).join("\n") || "src  package.json  README.md", ok: true };
  if (/^pwd$/.test(c)) return { out: "~/projects (scope-locked)", ok: true };
  if (/^echo\s+(.*)/.test(c)) return { out: c.replace(/^echo\s+/, ""), ok: true };
  if (/^(npm|pnpm|yarn) (test|run test)/.test(c)) return { out: "✓ 14 passed, 0 failed (2.1s)", ok: true };
  if (/^(npm|pnpm|yarn) (run )?build/.test(c)) return { out: "✓ built in 480ms — dist/ ready", ok: true };
  if (/^(node|python3?|deno)\b/.test(c)) return { out: "✓ ran clean, exit 0", ok: true };
  if (/^(whoami)$/.test(c)) return { out: "you — it's your machine, after all", ok: true };
  if (/^help$/.test(c)) return { out: "Preview shell: git status/add/commit/log, ls, pwd, echo, npm test/build…\nThe desktop app runs EVERY real command through your actual shell.", ok: true };
  return {
    out: `veylaro-sh (preview): "${c.split(" ")[0]}" simulated OK.\nIn the desktop app this executes for real in your shell, inside the session scope.`,
    ok: true,
  };
}

/** Live token-speed simulation for the privacy HUD. */
export function tokenSpeed(model: ModelId): number {
  const [a, b] = model === "max" ? [34, 52] : [58, 84];
  return rnd(a, b);
}
