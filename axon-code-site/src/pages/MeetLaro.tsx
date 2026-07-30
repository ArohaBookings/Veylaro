import { Link } from "react-router-dom";
import { ArrowRight, Bolt, Brain, Check, Cpu, Gauge, Shield, Sparkle } from "../components/Icons";
import { GlowCard, Reveal } from "../components/FX";
import { VeylaroMark } from "../components/Logo";

const TIERS = [
  {
    name: "Laro Lite",
    params: "4B",
    disk: "2.6 GB",
    floor: "4 GB minimum · 8 GB recommended",
    score: "68.9% HumanEval",
    mbpp: "51.0% MBPP",
    evidence: "Measured · 113/164 · 51/100",
    icon: <Gauge size={22} />,
  },
  {
    name: "Laro Med",
    params: "12B",
    disk: "7.6 GB",
    floor: "12 GB minimum · 16 GB recommended",
    score: "90.9% HumanEval",
    mbpp: "72.0% MBPP",
    evidence: "Measured · 149/164 · 72/100",
    icon: <Sparkle size={22} />,
    featured: true,
  },
  {
    name: "Laro Max",
    params: "24B",
    disk: "14 GB",
    floor: "24 GB minimum · 32 GB recommended",
    score: "Benchmarks pending",
    mbpp: "awaiting a big-memory run",
    evidence: "Not run on the 16 GB test host",
    icon: <Bolt size={22} />,
  },
];

const LATTICE = [
  ["Contract compiler", "Turns the requested behavior and invariants into explicit checks before editing starts."],
  ["Execution gate", "A patch survives only after real syntax, tests, lint, build, and task-specific checks pass."],
  ["Failure lattice", "Stores failed strategies by error class so the next attempt does not repeat the same mistake."],
  ["Holdout sentinel", "Fingerprints evaluation material and blocks grader leakage from prompts, memory, and selection."],
  ["Blast-radius governor", "Penalizes broad rewrites and blocks unrelated tests, fixtures, lockfiles, and generated output."],
  ["Counterexample forge", "Derives deterministic edge probes from the public contract before candidate selection."],
  ["Evidence scheduler", "Matches search depth and parallelism to the model tier and available memory."],
  ["Claim calibration", "Labels results measured, attributed, uncertain, or unverified instead of filling gaps with confidence."],
];

export function MeetLaro() {
  return (
    <main>
      <section className="page-hero meet-hero">
        <div className="container wide">
          <Reveal>
            <Link to="/" className="back-link">← Back to Veylaro</Link>
            <div className="meet-mark"><VeylaroMark size={92} animated /></div>
            <span className="eyebrow"><span className="dot" />Meet Laro</span>
            <h1 className="h-display meet-title">Three local models.<br /><span className="grad-text">One execution system.</span></h1>
            <p className="lede">
              Laro is the model family inside Veylaro Code. The weights propose; the
              execution lattice decides what survives. Every tier uses the same contract,
              retrieval, verification, memory, and release gates.
            </p>
            <div className="meet-actions">
              <Link to="/download" className="btn primary lg">View downloads <ArrowRight size={16} /></Link>
              <Link to="/benchmarks" className="btn ghost lg">Read measured evidence</Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section tight">
        <div className="container wide">
          <div className="tier-cards">
            {TIERS.map((tier, index) => (
              <Reveal key={tier.name} delay={index * 90}>
                <GlowCard className={tier.featured ? "meet-tier featured" : "meet-tier"}>
                  <div className="icon-tile">{tier.icon}</div>
                  <div className="meet-tier-head">
                    <h2>{tier.name}</h2>
                    {tier.featured && <span className="tier-pill">recommended</span>}
                  </div>
                  <p>{tier.params} parameters · approximately {tier.disk} on disk</p>
                  <div className="meet-score">{tier.score}</div>
                  <div className="meet-mbpp">{tier.mbpp}</div>
                  <div className="meet-evidence">{tier.evidence}</div>
                  <div className="meet-floor"><Cpu size={15} /> {tier.floor}</div>
                </GlowCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container wide">
          <Reveal className="center meet-section-head">
            <span className="eyebrow"><span className="dot" />Universal Execution Lattice</span>
            <h2 className="h-xl">The model proposes.<br /><span className="grad-text">Evidence promotes.</span></h2>
            <p className="lede">
              These systems are model-agnostic. They improve reliability and iteration,
              but they do not turn an unmeasured tier into a frontier model.
            </p>
          </Reveal>
          <div className="lattice-grid">
            {LATTICE.map(([title, body], index) => (
              <Reveal key={title} delay={(index % 4) * 70}>
                <div className="lattice-item">
                  <span className="lattice-num">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section tight">
        <div className="container split meet-proof">
          <Reveal variant="from-left">
            <span className="eyebrow"><span className="dot" />What is measured</span>
            <h2 className="h-lg">Two benchmarks,<br />run the honest way.</h2>
            <p className="lede">
              Every figure below is pass@1 with the generated code actually executed against the real
              tests, on our own hardware. A truncated answer counts as a failure. Frontier scores are each
              lab's own published number — see the full breakdown on the benchmarks page.
            </p>
            <div className="meet-actions">
              <Link to="/benchmarks" className="btn ghost lg">See the full chart <ArrowRight size={16} /></Link>
            </div>
          </Reveal>
          <Reveal variant="from-right">
            <GlowCard className="proof-card">
              <div><Check size={17} /><span><b>Laro Med</b> — 90.9% HumanEval (149/164)</span></div>
              <div><Check size={17} /><span><b>Laro Med</b> — 72.0% MBPP (72/100)</span></div>
              <div><Check size={17} /><span><b>Laro Lite</b> — 68.9% HumanEval (113/164)</span></div>
              <div><Check size={17} /><span><b>Laro Lite</b> — 51.0% MBPP (51/100)</span></div>
              <div><Brain size={17} /><span><b>Laro Max</b> — awaiting a machine with the memory to run it</span></div>
              <div><Shield size={17} /><span>Harness ships in the app — re-run every number yourself</span></div>
            </GlowCard>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
