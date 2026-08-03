/* ============================================================
   Veylaro Code MCP — drive the real local engine headlessly.

   This is a Model Context Protocol server (JSON-RPC 2.0 over stdio,
   newline-framed) that exposes Veylaro Code's actual build engine to an
   MCP client. It does NOT reimplement the engine — it imports the exact
   modules the desktop app ships:

     - runtime.ts        the OpenAI-compatible streaming call (veylaroChat)
     - agentLoop.ts      the @@FILE/@@RUN/@@DONE protocol + StreamParser
     - charter.ts        the build directive + dated context
     - contractCompiler  the non-negotiable contract compiled outside the model
     - verificationPlan  the deterministic, repo-derived verification commands
     - failureKernel     compact real failure evidence + a repair directive
     - commandPolicy     the same allow/deny guard the app enforces on @@RUN

   Tools:
     status   — endpoints, installed models→tier map, RAM headroom (no load)
     build    — run the real headless agent loop and grade the output
     course   — run evaluation/production_course.py (anti-cheat) for a tier
     inspect  — read back files a build wrote, so output can be checked

   Run with:  npx tsx mcp/veylaro-code.mts
   The protocol requires stdout to carry ONLY JSON-RPC frames; every log
   goes to stderr.
   ============================================================ */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import {
  veylaroChat, selectInstalledModel, tierFromModelName, modelPreference,
  engineContextWindow, exactCounter, type ChatMsg,
} from "../src/engine/runtime.ts";
import { budgetFor, fitConversation, normalizeForTemplate } from "../src/engine/contextBudget.ts";
import { StreamParser, FILE_PROTOCOL_PROMPT, resolveInScope, diffCounts, salvageFences, type ParseEvent } from "../src/engine/agentLoop.ts";
import { SOVEREIGN_FORGE_PROMPT, laroContext } from "../src/engine/charter.ts";
import { compileExecutionContract } from "../src/engine/contractCompiler.ts";
import { verificationCommands, reproductionCommand } from "../src/engine/verificationPlan.ts";
import { compactFailureEvidence, diagnoseFailure } from "../src/engine/failureKernel.ts";
import { classifyModelCommand } from "../src/engine/commandPolicy.ts";
import { assessDeliverable, continuationBrief } from "../src/engine/completionGate.ts";
import { stepPolicy } from "../src/engine/stepBudget.ts";
import { enforcementBrief, isProtocolFailure } from "../src/engine/protocolEnforcer.ts";
import { breadthBrief, detectRegression, regressionBrief } from "../src/engine/progressGuard.ts";
import { ambitionFloor } from "../src/engine/completionGate.ts";
import type { ModelId } from "../src/types.ts";

const SERVER = { name: "veylaro-code", version: "0.1.0" };
// Veylaro serves its own engine on :8080. There is no third-party runtime.
const CANDIDATE_ENDPOINTS = ["http://127.0.0.1:8080"];
const TIER_TAG: Record<ModelId, string> = { lite: "laro-lite", med: "laro-med", max: "laro-max" };

const log = (...a: unknown[]) => process.stderr.write(a.map(String).join(" ") + "\n");

/* ---------- endpoint / model discovery (no weights loaded) ---------- */

async function listModels(endpoint: string, timeoutMs = 2500): Promise<string[] | null> {
  const base = endpoint.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body: any = await res.json();
    return (body?.data || []).map((m: any) => String(m?.id || "")).filter(Boolean);
  } catch {
    return null;
  }
}

async function pickEndpoint(preferred?: string): Promise<{ endpoint: string; models: string[] } | null> {
  const order = preferred ? [preferred, ...CANDIDATE_ENDPOINTS] : CANDIDATE_ENDPOINTS;
  for (const ep of order) {
    const models = await listModels(ep);
    if (models && models.length) return { endpoint: ep, models };
  }
  return null;
}

