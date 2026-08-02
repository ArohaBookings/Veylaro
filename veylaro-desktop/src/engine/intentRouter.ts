/* ============================================================
   INTENT ROUTING — chat lane vs. the file-writing agent lane.

   This is a CODING AGENT. When a project is open and the user asks for work,
   it must build — not reply "great idea!". The old router defaulted unknown
   text to chat, so real requests ("get started on the ai receptionist ui")
   never reached the agent: "get started" wasn't a known verb, "started" didn't
   match \bstart\b, and the fallback sent anything unrecognised to conversation.

   The rule now: an explicit work imperative always wins, a genuine question
   stays conversation, and anything else with a work signal builds.
   ============================================================ */

/** Work verbs, with the inflections people actually type. */
const WORK_VERBS =
  /\b(?:build(?:s|ing)?|make|makes|making|create(?:s|d)?|creating|implement(?:s|ed|ing)?|add(?:s|ed|ing)?|write|writes|writing|rewrite|code(?:s|d)?|coding|fix(?:es|ed|ing)?|refactor(?:s|ed|ing)?|generate(?:s|d)?|generating|scaffold(?:s|ed|ing)?|set ?up|setup|design(?:s|ed|ing)?|rebuild|redesign|restyle|change(?:s|d)?|edit(?:s|ed|ing)?|delete|remove|migrate|deploy|debug|repair|run|start(?:s|ed|ing)?|serve|launch|open|preview|polish|improve|update(?:s|d)?|upgrade|integrate|prototype|draft|ship|finish|continue|wire ?up|hook ?up|spin ?up|put together|work(?:ing)? on|get(?:ting)? started|keep going|carry on|go ahead|do it|crack on)\b/i;

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

/** A direct instruction to do work — "get started on X", "build me Y",
    "can you add Z?", "go ahead and wire it up". These ALWAYS reach the agent,
    even when phrased as a question, because the user is asking for the work. */
const WORK_IMPERATIVE =
  /^(?:ok(?:ay)?[,!. ]+|so[,!. ]+|right[,!. ]+|yea?h?[,!. ]+|yep[,!. ]+|sure[,!. ]+|now[,!. ]+|then[,!. ]+|please\s+|pls\s+)*(?:(?:can|could|would|will|wanna|want to|lets|let'?s)\s+(?:you\s+|we\s+)?)?(?:go\s+ahead\s+(?:and\s+)?)?(?:get(?:ting)?\s+started|start(?:ed)?|build|make|create|implement|add|write|rewrite|code|fix|refactor|generate|scaffold|set\s?up|setup|design|rebuild|redesign|restyle|change|edit|update|upgrade|improve|polish|delete|remove|migrate|deploy|debug|repair|work\s+on|continue|keep\s+going|carry\s+on|finish|ship|draft|prototype|spin\s?up|wire\s?up|hook\s?up|integrate|put\s+together|do\s+it|crack\s+on)\b/i;

export function asksForWork(text: string): boolean {
  return WORK_IMPERATIVE.test(text.trim());
}

/**
 * True when the message is conversation and should get a fast chat reply
 * instead of the file-writing agent.
 *
 * Order matters:
 *   1. An explicit work imperative is ALWAYS work.
 *   2. Code, paths, project references, debugging and "run it" are work.
 *   3. A genuine question with no imperative stays conversation.
 *   4. Any remaining work signal builds; everything else is conversation.
 */
export function isFastInteraction(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;

  // 1. Explicit instruction to do work — even "can you build X?" or
  //    "get started on the ui, ok?" — never gets fobbed off with chat.
  if (asksForWork(clean)) return false;

  // 2. Hard work signals.
  if (wantsToRunApp(clean) || looksLikeDebug(clean)) return false;
  if (/@@(?:FILE|READ|RUN|DONE)\b|(?:^|\s)(?:src|app|test|tests)\/|\.[cm]?[jt]sx?\b|\/Users\//i.test(clean)) return false;
  if (/\b(?:this|the|my)\s+(?:code|function|file|repo|repository|project|codebase|app|ui|page|site|screen|component|feature)\b/i.test(clean)) return false;

  // Long messages are briefs, not small talk.
  if (clean.length > 180) return false;

  // 3. A real question with no imperative is conversation ("what should we
  //    build?", "is that possible?", "how does X work?").
  if (/\?\s*$/.test(clean)) return true;

  // 4. Otherwise: any work signal builds; the rest is conversation.
  if (looksLikeBuild(clean)) return false;
  return true;
}
