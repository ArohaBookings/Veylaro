export type FailureKind =
  | "assertion"
  | "syntax"
  | "typecheck"
  | "module-resolution"
  | "timeout"
  | "scope-policy"
  | "output-collapse"
  | "unknown";

export type FailureDiagnosis = {
  kind: FailureKind;
  directive: string;
};

const ERROR_LINE = /\b(error|failed|failure|exception|assert|expected|actual|cannot|not found|timeout|timed out|invalid)\b/i;

/** Keep the failure signal while bounding context. Test runners often put the
 * assertion at the tail, so blindly slicing the first N characters loses it. */
export function compactFailureEvidence(output: string, maxChars = 4_000): string {
  const normalized = output.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) return normalized;
  const lines = normalized.split("\n");
  const selected = new Set<number>();
  for (let index = 0; index < Math.min(18, lines.length); index += 1) selected.add(index);
  for (let index = Math.max(0, lines.length - 24); index < lines.length; index += 1) selected.add(index);
  lines.forEach((line, index) => {
    if (ERROR_LINE.test(line)) {
      selected.add(index);
      if (index > 0) selected.add(index - 1);
      if (index + 1 < lines.length) selected.add(index + 1);
    }
  });
  const compact = [...selected].sort((a, b) => a - b).map((index) => lines[index]).join("\n");
  if (compact.length <= maxChars) return compact;
  const half = Math.floor((maxChars - 40) / 2);
  return `${compact.slice(0, half)}\n... failure output compacted ...\n${compact.slice(-half)}`;
}

export function diagnoseFailure(output: string): FailureDiagnosis {
  const text = output.toLowerCase();
  if (/repetition|repeated markup|output collapse|protocol token/.test(text)) {
    return {
      kind: "output-collapse",
      directive: "Discard the collapsed draft. Produce one bounded complete file replacement with no repeated protocol tokens or commentary.",
    };
  }
  if (/blocked by|outside (?:the )?(?:project|scope)|test-integrity|protected test|not allowlisted/.test(text)) {
    return {
      kind: "scope-policy",
      directive: "Stay inside the observed allowed source paths. Do not edit tests, generated files, dependencies, or security policy.",
    };
  }
  if (/ts\d{4}|type error|typeerror:.*(?:assignable|property)|typecheck/.test(text)) {
    return {
      kind: "typecheck",
      directive: "Repair the reported type contract at the first project-owned frame. Preserve the public API and do not silence the checker with any, ignores, or disabled rules.",
    };
  }
  if (/syntaxerror|unexpected token|unterminated|parse error|parsing error/.test(text)) {
    return {
      kind: "syntax",
      directive: "Fix the parser failure first at the earliest project-owned location. Make no unrelated semantic rewrite until the file parses.",
    };
  }
  if (/cannot find module|module not found|err_module_not_found|could not resolve|no module named/.test(text)) {
    return {
      kind: "module-resolution",
      directive: "Trace the import against the observed manifest and filesystem. Correct an existing path or export; do not invent a package or install dependencies.",
    };
  }
  if (/timed out|timeout|heap out of memory|out of memory|allocation failed|infinite loop/.test(text)) {
    return {
      kind: "timeout",
      directive: "Find unbounded work or pathological complexity. Keep the resource limit fixed; repair the algorithm instead of raising time or memory ceilings.",
    };
  }
  if (/assertionerror|expected[\s:\S]{0,120}actual|expected .* (?:to|but|equal)|\bassert\b|\bfail(?:ed|ure)?\b/.test(text)) {
    return {
      kind: "assertion",
      directive: "Trace the first failing invariant from expected versus actual values, then make the smallest source-only repair. Preserve neighboring passing behavior.",
    };
  }
  return {
    kind: "unknown",
    directive: "Start at the first project-owned stack frame, inspect the exact source involved, and change only what the observed failure can justify.",
  };
}

export function failureRepairBrief(output: string, allowedPaths: readonly string[]): string {
  const diagnosis = diagnoseFailure(output);
  const paths = [...new Set(allowedPaths)].filter(Boolean);
  return [
    `Failure class: ${diagnosis.kind}`,
    `Repair rule: ${diagnosis.directive}`,
    paths.length ? `Allowed source files: ${paths.join(", ")}` : "Allowed source files: none identified; inspect before editing.",
    "Observed execution evidence:",
    compactFailureEvidence(output),
  ].join("\n");
}
