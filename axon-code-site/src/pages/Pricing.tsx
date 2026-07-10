import { useState } from "react";
import { Link } from "react-router-dom";
import { Reveal, GlowCard } from "../components/FX";
import { Check, Plus, DownloadIcon, ArrowRight } from "../components/Icons";
import { STRIPE_LINKS } from "../config";

type Plan = {
  name: string;
  tagline: string;
  monthly: number | null; // null = custom
  annualMonthly?: number; // effective monthly on annual billing
  cta: string;
  to: string;
  stripe?: { monthly: string; annual: string }; // hosted checkout (USD/NZD)
  featured?: boolean;
  features: { t: string; off?: boolean }[];
  note?: string;
};

const PLANS: Plan[] = [
  {
    name: "Free",
    tagline: "Try the real thing",
    monthly: 0,
    cta: "Download free",
    to: "/download",
    features: [
      { t: "Laro Lite & Laro Max — the real models, full weights" },
      { t: "120 agent messages per week" },
      { t: "Chat, file & image understanding" },
      { t: "Single-project memory" },
      { t: "Community support" },
      { t: "Unlimited usage", off: true },
      { t: "Local API access", off: true },
      { t: "Commercial license", off: true },
    ],
    note: "Free account — no credit card.",
  },
  {
    name: "Pro",
    tagline: "For serious builders",
    monthly: 29,
    annualMonthly: 24,
    cta: "Go Pro",
    to: "/download",
    stripe: { monthly: STRIPE_LINKS.proMonthly, annual: STRIPE_LINKS.proAnnual },
    featured: true,
    features: [
      { t: "Unlimited usage — run it 24/7" },
      { t: "Full agentic coding suite" },
      { t: "Advanced long-term memory" },
      { t: "Reasoning visibility & transcripts" },
      { t: "Local API endpoint" },
      { t: "Commercial use license" },
      { t: "Priority model updates" },
      { t: "Priority support" },
    ],
    note: "Cancel anytime. The model stays on your machine.",
  },
  {
    name: "Team",
    tagline: "For small teams",
    monthly: 119,
    annualMonthly: 99,
    cta: "Get Team",
    to: "/download",
    stripe: { monthly: STRIPE_LINKS.teamMonthly, annual: STRIPE_LINKS.teamAnnual },
    features: [
      { t: "Everything in Pro, per seat ×5" },
      { t: "Shared team memory & conventions" },
      { t: "Centralized license management" },
      { t: "Admin dashboard & usage insights" },
      { t: "Policy controls per workspace" },
      { t: "Priority support with SLA" },
    ],
    note: "Rolling out in beta.",
  },
  {
    name: "Enterprise",
    tagline: "For organizations",
    monthly: null,
    cta: "Talk to us",
    to: "/download",
    features: [
      { t: "Self-hosted fleet deployment" },
      { t: "SSO / SAML & SCIM provisioning" },
      { t: "Air-gapped environments" },
      { t: "Custom model fine-tunes" },
      { t: "Security review & DPA" },
      { t: "Dedicated support engineer" },
    ],
    note: "Perfect for regulated industries.",
  },
];

const FAQS = [
  {
    q: "Is the free tier actually useful?",
    a: "Yes. It runs the exact same local model as Pro — same intelligence, same privacy. The weekly message allowance is enough to test Veylaro on real projects and build small things. When you hit the ceiling, that's the product telling you it's paying for itself.",
  },
  {
    q: "If it runs on my machine, why is there a subscription?",
    a: "The subscription funds what keeps Veylaro the best local model in the world: continuous training runs, new model versions, the agent runtime, and support. The software and weights live on your machine — the subscription keeps them improving. Stop paying and the app keeps working; you just stop receiving new model updates and Pro features.",
  },
  {
    q: "What hardware do I need?",
    a: "Any Apple Silicon Mac (M1 or newer) with 16 GB unified memory, or a Windows machine with a modern GPU (8 GB+ VRAM) or recent CPU with 32 GB RAM. Veylaro auto-selects the right model — Laro Max on 16 GB+ machines, Laro Lite on anything down to 4 GB. More power means faster tokens, never a different privacy story.",
  },
  {
    q: "Does my code or my prompts ever leave my machine?",
    a: "No. Inference, indexing, memory and transcripts are all local. The app only touches the network for license checks and optional model updates — never with your code or conversations attached. Block it in your firewall and everything still works.",
  },
  {
    q: "How do 'unlimited' Pro plans really work?",
    a: "There is no meter because there is nothing to meter. Compute is yours, so we don't count your tokens — a 12-hour overnight refactor costs us the same as an idle app: nothing. This is the structural advantage of local AI, and we're passing it on.",
  },
  {
    q: "Can I use Veylaro for commercial work?",
    a: "Pro, Team and Enterprise include a full commercial license. The Free tier is for personal projects and evaluation.",
  },
  {
    q: "What about refunds?",
    a: "14-day free trial on Pro, and a no-questions 30-day refund window after your first payment. If Veylaro doesn't earn its seat, we don't want your money.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item ${open ? "open" : ""}`}>
      <button className="faq-q" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {q}
        <span className="plus"><Plus size={18} /></span>
      </button>
      <div className="faq-a"><p>{a}</p></div>
    </div>
  );
}

