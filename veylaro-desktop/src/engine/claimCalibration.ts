export interface VerifiedActivity {
  target: string;
  ok: boolean;
  detail?: string;
}

export function runtimeFactReply(prompt: string, model: string | null, tierName: string): string | null {
  const asksModel = /\b(?:what|which)\s+(?:model|checkpoint|weights|tier)\b|\bwhat (?:are you|you'?re) running\b/i.test(prompt);
  if (!asksModel) return null;
  if (!model) return "No local checkpoint is verified as running right now.";
  return `I'm running ${tierName} on ${model.replace(/:latest$/, "")} right now.`;
}

export function instantGreetingReply(prompt: string, name?: string): string | null {
  const clean = prompt.trim().replace(/[!.]+$/, "").trim();
  if (!/^(?:hi|hello|hey|yo)(?:\s+(?:laro|veylaro))?$/i.test(clean)) return null;
  const who = name?.trim() ? ` ${name.trim().split(/\s+/)[0]}` : "";
  return `Hey${who}. What are we working on?`;
}

/** Resolve one explicit binary arithmetic expression without generation. This
    deliberately stays narrow: unsupported or ambiguous maths goes back to the
    normal reasoning path instead of being guessed by a permissive parser. */
export function verifiedArithmeticReply(prompt: string): string | null {
  const clean = prompt.trim();
  if (!clean || clean.length > 120) return null;
  const number = "(-?(?:\\d+(?:\\.\\d+)?|\\.\\d+))";
  const match = clean.match(new RegExp(
    `^(?:(?:what(?:'s| is)|calculate|compute)\\s+)?${number}\\s*(plus|minus|times|multiplied by|divided by|[+\\-*/x×÷])\\s*${number}\\s*[?.]?$`,
    "i",
  ));
  if (!match) return null;

  const left = Number(match[1]);
  const operator = match[2].toLowerCase();
  const right = Number(match[3]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;

  let result: number;
  if (["+", "plus"].includes(operator)) result = left + right;
  else if (["-", "minus"].includes(operator)) result = left - right;
  else if (["*", "x", "×", "times", "multiplied by"].includes(operator)) result = left * right;
  else {
    if (right === 0) return "Undefined: division by zero.";
    result = left / right;
  }
  if (!Number.isFinite(result)) return null;
  return Number(result.toPrecision(12)).toString();
}

export function asksAboutCurrentActivity(prompt: string): boolean {
  return /\b(?:what (?:are you|you'?re) (?:doing|up to|working on)|how(?:'s| is) (?:the )?(?:testing|tests?|build|debugging|work|progress)|(?:current )?status|any progress)\b/i.test(prompt);
}

/** Status is a product fact, not a language-generation task. The model may
    phrase ordinary chat, but it cannot invent work that the runtime did not log. */
export function calibrateCasualReply(
  prompt: string,
  generated: string,
  latest?: VerifiedActivity,
): string {
  if (!asksAboutCurrentActivity(prompt)) return generated;
  if (!latest) return "I don't have a verified task running right now. Give me the project or problem and I'll inspect it.";
  const outcome = latest.ok ? "passed" : "failed";
  const detail = latest.detail?.trim() ? ` ${latest.detail.trim()}` : "";
  return `Last verified check: ${latest.target} ${outcome}.${detail}`.trim();
}
