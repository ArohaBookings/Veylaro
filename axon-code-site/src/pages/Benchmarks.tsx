import { Link } from "react-router-dom";
import { Reveal, GlowCard, CountUp } from "../components/FX";
import { BenchmarkChart } from "../components/BenchmarkChart";
import { VeylaroMark } from "../components/Logo";
import { ArrowRight, DownloadIcon, Shield, InfinityIcon, WifiOff, Bolt } from "../components/Icons";

export function Benchmarks() {
  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <Reveal>
            <span className="eyebrow"><span className="dot" />Benchmarks</span>
            <h1 className="h-display" style={{ fontSize: "clamp(40px, 6vw, 76px)" }}>
              We benchmark against giants.<br /><span className="grad-text">From your desk.</span>
            </h1>
            <p className="lede">
              The frontier cloud models are extraordinary — and they should be, with a data center behind
              them. Veylaro holds its own from a single machine. Yours.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <Reveal>
            <GlowCard style={{ padding: "42px 38px" }}>
              <BenchmarkChart />
              <p className="footnote" style={{ marginTop: 30 }}>
                Cloud model scores are publicly reported figures from each lab (Anthropic, OpenAI, Google, xAI),
                retrieved January 2026. Veylaro figures are preliminary internal evaluations on the same suites
                and will be replaced with final published numbers at general availability. Higher is better.
              </p>
            </GlowCard>
          </Reveal>
        </div>
      </section>

      {/* the real scoreboard */}
      <section className="section">
        <div className="container">
          <Reveal className="center" style={{ marginBottom: 50 }}>
            <span className="eyebrow"><span className="dot" />The other scoreboard</span>
            <h2 className="h-xl">Benchmarks the cloud<br /><span className="grad-text">can never win.</span></h2>
            <p className="lede" style={{ marginTop: 16 }}>
              Raw capability is half the story. The other half is what it costs you — in privacy, availability
              and control. Here, it isn't close.
            </p>
          </Reveal>
          <div className="stats-row">
            <Reveal delay={0}>
              <GlowCard className="stat-card">
                <Shield size={26} className="stat-ic" />
                <div className="big grad-text"><CountUp to={0} /></div>
                <div className="lbl">bytes of code uploaded — cloud agents upload every request</div>
              </GlowCard>
            </Reveal>
            <Reveal delay={100}>
              <GlowCard className="stat-card">
                <InfinityIcon size={26} className="stat-ic" />
                <div className="big grad-text">∞</div>
                <div className="lbl">usage on Pro — cloud plans throttle you weekly</div>
              </GlowCard>
            </Reveal>
            <Reveal delay={200}>
              <GlowCard className="stat-card">
                <WifiOff size={26} className="stat-ic" />
                <div className="big grad-text"><CountUp to={100} suffix="%" /></div>
                <div className="lbl">uptime for you — no outages, no status pages</div>
              </GlowCard>
            </Reveal>
            <Reveal delay={300}>
              <GlowCard className="stat-card">
                <Bolt size={26} className="stat-ic" />
                <div className="big grad-text"><CountUp to={0} suffix="ms" /></div>
                <div className="lbl">network latency — tokens stream off your own GPU</div>
              </GlowCard>
            </Reveal>
          </div>
        </div>
      </section>

      {/* full comparison table */}
      <section className="section tight">
        <div className="container">
          <Reveal>
            <GlowCard style={{ padding: 0, overflow: "auto" }}>
              <table className="compare-table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={{ width: "30%" }}></th>
                    <th className="col-veylaro"><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><VeylaroMark size={20} /> Veylaro</span></th>
                    <th>Claude Code</th>
                    <th>Codex / Copilot</th>
                    <th>Gemini CLI</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Runs fully on-device</td><td className="col-veylaro"><b>Yes</b></td><td>No</td><td>No</td><td>No</td></tr>
                  <tr><td>Code stays private</td><td className="col-veylaro"><b>By physics</b></td><td>By policy</td><td>By policy</td><td>By policy</td></tr>
                  <tr><td>Works offline</td><td className="col-veylaro"><b>Yes</b></td><td>No</td><td>No</td><td>No</td></tr>
                  <tr><td>Usage limits</td><td className="col-veylaro"><b>None on Pro</b></td><td>Session/weekly caps</td><td>Rate limits</td><td>Daily quotas</td></tr>
                  <tr><td>Agentic multi-file edits</td><td className="col-veylaro"><b>Yes</b></td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
                  <tr><td>Persistent local memory</td><td className="col-veylaro"><b>Yes</b></td><td>Partial</td><td>Partial</td><td>Partial</td></tr>
                  <tr><td>One flat price</td><td className="col-veylaro"><b>$29/mo</b></td><td>$20–200/mo</td><td>$10–200/mo</td><td>Usage-based</td></tr>
                  <tr><td>Your GPU does the work</td><td className="col-veylaro"><b>Yes</b></td><td>—</td><td>—</td><td>—</td></tr>
                </tbody>
              </table>
            </GlowCard>
            <p className="footnote" style={{ marginTop: 18 }}>
              Comparison reflects each product's standard consumer offering as of January 2026. Competitor
              names and marks belong to their respective owners; figures from public pricing and docs.
            </p>
          </Reveal>
        </div>
      </section>

      {/* methodology */}
      <section className="section tight">
        <div className="container split">
          <Reveal variant="from-left">
            <span className="eyebrow"><span className="dot" />Methodology</span>
            <h2 className="h-lg">Measured, not marketed.</h2>
            <p className="lede" style={{ marginTop: 14, fontSize: 16 }}>
              Every Veylaro release runs the full public suites — SWE-bench Verified, Terminal-Bench and
              GPQA Diamond — plus an internal harness of 1,200 real-world engineering tasks. We publish
              the numbers whether we like them or not, alongside the harness itself so you can reproduce
              every score on your own hardware. When the weights ship, the receipts ship with them.
            </p>
          </Reveal>
          <Reveal variant="from-right" delay={120}>
            <GlowCard>
              <h3 style={{ marginBottom: 14 }}>What "preliminary" means</h3>
              <p>
                Veylaro's final training run is still in progress. The figures shown are from the current
                release candidate, evaluated on the public test splits with the standard agent harness.
                Final GA numbers — good or bad — replace them the day we ship. No cherry-picking,
                no "internal variant" asterisks.
              </p>
            </GlowCard>
          </Reveal>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <Reveal variant="zoom">
            <div className="cta-band">
              <h2>Run the benchmark that matters.</h2>
              <p>Your codebase, your tickets, your Friday-afternoon bug. Free tier included.</p>
              <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
                <Link to="/download" className="btn primary lg"><DownloadIcon size={18} /> Download free</Link>
                <Link to="/pricing" className="btn ghost lg">See pricing <ArrowRight size={15} /></Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
