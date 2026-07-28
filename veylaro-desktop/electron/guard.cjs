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

function inNeverList(target) {
  const t = norm(target);
  return NEVER.some((n) => isInside(t, n));
}

/**
 * Can Laro write to this path right now?
 * @returns {{allow:boolean, reason?:string, needsConfirm?:boolean}}
 */
function checkWrite(target, { scope, scopeKind, fullDisk }) {
  const t = norm(target);
  if (!t) return { allow: false, reason: "empty path" };

  if (inNeverList(t)) {
    return { allow: false, reason: "protected system location — blocked in every mode, including full-disk" };
  }

  if (fullDisk) {
    // outside home is still worth a human glance
    if (!isInside(t, HOME)) return { allow: true, needsConfirm: true, reason: "outside your home folder" };
    return { allow: true };
  }

  const root = scopeKind === "file" ? path.dirname(norm(scope)) : norm(scope);
  if (!root) return { allow: false, reason: "no session scope set" };

  // In file scope, the file itself plus siblings it creates are fine.
  if (isInside(t, root)) return { allow: true };

  return {
    allow: false,
    reason: `outside this session's scope (${root}). Turn on full-disk access in Settings if you meant it.`,
  };
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

module.exports = { checkWrite, checkCommand, isInside, norm, NEVER, CATASTROPHIC, DESTRUCTIVE };