function memorySnapshot() {
  const totalGB = os.totalmem() / 1e9;
  const freeGB = os.freemem() / 1e9;
  return { totalGB: round1(totalGB), freeGB: round1(freeGB), freePct: Math.round((freeGB / totalGB) * 100) };
}
const round1 = (n: number) => Math.round(n * 10) / 10;

/* ---------- raw streaming for an explicit (possibly non-Laro) model ---------- */

async function* streamRaw(endpoint: string, model: string, messages: ChatMsg[], signal?: AbortSignal) {
  const base = endpoint.replace(/\/$/, "");
  // A benchmark harness that hits the context ceiling reports the HARNESS failing,
  // not the model — so the pinned-model path gets exactly the same treatment as
  // the shipped one: fit to the engine's real window, and normalise roles for
  // templates (Gemma's) that refuse anything but strict alternation.
  const numCtx = (await engineContextWindow(base, model)) ?? 8192;
  const budget = budgetFor(numCtx, 2048);
  const count = await exactCounter(base, messages);
  const fitted = fitConversation(messages, budget.prompt, count);
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: normalizeForTemplate(fitted.messages),
      stream: true, seed: 42, max_tokens: budget.reply, temperature: 0.3, top_p: 0.9,
    }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`engine responded ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      const payload = t.startsWith("data:") ? t.slice(5).trim() : t;
      if (!payload || payload === "[DONE]") return;
      try {
        const j = JSON.parse(payload);
        const chunk = j?.choices?.[0]?.delta?.content;
        if (chunk) yield chunk as string;
        if (j?.choices?.[0]?.finish_reason) return;
      } catch {
        /* partial */
      }
    }
  }
}

/** One model turn → collected text. Uses the shipped tier-safe veylaroChat when
    driving a Laro tier; the raw path when an explicit model is pinned (so the
    tool can benchmark alternative bases like Qwen-Coder). */
async function* generate(
  endpoint: string,
  explicitModel: string | undefined,
  tier: ModelId,
  messages: ChatMsg[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  if (explicitModel) {
    yield* streamRaw(endpoint, explicitModel, messages, signal);
    return;
  }
  for await (const c of veylaroChat(endpoint, TIER_TAG[tier], messages, tier, false, signal)) {
    if (c.type === "text") yield c.chunk;
  }
}

/* ---------- command execution (guarded) ---------- */

function runCommand(cmd: string, cwd: string, timeoutMs = 30_000): { out: string; ok: boolean } {
  const r = spawnSync(cmd, { cwd, shell: true, timeout: timeoutMs, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
  if (r.error) return { out: `${out}\n${r.error.message}`.trim(), ok: false };
  return { out, ok: r.status === 0 };
}

/* ---------- the headless build loop (the app's real pipeline) ---------- */

interface BuildArgs {
  task: string;
  tier?: ModelId;
  model?: string;
  endpoint?: string;
  dir?: string;
  maxSteps?: number;
  repairTurns?: number;
}

async function headlessBuild(args: BuildArgs) {
  const tier: ModelId = args.tier || "med";
  // No ambition ceiling here either — the app removed its hard-wired cap, so a
  // harness that stops at 16 would under-report what the product actually does.
  const maxSteps = clampInt(args.maxSteps, 1, 400, stepPolicy(String(args.task || ""), tier).hard);
  const repairTurns = clampInt(args.repairTurns, 0, 4, 2);

  const chosen = await pickEndpoint(args.endpoint);
  if (!chosen) return { ok: false, error: "No local Veylaro engine reachable on :8080. Start Veylaro Code, or run the bundled llama-server." };
  const endpoint = chosen.endpoint;

  // Resolve the model we will actually talk to (for the report + Laro-tier guard).
  let resolvedModel = args.model || "";
  if (!resolvedModel) {
    resolvedModel = selectInstalledModel(chosen.models, TIER_TAG[tier], tier);
    if (!resolvedModel) {
      return { ok: false, error: `Endpoint ${endpoint} does not serve Laro ${tier}. Available: ${chosen.models.join(", ")}` };
    }
  } else {
    // Match loosely so an explicit "laro-lite" resolves a served id with a suffix.
    const strip = (s: string) => s.replace(/:latest$/, "");
    const match = chosen.models.find((m) => m === resolvedModel || strip(m) === strip(resolvedModel));
    if (!match) {
      return { ok: false, error: `Model "${resolvedModel}" is not served by ${endpoint}. Available: ${chosen.models.join(", ")}` };
    }
    resolvedModel = match; // use the exact served id
  }

  // Scope dir: an isolated scratch workspace unless the caller pins one.
  const scope = path.resolve(args.dir || path.join(os.tmpdir(), `veylaro-build-${Date.now()}`));
  fs.mkdirSync(scope, { recursive: true });

  const ramGB = round1(os.totalmem() / 1e9);
  const rootEntries = safeReaddir(scope);
  const packageJson = readIfExists(path.join(scope, "package.json"));
  const existingProject = rootEntries.length > 0;
  const verify = verificationCommands({ packageJson, rootEntries });
  const contract = compileExecutionContract({
    request: args.task,
    scope,
    existingProject,
    testEditsLocked: false,
    verification: verify,
  });

  const system = [laroContext(ramGB), SOVEREIGN_FORGE_PROMPT, FILE_PROTOCOL_PROMPT, contract].join("\n\n");
  const messages: ChatMsg[] = [
    { role: "system", content: system },
    { role: "user", content: args.task },
  ];

  const written = new Map<string, { plus: number; minus: number; op: "create" | "edit" }>();
  const gateRejections: string[] = [];
  const commands: { cmd: string; ok: boolean; allowed: boolean; classification: string; out: string }[] = [];
  const narration: string[] = [];
  const steps: { step: number; files: string[]; reads: string[]; runs: string[]; done: boolean }[] = [];
  const started = Date.now();

  let sawDone = false;
  let idleStreak = 0;
  for (let step = 0; step < maxSteps && !sawDone; step++) {
    const beforeStep = new Map(
      [...written.keys()].map((rel) => [rel, readIfExists(path.join(scope, rel)) ?? ""] as const),
    );
    const parser = new StreamParser();
    let raw = "";
    const reads: string[] = [];
    const runs: string[] = [];
    const filesThisStep: string[] = [];

    const apply = (ev: ParseEvent) => {
      if (ev.t === "narrate") narration.push(ev.text);
      else if (ev.t === "read") reads.push(ev.path);
      else if (ev.t === "run") runs.push(ev.cmd);
      else if (ev.t === "done") sawDone = true;
      else if (ev.t === "file" || ev.t === "append") {
        const abs = resolveInScope(scope, "folder", ev.path);
        if (!abs.startsWith(scope)) return; // scope guard — never escape the workspace
        const old = readIfExists(abs);
        // An @@APPEND that fell through to nothing was a silently ignored edit:
        // the model did the work, the harness dropped it, and the step looked idle.
        const next = ev.t === "append" && old
          ? `${old.replace(/\s*$/, "")}\n\n${ev.content}`
          : ev.content;
        const d = diffCounts(old, next);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, next);
        const rel = path.relative(scope, abs);
        written.set(rel, d);
        filesThisStep.push(rel);
      }
    };

    try {
      for await (const chunk of generate(endpoint, args.model, tier, messages)) {
        raw += chunk;
        for (const ev of parser.push(chunk)) apply(ev);
      }
    } catch (e: any) {
      return { ok: false, error: `model turn failed: ${e?.message || e}`, endpoint, model: resolvedModel };
    }
    for (const ev of parser.flush()) apply(ev);

    // Salvage: model ignored the protocol but pasted a named fenced file.
    if (filesThisStep.length === 0 && /```/.test(raw)) {
      for (const f of salvageFences(raw).files) {
        const abs = resolveInScope(scope, "folder", f.path);
        if (!abs.startsWith(scope)) continue;
        const d = diffCounts(readIfExists(abs), f.content);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, f.content);
        const rel = path.relative(scope, abs);
        written.set(rel, d);
        filesThisStep.push(rel);
      }
    }

    messages.push({ role: "assistant", content: raw });

    // Feed real @@READ / @@RUN results back, exactly like the app's next turn.
    const feedback: string[] = [];
    for (const rel of reads.slice(0, 6)) {
      const abs = resolveInScope(scope, "folder", rel);
      const content = abs.startsWith(scope) ? readIfExists(abs) : null;
      feedback.push(`@@READ ${rel}\n${content == null ? "(file does not exist)" : content.slice(0, 6000)}`);
    }
    for (const cmd of runs.slice(0, 4)) {
      const decision = classifyModelCommand(cmd, { mode: "build" });
      if (!decision.allowed) {
        commands.push({ cmd, ok: false, allowed: false, classification: decision.classification, out: decision.reason });
        feedback.push(`@@RUN ${cmd}\nBLOCKED (${decision.classification}): ${decision.reason}`);
        continue;
      }
      const res = runCommand(cmd, scope);
      commands.push({ cmd, ok: res.ok, allowed: true, classification: decision.classification, out: res.out.slice(0, 2000) });
      feedback.push(`@@RUN ${cmd}\nexit=${res.ok ? 0 : 1}\n${compactFailureEvidence(res.out, 1500)}`);
    }

    steps.push({ step: step + 1, files: filesThisStep, reads, runs, done: sawDone });

    // COMPLETION GATE: @@DONE is a claim. Judge the artifact on disk; if it's a
    // stub, reject the claim and keep building with a concrete list of gaps.
    if (sawDone && step < maxSteps - 1) {
      const onDisk = [...written.keys()].map((rel) => ({
        path: rel,
        content: readIfExists(path.join(scope, rel)) ?? "",
      }));
      const verdict = assessDeliverable(args.task, onDisk, { existingProject });
      if (!verdict.complete) {
        sawDone = false;
        gateRejections.push(verdict.reason);
        messages.push({ role: "user", content: continuationBrief(verdict) });
        continue;
      }
    }

    if (sawDone) break;
    if (feedback.length) {
      messages.push({ role: "user", content: feedback.join("\n\n") });
      continue;
    }

    const onDiskNow = [...written.keys()].map((rel) => ({
      path: rel,
      content: readIfExists(path.join(scope, rel)) ?? "",
    }));
    const liveVerdict = assessDeliverable(args.task, onDiskNow, { existingProject });

    // AN IDLE STEP IS A PROTOCOL FAILURE, NOT THE END OF THE RUN.
    // This harness used to `break` the moment a step wrote nothing, so a single
    // prose reply ended the whole build — and a headless benchmark then reported
    // the product stopping far earlier than it actually does. Same escalating
    // enforcement the app uses.
    if (isProtocolFailure(filesThisStep.length, runs.length)) {
      idleStreak += 1;
      if (idleStreak > 3) break;
      messages.push({ role: "user", content: enforcementBrief({
        request: args.task,
        missing: liveVerdict.missing,
        existingPaths: [...written.keys()],
        attempt: idleStreak,
      }) });
      continue;
    }
    idleStreak = 0;

    const regression = detectRegression(beforeStep, new Map(onDiskNow.map((f) => [f.path, f.content])));
    if (regression.regressed) {
      messages.push({ role: "user", content: regressionBrief(regression) });
      continue;
    }

    if (!liveVerdict.complete) {
      const wantsMoreFiles = /across \d+\+ files|several real screens|product surface/i.test(liveVerdict.missing.join(" "));
      const breadth = wantsMoreFiles
        ? breadthBrief(args.task, [...written.keys()], ambitionFloor(args.task).files)
        : null;
      messages.push({ role: "user", content: breadth ?? continuationBrief(liveVerdict) });
      continue;
    }
    messages.push({ role: "user", content: "Continue. If the entire task is complete and every file is written, output @@DONE." });
  }

  // Deterministic verification pass (re-derive commands now that files exist).
  const finalEntries = safeReaddir(scope);
  const finalPkg = readIfExists(path.join(scope, "package.json"));
  let verifyCmds = verificationCommands({ packageJson: finalPkg, rootEntries: finalEntries });
  const verification: { cmd: string; ok: boolean; out: string }[] = [];
  for (const cmd of verifyCmds) {
    const res = runCommand(cmd, scope, 45_000);
    verification.push({ cmd, ok: res.ok, out: compactFailureEvidence(res.out, 1500) });
  }

  // Bounded repair turns on real failure evidence.
  let repairsUsed = 0;
  while (repairsUsed < repairTurns && verification.some((v) => !v.ok)) {
    const failing = verification.find((v) => !v.ok)!;
    const diag = diagnoseFailure(failing.out);
    repairsUsed++;
    const repairMsg =
      `A verification command failed. Repair the source only — do not weaken or edit tests.\n` +
      `Command: ${failing.cmd}\nDiagnosis: ${diag.kind}\nDirective: ${diag.directive}\n` +
      `Failure evidence:\n${failing.out}`;
    messages.push({ role: "user", content: repairMsg });

    const parser = new StreamParser();
    let raw = "";
    try {
      for await (const chunk of generate(endpoint, args.model, tier, messages)) {
        raw += chunk;
        for (const ev of parser.push(chunk)) {
          if (ev.t === "file") {
            const abs = resolveInScope(scope, "folder", ev.path);
            if (!abs.startsWith(scope)) continue;
            const d = diffCounts(readIfExists(abs), ev.content);
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, ev.content);
            written.set(path.relative(scope, abs), d);
          }
        }
      }
    } catch (e: any) {
      break;
    }
    parser.flush();
    messages.push({ role: "assistant", content: raw });
    // re-run verification
    for (const v of verification) {
      const res = runCommand(v.cmd, scope, 45_000);
      v.ok = res.ok;
      v.out = compactFailureEvidence(res.out, 1500);
    }
  }

  const filesArr = [...written.entries()].map(([p, d]) => ({ path: p, plus: d.plus, minus: d.minus, op: d.op }));
  const verified = verifyCmds.length > 0 && verification.every((v) => v.ok);
  const grade = honestGrade({ files: filesArr.length, hasVerifier: verifyCmds.length > 0, verified, verification });

  return {
    ok: true,
    endpoint,
    model: resolvedModel,
    tier,
    scope,
    elapsedMs: Date.now() - started,
    steps,
    files: filesArr,
    commands,
    reproduction: reproductionCommand({ packageJson: finalPkg, rootEntries: finalEntries }),
    verification,
    verified,
    repairsUsed,
    gateRejections,
    narration: narration.slice(-12),
    grade,
  };
}

