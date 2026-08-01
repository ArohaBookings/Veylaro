/* ============================================================
   The Guard — the thing standing between Laro and your disk.

   Every file write, delete and shell command passes through here
   BEFORE it happens. It is deliberately dumb, deliberately strict,
   and has no idea what the model "meant". Rules only.

   Two modes:
     scoped (default)  — only the session's file/folder is writable
     full disk         — the user explicitly accepted the risk, but
                         the system blocklist still applies. Always.

   Nothing here can be turned off by the model. Only by the human,
   in Settings, with a typed confirmation.
   ============================================================ */
const path = require("path");
const os = require("os");
const fs = require("fs");

const HOME = os.homedir();

/** Places nothing may ever write, in ANY mode, ever. */
const NEVER = [
  "/System", "/Library/LaunchDaemons", "/Library/LaunchAgents", "/usr", "/bin",
  "/sbin", "/etc", "/var/db", "/private/etc", "/private/var/db", "/Applications",
  "C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)",
  path.join(HOME, "Library", "Keychains"),
  path.join(HOME, ".ssh"),
  path.join(HOME, ".aws"),
  path.join(HOME, ".gnupg"),
  path.join(HOME, "Library", "Application Support", "Veylaro Code"), // its own state
];

/** Commands that can destroy a machine or exfiltrate. Blocked outright. */
const CATASTROPHIC = [
  /\brm\s+(-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+\/(?:\s|$)/i, // rm -rf /
  /\brm\s+(-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+~\/?(?:\s|$)/i, // rm -rf ~
  /\bmkfs(\.\w+)?\b/i,
  /\bdd\s+[^|]*of=\/dev\/(disk|sd|nvme)/i,
  /:\(\)\s*\{.*\|.*&.*\}\s*;?\s*:/, // fork bomb
  /\bchmod\s+(-R\s+)?777\s+\/(?:\s|$)/i,
  /\bsudo\s+rm\b/i,
  /\bdiskutil\s+(erase|reformat)/i,
  /\bformat\s+[a-z]:/i,
  />\s*\/dev\/(sd|disk|nvme)/i,
];

/** Commands we always want a human to confirm, even in bypass mode. */
const DESTRUCTIVE = [
  /\brm\s+-[a-z]*r/i,
  /\bgit\s+push\s+.*--force\b/i, /\bgit\s+push\s+.*-f\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[a-z]*f/i,
  /\bdrop\s+(table|database)\b/i,
  /\btruncate\s+table\b/i,
  /\bnpm\s+publish\b/i,
  /\bkill\s+-9\b/i,
  /\bshutdown\b/i, /\breboot\b/i,
];

function norm(p) {
  if (!p) return "";
  let s = String(p).trim().replace(/^~(?=$|[/\\])/, HOME);
  try { s = path.resolve(s); } catch { /* keep raw */ }
  return s;
}

/** true when `child` is inside `parent` (or is it) — no ".." escapes. */
function isInside(child, parent) {
  const c = norm(child);
  const p = norm(parent);
  if (!c || !p) return false;
  if (c === p) return true;
  const rel = path.relative(p, c);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Resolve an existing path, or resolve the closest existing parent and append
 * the missing suffix. This makes a path such as `scope/link/new.ts` resolve
 * through `link` before containment is checked. Unresolvable symlinks and a
 * non-directory parent are rejected instead of being treated as ordinary path
 * text.
 *
 * @returns {{ok:true, lexical:string, resolved:string, exists:boolean}|{ok:false, reason:string}}
 */
function resolveForGuard(target, { mustExist = false } = {}) {
  const lexical = norm(target);
  if (!lexical) return { ok: false, reason: "empty path" };

  let cursor = lexical;
  const missing = [];

  while (true) {
    try {
      fs.lstatSync(cursor);
      let real;
      try {
        real = fs.realpathSync.native(cursor);
      } catch {
        return { ok: false, reason: "path contains an unresolved symbolic link" };
      }

      if (missing.length && !fs.statSync(real).isDirectory()) {
        return { ok: false, reason: "nearest existing parent is not a directory" };
      }
      if (mustExist && missing.length) {
        return { ok: false, reason: "path does not exist" };
      }

      return {
        ok: true,
        lexical,
        resolved: missing.length ? path.resolve(real, ...missing) : real,
        exists: missing.length === 0,
      };
    } catch (error) {
      if (!error || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) {
        return { ok: false, reason: `cannot inspect path: ${error && error.message ? error.message : String(error)}` };
      }

      const parent = path.dirname(cursor);
      if (parent === cursor) return { ok: false, reason: "path has no existing parent" };
      missing.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
}

function inNeverList(target, resolvedTarget = target) {
  const lexical = norm(target);
  const resolved = norm(resolvedTarget);
  return NEVER.some((n) => isInside(lexical, n) || isInside(resolved, n));
}

function scopedVerdict(targetInfo, { scope, scopeKind, fullDisk }, operation) {
  if (inNeverList(targetInfo.lexical, targetInfo.resolved)) {
    return { allow: false, reason: `protected system location - ${operation} blocked in every mode, including full-disk` };
  }

  if (fullDisk) {
    // A lexical path in HOME can still resolve through a symlink to elsewhere.
    if (!isInside(targetInfo.lexical, HOME) || !isInside(targetInfo.resolved, HOME)) {
      return { allow: true, path: targetInfo.resolved, needsConfirm: true, reason: "outside your home folder" };
    }
    return { allow: true, path: targetInfo.resolved };
  }

  const rawScope = norm(scope);
  if (!rawScope) return { allow: false, reason: "no session scope set" };
  const lexicalRoot = scopeKind === "file" ? path.dirname(rawScope) : rawScope;
  const rootInfo = resolveForGuard(lexicalRoot, { mustExist: true });
  if (!rootInfo.ok) return { allow: false, reason: `invalid session scope: ${rootInfo.reason}` };

  // Both checks matter: the lexical check rejects an outside path that happens
  // to point inward, while the resolved check rejects an in-scope symlink that
  // points outward.
  if (isInside(targetInfo.lexical, rootInfo.lexical) && isInside(targetInfo.resolved, rootInfo.resolved)) {
    return { allow: true, path: targetInfo.resolved };
  }

  return {
    allow: false,
    reason: `outside this session's scope (${rootInfo.lexical}). Turn on full-disk access in Settings if you meant it.`,
  };
}

/**
 * Can Laro write to this path right now?
 * @returns {{allow:boolean, reason?:string, needsConfirm?:boolean}}
 */
function checkWrite(target, options = {}) {
  const targetInfo = resolveForGuard(target);
  if (!targetInfo.ok) return { allow: false, reason: targetInfo.reason };
  return scopedVerdict(targetInfo, options, "write");
}

/**
 * Can Laro read this existing path right now?
 * @returns {{allow:boolean, path?:string, reason?:string, needsConfirm?:boolean}}
 */
function checkRead(target, options = {}) {
  const targetInfo = resolveForGuard(target, { mustExist: true });
  if (!targetInfo.ok) return { allow: false, reason: targetInfo.reason };
  return scopedVerdict(targetInfo, options, "read");
}

/**
 * Validate a command working directory. Missing paths and files are rejected;
 * callers must not silently substitute HOME or another directory.
 * @returns {{allow:boolean, path?:string, reason?:string, needsConfirm?:boolean}}
 */
function checkCwd(cwd, options = {}) {
  if (!norm(cwd)) return { allow: false, reason: "working directory is required" };

  const verdict = checkRead(cwd, options);
  if (!verdict.allow) return verdict;

  try {
    if (!fs.statSync(verdict.path).isDirectory()) {
      return { allow: false, reason: "working directory is not a directory" };
    }
  } catch (error) {
    return { allow: false, reason: `invalid working directory: ${error && error.message ? error.message : String(error)}` };
  }

  return verdict;
}

/**
 * Should this command run?
 * @returns {{allow:boolean, reason?:string, needsConfirm?:boolean}}
 */
function checkCommand(cmd) {
  const c = String(cmd || "");
  if (!c.trim()) return { allow: false, reason: "empty command" };
  for (const re of CATASTROPHIC) {
    if (re.test(c)) return { allow: false, reason: "this command can destroy the machine — blocked" };
  }
  for (const re of DESTRUCTIVE) {
    if (re.test(c)) return { allow: true, needsConfirm: true, reason: "destructive — needs your OK" };
  }
  return { allow: true };
}

/** Parse one command line without invoking a shell. Model-issued commands are
 * executed with execFile(), so shell grammar is both unnecessary and unsafe. */
function parseCommand(cmd) {
  const input = String(cmd || "");
  if (!input.trim()) return { ok: false, reason: "empty command" };
  if (input.length > 4096) return { ok: false, reason: "command is too long" };
  if (/[\0\n\r;&|<>`$*?\[\]{}()!]/.test(input)) {
    return { ok: false, reason: "shell operators, expansion, and redirection are not allowed" };
  }

  const argv = [];
  let token = "";
  let quote = "";
  let started = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = "";
      else if (ch === "\\" && quote === '"') {
        if (++i >= input.length) return { ok: false, reason: "incomplete escape" };
        token += input[i];
      } else token += ch;
      started = true;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; started = true; }
    else if (/\s/.test(ch)) {
      if (started) { argv.push(token); token = ""; started = false; }
    } else if (ch === "\\") {
      if (++i >= input.length) return { ok: false, reason: "incomplete escape" };
      token += input[i];
      started = true;
    } else { token += ch; started = true; }
  }
  if (quote) return { ok: false, reason: "unterminated quote" };
  if (started) argv.push(token);
  if (!argv.length || argv.length > 128) return { ok: false, reason: "invalid command arguments" };
  return { ok: true, argv };
}

/** Default-deny policy for commands proposed by the model. The renderer has a
 * matching classifier for UX, but this main-process check is authoritative. */
function checkModelCommand(cmd, { mode = "repair" } = {}) {
  const parsed = parseCommand(cmd);
  if (!parsed.ok) return { allow: false, reason: parsed.reason };
  const argv = parsed.argv;
  const exe = argv[0].toLowerCase();
  const args = argv.slice(1);

  if (argv.some((value, index) => {
    const normalized = value.replace(/\\/g, "/");
    return (index === 0 && normalized.includes("/")) || normalized.startsWith("/") ||
      /^[a-z]:\//i.test(normalized) || normalized.split("/").includes("..");
  })) return { allow: false, reason: "absolute paths and parent traversal are not allowed" };

  const inspection = new Set(["cat", "file", "grep", "head", "ls", "pwd", "rg", "stat", "tail", "tree", "wc"]);
  if (inspection.has(exe)) {
    if (exe === "tail" && args.some((v) => v === "-f" || v === "--follow" || /^-[^-]*f/.test(v))) return { allow: false, reason: "follow mode is not bounded" };
    if (exe === "ls" && args.some((v) => v === "-R" || v === "--recursive" || /^-[^-]*R/.test(v))) return { allow: false, reason: "recursive listing is not bounded" };
    if (exe === "rg" && args.some((v) => v === "--pre" || v.startsWith("--pre="))) return { allow: false, reason: "rg preprocessors are not allowed" };
    return { allow: true, argv, kind: "inspection" };
  }

  if (exe === "git") {
    const reads = new Set(["blame", "describe", "diff", "grep", "log", "ls-files", "rev-parse", "shortlog", "show", "status"]);
    const sub = args.find((value) => !value.startsWith("-"));
    if (!sub || !reads.has(sub) || args.some((value) => /^(?:--exec|--ext-diff|--output|--textconv)(?:=|$)/.test(value))) {
      return { allow: false, reason: "only read-only git commands are allowed" };
    }
    return { allow: true, argv, kind: "inspection" };
  }

  if (["npm", "pnpm", "yarn", "bun"].includes(exe)) {
    const name = args[0] === "run" ? args[1] : args[0];
    const allowed = /^(?:test|check|lint|typecheck|verify)(?::[a-z0-9_.-]+)*$/i.test(name || "") ||
      (mode === "build" && /^(?:build|bundle|compile)(?::[a-z0-9_.-]+)*$/i.test(name || ""));
    if (!allowed) return { allow: false, reason: "package installs and unapproved package scripts are not allowed" };
    return { allow: true, argv, kind: mode === "build" && /^(?:build|bundle|compile)/i.test(name) ? "build" : "test" };
  }

  const directTest =
    (["pytest", "py.test", "mypy", "pyright", "pylint", "flake8", "phpunit"].includes(exe)) ||
    (["python", "python3"].includes(exe) && args[0] === "-m" && ["pytest", "unittest"].includes(args[1])) ||
    (exe === "node" && args.includes("--test")) ||
    (exe === "vitest" && (args[0] === "run" || args.includes("--run"))) ||
    (["jest", "mocha", "ava", "tap"].includes(exe) && !args.some((v) => v.startsWith("--watch"))) ||
    (["eslint", "stylelint"].includes(exe) && !args.some((v) => v.startsWith("--fix"))) ||
    (exe === "ruff" && args[0] === "check" && !args.includes("--fix")) ||
    (exe === "prettier" && args.includes("--check")) ||
    (exe === "tsc" && args.some((v) => v.toLowerCase() === "--noemit")) ||
    (exe === "go" && ["test", "vet"].includes(args[0])) ||
    (exe === "cargo" && ["check", "clippy", "test"].includes(args[0])) ||
    (exe === "dotnet" && args[0] === "test") ||
    (exe === "swift" && args[0] === "test") ||
    (exe === "playwright" && args[0] === "test") ||
    (exe === "cypress" && args[0] === "run");
  if (directTest) return { allow: true, argv, kind: "test" };

  const directBuild = mode === "build" && (
    (["vite", "next", "astro", "nuxt"].includes(exe) && args[0] === "build") ||
    (exe === "cargo" && args[0] === "build") ||
    (exe === "go" && args[0] === "build") ||
    (exe === "dotnet" && args[0] === "build") ||
    (exe === "swift" && args[0] === "build") ||
    (exe === "tsc" && !args.some((v) => v.toLowerCase() !== "--noemit"))
  );
  if (directBuild) return { allow: true, argv, kind: "build" };

  return { allow: false, reason: "command is not on the bounded model allowlist" };
}

module.exports = {
  checkWrite,
  checkRead,
  checkCwd,
  checkCommand,
  checkModelCommand,
  parseCommand,
  isInside,
  norm,
  resolveForGuard,
  NEVER,
  CATASTROPHIC,
  DESTRUCTIVE,
};
