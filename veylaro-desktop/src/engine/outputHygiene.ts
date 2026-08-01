/* Deterministic protection against local-model repetition collapse and protocol
   leakage. This does not grade correctness; it only prevents obviously damaged
   text from becoming the user's final answer or a training precedent. */

const PROTOCOL = /@@(?:FILE|END|RUN|DONE)\b[^\n]*/gi;
const TAG_GARBAGE = /(?:<\/?[>\s]*){4,}|(?:<\/>\s*){3,}/;
const TAG_GARBAGE_GLOBAL = /(?:<\/?[>\s]*){4,}|(?:<\/>\s*){3,}/g;
const MODEL_CONTROL_TOKENS = /<(?:end_of_turn|start_of_turn|bos|eos|pad)>/gi;

export function collapseReason(value: string): string | null {
  const text = value.trim();
  if (!text) return "empty output";
  if (TAG_GARBAGE.test(text)) return "repeated markup tokens";

  const words = text.toLowerCase().match(/[a-z0-9_]+|[^\s]/g) || [];
  if (words.length >= 18) {
    const counts = new Map<string, number>();
    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
    const highest = Math.max(...counts.values());
    if (highest / words.length > 0.42) return "single-token repetition";

    const windows = new Map<string, number>();
    for (let i = 0; i + 3 < words.length; i++) {
      const key = words.slice(i, i + 4).join(" ");
      windows.set(key, (windows.get(key) || 0) + 1);
    }
    if ([...windows.values()].some((count) => count >= 4)) return "phrase repetition";
  }
  return null;
}

export function cleanAssistantText(value: string, maxChars = 1200): string {
  if (collapseReason(value)) return "";
  return value
    .replace(PROTOCOL, "")
    .replace(MODEL_CONTROL_TOKENS, "")
    .replace(TAG_GARBAGE_GLOBAL, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}
