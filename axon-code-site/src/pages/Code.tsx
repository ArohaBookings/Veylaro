import { Link } from "react-router-dom";
import { Reveal, GlowCard } from "../components/FX";
import { VeylaroMark } from "../components/Logo";
import {
  ArrowRight, Bolt, Brain, Check, Eye, GitBranch, Layers, Lock, Memory, Shield, Sparkle, TerminalIcon, Gauge,
} from "../components/Icons";
import { RegisterInterest } from "../components/Interest";
import { DOWNLOADS_ENABLED } from "../config";

/* A faithful CSS mockup of the actual Veylaro Code app window. */
function AppMock() {
  return (
    <div className="appmock" role="img" aria-label="The Veylaro Code app">
      <div className="am-title">
        <span className="am-dots"><i /><i /><i /></span>
        <span className="am-brand"><VeylaroMark size={14} /> Veylaro <b>Code</b></span>
        <span className="am-live">● local · live weights · veylaro-code</span>
      </div>
      <div className="am-body">
        <div className="am-side">
          <span className="am-btn">＋ New session</span>
          <span className="am-lbl">Working on</span>
          <span className="am-file on"><i className="am-pulse" />checkout.ts <b>+58</b> <s>−14</s></span>
          <span className="am-file"><i className="am-ok" />checkout.theme.css <b>+64</b> <s>−0</s></span>
          <span className="am-lbl" style={{ marginTop: "auto" }}>Plan</span>
          <span className="am-plan">∞ Unlimited · Pro</span>
        </div>
        <div className="am-main">
          <div className="am-row am-user">make the empty-cart bug impossible, then prove it</div>
          <div className="am-row am-say">On it. Reading checkout.ts so I know exactly what I'm working with…</div>
          <div className="am-row am-dev">› plan: locate fault → patch → regression guard → run to verify</div>
          <div className="am-row am-think">✦ silly me — that variable name lied to me. renaming it so it can't lie to you.</div>
          <div className="am-row am-diff">
            <span className="d">- if (items.length &gt; 1) submit(items)</span>
            <span className="a">+ if (items.length &gt;= 1) submit(items)</span>
          </div>
          <div className="am-row am-verify">✓ Verified — ran it end-to-end. Behavior confirmed, not assumed.</div>
        </div>
      </div>
    </div>
  );
}

export function Code() {
  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <Reveal>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
              <VeylaroMark size={100} animated />
            </div>
            <span className="eyebrow"><span className="dot" />The app</span>
            <h1 className="h-display" style={{ fontSize: "clamp(40px, 6vw, 76px)" }}>
              Veylaro <span className="grad-text">Code.</span>
            </h1>
            <p className="lede">
              The desktop home of Laro — an agent that plans, edits, runs, verifies and narrates
              every step in plain English <em>and</em> dev-speak. On your machine. On your terms.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <div style={{ maxWidth: 860, margin: "44px auto 0" }}>
              <AppMock />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="center" style={{ marginBottom: 52 }}>
            <span className="eyebrow"><span className="dot" />What it does</span>
            <h2 className="h-xl">Everything the cloud agents do.<br /><span className="grad-text">Plus the things they won't.</span></h2>
          </Reveal>
          <div className="bento">
            {[
              { c: "b-2", icon: <Brain />, t: "Plan mode", b: "Laro shows you the plan first — numbered, honest, editable. Nothing is touched until you approve. Bypass mode for when you trust it fully." },
              { c: "b-2", icon: <Eye />, t: "Narrates everything", b: "Every action, twice: a plain-English line for humans and a precise dev line for engineers. Hover any term for a plain-language tooltip." },
              { c: "b-2", icon: <TerminalIcon />, t: "Terminal mode", b: "A real shell inside the app — commit files, run tests, anything your terminal can do, scoped to your session." },
              { c: "b-3", icon: <Layers />, t: "Time machine", b: "Every edit snaps a checkpoint on a scrubbable timeline. One click rewinds the session — line counts, files, everything rolls back." },
              { c: "b-3", icon: <Bolt />, t: "Sub-agents", b: "On capable machines Laro splits into Scout, Builder and Verifier lanes that work the problem in parallel. Auto-scales to your RAM." },
              { c: "b-2", icon: <Shield />, t: "Privacy HUD", b: "Live proof: 0 bytes to the cloud, tokens per second, RAM, and a running counter of what you've saved versus metered cloud agents." },
              { c: "b-2", icon: <Memory />, t: "Overnight training", b: "Opt in and Laro practices while you sleep — a personal adapter trained on your accepted work, kept separate from base updates so nothing is ever lost." },
              { c: "b-2", icon: <GitBranch />, t: "Internet when you want it", b: "A globe toggle grants live web search — only the query leaves the machine, never your code. Offline, everything still works." },
            ].map((f, i) => (
              <Reveal key={f.t} delay={(i % 3) * 100} className={f.c}>
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
        <div className="container split">
          <Reveal variant="from-left">
            <span className="eyebrow"><span className="dot" />Always getting smarter</span>
            <h2 className="h-xl">Updates land.<br /><span className="grad-text">Your Laro keeps its memory.</span></h2>
            <p className="lede" style={{ marginTop: 18 }}>
              When we ship smarter weights, the app shows a single <b>Download update</b> button.
              Your personal overnight-training adapter is re-applied on top of every update —
              so Laro gets our improvements <em>and</em> keeps everything it learned about you.
            </p>
            <ul style={{ listStyle: "none", marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "One-click model updates, checked against veylaro's feed",
                "Personal adapter survives every base update",
                "Free tier limits respected even fully offline",
                "Works on a plane, in a bunker, on your terms",
              ].map((t) => (
                <li key={t} style={{ display: "flex", gap: 10, color: "var(--muted)", fontSize: 15 }}>
                  <Check size={15} /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal variant="from-right" delay={120}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { icon: <Gauge size={20} />, t: "Tuned for speed", b: "Weights stay hot between messages, the first token streams instantly, and Laro Lite answers at 60–80 tokens/sec on ordinary laptops." },
                { icon: <Lock size={20} />, t: "Scope lock", b: "Every session is pinned to one file or folder. The agent physically cannot wander outside it." },
                { icon: <Sparkle size={20} />, t: "Asks before it assumes", b: "Ambiguous request? Laro asks up to four crisp questions — one at a time, with an 'Other' box so you can answer in your own words." },
              ].map((c) => (
                <GlowCard key={c.t} style={{ display: "flex", gap: 18, alignItems: "flex-start", padding: 24 }}>
                  <div className="icon-tile" style={{ margin: 0, flexShrink: 0 }}>{c.icon}</div>
                  <div>
                    <h3 style={{ fontSize: 17 }}>{c.t}</h3>
                    <p style={{ fontSize: 14.5 }}>{c.b}</p>
                  </div>
                </GlowCard>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <Reveal variant="zoom">
            <div className="cta-band">
              <h2>Be first in the door.</h2>
              <p>
                {DOWNLOADS_ENABLED
                  ? "Veylaro Code is live — grab it on the download page."
                  : "Downloads open very soon. Register and you'll hear the moment they do."}
              </p>
              {DOWNLOADS_ENABLED ? (
                <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
                  <Link to="/download" className="btn primary lg">Download Veylaro Code <ArrowRight size={16} /></Link>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <RegisterInterest source="code-page" />
                </div>
              )}
              <div className="hero-sub" style={{ justifyContent: "center", marginTop: 22 }}>
                <span>Free tier included</span><span>·</span><span>Laro Lite runs on 4 GB RAM</span><span>·</span><span>100% local</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
