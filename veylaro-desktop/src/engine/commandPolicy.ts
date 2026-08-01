export type CommandPolicyMode = "repair" | "build";

export type CommandPolicyClassification =
  | "allowed-inspection"
  | "allowed-test"
  | "allowed-build"
  | "denied-empty"
  | "denied-too-large"
  | "denied-malformed"
  | "denied-shell-control"
  | "denied-redirection"
  | "denied-command-substitution"
  | "denied-shell-expansion"
  | "denied-path-escape"
  | "denied-mutation"
  | "denied-package-install"
  | "denied-git-mutation"
  | "denied-arbitrary-code"
  | "denied-not-allowlisted";

export interface CommandPolicyOptions {
  mode?: CommandPolicyMode;
}

export interface CommandPolicyDecision {
  allowed: boolean;
  classification: CommandPolicyClassification;
  reason: string;
  mode: CommandPolicyMode;
  executable?: string;
  tokens: readonly string[];
}

const MAX_COMMAND_LENGTH = 4_096;
const MAX_TOKEN_COUNT = 128;

const INSPECTION_COMMANDS = new Set([
  "cat",
  "file",
  "grep",
  "head",
  "ls",
  "pwd",
  "rg",
  "stat",
  "tail",
  "tree",
  "wc",
]);

const FILE_MUTATION_COMMANDS = new Set([
  "chmod",
  "chown",
  "chgrp",
  "cp",
  "dd",
  "ed",
  "ex",
  "install",
  "ln",
  "mkdir",
  "mv",
  "nano",
  "patch",
  "rm",
  "rmdir",
  "rsync",
  "tee",
  "touch",
  "truncate",
  "vi",
  "vim",
]);

const SYSTEM_MUTATION_COMMANDS = new Set([
  "defaults",
  "diskutil",
  "docker",
  "kill",
  "killall",
  "launchctl",
  "mount",
  "pkill",
  "reboot",
  "shutdown",
  "sudo",
  "systemctl",
  "umount",
]);

const SHELLS = new Set([
  "bash",
  "cmd",
  "csh",
  "dash",
  "fish",
  "ksh",
  "powershell",
  "pwsh",
  "sh",
  "tcsh",
  "zsh",
]);

const INTERPRETERS = new Set([
  "awk",
  "deno",
  "lua",
  "osascript",
  "perl",
  "php",
  "python",
  "python3",
  "ruby",
]);

const GIT_MUTATIONS = new Set([
  "add",
  "am",
  "apply",
  "bisect",
  "branch",
  "checkout",
  "cherry-pick",
  "clean",
  "clone",
  "commit",
  "config",
  "fetch",
  "gc",
  "init",
  "merge",
  "mv",
  "notes",
  "prune",
  "pull",
  "push",
  "rebase",
  "remote",
  "replace",
  "reset",
  "restore",
  "revert",
  "rm",
  "stash",
  "submodule",
  "switch",
  "tag",
  "update-index",
  "update-ref",
  "worktree",
]);

const GIT_INSPECTION = new Set([
  "blame",
  "describe",
  "diff",
  "diff-files",
  "diff-index",
  "diff-tree",
  "grep",
  "log",
  "ls-files",
  "name-rev",
  "rev-parse",
  "shortlog",
  "show",
  "status",
]);

const REPAIR_SCRIPTS = /^(?:check|lint|test|typecheck|verify)(?::[a-z0-9_.-]+)*$/i;
const BUILD_SCRIPTS = /^(?:build|bundle|compile)(?::[a-z0-9_.-]+)*$/i;

interface SyntaxIssue {
  classification: CommandPolicyClassification;
  reason: string;
}

function denied(
  classification: CommandPolicyClassification,
  reason: string,
  mode: CommandPolicyMode,
  tokens: readonly string[] = [],
): CommandPolicyDecision {
  return { allowed: false, classification, reason, mode, executable: tokens[0], tokens };
}

