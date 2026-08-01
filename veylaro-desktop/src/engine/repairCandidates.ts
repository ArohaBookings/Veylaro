import { StreamParser, salvageFences } from "./agentLoop";

export interface RepairFile {
  path: string;
  content: string;
}

const PLACEHOLDER = /(?:^|\n)\s*(?:\.\.\.|\/\/\s*(?:rest|remaining)\s+(?:unchanged|omitted)|#\s*(?:rest|remaining)\s+(?:unchanged|omitted))\s*(?:\n|$)/i;

function normalizePath(value: string): string {
  const parts: string[] = [];
  for (const part of value.trim().replace(/\\/g, "/").replace(/^\.\//, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function usable(file: RepairFile, allowed: Set<string>): boolean {
  return allowed.has(file.path) && file.content.trim().length >= 12 && !PLACEHOLDER.test(file.content);
}

/**
 * Recover complete source replacements from a repair response.
 *
 * The normal path is the explicit @@FILE protocol. A small local model may
 * occasionally return one bare fenced source file despite a precise request;
 * when the runtime already knows the single expected file, that response is
 * unambiguous and safe to salvage. Multiple fences or unknown paths remain a
 * hard rejection, so this fallback cannot silently spray invented files into a
 * repository.
 */
export function extractRepairFiles(text: string, expectedPaths: string[]): RepairFile[] {
  const allowed = new Set(expectedPaths.map(normalizePath).filter(Boolean));
  if (!allowed.size) return [];

  const parser = new StreamParser();
  const parsed = [
    ...parser.push(text.endsWith("\n") ? text : `${text}\n`),
    ...parser.flush(),
  ];
  const candidates: RepairFile[] = parsed
    .filter((event): event is Extract<typeof event, { t: "file" }> => event.t === "file")
    .map((event) => ({ path: normalizePath(event.path), content: event.content }));

  for (const file of salvageFences(text).files) {
    candidates.push({ path: normalizePath(file.path), content: file.content });
  }

  const accepted = new Map<string, RepairFile>();
  for (const file of candidates) {
    if (usable(file, allowed)) accepted.set(file.path, file);
  }
  if (accepted.size) return [...accepted.values()];

  if (allowed.size !== 1) return [];
  const fences = [...text.matchAll(/```[^\n`]*\n([\s\S]*?)```/g)];
  if (fences.length !== 1) return [];
  const fallback: RepairFile = {
    path: [...allowed][0],
    content: fences[0][1].replace(/^\s*\n/, "").replace(/\n\s*$/, ""),
  };
  return usable(fallback, allowed) ? [fallback] : [];
}

