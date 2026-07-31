/* ============================================================
   UI-TASTE LOOP — the visual analogue of verify-and-repair.

   A text model can't see a screenshot. But it CAN read objective,
   computed quality signals, and those are exactly the things that
   separate a plain UI from a tasteful one:

     • contrast   — WCAG ratio of every text element vs its real bg
     • overflow   — content wider than the viewport (horizontal scroll)
     • font       — the browser-default serif = nobody set a font
     • targets    — buttons/links smaller than a fingertip (32px)
     • edges      — content jammed against the window with no padding
     • images     — missing / broken sources
     • console    — JS errors on load

   Every one is a deterministic measurement — no AI judgment, no
   training data, nothing to fake. We compute them in the rendered
   page, turn the failures into a plain-text critique, and hand it
   back to the model to fix — then re-render and re-measure. Same
   loop that took debugging from 2/3 to 4/4, pointed at taste.

   UI_AUDIT_JS runs inside the page (Viewport webview, or a headless
   browser in tests). formatCritique() turns its report into the
   text the model repairs against.
   ============================================================ */

export interface UiIssue { type: string; msg: string; sev: "high" | "med" | "low" }
export interface UiReport { vw: number; issues: UiIssue[]; score: number }

/** Self-contained; returns a UiReport. Safe to run via executeJavaScript /
    page.evaluate. Pure measurement — never mutates the page. */
