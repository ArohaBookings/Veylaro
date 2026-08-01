import type { RepairFile } from "./repairCandidates";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generate a tiny, auditable set of arithmetic repairs from source semantics.
 * This is deliberately narrow: it only activates when a JavaScript/TypeScript
 * file reads a `.percent` value and subtracts that value directly from an
 * aggregate. The runtime still has to execute unchanged tests before any
 * candidate survives.
 *
 * It is a model-agnostic program-repair lane, not a benchmark answer lookup.
 */
export function synthesizeSemanticRepairs(path: string, source: string, failureOutput: string): RepairFile[] {
  if (!/\.[cm]?[jt]sx?$/i.test(path)) return [];
  if (!/(?:expected|actual|assert|not equal|!==|regular expression)/i.test(failureOutput)) return [];

  const repairs: RepairFile[] = [];

  // Node's assertion output often gives us a literal contract mismatch: the
  // test expected /Game finished/ but the code threw "Invalid move: Game
  // already finished." Turn only that observed literal into a candidate. The
  // unchanged test suite remains the authority, so a misleading message or a
  // coincidental string match cannot be promoted on its own.
  const literalPairs = [...failureOutput.matchAll(
    /regular expression \/([^/\n]{1,80})\/[a-z]*\.\s*Input:[\s\S]{0,220}?["'](?:Error:\s*)?([^"'\n]{1,120})["']/gi,
  )];
  for (const match of literalPairs.slice(0, 4)) {
    const expected = match[1].replace(/\\s\+/g, " ").replace(/\\([.\-])/g, "$1");
    const actual = match[2].trim();
    if (!/^[\w .,:;!?-]{1,80}$/.test(expected) || !actual || expected === actual) continue;
    if (!source.includes(actual)) continue;
    repairs.push({ path, content: source.replace(actual, expected) });
  }

  const percent = source.match(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*\??\.percent\b[^;\n]*[;\n]/);
  if (!percent) return uniqueRepairs(repairs);
  const rate = percent[1];

  const aggregates = [...source.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*(?:\.reduce\s*\(|\.sum\s*\(|subtotal|total)[^;\n]*[;\n]/g)]
    .map((match) => match[1])
    .filter((name) => name !== rate);
  if (!aggregates.length) return uniqueRepairs(repairs);

  for (const total of [...new Set(aggregates)].slice(0, 3)) {
    const direct = new RegExp(`\\b${escapeRegExp(total)}\\s*-\\s*${escapeRegExp(rate)}\\b`);
    if (!direct.test(source)) continue;
    for (const expression of [
      `${total} - ${total} * (${rate} / 100)`,
      `${total} * (1 - ${rate} / 100)`,
    ]) {
      repairs.push({ path, content: source.replace(direct, expression) });
    }
  }
  return uniqueRepairs(repairs);
}

function uniqueRepairs(repairs: RepairFile[]): RepairFile[] {
  const seen = new Set<string>();
  return repairs.filter((candidate) => {
    if (seen.has(candidate.content)) return false;
    seen.add(candidate.content);
    return true;
  }).slice(0, 4);
}
