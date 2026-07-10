import { Link } from "react-router-dom";
import { Reveal, GlowCard, CountUp } from "../components/FX";
import { Shield, Lock, WifiOff, InfinityIcon, Eye, Bolt, DownloadIcon, ArrowRight, Globe, Cpu } from "../components/Icons";

const REASONS = [
  {
    icon: <Lock size={20} />,
    t: "Private by physics, not by promise",
    b: "Cloud privacy is a paragraph in a terms-of-service that can change next quarter. Veylaro's privacy is structural: inference happens on your silicon, so there is no server that could see, store, or train on your code. A promise can be broken. Physics can't.",
  },
  {
    icon: <InfinityIcon size={20} />,
    t: "No usage limits, ever",
    b: "Cloud agents throttle you because every token costs them GPU time. Your tokens cost us nothing — so Pro has no meters, no session caps, no 'you've hit your weekly limit' at 4pm on deadline day. Run a 12-hour refactor overnight. Run three.",
  },
  {
    icon: <WifiOff size={20} />,
    t: "Works where the cloud can't",
    b: "Planes, trains, submarines, secure facilities, client sites with locked-down networks, or just your house when the ISP dies. Veylaro is exactly as smart offline as online, because online was never part of the deal.",
  },
  {
    icon: <Bolt size={20} />,
    t: "Zero network latency",
    b: "Every cloud completion pays a round-trip tax to a data center — plus queueing behind millions of other users. Veylaro streams tokens straight off your GPU. The fastest network request is the one that never happens.",
  },
  {
    icon: <Eye size={20} />,
    t: "Auditable to the last byte",
    b: "Point any network monitor at Veylaro and watch it: zero bytes of your code or prompts on the wire. Your security team doesn't have to trust our word — they can verify it with tcpdump in five minutes.",
  },
  {
    icon: <Cpu size={20} />,
    t: "You own the depreciation curve",
    b: "Cloud subscriptions rent you intelligence forever. Veylaro turns the hardware you already own into the asset. Model versions you've downloaded keep working for life — no one can sunset your setup remotely.",
  },
];

const WHO = [
  { t: "Agencies & freelancers", b: "Client NDAs stop meaning 'except our AI vendor'. Every client's code stays on your disk, fully separated by workspace." },
  { t: "Fintech, health & legal", b: "Regulated codebases can finally use frontier-class AI without a data-processing addendum, a vendor review, or a compliance panic." },
  { t: "Founders & indie hackers", b: "Your unreleased product is your moat. Build it without shipping your ideas to the companies most capable of competing with you." },
  { t: "Security-critical teams", b: "Air-gapped and zero-trust environments get a real agentic AI for the first time. Enterprise ships with full offline licensing." },
];

export function Local() {
  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <Reveal>
            <span className="eyebrow"><span className="dot" />Why local</span>
            <h1 className="h-display" style={{ fontSize: "clamp(40px, 6vw, 76px)" }}>
              The cloud is just<br /><span className="grad-text">someone else's computer.</span>
            </h1>
            <p className="lede">
              Every cloud AI request is your intellectual property travelling to hardware you don't
              control, governed by policies you didn't write. Local AI deletes that entire category
              of risk — and it turns out to be faster, cheaper and more reliable too.
            </p>
          </Reveal>
        </div>
      </section>

      {/* headline stats */}
      <section className="section tight" style={{ paddingTop: 20 }}>
        <div className="container">
          <div className="stats-row">
            <Reveal delay={0}><GlowCard className="stat-card"><div className="big grad-text"><CountUp to={0} /></div><div className="lbl">servers involved in your inference</div></GlowCard></Reveal>
            <Reveal delay={100}><GlowCard className="stat-card"><div className="big grad-text"><CountUp to={0} /></div><div className="lbl">third parties with access to your code</div></GlowCard></Reveal>
            <Reveal delay={200}><GlowCard className="stat-card"><div className="big grad-text"><CountUp to={0} /></div><div className="lbl">terms-of-service changes that can affect you</div></GlowCard></Reveal>
            <Reveal delay={300}><GlowCard className="stat-card"><div className="big grad-text"><CountUp to={1} /></div><div className="lbl">person who controls your AI: you</div></GlowCard></Reveal>
          </div>
        </div>
      </section>

      {/* six reasons */}
      <section className="section">
        <div className="container">
          <Reveal className="center" style={{ marginBottom: 50 }}>
            <span className="eyebrow"><span className="dot" />The case</span>
            <h2 className="h-xl">Six reasons local wins.<br /><span className="grad-text">Each one is enough.</span></h2>
          </Reveal>
          <div className="bento">
            {REASONS.map((r, i) => (
              <Reveal key={r.t} delay={(i % 3) * 100} className="b-3">
                <GlowCard style={{ height: "100%" }}>
                  <div className="icon-tile">{r.icon}</div>
                  <h3>{r.t}</h3>
                  <p>{r.b}</p>
                </GlowCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* the data flow diagram, in words */}
      <section className="section tight">
        <div className="container split">
          <Reveal variant="from-left">
            <span className="eyebrow"><span className="dot" />Follow the bytes</span>
            <h2 className="h-lg">Where your code goes<br />when you ask for help.</h2>
            <p className="lede" style={{ marginTop: 14, fontSize: 16 }}>
              With a cloud agent, one autocomplete triggers a journey: your file context is serialized,
              shipped over TLS to a load balancer, decrypted in someone's inference cluster, held in
              memory beside a million strangers' requests, and — depending on your plan and their
              policy — logged, retained or reviewed. With Veylaro, the journey is a memory bus.
            </p>
          </Reveal>
          <Reveal variant="from-right" delay={120}>
            <GlowCard style={{ padding: 30 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13.5, lineHeight: 2.3 }}>
                <div style={{ color: "var(--dim)", marginBottom: 4 }}>// cloud agent</div>
                <div style={{ color: "var(--muted)" }}>your code → TLS → CDN → load balancer →<br />inference cluster → retention policy → <span style={{ color: "var(--red)" }}>?</span></div>
                <div style={{ height: 1, background: "var(--border)", margin: "18px 0" }} />
                <div style={{ color: "var(--dim)", marginBottom: 4 }}>// veylaro code</div>
                <div style={{ color: "var(--muted)" }}>your code → <span className="grad-text" style={{ fontWeight: 600 }}>your GPU</span> → done <span style={{ color: "var(--green)" }}>✓</span></div>
              </div>
            </GlowCard>
          </Reveal>
        </div>
      </section>

      {/* who it's for */}
      <section className="section tight">
        <div className="container">
          <Reveal className="center" style={{ marginBottom: 46 }}>
            <span className="eyebrow"><span className="dot" />Built for</span>
            <h2 className="h-xl">Who needs this <span className="grad-text">yesterday.</span></h2>
          </Reveal>
          <div className="bento">
            {WHO.map((w, i) => (
              <Reveal key={w.t} delay={(i % 2) * 100} className="b-3">
                <GlowCard style={{ height: "100%" }}>
                  <h3>{w.t}</h3>
                  <p>{w.b}</p>
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
              <span style={{ color: "var(--violet)", display: "inline-block" }}><Shield size={44} /></span>
              <h2 style={{ marginTop: 18 }}>Take your code off the grid.</h2>
              <p>Download Veylaro and get frontier-class agentic coding with a privacy model your security team can verify.</p>
              <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
                <Link to="/download" className="btn primary lg"><DownloadIcon size={18} /> Download free</Link>
                <Link to="/privacy" className="btn ghost lg">Read the privacy policy <ArrowRight size={15} /></Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
