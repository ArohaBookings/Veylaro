export type ContractInput = {
  request: string;
  scope: string;
  existingProject: boolean;
  testEditsLocked: boolean;
  verification: readonly string[];
};

function workKinds(request: string): string[] {
  const kinds: string[] = [];
  if (/\b(fix|debug|repair|bug|error|crash|failing|regression)\b/i.test(request)) kinds.push("repair");
  if (/\b(build|create|implement|add|scaffold|generate|design)\b/i.test(request)) kinds.push("build");
  if (/\b(refactor|migrate|upgrade|convert)\b/i.test(request)) kinds.push("change");
  if (/\b(ui|ux|page|screen|website|dashboard|frontend|react|css)\b/i.test(request)) kinds.push("interface");
  if (/\b(auth|security|permission|secret|token|tenant|role)\b/i.test(request)) kinds.push("security");
  return kinds.length ? kinds : ["engineering"];
}

/** Compile the non-negotiable contract outside the model. The model cannot
 * omit or soften these invariants, and the recap is still derived from runtime
 * evidence rather than the model's claimed completion. */
export function compileExecutionContract(input: ContractInput): string {
  const task = input.request.replace(/\s+/g, " ").trim().slice(0, 1_600);
  const invariants = [
    `Stay inside the observed project scope: ${input.scope}.`,
    input.existingProject
      ? "Preserve unrelated working behavior, project conventions, and existing dependency choices."
      : "Create a complete runnable minimum, not placeholders or a decorative facade.",
    input.testEditsLocked
      ? "Existing tests and grader files are immutable evidence; repair source code only."
      : "Do not weaken validation merely to make a check green.",
    "Never install dependencies, mutate git history, or execute a command outside the runtime allowlist.",
    "Never claim a file, command, render, or result that the runtime did not observe.",
  ];
  if (/\b(ui|ux|page|screen|website|dashboard|frontend|react|css)\b/i.test(input.request)) {
    invariants.push("Interactive controls must work; a blank, crashed, inaccessible, or click-dead render cannot pass.");
  }
  if (/\b(auth|security|permission|secret|token|tenant|role)\b/i.test(input.request)) {
    invariants.push("Preserve authorization boundaries, validate untrusted input, and never expose secrets.");
  }

  const acceptance = input.verification.length
    ? input.verification.map((command) => `Runtime must execute and pass: ${command}.`)
    : ["No repository-declared automated verifier was found; do not label the result test-verified."];

  return [
    "RUNTIME EXECUTION CONTRACT (compiled outside the model; do not restate it)",
    `Work class: ${workKinds(input.request).join(", ")}`,
    `Requested behavior: ${task || "No usable request supplied."}`,
    "Invariants:",
    ...invariants.map((line) => `- ${line}`),
    "Acceptance:",
    ...acceptance.map((line) => `- ${line}`),
    "Non-goals:",
    "- No unrelated cleanup, invented repository structure, benchmark optimization, or hidden-test inference.",
    "- Completion language is reserved for evidence the runtime independently verifies.",
  ].join("\n");
}