function allowed(
  classification: "allowed-inspection" | "allowed-test" | "allowed-build",
  reason: string,
  mode: CommandPolicyMode,
  tokens: readonly string[],
): CommandPolicyDecision {
  return { allowed: true, classification, reason, mode, executable: tokens[0], tokens };
}

/**
 * Reject shell grammar before token classification. This scanner deliberately
 * accepts less than a shell: model commands do not need composition, expansion,
 * redirection, comments, globbing, or subshells.
 */
function inspectShellSyntax(input: string): SyntaxIssue | undefined {
  let quote: "'" | '"' | undefined;
  let atWordStart = true;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "\0") {
      return { classification: "denied-malformed", reason: "NUL bytes are not valid command input." };
    }

    if (quote === "'") {
      if (char === "'") quote = undefined;
      continue;
    }

    if (quote === '"') {
      if (char === '"') {
        quote = undefined;
        continue;
      }
      if (char === "\\") {
        if (index + 1 >= input.length) {
          return { classification: "denied-malformed", reason: "The command ends with an incomplete escape." };
        }
        index += 1;
        continue;
      }
      if (char === "`" || (char === "$" && next === "(")) {
        return {
          classification: "denied-command-substitution",
          reason: "Command substitution is not permitted in model-initiated commands.",
        };
      }
      if (char === "$") {
        return {
          classification: "denied-shell-expansion",
          reason: "Shell variable expansion is not permitted in model-initiated commands.",
        };
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      atWordStart = false;
      continue;
    }
    if (char === "\\") {
      if (index + 1 >= input.length) {
        return { classification: "denied-malformed", reason: "The command ends with an incomplete escape." };
      }
      index += 1;
      atWordStart = false;
      continue;
    }
    if (char === "\n" || char === "\r" || char === ";" || char === "|" || char === "&") {
      return {
        classification: "denied-shell-control",
        reason: "Shell control operators and multi-command input are not permitted.",
      };
    }
    if (char === "<" || char === ">") {
      return {
        classification: "denied-redirection",
        reason: "Input, output, process, and heredoc redirection are not permitted.",
      };
    }
    if (char === "`" || (char === "$" && next === "(")) {
      return {
        classification: "denied-command-substitution",
        reason: "Command substitution is not permitted in model-initiated commands.",
      };
    }
    if (char === "$" || char === "*" || char === "?" || char === "[" || char === "{" || char === "}" || char === "!") {
      return {
        classification: "denied-shell-expansion",
        reason: "Shell expansion and unbounded globbing are not permitted.",
      };
    }
    if (char === "(" || char === ")") {
      return {
        classification: "denied-shell-control",
        reason: "Subshells and shell grouping are not permitted.",
      };
    }
    if (char === "#" && atWordStart) {
      return {
        classification: "denied-shell-control",
        reason: "Shell comments are not permitted in model-initiated commands.",
      };
    }
    if (char === "~" && atWordStart) {
      return {
        classification: "denied-shell-expansion",
        reason: "Home-directory expansion is not permitted.",
      };
    }

    atWordStart = /\s/.test(char);
  }

  if (quote) return { classification: "denied-malformed", reason: "The command contains an unterminated quote." };
  return undefined;
}

function tokenize(input: string): string[] | undefined {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let quote: "'" | '"' | undefined;

  const push = () => {
    if (!started) return;
    tokens.push(current);
    current = "";
    started = false;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else if (char === "\\" && quote === '"') {
        index += 1;
        if (index >= input.length) return undefined;
        current += input[index];
      } else {
        current += char;
      }
      started = true;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      push();
    } else if (char === "\\") {
      index += 1;
      if (index >= input.length) return undefined;
      current += input[index];
      started = true;
    } else {
      current += char;
      started = true;
    }
  }
  if (quote) return undefined;
  push();
  return tokens;
}