function honestGrade(x: {
  files: number;
  hasVerifier: boolean;
  verified: boolean;
  verification: { ok: boolean }[];
}): { verdict: string; detail: string } {
  if (x.files === 0) return { verdict: "no-output", detail: "The model wrote no files." };
  if (!x.hasVerifier) {
    return {
      verdict: "unverified",
      detail: `${x.files} file(s) written, but the project declares no automated verifier — output is not test-verified.`,
    };
  }
  if (x.verified) return { verdict: "verified", detail: `${x.files} file(s) written; all ${x.verification.length} verification command(s) passed.` };
  const passed = x.verification.filter((v) => v.ok).length;
  return { verdict: "failing", detail: `${x.files} file(s) written; ${passed}/${x.verification.length} verification command(s) passed.` };
}

/* ---------- course (anti-cheat production evaluation) ---------- */

function repoRoot(): string {
  // mcp/ lives under veylaro-desktop/; the evaluation/ dir is at the repo root.
  return path.resolve(new URL("..", import.meta.url).pathname, "..");
}

async function runCourse(args: { tier?: ModelId; model?: string; endpoint?: string; repairTurns?: number; minMemoryFree?: number }) {
  const root = repoRoot();
  const script = path.join(root, "evaluation", "production_course.py");
  if (!fs.existsSync(script)) return { ok: false, error: `production_course.py not found at ${script}` };

  const chosen = await pickEndpoint(args.endpoint);
  if (!chosen) return { ok: false, error: "No local engine reachable to evaluate." };
  const tier: ModelId = args.tier || "lite";
  const model = args.model || selectInstalledModel(chosen.models, TIER_TAG[tier], tier) || chosen.models[0];

  const outFile = path.join(os.tmpdir(), `veylaro-course-${Date.now()}.json`);
  const cliArgs = [
    script,
    "--endpoint", `${chosen.endpoint.replace(/\/$/, "")}/v1`,
    "--model", model,
    "--repair-turns", String(clampInt(args.repairTurns, 0, 4, 2)),
    "--min-memory-free", String(clampInt(args.minMemoryFree, 0, 100, 20)),
    "--output", outFile,
  ];
  log(`[course] python3 ${cliArgs.join(" ")}`);
  const r = spawnSync("python3", cliArgs, { cwd: root, encoding: "utf8", timeout: 45 * 60_000, maxBuffer: 32 * 1024 * 1024 });
  let result: any = null;
  try {
    result = JSON.parse(fs.readFileSync(outFile, "utf8"));
  } catch {
    /* fall through to stdout */
  }
  return {
    ok: r.status === 0 || !!result,
    endpoint: chosen.endpoint,
    model,
    tier,
    exitCode: r.status,
    aggregate: result?.aggregate ?? null,
    status: result?.status ?? null,
    result,
    stderrTail: (r.stderr || "").split("\n").slice(-12).join("\n"),
  };
}

