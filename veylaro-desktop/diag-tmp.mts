import { veylaroChat, type ChatMsg } from "./src/engine/runtime.ts";
import { FILE_PROTOCOL_PROMPT } from "./src/engine/agentLoop.ts";
import { enforcementBrief } from "./src/engine/protocolEnforcer.ts";
import { laroContext, SOVEREIGN_FORGE_PROMPT } from "./src/engine/charter.ts";

const URL = "http://127.0.0.1:8080";
const TASK = "Build a complete AI receptionist web app: a call-intake form, a live list of today's bookings with edit and delete, availability slots, a search filter, empty/loading/error states, localStorage persistence, and a polished dark UI. Plain HTML/CSS/JS.";
const PROSE = "Great! Now that we have the basic structure, let's plan the next steps. We'll need to add the booking list component, then wire up localStorage persistence, and finally style everything with a dark theme. I'll start by outlining the data model for a booking: each booking will have an id, caller name, phone number, reason, notes, and a timestamp. Let me know if you'd like me to proceed with this approach.";

const base: ChatMsg[] = [
  { role: "system", content: laroContext(16) + "\n\n" + SOVEREIGN_FORGE_PROMPT },
  { role: "system", content: FILE_PROTOCOL_PROMPT },
  { role: "user", content: TASK },
  { role: "assistant", content: "🧱 Scaffolding the page\n@@FILE index.html\n<!doctype html><html><body><h1>Receptionist</h1></body></html>\n@@END" },
  { role: "user", content: "Not done yet — only 41 lines across 1 file(s). Keep building." },
];
const brief = enforcementBrief({ request: TASK, missing: ["Only 41 lines across 1 file(s)."], existingPaths: ["index.html"], attempt: 1 });

async function run(label: string, convo: ChatMsg[]) {
  let out = "";
  for await (const p of veylaroChat(URL, "", convo, "med", false, undefined, {})) {
    if (p.type === "text") out += p.chunk;
  }
  const hasFile = /^@@FILE\s+\S+/m.test(out);
  const hasEnd = /^@@END\s*$/m.test(out);
  console.log(`${label.padEnd(34)} ${out.length.toString().padStart(5)} chars  @@FILE=${hasFile ? "YES" : "no "}  @@END=${hasEnd ? "YES" : "no "}`);
  console.log(`    opens: ${JSON.stringify(out.slice(0, 90))}`);
}

// A: the failed prose turn is KEPT in context (what the loop does today)
await run("A) prose turn kept", [...base, { role: "assistant", content: PROSE }, { role: "user", content: brief }]);
// B: the failed prose turn is DROPPED before retrying
await run("B) prose turn dropped", [...base, { role: "user", content: brief }]);
