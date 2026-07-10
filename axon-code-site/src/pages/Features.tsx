import { Link } from "react-router-dom";
import { Reveal, GlowCard, Tilt } from "../components/FX";
import { Terminal } from "../components/Terminal";
import {
  TerminalIcon, Memory, Eye, Brain, GitBranch, Layers, Gauge, Sparkle, Shield,
  WifiOff, InfinityIcon, Bolt, Folder, Refresh, Check, ArrowRight, DownloadIcon, Lock, Cpu,
} from "../components/Icons";

const PILLARS = [
  {
    icon: <TerminalIcon />,
    title: "Agentic coding, end to end",
    body: "Veylaro doesn't suggest — it ships. Describe the outcome and it plans the work, edits across files, runs commands, executes your test suite, reads the failures and iterates until everything is green.",
    points: ["Multi-file refactors and feature builds", "Autonomous test → fix → retest loops", "Terminal, build tools and package managers", "Long-running tasks with checkpoints"],
  },
  {
    icon: <Brain />,
    title: "Whole-repo understanding",
    body: "On first launch Veylaro indexes your project on-device into a live semantic map. Ask about any corner of a 500k-line codebase and get answers grounded in your actual code, not generic guesses.",
    points: ["Local semantic index — nothing uploaded", "Architecture-aware answers and edits", "40+ languages and frameworks", "Instant lookup, zero network latency"],
  },
  {
    icon: <Memory />,
    title: "Memory that compounds",
    body: "Veylaro keeps long-term memory of your conventions, decisions and corrections between sessions. Tell it once that you prefer composition over inheritance — it remembers forever.",
    points: ["Project memory: architecture & style", "Personal memory: how you like to work", "Fully inspectable and editable", "Stored encrypted on your disk"],
  },
  {
    icon: <Eye />,
    title: "Reasoning you can watch",
    body: "Every plan, every decision, every command is streamed live and kept in an auditable trail. When Veylaro touches your code, you can see exactly why — and veto anything before it lands.",
    points: ["Live plan and thought stream", "Reviewable diffs before apply", "Full session transcripts", "Granular permission controls"],
  },
];

const GRID = [
  { icon: <GitBranch />, t: "Git-native", b: "Clean diffs, meaningful commits, branch awareness. Veylaro fits your existing review flow instead of fighting it." },
  { icon: <Layers />, t: "Files, images & logs", b: "Screenshots of a broken UI, a crash log, a design mock, a PDF spec — drop them in and Veylaro works from them, locally." },
  { icon: <Gauge />, t: "Native speed", b: "Tokens stream straight off your GPU. No queueing behind a million other users, no rate limiting, no regional outages." },
  { icon: <Sparkle />, t: "Local API", b: "Pro exposes a localhost API. Wire Veylaro into your editor, CI hooks or scripts — your own private model endpoint." },
  { icon: <WifiOff />, t: "Fully offline", b: "Planes, trains, secure facilities, bad hotel Wi-Fi. Veylaro works identically with the network cable cut." },
  { icon: <InfinityIcon />, t: "No usage limits", b: "It's your hardware. Run Veylaro 24 hours a day on Pro and the only limit is your electricity bill." },
  { icon: <Shield />, t: "Zero telemetry", b: "No analytics on your prompts, no logging of your code, no 'anonymized' data collection. Nothing is phoned home — there is no home to phone." },
  { icon: <Refresh />, t: "Model updates, your call", b: "New Veylaro model versions download as optional updates. You decide when — and old versions keep working forever." },
  { icon: <Folder />, t: "Workspace sandboxing", b: "Veylaro only sees the folders you grant. Scope it to a repo, a directory, or your whole dev drive — you hold the keys." },
];