/* ---------- inspect (read produced output) ---------- */

function inspectDir(dir: string, maxBytes = 20_000) {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) return { ok: false, error: `Not found: ${abs}` };
  const files: { path: string; bytes: number; content: string }[] = [];
  let budget = maxBytes;
  const walk = (d: string) => {
    for (const name of safeReaddir(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        if (name === "node_modules" || name === ".git") continue;
        walk(p);
      } else if (budget > 0) {
        const content = fs.readFileSync(p, "utf8").slice(0, Math.min(budget, 8000));
        budget -= content.length;
        files.push({ path: path.relative(abs, p), bytes: st.size, content });
      }
    }
  };
  walk(abs);
  return { ok: true, dir: abs, fileCount: files.length, files };
}

/* ---------- small helpers ---------- */

function safeReaddir(d: string): string[] {
  try {
    return fs.readdirSync(d);
  } catch {
    return [];
  }
}
function readIfExists(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}
function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = typeof v === "number" ? Math.round(v) : dflt;
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : dflt));
}

/* ---------- tool registry ---------- */

const TOOLS = [
  {
    name: "status",
    description:
      "Report which local Veylaro engine endpoints are up, the installed models mapped to their product tier (Lite/Med/Max), and current RAM headroom. Loads no weights.",
    inputSchema: {
      type: "object",
      properties: { endpoint: { type: "string", description: "Optional endpoint to probe first (e.g. http://127.0.0.1:8080)." } },
    },
  },
  {
    name: "build",
    description:
      "Run Veylaro Code's real headless agent loop on a task: it compiles the execution contract outside the model, streams the model through the @@FILE/@@RUN protocol, writes files into an isolated workspace, runs the repo-derived verification commands, and applies bounded repair turns on real failure evidence. Returns the files written, command results, and an evidence-based grade. Executes a local model (uses RAM).",
    inputSchema: {
      type: "object",
      required: ["task"],
      properties: {
        task: { type: "string", description: "What to build or fix." },
        tier: { type: "string", enum: ["lite", "med", "max"], description: "Product tier to drive (default med). Ignored if `model` is set." },
        model: { type: "string", description: "Pin an exact served model id (e.g. mlx-community/Qwen2.5-Coder-3B-Instruct-4bit) to benchmark an alternative base." },
        endpoint: { type: "string", description: "Engine endpoint (default: the Veylaro engine on :8080)." },
        dir: { type: "string", description: "Workspace dir (default: an isolated temp dir)." },
        maxSteps: { type: "number", description: "Max model turns (1–400; defaults to the ambition-scaled budget for the task)." },
        repairTurns: { type: "number", description: "Bounded repair turns on failure (0–4, default 2)." },
      },
    },
  },
  {
    name: "course",
    description:
      "Run the anti-cheat production capability course (evaluation/production_course.py) against a tier's live endpoint: three execution-graded fixtures (cart debug, SaaS auth + tenant isolation, game state) with hidden-test hashing. Returns the measured score. Long-running; uses RAM.",
    inputSchema: {
      type: "object",
      properties: {
        tier: { type: "string", enum: ["lite", "med", "max"], description: "Tier to evaluate (default lite)." },
        model: { type: "string", description: "Pin an exact served model id instead of the tier default." },
        endpoint: { type: "string", description: "Engine endpoint (default: auto-detect)." },
        repairTurns: { type: "number", description: "Repair turns per fixture (0–4, default 2)." },
        minMemoryFree: { type: "number", description: "Refuse to run below this % free RAM (default 20)." },
      },
    },
  },
  {
    name: "inspect",
    description: "Read back the files under a build workspace directory so the output can be checked directly.",
    inputSchema: {
      type: "object",
      required: ["dir"],
      properties: {
        dir: { type: "string", description: "Workspace directory returned by `build`." },
        maxBytes: { type: "number", description: "Total byte budget across files (default 20000)." },
      },
    },
  },
] as const;