function hasPathEscape(tokens: readonly string[]): boolean {
  return tokens.some((rawToken, index) => {
    const token = rawToken.includes("=") ? rawToken.slice(rawToken.indexOf("=") + 1) : rawToken;
    if (!token || token === "-") return false;
    const normalized = token.replace(/\\/g, "/");
    if (index === 0 && normalized.includes("/")) return true;
    if (normalized.startsWith("/") || /^[a-z]:\//i.test(normalized)) return true;
    return normalized.split("/").includes("..");
  });
}

function isPackageInstall(tokens: readonly string[]): boolean {
  const [executable = "", command = "", next = "", fourth = ""] = tokens;
  const verb = command.toLowerCase();
  const subverb = next.toLowerCase();
  const fourthVerb = fourth.toLowerCase();

  if (["npx", "pip", "pip3", "pipx", "corepack", "brew", "apt", "apt-get", "dnf", "yum", "pacman"].includes(executable)) return true;
  if (executable === "npm" && ["add", "ci", "exec", "i", "install", "link", "outdated", "publish", "rebuild", "remove", "rm", "uninstall", "update"].includes(verb)) return true;
  if (executable === "pnpm" && ["add", "create", "deploy", "dlx", "env", "i", "import", "install", "link", "publish", "remove", "rm", "setup", "unlink", "up", "update"].includes(verb)) return true;
  if (executable === "yarn" && ["add", "create", "dlx", "import", "install", "link", "plugin", "remove", "set", "unlink", "up", "upgrade"].includes(verb)) return true;
  if (executable === "bun" && ["add", "create", "i", "install", "link", "remove", "rm", "unlink", "update", "x"].includes(verb)) return true;
  if (["python", "python3"].includes(executable) && verb === "-m" && subverb === "pip" && ["download", "install", "uninstall", "wheel"].includes(fourthVerb)) return true;
  if (executable === "uv" && (["add", "remove", "sync", "tool"].includes(verb) || (verb === "pip" && ["install", "uninstall", "sync"].includes(subverb)))) return true;
  if (executable === "poetry" && ["add", "install", "lock", "remove", "self", "update"].includes(verb)) return true;
  if (executable === "cargo" && ["add", "install", "uninstall", "update"].includes(verb)) return true;
  if (executable === "gem" && ["install", "uninstall", "update"].includes(verb)) return true;
  if (executable === "go" && ["get", "install"].includes(verb)) return true;
  if (executable === "dotnet" && ["add", "new", "nuget", "remove", "restore", "tool"].includes(verb)) return true;
  if (["make", "cmake"].includes(executable) && tokens.slice(1).some((token) => token.toLowerCase() === "install")) return true;
  return false;
}

function gitSubcommand(tokens: readonly string[]): string | undefined {
  let index = 1;
  while (index < tokens.length && tokens[index].startsWith("-")) {
    if (!["--literal-pathspecs", "--no-optional-locks", "--no-pager"].includes(tokens[index])) return undefined;
    index += 1;
  }
  return tokens[index]?.toLowerCase();
}

function isGitInspectionSafe(tokens: readonly string[]): boolean {
  const subcommand = gitSubcommand(tokens);
  if (!subcommand || !GIT_INSPECTION.has(subcommand)) return false;
  const unsafeOptions = ["--exec", "--ext-diff", "--output", "--textconv"];
  return !tokens.some((token) => unsafeOptions.some((option) => token === option || token.startsWith(`${option}=`)));
}

function isFileMutation(tokens: readonly string[]): boolean {
  const [executable = ""] = tokens;
  if (FILE_MUTATION_COMMANDS.has(executable) || SYSTEM_MUTATION_COMMANDS.has(executable)) return true;
  if (executable === "sed" && tokens.slice(1).some((token) => /^-.*i/.test(token) || token === "--in-place" || token.startsWith("--in-place="))) return true;
  if (executable === "perl" && tokens.slice(1).some((token) => /^-[a-z]*i[a-z]*$/i.test(token))) return true;
  if (executable === "find" && tokens.slice(1).some((token) => ["-delete", "-exec", "-execdir", "-fprint", "-fprint0", "-ok", "-okdir"].includes(token))) return true;
  return false;
}

function isSafePackageScript(tokens: readonly string[], mode: CommandPolicyMode): "test" | "build" | undefined {
  const [executable, command, script] = tokens;
  if (!["npm", "pnpm", "yarn", "bun"].includes(executable)) return undefined;

  let name: string | undefined;
  if (command === "test") name = "test";
  else if (command === "run") name = script;
  else if (["pnpm", "yarn", "bun"].includes(executable)) name = command;
  if (!name) return undefined;

  if (REPAIR_SCRIPTS.test(name)) return "test";
  if (mode === "build" && BUILD_SCRIPTS.test(name)) return "build";
  return undefined;
}

function isDirectTestCommand(tokens: readonly string[]): boolean {
  const [executable = "", command = "", next = ""] = tokens;
  const args = tokens.slice(1);

  if (["pytest", "py.test", "mypy", "pyright", "pylint", "flake8", "phpunit"].includes(executable)) return true;
  if (["python", "python3"].includes(executable)) return command === "-m" && ["pytest", "unittest"].includes(next);
  if (executable === "node") return command === "--test" || args.includes("--test");
  if (executable === "vitest") return command === "run" || args.includes("--run");
  if (["jest", "mocha", "ava", "tap"].includes(executable)) return !args.some((arg) => arg === "--watch" || arg.startsWith("--watch="));
  if (["eslint", "stylelint"].includes(executable)) return !args.some((arg) => arg === "--fix" || arg.startsWith("--fix="));
  if (executable === "ruff") return (command === "check" && !args.includes("--fix")) || (command === "format" && args.includes("--check"));
  if (executable === "prettier") return args.includes("--check");
  if (executable === "tsc") return args.some((arg) => arg.toLowerCase() === "--noemit");
  if (executable === "go") return ["test", "vet"].includes(command);
  if (executable === "cargo") return ["check", "clippy", "test"].includes(command) || (command === "fmt" && args.includes("--check"));
  if (executable === "dotnet") return command === "test";
  if (executable === "swift") return command === "test";
  if (executable === "xcodebuild") return args.includes("test");
  if (executable === "playwright") return command === "test";
  if (executable === "cypress") return command === "run";
  if (executable === "mvn") return ["test", "verify"].includes(command);
  if (executable === "gradle") return ["check", "test"].includes(command);
  if (["make", "just"].includes(executable)) return ["check", "lint", "test", "typecheck", "verify"].includes(command);
  if (executable === "bundle" && command === "exec") return ["rake", "rspec", "rubocop"].includes(next);
  return false;
}

function isDirectBuildCommand(tokens: readonly string[]): boolean {
  const [executable = "", command = ""] = tokens;
  if (["vite", "next", "astro", "nuxt"].includes(executable)) return command === "build";
  if (executable === "cargo") return command === "build";
  if (executable === "go") return command === "build";
  if (executable === "dotnet") return command === "build";
  if (executable === "swift") return command === "build";
  if (executable === "mvn") return ["package", "verify"].includes(command);
  if (["make", "just"].includes(executable)) return ["build", "bundle", "compile"].includes(command);
  return executable === "tsc";
}

function inspectionAllowed(tokens: readonly string[]): boolean {
  const [executable = ""] = tokens;
  if (executable === "git") return isGitInspectionSafe(tokens);
  if (!INSPECTION_COMMANDS.has(executable)) return false;
  if (executable === "tail" && tokens.slice(1).some((token) => token === "-f" || /^-[^-]*f/.test(token) || token === "--follow" || token.startsWith("--follow="))) return false;
  if (executable === "rg" && tokens.slice(1).some((token) => token === "--pre" || token.startsWith("--pre=") || token === "--pre-glob" || token.startsWith("--pre-glob="))) return false;
  if (executable === "ls" && tokens.slice(1).some((token) => token === "-R" || /^-[^-]*R/.test(token) || token === "--recursive")) return false;
  return true;
}

/**
 * Classify one model-proposed command without executing it. Unknown commands
 * are denied. User-authored commands should use a separate, explicit approval
 * path rather than bypassing this policy.
 */
export function classifyModelCommand(command: string, options: CommandPolicyOptions = {}): CommandPolicyDecision {
  const mode = options.mode ?? "repair";
  const input = command.trim();
  if (!input) return denied("denied-empty", "An empty command cannot be executed.", mode);
  if (command.length > MAX_COMMAND_LENGTH) return denied("denied-too-large", `Command exceeds ${MAX_COMMAND_LENGTH} characters.`, mode);

  const syntaxIssue = inspectShellSyntax(command);
  if (syntaxIssue) return denied(syntaxIssue.classification, syntaxIssue.reason, mode);

  const parsed = tokenize(input);
  if (!parsed || parsed.length === 0) return denied("denied-malformed", "The command could not be parsed safely.", mode);
  if (parsed.length > MAX_TOKEN_COUNT) return denied("denied-too-large", `Command exceeds ${MAX_TOKEN_COUNT} arguments.`, mode, parsed);

  const tokens = parsed.map((token, index) => (index === 0 ? token.toLowerCase() : token));
  const executable = tokens[0];
  if (hasPathEscape(tokens)) {
    return denied("denied-path-escape", "Absolute paths, parent traversal, and path-qualified executables are not permitted.", mode, tokens);
  }
  if (/^[a-z_][a-z0-9_]*=/i.test(executable)) {
    return denied("denied-shell-expansion", "Inline environment assignments are not permitted.", mode, tokens);
  }
  if (isPackageInstall(tokens)) {
    return denied("denied-package-install", "Package installation, dependency mutation, and package execution are not permitted.", mode, tokens);
  }
  if (executable === "git") {
    const subcommand = gitSubcommand(tokens);
    if (subcommand && GIT_MUTATIONS.has(subcommand)) {
      return denied("denied-git-mutation", `git ${subcommand} mutates repository state and is not permitted.`, mode, tokens);
    }
  }
  if (isFileMutation(tokens)) {
    return denied("denied-mutation", `${executable} can mutate files or system state and is not permitted.`, mode, tokens);
  }
  if (SHELLS.has(executable)) {
    return denied("denied-arbitrary-code", "Shell interpreters are not permitted for model-initiated commands.", mode, tokens);
  }
  if (INTERPRETERS.has(executable) && !isDirectTestCommand(tokens)) {
    return denied("denied-arbitrary-code", `${executable} is only permitted in a narrowly recognized test invocation.`, mode, tokens);
  }
  if (executable === "node" && !isDirectTestCommand(tokens)) {
    return denied("denied-arbitrary-code", "Node.js is only permitted with its built-in test runner.", mode, tokens);
  }

  if (inspectionAllowed(tokens)) {
    return allowed("allowed-inspection", "Command is on the bounded read-only inspection allowlist.", mode, tokens);
  }
  const packageScript = isSafePackageScript(tokens, mode);
  if (packageScript === "test") {
    return allowed("allowed-test", "Command invokes an explicitly allowlisted validation script.", mode, tokens);
  }
  if (isDirectTestCommand(tokens)) {
    return allowed("allowed-test", "Command is a recognized non-mutating test or static-check invocation.", mode, tokens);
  }
  if (mode === "build" && (packageScript === "build" || isDirectBuildCommand(tokens))) {
    return allowed("allowed-build", "Build mode permits this explicit build command.", mode, tokens);
  }

  return denied(
    "denied-not-allowlisted",
    `Model-initiated command '${executable}' is not on the ${mode} allowlist.`,
    mode,
    tokens,
  );
}

export function isModelCommandAllowed(command: string, options: CommandPolicyOptions = {}): boolean {
  return classifyModelCommand(command, options).allowed;
}
