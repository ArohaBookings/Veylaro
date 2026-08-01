export type VerificationInput = {
  packageJson?: string | null;
  rootEntries?: readonly string[];
};

const SCRIPT_ORDER = ["test", "lint", "typecheck", "check", "build"] as const;
const PLACEHOLDER_TEST = /no test specified|echo\s+["']?error|exit\s+1/i;

function packageRunner(input: VerificationInput, parsed: Record<string, unknown>): "npm" | "pnpm" | "yarn" | "bun" {
  const declared = typeof parsed.packageManager === "string" ? parsed.packageManager.split("@")[0] : "";
  if (declared === "pnpm" || declared === "yarn" || declared === "bun" || declared === "npm") return declared;
  const names = new Set((input.rootEntries || []).map((name) => name.toLowerCase()));
  if (names.has("pnpm-lock.yaml")) return "pnpm";
  if (names.has("yarn.lock")) return "yarn";
  if (names.has("bun.lock") || names.has("bun.lockb")) return "bun";
  return "npm";
}

/** Compile a bounded, deterministic verification plan from repository evidence.
 * The returned commands are still checked by the model-command policy before
 * execution. No command is inferred from model prose. */
export function verificationCommands(input: VerificationInput): string[] {
  const commands: string[] = [];
  if (input.packageJson) {
    try {
      const parsed = JSON.parse(input.packageJson);
      const scripts = parsed?.scripts || {};
      const runner = packageRunner(input, parsed || {});
      for (const name of SCRIPT_ORDER) {
        const value = scripts[name];
        if (typeof value !== "string" || !value.trim()) continue;
        if (name === "test" && PLACEHOLDER_TEST.test(value)) continue;
        commands.push(runner === "npm" && name === "test" ? "npm test" : `${runner} run ${name}`);
      }
    } catch {
      // A malformed package manifest is evidence, not permission to guess.
    }
  }

  if (commands.length) return [...new Set(commands)].slice(0, 4);

  const names = new Set((input.rootEntries || []).map((name) => name.toLowerCase()));
  if (names.has("pytest.ini") || names.has("conftest.py") || names.has("tests") || names.has("pyproject.toml")) {
    return ["python3 -m pytest -q"];
  }
  if (names.has("cargo.toml")) return ["cargo test --quiet"];
  if (names.has("go.mod")) return ["go test ./..."];
  return [];
}

/** Reproduction uses the narrowest behavior check, never a build-only command. */
export function reproductionCommand(input: VerificationInput): string | null {
  const commands = verificationCommands(input);
  return commands.find((command) => /(?:^|\s)(?:test|pytest)(?:\s|$)|go test/.test(command)) || null;
}