async function callTool(name: string, argsIn: any) {
  const args = argsIn || {};
  switch (name) {
    case "status": {
      const results: any[] = [];
      const order = args.endpoint ? [args.endpoint, ...CANDIDATE_ENDPOINTS] : CANDIDATE_ENDPOINTS;
      const seen = new Set<string>();
      for (const ep of order) {
        if (seen.has(ep)) continue;
        seen.add(ep);
        const models = await listModels(ep);
        if (!models) {
          results.push({ endpoint: ep, up: false });
          continue;
        }
        results.push({
          endpoint: ep,
          up: true,
          models: models.map((m) => ({ id: m, tier: tierFromModelName(m) ?? null })),
        });
      }
      const tiers: Record<string, boolean> = { lite: false, med: false, max: false };
      for (const r of results) for (const m of r.models || []) if (m.tier) tiers[m.tier] = true;
      return { memory: memorySnapshot(), endpoints: results, tiersServed: tiers };
    }
    case "build":
      return headlessBuild(args);
    case "course":
      return runCourse(args);
    case "inspect":
      return inspectDir(args.dir, args.maxBytes);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

/* ---------- JSON-RPC 2.0 over stdio (newline-framed) ---------- */

function send(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handle(msg: any) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;
  try {
    if (method === "initialize") {
      return send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion || "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: SERVER,
        },
      });
    }
    if (method === "notifications/initialized" || method === "notifications/cancelled") return;
    if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
    if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    if (method === "tools/call") {
      const result = await callTool(params?.name, params?.arguments);
      return send({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: result?.ok === false },
      });
    }
    if (!isNotification) send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (e: any) {
    log(`[error] ${method}: ${e?.stack || e}`);
    if (!isNotification) send({ jsonrpc: "2.0", id, error: { code: -32603, message: String(e?.message || e) } });
  }
}

function main() {
  log(`veylaro-code MCP up — tools: ${TOOLS.map((t) => t.name).join(", ")}`);
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => {
    buf += d;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        log(`[warn] non-JSON line ignored: ${line.slice(0, 120)}`);
        continue;
      }
      void handle(msg);
    }
  });
  process.stdin.on("end", () => process.exit(0));
}

main();