export function Pricing() {
  const [annual, setAnnual] = useState(true);

  return (
    <main>
      <section className="page-hero" style={{ paddingBottom: 30 }}>
        <div className="container">
          <Reveal>
            <span className="eyebrow"><span className="dot" />Pricing</span>
            <h1 className="h-display" style={{ fontSize: "clamp(40px, 6vw, 76px)" }}>
              One flat price.<br /><span className="grad-text">Zero meters running.</span>
            </h1>
            <p className="lede">
              Cloud AI charges you more the more you build. Veylaro runs on your hardware,
              so heavy usage costs us nothing — and we price it that way.
            </p>
            <div className="price-toggle">
              <span className={!annual ? "on" : ""}>Monthly</span>
              <button
                className={`switch ${annual ? "on" : ""}`}
                onClick={() => setAnnual((v) => !v)}
                aria-label="Toggle annual billing"
              />
              <span className={annual ? "on" : ""}>Annual</span>
              <span className="save-pill">2 months free</span>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section tight" style={{ paddingTop: 10 }}>
        <div className="container wide">
          <div className="plans">
            {PLANS.map((p, i) => (
              <Reveal key={p.name} delay={i * 90} style={{ height: "100%" }}>
                <GlowCard className={`plan ${p.featured ? "featured" : ""}`} style={{ height: "100%" }}>
                  {p.featured && <span className="plan-tag">Most popular</span>}
                  <h3>{p.name}</h3>
                  <div className="plan-for">{p.tagline}</div>
                  <div className="price">
                    {p.monthly === null ? (
                      <>Custom</>
                    ) : p.monthly === 0 ? (
                      <>$0</>
                    ) : (
                      <>
                        ${annual && p.annualMonthly ? p.annualMonthly : p.monthly}
                        <small> /month</small>
                      </>
                    )}
                  </div>
                  <div className="bill-note">
                    {p.monthly !== null && p.monthly > 0
                      ? annual && p.annualMonthly
                        ? `billed annually — $${p.annualMonthly * 12}/yr`
                        : "billed monthly"
                      : p.monthly === 0
                        ? "forever"
                        : "tailored to your org"}
                  </div>
                  <ul>
                    {p.features.map((f) => (
                      <li key={f.t} className={f.off ? "off" : ""}>
                        <Check size={15} /> {f.t}
                      </li>
                    ))}
                  </ul>
                  {p.stripe ? (
                    <a
                      href={annual ? p.stripe.annual : p.stripe.monthly}
                      target="_blank"
                      rel="noreferrer"
                      className={`btn ${p.featured ? "primary" : "ghost"}`}
                    >
                      {p.cta} — {annual ? "annual" : "monthly"}
                    </a>
                  ) : (
                    <Link to={p.to} className={`btn ${p.featured ? "primary" : "ghost"}`}>
                      {p.cta}
                    </Link>
                  )}
                  {p.note && <div style={{ fontSize: 12, color: "var(--dim)", textAlign: "center", marginTop: 12 }}>{p.note}</div>}
                </GlowCard>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200}>
            <p className="footnote center" style={{ marginTop: 26 }}>
              All plans run 100% locally. Billed securely by Stripe in USD or NZD — checkout localizes
              automatically. Annual Pro is $290/year — pay for 10 months, use 12. The Free plan needs
              only an account; your card is never asked for.
            </p>
          </Reveal>
        </div>
      </section>

      {/* value framing */}
      <section className="section tight">
        <div className="container">
          <Reveal>
            <GlowCard style={{ padding: "40px 38px" }}>
              <div className="split" style={{ alignItems: "center" }}>
                <div>
                  <h2 className="h-lg">The math cloud vendors<br />hope you never do.</h2>
                  <p className="lede" style={{ marginTop: 14, fontSize: 16 }}>
                    A heavy agentic workflow on cloud AI can burn through hundreds of dollars of
                    metered usage a month — and the bill grows with your ambition. Veylaro is a flat
                    $29. Use it 10× more and it costs exactly the same.
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    { label: "Cloud agent · heavy month", value: "$200–500+", w: "100%", grad: false },
                    { label: "Cloud agent · typical month", value: "$60–200", w: "56%", grad: false },
                    { label: "Veylaro Pro · any month at all", value: "$29", w: "18%", grad: true },
                  ].map((r) => (
                    <div key={r.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 7 }}>
                        <span style={{ color: "var(--muted)" }}>{r.label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", color: r.grad ? "var(--violet)" : "var(--dim)", fontWeight: 600 }}>{r.value}</span>
                      </div>
                      <div style={{ height: 12, borderRadius: 7, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: r.w, borderRadius: 7, background: r.grad ? "var(--grad-btn)" : "linear-gradient(90deg,#3a322c,#5a4c3e)" }} />
                      </div>
                    </div>
                  ))}
                  <p className="footnote">Illustrative comparison of typical metered cloud-agent spend vs. Veylaro Pro flat pricing.</p>
                </div>
              </div>
            </GlowCard>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" id="faq">
        <div className="container">
          <Reveal className="center" style={{ marginBottom: 44 }}>
            <span className="eyebrow"><span className="dot" />FAQ</span>
            <h2 className="h-xl">Fair questions.<br /><span className="grad-text">Straight answers.</span></h2>
          </Reveal>
          <Reveal delay={100}>
            <div className="faq">
              {FAQS.map((f) => (
                <FaqItem key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <Reveal variant="zoom">
            <div className="cta-band">
              <h2>Start free. Stay unlimited.</h2>
              <p>Download the app, meet the model, and upgrade when it earns it.</p>
              <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
                <Link to="/download" className="btn primary lg"><DownloadIcon size={18} /> Download Veylaro</Link>
                <Link to="/benchmarks" className="btn ghost lg">Benchmarks <ArrowRight size={15} /></Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