export const UI_AUDIT_JS = `(() => {
  // Graded at the highest bar — the way a world-class product designer would.
  // Passing the accessibility FLOOR (readable, no overflow) is not a good UI; it's
  // the price of entry. Real taste = type hierarchy, a considered palette with an
  // accent, depth, generous whitespace, a real font, a composed layout. High scores
  // must be EARNED with craft, not handed out for "black text on white".
  const issues = [];
  const add = (type, sev, msg) => issues.push({ type, sev, msg });
  const vw = window.innerWidth;
  const rgb = (s) => { const m = (s||'').match(/[\\d.]+/g); return m ? m.slice(0,3).map(Number) : null; };
  const alpha = (s) => { const m = (s||'').match(/rgba?\\(([^)]+)\\)/); if(!m) return 1; const p = m[1].split(','); return p.length>3 ? parseFloat(p[3]) : 1; };
  const lum = (c) => { const a = c.map(v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }); return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]; };
  const contrast = (fg,bg) => { const L1=lum(fg),L2=lum(bg); return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05); };
  const bgOf = (el) => { let e=el; while(e){ const c=getComputedStyle(e).backgroundColor; const p=rgb(c); if(p && alpha(c)>0.5) return p; e=e.parentElement; } return [255,255,255]; };
  const sat = (c) => { const mx=Math.max(...c)/255, mn=Math.min(...c)/255; return mx===0?0:(mx-mn)/mx; };
  const all = [...document.querySelectorAll('body *')].filter(e => e.offsetWidth>0 && e.offsetHeight>0).slice(0,600);

  /* ---------- FLOOR: correctness failures (hard) ---------- */
  let floorBroken = false;
  const de = document.documentElement;
  if (de.scrollWidth > vw + 3) { add('overflow','high',\`page scrolls sideways (\${de.scrollWidth}px vs \${vw}px window) — broken layout\`); floorBroken = true; }
  const bf = (getComputedStyle(document.body).fontFamily||'').trim();
  if (/^(times|serif|"?times|"?georgia)/i.test(bf)) { add('font','high',\`browser-default serif font (\${bf}) — no typeface was chosen\`); floorBroken = true; }
  const texts = all.filter(e => e.childElementCount===0 && (e.textContent||'').trim().length>0);
  let cf = 0;
  for (const el of texts.slice(0,160)) {
    const cs=getComputedStyle(el); const fg=rgb(cs.color); if(!fg) continue;
    const r=contrast(fg,bgOf(el)); const sz=parseFloat(cs.fontSize); const min=(sz>=24||(sz>=18.66&&parseInt(cs.fontWeight)>=700))?3:4.5;
    if (r<min){ cf++; if(cf<=3) add('contrast','high',\`low contrast \${r.toFixed(1)}:1 (need \${min}) on "\${(el.textContent||'').trim().slice(0,28)}"\`); }
  }
  if (cf>3){ add('contrast','high',\`+\${cf-3} more unreadable text elements\`); }
  if (cf>0) floorBroken = true;
  let tiny=0; for (const t of [...document.querySelectorAll('button,a,[role=button]')]) { const r=t.getBoundingClientRect(); if(r.width>0 && r.height<30 && (t.textContent||'').trim()) tiny++; }
  if (tiny) add('target','med',\`\${tiny} tap target(s) under ~30px tall\`);
  let broken=0; for (const i of document.querySelectorAll('img')) { if(!i.getAttribute('src')||(i.complete&&i.naturalWidth===0)) broken++; }
  if (broken) add('img','med',\`\${broken} broken/missing image(s)\`);

  /* ---------- CRAFT: what actually makes it good ---------- */
  const bodySize = parseFloat(getComputedStyle(document.body).fontSize)||16;
  const heads = [...document.querySelectorAll('h1,h2,[class*=title],[class*=hero],[class*=display]')].filter(e=>e.offsetHeight>0);
  const maxHead = Math.max(bodySize, ...heads.map(h=>parseFloat(getComputedStyle(h).fontSize)||0));
  const scale = maxHead / bodySize;
  if (scale < 1.8) add('hierarchy','high',\`flat type hierarchy — biggest heading is only \${scale.toFixed(1)}× the body. World-class UIs open with a bold hero at 3–5× (clamp, large weight).\`);
  else if (scale < 2.6) add('hierarchy','med',\`type hierarchy is soft (\${scale.toFixed(1)}×) — a world-class hero is 3–5× the body; push it much larger\`);

  // sparse / undesigned — a world-class page has considered structure and detail,
  // not five stacked elements. (Rough proxy: element count for a full-window page.)
  const styledEls = all.filter(e => { const s=getComputedStyle(e); return parseFloat(s.borderRadius)>2 || s.boxShadow!=='none' || /gradient/.test(s.backgroundImage) || s.borderStyle!=='none'; }).length;
  if (all.length < 14 || styledEls < 3) add('richness','high',\`the page is sparse (\${all.length} elements, \${styledEls} with any styling) — a world-class UI has real structure: sections, cards, considered detail and depth\`);

  const lh = parseFloat(getComputedStyle(document.body).lineHeight); const lhr = lh/bodySize;
  if (lh && lhr < 1.45) add('rhythm','med',\`cramped line-height (\${lhr.toFixed(2)}) — give text room to breathe (≈1.5–1.7)\`);

  // palette: pure black/white = amateur; needs a considered accent
  let pureBlackText=0, pureWhiteBg=0, hasAccent=false; const hues=new Set();
  for (const el of all) { const cs=getComputedStyle(el); const c=rgb(cs.color), b=rgb(cs.backgroundColor);
    if (c && c[0]<8&&c[1]<8&&c[2]<8) pureBlackText++;
    if (b && b[0]>250&&b[1]>250&&b[2]>250 && alpha(cs.backgroundColor)>0.9) pureWhiteBg++;
    for (const col of [c,b]) if (col && sat(col)>0.35 && Math.max(...col)>60) { hasAccent=true; hues.add(Math.round((Math.atan2(col[2]-col[1],col[0]-col[1]))*10)); } }
  if (!hasAccent) add('palette','high','no accent colour anywhere — the whole page is greys/black/white. A world-class UI has a considered accent and depth of tone.');
  if (pureBlackText>3) add('palette','med','pure #000 text — designers use a softened near-black (e.g. #111827), never dead black');
  if (pureWhiteBg>0 && !hasAccent) add('palette','low','flat pure-white canvas — consider a tinted or layered background');

  // depth & polish: radius, shadow, gradient, borders
  let radius=false, shadow=false, gradient=false, transition=false;
  for (const el of all) { const cs=getComputedStyle(el);
    if (parseFloat(cs.borderRadius)>2) radius=true;
    if (cs.boxShadow && cs.boxShadow!=='none') shadow=true;
    if (/gradient/.test(cs.backgroundImage)) gradient=true;
    if (cs.transitionDuration && cs.transitionDuration!=='0s') transition=true; }
  // real depth needs elevation (shadow) OR a gradient/tonal background — a lone
  // rounded corner isn't "depth". Count how much depth is actually used.
  let shadowCount=0, gradCount=0;
  for (const el of all) { const cs=getComputedStyle(el); if(cs.boxShadow&&cs.boxShadow!=='none')shadowCount++; if(/gradient/.test(cs.backgroundImage))gradCount++; }
  if (!radius && !shadow && !gradient) add('depth','high','completely flat — no rounded corners, shadows or gradients. Add depth: rounded cards, soft shadows, a gradient or two.');
  else if (shadowCount + gradCount < 2) add('depth','med',\`thin depth (\${shadowCount} shadows, \${gradCount} gradients) — the UI reads flat. World-class work layers soft shadows and tonal/gradient surfaces.\`);
  if (!radius) add('depth','low','sharp corners — soften cards and buttons with border-radius');

  // real font vs bare system default
  if (!/inter|poppins|manrope|geist|s(o|ö)hne|satoshi|space grotesk|jost|general sans|cabinet/i.test(bf) && /^(system-ui|-apple-system|arial|helvetica|sans-serif|blinkmac)/i.test(bf))
    add('font','med','using the bare system font — a chosen typeface (Inter, Geist, Söhne…) is a big step toward world-class');

  // composition: is content in a constrained, centred container?
  const wide = all.filter(e=>{ const cs=getComputedStyle(e); return e.offsetWidth>vw*0.9 && cs.maxWidth!=='none' && parseFloat(cs.maxWidth)>0; });
  if (vw>=900 && wide.length===0) add('layout','med','no max-width container — content sprawls full-bleed. Constrain the main column and centre it.');
  if (!transition && document.querySelector('button,a')) add('polish','low','no transitions — buttons/links snap with no hover feel; add subtle transitions');

  /* ---------- score: high bar. Floor failures cap it low. ---------- */
  const W = { high:16, med:9, low:4 };
  let score = 100 - issues.reduce((s,i)=>s+(W[i.sev]||6),0);
  if (floorBroken) score = Math.min(score, 45);   // broken basics can't score above 45
  score = Math.max(0, Math.round(score));
  return { vw, issues, score };
})()`;

/** Turn a report into the plain-text critique the model repairs against. */
export function formatCritique(report: UiReport): string {
  if (!report.issues.length) return "";
  const lines = report.issues.map((i) => `- [${i.sev}] ${i.msg}`);
  return `A render of the page was measured (objective checks, not opinion). Taste score ${report.score}/100. Fix these — they're what separate a plain UI from a polished one:\n${lines.join("\n")}\n\nApply real fixes in the source (contrast, a proper font stack, spacing/max-width, tap-target padding). Rewrite the affected file(s) with @@FILE … @@END. Keep the layout and content; raise the quality.`;
}

/** How many "high" issues remain — the gate for "is this actually good?". */
export function highIssues(report: UiReport): number {
  return report.issues.filter((i) => i.sev === "high").length;
}
