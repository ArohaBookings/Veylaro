const WORK_VERBS = /\b(build|make|create|implement|add|write|code|fix|refactor|generate|scaffold|set ?up|design|rebuild|redesign|change|edit|delete|remove|migrate|deploy|debug|repair|run|start|serve|launch|open|preview)\b/i;

export function looksLikeBuild(text: string): boolean {
  return WORK_VERBS.test(text) || /\bturn (?:this|it) into|\bconvert\b/i.test(text);
}

export function looksLikeDebug(text: string): boolean {
  return /\b(fix|debug|repair|broken|failing|failure|regression|bug|error|exception|crash|wrong with|doesn'?t work|not working)\b/i.test(text);
}

export function wantsToRunApp(text: string): boolean {
  const t = text.trim();
  if (t.length > 120) return false;
  return /\b(run|start|serve|launch|open|preview|show|see|view|load)\b.{0,30}\b(local ?host|dev ?server|it|this|the (?:app|ui|site|page|project)|my (?:app|ui|site))\b/i.test(t)
    || /\b(show|let)\s+me\s+(see|it|the)\b/i.test(t)
    || /^(run|start|open|serve|preview|launch)\s+(it|localhost|the (?:app|site|ui))\b/i.test(t);
}

/** Route short conversation and knowledge questions away from the file agent.
    Explicit work, project references, paths, and debugging always win. */
export function isFastInteraction(text: string): boolean {
  const clean = text.trim();
  if (!clean || clean.length > 180) return false;
  if (wantsToRunApp(clean) || looksLikeDebug(clean)) return false;
  if (/@@(?:FILE|READ|RUN|DONE)\b|(?:^|\s)(?:src|app|test|tests)\/|\.[cm]?[jt]sx?\b|\/Users\//i.test(clean)) return false;
  if (/\b(?:this|the|my)\s+(?:code|function|file|repo|repository|project|codebase)\b/i.test(clean)) return false;

  const asksForWork = /^(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+)?(?:build|make|create|implement|add|write|code|fix|refactor|generate|scaffold|set ?up|design|rebuild|redesign|change|edit|delete|remove|migrate|deploy|debug|repair)\b/i.test(clean);
  if (asksForWork) return false;

  // Conceptual questions such as "how do I build X?" remain chat; direct
  // imperatives such as "build X" are handled above by the coding agent.
  return /[?!.]$/.test(clean)
    || /^(?:hi|hello|hey|yo|thanks|thank you|cheers|cool|nice|okay|ok|lol|good (?:morning|afternoon|evening)|who|what|why|how|when|where|explain|tell me|do you|are you|can we|let'?s chat)\b/i.test(clean)
    || !looksLikeBuild(clean);
}
