const NEGATED_TEST_EDIT = /\b(?:do\s+not|don't|never|without|avoid|must\s+not)\b[^.!?\n]{0,80}\b(?:edit|change|rewrite|update|modify|touch)\b[^.!?\n]{0,40}\btests?\b/i;
const POSITIVE_TEST_EDIT = /\b(?:add|create|write|implement|update|change|rewrite|modify)\b[^.!?\n]{0,40}\b(?:tests?|test\s+(?:suite|cases?))\b/i;

export function explicitlyRequestsTestEdits(prompt: string): boolean {
  if (NEGATED_TEST_EDIT.test(prompt)) return false;
  return POSITIVE_TEST_EDIT.test(prompt);
}

export function isProtectedTestPath(value: string): boolean {
  const path = value.replace(/\\/g, "/").toLowerCase();
  const base = path.split("/").pop() || "";
  if (/(^|\/)(?:test|tests|__tests__)(\/|$)/.test(path)) return true;
  if (/\.(?:test|spec)\.[^.]+$/.test(base)) return true;
  if (/^test_.+\.py$|.+_test\.(?:py|go|rs)$/.test(base)) return true;
  if (/^(?:conftest\.py|pytest\.ini|tox\.ini|jest\.config\.[^.]+|vitest\.config\.[^.]+|playwright\.config\.[^.]+|cypress\.config\.[^.]+)$/.test(base)) return true;
  return base === "package.json" || /^(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(base);
}

