import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { VeylaroMark } from "../components/Logo";
import { Reveal, CountUp, GlowCard, Tilt, WordReveal } from "../components/FX";
import { Terminal } from "../components/Terminal";
import { BenchmarkChart } from "../components/BenchmarkChart";
import { RegisterInterest } from "../components/Interest";
import {
  Apple, Windows, ArrowRight, Shield, InfinityIcon, WifiOff, Bolt, Cpu, Lock,
  Brain, GitBranch, Eye, TerminalIcon, Memory, Check, DownloadIcon, Sparkle, Gauge, Layers,
} from "../components/Icons";

/* ---------------- sticky scroll story ---------------- */
const STORY = [
  {
    num: "01 — Install",
    title: "The model downloads with the app.",
    body: "One installer. Laro Max — or Laro Lite for lighter machines — lands on your SSD: weights, memory, everything. One free account, no API key, no cloud handshake.",
  },
  {
    num: "02 — Understand",
    title: "Veylaro reads your entire codebase. Locally.",
    body: "It indexes your repo on-device and builds a live map of your architecture. Your proprietary code is never uploaded, embedded, or logged anywhere.",
  },
  {
    num: "03 — Act",
    title: "An agent that edits, runs and tests.",
    body: "Veylaro plans multi-step changes, writes the code, runs your test suite, reads the failures and fixes them — in a loop, until it's done.",
  },
  {
    num: "04 — Own",
    title: "Everything stays on your machine.",
    body: "Prompts, diffs, memory, telemetry: zero bytes leave your hardware. Unplug the internet and Veylaro keeps working. That's not a policy — it's physics.",
  },
];

function StoryVisual({ active }: { active: number }) {
  return (
    <div className="story-visual">
      {/* 01 — install */}
      <div className={`panel ${active === 0 ? "active" : ""}`}>
        <div style={{ textAlign: "center", width: "100%", maxWidth: 380 }}>
          <VeylaroMark size={92} />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted)", margin: "26px 0 12px", display: "flex", justifyContent: "space-between" }}>
            <span>veylaro-1.0.0-arm64.dmg</span><span style={{ color: "var(--violet)" }}>9.4 GB</span>
          </div>
          <div style={{ height: 10, borderRadius: 6, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: active === 0 ? "86%" : "0%", background: "var(--grad-btn)", borderRadius: 6, transition: "width 2.6s var(--ease-out)" }} />
          </div>
          <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 12 }}>Model weights included · installs in minutes</div>
        </div>
      </div>
      {/* 02 — reads codebase */}
      <div className={`panel ${active === 1 ? "active" : ""}`}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13.5, lineHeight: 2.1, color: "var(--muted)", width: "100%", maxWidth: 380 }}>
          <div style={{ color: "var(--violet)", marginBottom: 6 }}>◆ indexing ~/projects/app · on-device</div>
          <div>├─ src/ <span style={{ color: "var(--dim)" }}>412 files</span> <span style={{ color: "var(--green)" }}>✓</span></div>
          <div>├─ server/ <span style={{ color: "var(--dim)" }}>187 files</span> <span style={{ color: "var(--green)" }}>✓</span></div>
          <div>├─ packages/ui/ <span style={{ color: "var(--dim)" }}>96 files</span> <span style={{ color: "var(--green)" }}>✓</span></div>
          <div>└─ tests/ <span style={{ color: "var(--dim)" }}>230 files</span> <span style={{ color: "var(--green)" }}>✓</span></div>
          <div style={{ marginTop: 12, color: "var(--sky)" }}>925 files mapped · 0 uploaded</div>
        </div>
      </div>
      {/* 03 — agent acts */}
      <div className={`panel ${active === 2 ? "active" : ""}`}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13.5, lineHeight: 2.1, width: "100%", maxWidth: 400 }}>
          <div style={{ color: "var(--dim)" }}>// auth/session.ts</div>
          <div style={{ background: "rgba(248,113,113,0.1)", color: "#fda4af", padding: "0 10px", borderRadius: 6 }}>- const token = md5(user.id)</div>
          <div style={{ background: "rgba(52,211,153,0.1)", color: "#6ee7b7", padding: "0 10px", borderRadius: 6 }}>+ const token = await signJWT(user, expiry)</div>
          <div style={{ background: "rgba(52,211,153,0.1)", color: "#6ee7b7", padding: "0 10px", borderRadius: 6, marginTop: 4 }}>+ await rotateRefreshToken(session)</div>
          <div style={{ marginTop: 14, color: "var(--green)" }}>✓ 18 tests passed</div>
          <div style={{ color: "var(--violet)" }}>✦ committed: fix(auth): sign sessions properly</div>
        </div>
      </div>
      {/* 04 — private */}
      <div className={`panel ${active === 3 ? "active" : ""}`}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 110, height: 110, margin: "0 auto 24px", borderRadius: 30, display: "grid", placeItems: "center", background: "linear-gradient(135deg, rgba(216,154,102,0.2), rgba(226,183,134,0.12))", border: "1px solid rgba(216,154,102,0.4)", color: "var(--violet)" }}>
            <Shield size={54} />
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 700, letterSpacing: "-0.03em" }}>
            0 <span style={{ fontSize: 20, color: "var(--muted)", fontWeight: 500 }}>bytes to the cloud</span>
          </div>
          <div style={{ color: "var(--dim)", marginTop: 10, fontSize: 14 }}>Airplane mode approved ✈</div>
        </div>
      </div>
    </div>
  );
}