export function Features() {
  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <Reveal>
            <span className="eyebrow"><span className="dot" />Features</span>
            <h1 className="h-display" style={{ fontSize: "clamp(40px, 6vw, 76px)" }}>
              A frontier agent.<br /><span className="grad-text">On your hardware.</span>
            </h1>
            <p className="lede">
              Everything you'd expect from the best cloud coding agents — rebuilt around a radical
              constraint: your code never leaves your machine.
            </p>
          </Reveal>
        </div>
      </section>

      {/* pillars — alternating splits */}
      {PILLARS.map((p, i) => (
        <section className="section tight" key={p.title}>
          <div className="container split">
            <Reveal variant={i % 2 ? "from-right" : "from-left"} style={{ order: i % 2 ? 2 : 1 }}>
              <div className="icon-tile" style={{ width: 54, height: 54, borderRadius: 16, marginBottom: 22 }}>{p.icon}</div>
              <h2 className="h-lg">{p.title}</h2>
              <p className="lede" style={{ marginTop: 16, fontSize: 16.5 }}>{p.body}</p>
              <ul style={{ listStyle: "none", marginTop: 22, display: "flex", flexDirection: "column", gap: 11 }}>
                {p.points.map((pt) => (
                  <li key={pt} style={{ display: "flex", gap: 10, color: "var(--muted)", fontSize: 15 }}>
                    <Check size={15} /> {pt}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal variant={i % 2 ? "from-left" : "from-right"} delay={120} style={{ order: i % 2 ? 1 : 2 }}>
              {i === 0 ? (
                <Tilt max={4}><Terminal /></Tilt>
              ) : (
                <Tilt max={5}>
                  <GlowCard style={{ minHeight: 300, display: "grid", placeItems: "center", padding: 50 }}>
                    <PillarArt index={i} />
                  </GlowCard>
                </Tilt>
              )}
            </Reveal>
          </div>
        </section>
      ))}

      {/* everything else grid */}
      <section className="section">
        <div className="container">
          <Reveal className="center" style={{ marginBottom: 50 }}>
            <span className="eyebrow"><span className="dot" />And then some</span>
            <h2 className="h-xl">Built like a product.<br /><span className="grad-text">Not a demo.</span></h2>
          </Reveal>
          <div className="bento">
            {GRID.map((f, i) => (
              <Reveal key={f.t} delay={(i % 3) * 90} className="b-2">
                <GlowCard style={{ height: "100%" }}>
                  <div className="icon-tile">{f.icon}</div>
                  <h3>{f.t}</h3>
                  <p>{f.b}</p>
                </GlowCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <Reveal variant="zoom">
            <div className="cta-band">
              <h2>Feel it on your own repo.</h2>
              <p>The download includes the full model and a generous free tier. Point it at your gnarliest codebase.</p>
              <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
                <Link to="/download" className="btn primary lg"><DownloadIcon size={18} /> Download Veylaro</Link>
                <Link to="/benchmarks" className="btn ghost lg">Compare benchmarks <ArrowRight size={15} /></Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

/* Decorative panels for pillars 2–4 */
function PillarArt({ index }: { index: number }) {
  if (index === 1) {
    return (
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13.5, lineHeight: 2.2, color: "var(--muted)", width: "100%" }}>
        <div style={{ color: "var(--violet)" }}>❯ veylaro "where do we validate webhook signatures?"</div>
        <div style={{ marginTop: 10 }}><span style={{ color: "var(--sky)" }}>◆</span> server/webhooks/verify.ts <span style={{ color: "var(--dim)" }}>— HMAC check, line 42</span></div>
        <div><span style={{ color: "var(--sky)" }}>◆</span> Called from routes/stripe.ts &amp; routes/github.ts</div>
        <div><span style={{ color: "var(--amber)" }}>⚠</span> routes/slack.ts skips verification <span style={{ color: "var(--dim)" }}>— want a fix?</span></div>
        <div style={{ color: "var(--dim)", marginTop: 10 }}>answered from local index · 0.4s · offline</div>
      </div>
    );
  }
  if (index === 2) {
    return (
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        {[
          ["Project", "Monorepo · pnpm · strict TS · no default exports"],
          ["Style", "Composition over inheritance · early returns"],
          ["Decision", "Auth uses JWT + rotating refresh (Jun 2026)"],
          ["Correction", "Never touch legacy/billing without asking"],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 14, alignItems: "center", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 12, padding: "13px 16px" }}>
            <span className="badge violet">{k}</span>
            <span style={{ fontSize: 13.5, color: "var(--muted)" }}>{v}</span>
          </div>
        ))}
        <div style={{ fontSize: 12.5, color: "var(--dim)", textAlign: "center", marginTop: 6 }}><Lock size={12} /> stored encrypted · on your disk · editable anytime</div>
      </div>
    );
  }
  return (
    <div style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 13.5, lineHeight: 2.15 }}>
      <div style={{ color: "var(--violet)" }}>✦ Plan — migrate sessions to signed JWT</div>
      <div style={{ color: "var(--muted)" }}>1. Add jose · 2. Rewrite session.ts · 3. Update middleware · 4. Tests</div>
      <div style={{ color: "var(--sky)", marginTop: 8 }}>◆ Waiting for approval on step 2 diff…</div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <span className="badge green">✓ Approve</span>
        <span className="badge dim">Edit plan</span>
        <span className="badge amber">Skip step</span>
      </div>
      <div style={{ color: "var(--dim)", marginTop: 12 }}>every action logged → session transcript</div>
    </div>
  );
}
