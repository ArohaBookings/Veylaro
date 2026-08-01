/* ============================================================
   FUNCTIONAL REALITY GATE — "does the app actually work?"

   verify-and-repair proves code against tests. But a freshly built
   app usually has NO tests — and the classic local-model failure is
   an app that LOOKS fine and does nothing: dead buttons, a blank
   screen behind a spinner, a JS error that killed the script, state
   that silently doesn't persist. The pretty audit (uiCritique) can't
   catch any of that.

   So this gate exercises the running app and reports hard functional
   facts — no opinion, no training data:
     • did anything throw on load? (JS errors)
     • is the screen actually populated, or blank?
     • do the buttons DO something — does clicking change the DOM?
     • (for localStorage apps) does state survive a reload?

   Failures become a plain-text repair brief for Laro, same loop as
   verify-and-repair — now pointed at "it runs", not just "it renders".

   INJECT_ERRORS_JS is added before load to catch throws; PROBE_JS
   runs after and returns a FunctionalReport. In the harness these run
   via Playwright; in the app, via the Viewport webview.
   ============================================================ */

/** Add before the page loads so we catch anything it throws on startup. */
export const INJECT_ERRORS_JS = `window.__vErrors=[];addEventListener('error',e=>{try{__vErrors.push(String(e.message||e.error||e).slice(0,140))}catch(_){}}); addEventListener('unhandledrejection',e=>{try{__vErrors.push('promise: '+String(e.reason).slice(0,120))}catch(_){}});`;

/** Runs after load. It probes only controls that are structurally safe to click:
    tabs, disclosure controls, and explicit non-submit buttons with harmless
    navigation/toggle labels. It never submits forms, publishes, pays, deletes,
    signs out, or clicks an unclassified button. */
export const PROBE_JS = `(() => {
  const r = { bodyLen: 0, jsErrors: [], buttons: 0, testedButtons: 0, skippedButtons: 0, deadButtons: [], inputs: 0, usesStorage: false };
  r.bodyLen = (document.body.innerText||'').trim().length;
  r.jsErrors = (window.__vErrors||[]).slice(0,6);
  r.inputs = document.querySelectorAll('input,textarea,select').length;
  // storage detection: inline HTML + every linked/inline <script> (external app.js
  // was being missed), OR the fact that something is actually in storage.
  const scriptText = [...document.scripts].map(s => s.textContent || '').join('\\n') + document.documentElement.innerHTML;
  const mentionsStorage = /localStorage|sessionStorage/.test(scriptText);
  const visible = [...document.querySelectorAll('button,[role=button],[role=tab]')].filter(b => b.offsetWidth>0 && b.offsetHeight>0 && !b.disabled).slice(0,40);
  r.buttons = visible.length;
  const harmful = /delete|remove|destroy|drop|reset|clear|erase|buy|pay|purchase|checkout|submit|send|publish|deploy|logout|log out|sign out|unsubscribe|revoke|disconnect/i;
  const harmless = /menu|toggle|show|hide|open|close|expand|collapse|next|previous|back|forward|tab|filter|sort|view|preview|details|pause|resume|play|stop/i;
  const btns = visible.filter(b => {
    const label = ((b.getAttribute('aria-label')||b.textContent||b.value||'')+'').trim();
    const type = (b.getAttribute('type')||'button').toLowerCase();
    const inForm = !!b.closest('form');
    if (!label || harmful.test(label) || type === 'submit' || (inForm && type !== 'button')) return false;
    return b.getAttribute('data-veylaro-probe') === 'safe' || b.getAttribute('role') === 'tab' || b.hasAttribute('aria-expanded') || b.hasAttribute('aria-controls') || harmless.test(label);
  }).slice(0,14);
  r.testedButtons = btns.length;
  r.skippedButtons = Math.max(0, r.buttons - r.testedButtons);
  for (const b of btns) {
    const label = ((b.textContent||b.value||'')+'').trim().slice(0,22) || '(button)';
    // fill any empty inputs so an "Add" button has something to act on
    document.querySelectorAll('input[type=text],input:not([type]),textarea').forEach(i => { if(!i.value) i.value='probe test'; i.dispatchEvent(new Event('input',{bubbles:true})); });
    const before = document.body.innerHTML;
    try { b.click(); } catch(e) { r.jsErrors.push('click "'+label+'": '+String(e).slice(0,80)); }
    if (document.body.innerHTML === before) r.deadButtons.push(label);
  }
  // set AFTER interacting — an app that wrote to storage during the probe clearly uses it
  r.usesStorage = mentionsStorage || localStorage.length > 0 || sessionStorage.length > 0;
  return r;
})()`;

export interface FunctionalReport {
  bodyLen: number;
  jsErrors: string[];
  buttons: number;
  testedButtons: number;
  skippedButtons: number;
  deadButtons: string[];
  inputs: number;
  usesStorage: boolean;
  storagePersists?: boolean | null; // set by the harness/app after a reload check
}

export function functionalIssues(r: FunctionalReport): string[] {
  const out: string[] = [];
  if (r.jsErrors.length) out.push(`the page throws JavaScript errors: ${r.jsErrors.slice(0, 3).join(" · ")}`);
  if (r.bodyLen < 15) out.push("the screen is essentially blank — nothing rendered (a script error or an empty render)");
  if (r.testedButtons > 0 && r.deadButtons.length === r.testedButtons) out.push(`every safely testable control is dead — clicking does nothing (${r.deadButtons.join(", ")}). The handlers aren't wired.`);
  else if (r.deadButtons.length) out.push(`these buttons do nothing when clicked: ${r.deadButtons.join(", ")} — wire their handlers`);
  if (r.usesStorage && r.storagePersists === false) out.push("state does not survive a reload — the localStorage save/restore is broken");
  return out;
}

/** Is the app functionally broken enough to demand a repair pass? */
export function isBroken(r: FunctionalReport): boolean {
  return r.jsErrors.length > 0 || r.bodyLen < 15 || (r.testedButtons > 0 && r.deadButtons.length === r.testedButtons) || r.storagePersists === false;
}

/** A visual score cannot outrank hard runtime evidence. A blank/crashed page is
    capped at 10; a facade whose safely testable controls are all dead is capped
    at 35. This closes the old "90/100 but broken" grading blind spot. */
export function truthCappedVisualScore(visualScore: number, r: FunctionalReport | null): number {
  if (!r) return visualScore;
  if (r.bodyLen < 15 || r.jsErrors.length > 0) return Math.min(visualScore, 10);
  if (r.testedButtons > 0 && r.deadButtons.length === r.testedButtons) return Math.min(visualScore, 35);
  return visualScore;
}

/** Repair brief for Laro when the app doesn't actually work. */
export function functionalCritique(r: FunctionalReport): string {
  const issues = functionalIssues(r);
  if (!issues.length) return "";
  return `I ran the app you built and it doesn't fully work yet. Objective results (not opinion):\n${issues.map((i) => `- ${i}`).join("\n")}\n\nFix the logic so it actually works — wire the handlers, fix the errors, make state persist. Rewrite the affected file(s) with @@FILE … @@END. Don't just restyle it; make it FUNCTION.`;
}
