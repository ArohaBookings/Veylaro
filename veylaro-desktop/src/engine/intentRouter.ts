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
/** The only things that are genuinely conversation: greetings, acknowledgements,
    and questions about Laro itself. Everything else is work. */
const PURE_CHAT =
  /^(?:hi|hey|hello|yo|sup|hiya|howdy|thanks?|thank you|ta|cheers|cool|nice|great|awesome|perfect|ok(?:ay)?|sure|yep|yeah|nah|no|lol|haha|good (?:morning|afternoon|evening|night)|how(?:'?s| is| are)(?: it going| you| things)?|what'?s up|who (?:are|made) you|what are you|what can you do|tell me about yourself|are you (?:there|ok|real))\b[\s\S]{0,40}$/i;

/**
 * True when the message is small talk that deserves a fast chat reply.
 *
 * THE DEFAULT IS WORK. This is a coding agent with a project open — if the user
 * says anything about the project ("the header is ugly", "receptionist ui",
 * "hundreds of lines please"), it acts. The user should never have to phrase a
 * request in magic words to get the agent to do its job.
 *
 * Only three things stay conversation:
 *   1. Greetings / acknowledgements / questions about Laro itself.
 *   2. A short genuine question that carries no instruction.
 *   3. Nothing else.
 */
/* A BUILD INSTRUCTION HAS TO SAY SOMETHING.

   The default here is "work", which is right — the user should be able to say
   anything about the project and have it act. But "work" was applied to bare
   filler too. Typing "testing" started scaffolding a whole React app; so did
   "test" and "hmm". The user's words: "i said testing not continue".

   A message is actionable if it has a real verb, or names something to work on,
   or is long enough to be a description. One or two words with none of that is
   somebody poking the box, not commissioning a project. */
const ARTIFACT_NOUN =
  /\b(ui|ux|app|api|page|site|website|game|saas|form|button|header|footer|nav|menu|modal|table|chart|dashboard|component|screen|layout|style|theme|css|html|script|server|route|endpoint|database|db|schema|login|signup|auth|receptionist|booking|checkout|cart|profile|settings)\b/i;

export function hasActionableSubstance(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  // A real sentence is a real request, whatever words it uses.
  if (words.length >= 5) return true;
  // A genuine verb makes even two words a job: "build minecraft".
  if (WORK_VERBS.test(text)) return true;
  // Naming a thing counts, but only alongside another word: "receptionist ui",
  // not a lone noun that might just be someone thinking out loud.
  if (words.length >= 2 && ARTIFACT_NOUN.test(text)) return true;
  // Paths and code are unambiguous.
  if (/[\\/]|\.[cm]?[jt]sx?\b|\.(?:html?|css|json|py|md)\b/i.test(text)) return true;
  return false;
}

export function isFastInteraction(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;

  // An explicit instruction always works, even phrased as a question.
  if (asksForWork(clean)) return false;
  if (wantsToRunApp(clean) || looksLikeDebug(clean)) return false;
  if (/@@(?:FILE|READ|RUN|DONE)\b|(?:^|\s)(?:src|app|test|tests)\/|\.[cm]?[jt]sx?\b|\/Users\//i.test(clean)) return false;

  // Greetings and "who are you" style chat.
  if (PURE_CHAT.test(clean)) return true;

  // A short, genuine question with no instruction in it stays conversation
  // ("what should we build?", "is that possible?").
  if (/\?\s*$/.test(clean) && clean.length < 100) return true;

  // Filler with nothing to act on — "testing", "test", "hmm", "wait" — is not a
  // commission. Starting a build on these is how a single word became a React
  // scaffold the user never asked for.
  if (!hasActionableSubstance(clean)) return true;

  // Everything else: do the work.
  return false;
}
