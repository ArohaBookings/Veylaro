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


/* ============================================================
   NARRATION IS NOT CODE.

   The user's words: "why tf is it pasting the code its doing in veylaro code
   chat it should be fucken internal like how it is on codex".

   They're right. Anything the model emits OUTSIDE an @@FILE block becomes a
   narration line and is shown in chat. When the model drifts out of the protocol
   mid-file — a stray `}` , a leftover `const x = 1;`, a fence it opened and
   never closed — those lines land in the transcript as if they were commentary.
   The file rows already say what was written; the raw source belongs nowhere
   near the conversation.

   A narration line is a short human sentence about the work. If it looks like
   source code, it is protocol drift, not narration, and the chat must not show
   it. The line is still parsed and still counts for collapse detection — this
   only controls what a human sees.
   ============================================================ */

/** Shapes that are code, not commentary. */
const CODE_SHAPE = [
  /^[\s]*[<>{}()\[\];]/,                          // opens/closes a block or tag
  /^\s*(?:const|let|var|function|class|import|export|return|if|else|for|while|switch|case|try|catch|async|await|def|public|private)\b/,
  /^\s*(?:<\/?[a-z][\w-]*|@media|@import|:root|\.[a-z][\w-]*\s*\{|#[a-z][\w-]*\s*\{)/i,
  /[;{}]\s*$/,                                     // ends like a statement or block
  /^\s*(?:\/\/|\/\*|\*|#!)/,                        // a code comment
  /^\s*```/,                                       // a fence
  /=>|===|!==|\+\+|&&|\|\|/,                        // operators prose doesn't use
  /^\s*["'`]?[\w-]+["'`]?\s*:\s*["'{[\d]/,          // an object/CSS property line
];

/** True when a "narration" line is actually source code that leaked out of a
    file block, and so must not be shown in the chat. */
export function looksLikeCode(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  // A sentence with spaces and no code punctuation is narration, even if long.
  if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(t)) return false;
  return CODE_SHAPE.some((re) => re.test(t));
}

/** Should this narration line be shown to the user at all? */
export function isPresentableNarration(line: string): boolean {
  const t = line.trim();
  if (t.length < 3) return false;
  return !looksLikeCode(t);
}