function StorySection() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.idx);
            setActive(idx);
          }
        });
      },
      { rootMargin: "-42% 0px -42% 0px" }
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section className="section">
      <div className="container">
        <Reveal className="center" style={{ marginBottom: 30 }}>
          <span className="eyebrow"><span className="dot" />Local by design</span>
          <h2 className="h-xl">Not connected to the cloud.<br /><span className="grad-text">Connected to your machine.</span></h2>
        </Reveal>
        <div className="story">
          <div className="story-sticky">
            <StoryVisual active={active} />
          </div>
          <div className="story-steps">
            {STORY.map((s, i) => (
              <div
                key={i}
                data-idx={i}
                ref={(el) => (stepRefs.current[i] = el)}
                className={`story-step ${active === i ? "active" : ""}`}
              >
                <span className="num">{s.num}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- page ---------------- */
export function Home() {
  return (
    <main>
      {/* ============ HERO ============ */}
      <section className="hero">
        <div className="container wide hero-inner">
          <div>
            <Reveal>
              <span className="eyebrow"><span className="dot" />The most powerful local AI in the world</span>
            </Reveal>
            <h1 className="h-display">
              <WordReveal text="Your code." startDelay={100} />
              <br />
              <WordReveal text="Your machine." startDelay={300} />
              <br />
              <WordReveal text="Your AI." startDelay={550} gradient />
            </h1>
            <Reveal delay={250}>
              <p className="lede" style={{ marginTop: 28 }}>
                Veylaro is an agentic coding AI that lives on your computer — not in someone
                else's data center. It reads your codebase, writes real code, runs your tests and
                never sends a single byte to the cloud.
              </p>
            </Reveal>
            <Reveal delay={400}>
              <div className="hero-ctas">
                <Link to="/download" className="btn primary lg">
                  <DownloadIcon size={18} /> Download free <span className="arrow">→</span>
                </Link>
                <Link to="/benchmarks" className="btn ghost lg">
                  See benchmarks
                </Link>
              </div>
              <div className="hero-sub">
                <span><Apple size={14} /> macOS</span>
                <span><Windows size={13} /> Windows</span>
                <span>Free tier · 2-minute account · No credit card</span>
              </div>
            </Reveal>
            <Reveal delay={550}>
              <div className="hero-badges">
                <span className="chip"><Lock size={14} /> 100% on-device</span>
                <span className="chip"><InfinityIcon size={15} /> No usage limits</span>
                <span className="chip"><WifiOff size={14} /> Works offline</span>
                <span className="chip"><Bolt size={14} /> Agentic coding</span>
              </div>
            </Reveal>
          </div>

          <div className="logo-stage">
            <div className="halo" />
            <div className="orbit o1"><span className="sat" /></div>
            <div className="orbit o2"><span className="sat blue" /></div>
            <div className="logo-float">
              <VeylaroMark size={290} animated />
            </div>
            <div className="float-chip" style={{ top: "9%", left: "4%", animationDelay: "0.4s" }}>
              <small>Data to cloud</small>
              <b>0 bytes. Ever.</b>
            </div>
            <div className="float-chip" style={{ bottom: "13%", right: "2%", animationDelay: "1.3s" }}>
              <small>Usage limits</small>
              <b>∞ Unlimited</b>
            </div>
            <div className="float-chip" style={{ bottom: "2%", left: "12%", animationDelay: "2.2s" }}>
              <small>Latency</small>
              <b>Zero network</b>
            </div>
          </div>
        </div>
      </section>

      {/* ============ MARQUEE ============ */}
      <div className="marquee-band">
        <div className="marquee" aria-hidden>
          {[0, 1].map((k) => (
            <span key={k} style={{ display: "contents" }}>
              <span><i>✦</i> Private by physics</span>
              <span><i>✦</i> No usage limits</span>
              <span><i>✦</i> Works offline</span>
              <span><i>✦</i> Agentic coding</span>
              <span><i>✦</i> Persistent memory</span>
              <span><i>✦</i> Your GPU, your rules</span>
              <span><i>✦</i> Zero telemetry</span>
              <span><i>✦</i> One flat price</span>
            </span>
          ))}
        </div>
      </div>

      {/* ============ MISSION ============ */}
      <section className="section tight">
        <div className="container center">
          <Reveal>
            <span className="eyebrow"><span className="dot" />Our mission</span>
            <h2 className="h-display" style={{ fontSize: "clamp(34px, 5.6vw, 72px)", maxWidth: 900, margin: "0 auto" }}>
              We believe everyone should <span className="grad-text">own powerful AI.</span>
            </h2>
            <p className="lede" style={{ marginTop: 24 }}>
              Not rent it. Not queue for it. Not hand your work to someone else's servers. Intelligence
              that lives on your machine, answers to you, and gets smarter every night — that's the whole company.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 34 }}>
              <span className="chip">✦ Yours — it lives on your hardware</span>
              <span className="chip">✦ Private by physics, not by promise</span>
              <span className="chip">✦ Always getting smarter — even while you sleep</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ TERMINAL DEMO ============ */}
      <section className="section">
        <div className="container split split-terminal">
          <Reveal variant="from-left">
            <span className="eyebrow"><span className="dot" />Agentic, end to end</span>
            <h2 className="h-xl">An engineer in your terminal.<br />Not a chatbot in a tab.</h2>
            <p className="lede" style={{ marginTop: 20 }}>
              Give Veylaro a task in plain English. It plans, edits multiple files, runs your tests,
              reads the failures and keeps going until the job is done — like a senior engineer
              who never gets tired and never phones home.
            </p>
            <ul style={{ listStyle: "none", marginTop: 26, display: "flex", flexDirection: "column", gap: 13 }}>
              {[
                "Multi-file edits with full project context",
                "Runs shell commands, tests and builds",
                "Explains its reasoning as it works",
                "Git-native: reviewable diffs and clean commits",
              ].map((t) => (
                <li key={t} style={{ display: "flex", gap: 11, color: "var(--muted)", fontSize: 15.5 }}>
                  <Check className="ck" size={16} /> {t}
                </li>
              ))}
            </ul>
            <Link to="/features" className="btn ghost" style={{ marginTop: 30 }}>
              Explore all features <ArrowRight size={15} />
            </Link>
          </Reveal>
          <Reveal variant="from-right" delay={150}>
            <Tilt max={4}>
              <Terminal />
            </Tilt>
          </Reveal>
        </div>
      </section>

      {/* ============ STICKY STORY ============ */}
      <StorySection />

      {/* ============ STATS ============ */}
      <section className="section tight">
        <div className="container">
          <div className="stats-row">
            <Reveal delay={0}><GlowCard className="stat-card"><div className="big grad-text"><CountUp to={0} /></div><div className="lbl">bytes of your code sent to the cloud</div></GlowCard></Reveal>
            <Reveal delay={100}><GlowCard className="stat-card"><div className="big grad-text">∞</div><div className="lbl">usage limits on Pro — run it all day</div></GlowCard></Reveal>
            <Reveal delay={200}><GlowCard className="stat-card"><div className="big grad-text"><CountUp to={40} suffix="+" /></div><div className="lbl">languages &amp; frameworks understood</div></GlowCard></Reveal>
            <Reveal delay={300}><GlowCard className="stat-card"><div className="big grad-text"><CountUp to={100} suffix="%" /></div><div className="lbl">of the model lives on your hardware</div></GlowCard></Reveal>
          </div>
        </div>
      </section>

      {/* ============ BENTO FEATURES ============ */}
      <section className="section">
        <div className="container">
          <Reveal className="center" style={{ marginBottom: 56 }}>
            <span className="eyebrow"><span className="dot" />Capabilities</span>
            <h2 className="h-xl">Everything a cloud agent does.<br /><span className="grad-text">Nothing a cloud agent takes.</span></h2>
          </Reveal>
          <div className="bento">
            {[
              { c: "b-2", icon: <TerminalIcon />, t: "Agentic coding", b: "Plans and executes multi-step engineering tasks: refactors, features, bug hunts, migrations — hands on the keyboard, not just advice." },
              { c: "b-2", icon: <Memory />, t: "Persistent memory", b: "Veylaro remembers your architecture, conventions and past decisions between sessions. It gets sharper the longer you work together." },
              { c: "b-2", icon: <Eye />, t: "Visible reasoning", b: "Watch the plan form in real time. Every decision, every file touched, every command run — fully inspectable, never a black box." },
              { c: "b-3", icon: <Brain />, t: "Deep project understanding", b: "On-device indexing builds a live semantic map of your entire repo — hundreds of thousands of lines — so answers come with real context, instantly." },
              { c: "b-3", icon: <GitBranch />, t: "Git-native workflow", b: "Clean, reviewable diffs. Sensible commit messages. Branch-aware edits. Veylaro works the way your team already ships." },
              { c: "b-2", icon: <Layers />, t: "Files & images", b: "Drop in screenshots, logs, PDFs or design mocks. Veylaro reads them locally and turns them into working code." },
              { c: "b-2", icon: <Gauge />, t: "Zero-latency feel", b: "No round trip to a data center. Tokens stream straight off your GPU — the fastest network request is the one you never make." },
              { c: "b-2", icon: <Sparkle />, t: "Local API access", b: "A localhost API endpoint on Pro. Point your scripts, editors and tools at your own machine and build on top of Veylaro." },
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

      {/* ============ BENCHMARK PREVIEW ============ */}
      <section className="section" style={{ background: "linear-gradient(180deg, transparent, rgba(176,106,63,0.045), transparent)" }}>
        <div className="container">
          <Reveal className="center" style={{ marginBottom: 46 }}>
            <span className="eyebrow"><span className="dot" />Benchmarks</span>
            <h2 className="h-xl">Cloud-class results.<br /><span className="grad-text">Zero cloud.</span></h2>
            <p className="lede" style={{ marginTop: 18 }}>
              The frontier labs rent you intelligence by the token. Veylaro puts it on your SSD —
              and holds its own against the giants.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <GlowCard style={{ padding: "40px 36px" }}>
              <BenchmarkChart />
            </GlowCard>
          </Reveal>
          <Reveal delay={250} className="center" style={{ marginTop: 34 }}>
            <Link to="/benchmarks" className="btn ghost">Full benchmark breakdown <ArrowRight size={15} /></Link>
          </Reveal>
        </div>
      </section>

      {/* ============ PRIVACY SPLIT ============ */}
      <section className="section">
        <div className="container split">
          <Reveal variant="from-left">
            <span className="eyebrow"><span className="dot" />Private by physics</span>
            <h2 className="h-xl">Cloud AI reads your code.<br /><span className="grad-text">Veylaro can't. It's offline.</span></h2>
            <p className="lede" style={{ marginTop: 20 }}>
              Every cloud assistant ships your proprietary code to servers you don't control,
              under policies you didn't write. Veylaro's privacy isn't a promise in a terms-of-service —
              it's an architecture. There is no server to send your code to.
            </p>
            <Link to="/local" className="btn ghost" style={{ marginTop: 28 }}>
              Why local wins <ArrowRight size={15} />
            </Link>
          </Reveal>
          <Reveal variant="from-right" delay={120}>
            <GlowCard style={{ padding: 0 }}>
              <table className="compare-table">
                <thead>
                  <tr>
                    <th></th>
                    <th className="col-veylaro">Veylaro</th>
                    <th>Cloud AI</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Your code leaves your machine</td><td className="col-veylaro"><b>Never</b></td><td>Every request</td></tr>
                  <tr><td>Usage limits</td><td className="col-veylaro"><b>None</b></td><td>Hourly / weekly caps</td></tr>
                  <tr><td>Works offline</td><td className="col-veylaro"><b>Yes</b></td><td>No</td></tr>
                  <tr><td>Trains on your data</td><td className="col-veylaro"><b>Impossible</b></td><td>Policy-dependent</td></tr>
                  <tr><td>Cost at heavy usage</td><td className="col-veylaro"><b>Flat</b></td><td>Escalating</td></tr>
                </tbody>
              </table>
            </GlowCard>
          </Reveal>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="section tight">
        <div className="container">
          <Reveal variant="zoom">
            <div className="cta-band">
              <VeylaroMark size={72} />
              <h2 style={{ marginTop: 24 }}>Own your AI.</h2>
              <p>Veylaro Code puts a frontier-class coding agent on your own hardware. Free to start. Yours forever.</p>
              <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
                <span className="btn primary lg ghosted" aria-disabled="true"><Apple size={19} /> Download for Mac<span className="soon-pill">soon</span></span>
                <span className="btn primary lg ghosted" aria-disabled="true"><Windows size={17} /> Download for Windows<span className="soon-pill">soon</span></span>
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
                <RegisterInterest source="home-cta" />
              </div>
              <div className="hero-sub" style={{ justifyContent: "center", marginTop: 22 }}>
                <span>Free tier included</span><span>·</span><span>Pro from $29/mo</span><span>·</span><span>Billed by Stripe · USD & NZD</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
