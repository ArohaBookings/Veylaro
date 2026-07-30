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
              90.9% on HumanEval.<br /><span className="grad-text">On a laptop. Offline.</span>
            </h1>
            <p className="lede">
              Laro Med solved 149 of 164 — every line executed, incomplete output counted as a
              failure. That lands it between GPT-4o (90.2%) and Claude 3.5 Sonnet (92%) on the same
              benchmark, running offline on a 16 GB laptop. No API. No data leaving the machine.
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
                Higher is better. Laro bars are executed locally on a 16 GB Mac; competitor bars are
                each lab's last officially published HumanEval on their own harness (sources linked).
                The newest frontier models no longer publish HumanEval, so their most recent published
                score is used — no invented numbers.
              </p>
            </GlowCard>
          </Reveal>
        </div>
      </section>

      {/* the real scoreboard */}
      <section className="section">
        <div className="container">
          <Reveal className="center" style={{ marginBottom: 50 }}>
            <span className="eyebrow"><span className="dot" />The local advantage</span>
            <h2 className="h-xl">Capability is measured.<br /><span className="grad-text">Privacy is architectural.</span></h2>
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
                <div className="lbl">bytes of project code sent by local inference — optional online services are separate</div>
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
                <div className="big grad-text"><CountUp to={0} /></div>
                <div className="lbl">cloud inference outages — your local runtime has no provider dependency</div>
              </GlowCard>
            </Reveal>
            <Reveal delay={300}>
              <GlowCard className="stat-card">
                <Bolt size={26} className="stat-ic" />
                <div className="big grad-text"><CountUp to={0} /></div>
                <div className="lbl">network round trips for local inference — generation latency still depends on hardware</div>
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
                  <tr><td>Local model inference</td><td className="col-veylaro"><b>Built in</b></td><td>Cloud</td><td>Cloud</td><td>Cloud</td></tr>
                  <tr><td>Project code sent to model provider</td><td className="col-veylaro"><b>No</b></td><td>Required</td><td>Required</td><td>Required</td></tr>
                  <tr><td>Core coding chat works offline</td><td className="col-veylaro"><b>Yes</b></td><td>No</td><td>No</td><td>No</td></tr>
                  <tr><td>Usage on Veylaro Pro</td><td className="col-veylaro"><b>Unlimited</b></td><td>See provider</td><td>See provider</td><td>See provider</td></tr>
                  <tr><td>Agentic multi-file edits</td><td className="col-veylaro"><b>Yes</b></td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
                  <tr><td>Verified precedent memory on device</td><td className="col-veylaro"><b>Opt in</b></td><td>Provider dependent</td><td>Provider dependent</td><td>Provider dependent</td></tr>
                  <tr><td>First month</td><td className="col-veylaro"><b>Unlimited, no card</b></td><td>See provider</td><td>See provider</td><td>See provider</td></tr>
                  <tr><td>Your GPU does the work</td><td className="col-veylaro"><b>Yes</b></td><td>—</td><td>—</td><td>—</td></tr>
                </tbody>
              </table>
            </GlowCard>
            <p className="footnote" style={{ marginTop: 18 }}>
              Product terms change. This table describes the intended Veylaro architecture and broad
              product categories, not a benchmark. Verify current competitor limits before purchasing.
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
              We run the standard HumanEval set: all 164 problems, generated code executed,
              thinking off, and incomplete output scored as failure. Raw local artifacts retain
              task-level results for HumanEval. Scores stay tied to the exact artifact that produced
              them; an installed preview model does not inherit a different model's result.
            </p>
          </Reveal>
          <Reveal variant="from-right" delay={120}>
            <GlowCard>
              <h3 style={{ marginBottom: 14 }}>How we label every number</h3>
              <ul className="bench-legend">
                <li><b>Measured</b> — we ran it here, on this hardware, and the raw output is on disk. Only these get quoted as a Laro result.</li>
                <li><b>Vendor</b> — the lab's own published figure on their own harness.</li>
                <li><b>Not published</b> — no number exists we can cite. It stays blank rather than guessed.</li>
                <li><b>Pending</b> — we intend to measure it and haven't yet. Laro Max is here: it needs 24 GB and our test box has 16.</li>
              </ul>
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
