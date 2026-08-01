import { Reveal, GlowCard } from "../components/FX";
import { VeylaroMark } from "../components/Logo";
import { Apple, Windows, Linux, Android, DownloadIcon, Check, Shield, Cpu, Bolt, Sparkle, Gauge } from "../components/Icons";
import { Link } from "react-router-dom";
import { BUILDS, DOWNLOADS_ENABLED, PUBLIC_ARTIFACTS_READY } from "../config";
import { useAppConfig } from "../lib/appConfig";
import { RegisterInterest } from "../components/Interest";

export function Download() {
  // the live switch wins; the compile-time flag is the offline fallback
  const cfg = useAppConfig();
  const tierOpen = {
    lite: cfg.lite_download_enabled,
    med: cfg.med_download_enabled,
    max: cfg.max_download_enabled,
  };
  const open = PUBLIC_ARTIFACTS_READY && (cfg.downloads_enabled || DOWNLOADS_ENABLED) && Object.values(tierOpen).some(Boolean);

  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <Reveal>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
              <VeylaroMark size={110} animated />
            </div>
            <span className="eyebrow"><span className="dot" />Download</span>
            <h1 className="h-display" style={{ fontSize: "clamp(40px, 6vw, 76px)" }}>
              One app.<br /><span className="grad-text">Choose the model that fits.</span>
            </h1>
            <p className="lede">
              The installer sets up Veylaro Code and offers only model tiers that have passed
              their individual release gate. One account, no API keys, and no cloud inference.
            </p>
            {!open && (
              <div className="interest-band">
                <div className="ib-title">✦ Downloads open very soon.</div>
                <p>Leave your email and you're first in line the moment Veylaro Code goes live.</p>
                <RegisterInterest source="download-page" />
              </div>
            )}
          </Reveal>
        </div>
      </section>

      <section className="section tight" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="dl-cards">
            <Reveal delay={0}>
              <GlowCard className="dl-card">
                <div className="os-icon"><Apple size={34} /></div>
                <h3>macOS</h3>
                <div className="os-meta">Apple Silicon (M1–M4) · macOS 13+ · Universal</div>
                {open ? (
                  <>
                    <a href={BUILDS.macArm} className="btn primary lg" style={{ width: "100%" }}>
                      <DownloadIcon size={18} /> Download for Mac
                    </a>
                    <a href={BUILDS.macIntel} className="dl-alt">Intel Mac build</a>
                  </>
                ) : (
                  <span className="btn primary lg ghosted" aria-disabled="true" style={{ width: "100%" }}>
                    <DownloadIcon size={18} /> Download for Mac
                    <span className="soon-pill">soon</span>
                  </span>
                )}
                <div className="dl-req">
                  <span>Released tiers only</span><span>macOS 13+</span><a href={BUILDS.checksums} target="_blank" rel="noreferrer">SHA-256 ↗</a>
                </div>
              </GlowCard>
            </Reveal>
            <Reveal delay={120}>
              <GlowCard className="dl-card">
                <div className="os-icon"><Windows size={30} /></div>
                <h3>Windows</h3>
                <div className="os-meta">Windows 11 / 10 (64-bit) · NVIDIA, AMD or CPU · .exe</div>
                {open ? (
                  <>
                    <a href={BUILDS.win} className="btn primary lg" style={{ width: "100%" }}>
                      <DownloadIcon size={18} /> Download for Windows
                    </a>
                    <a href={BUILDS.winPortable} className="dl-alt">Portable .exe (no install)</a>
                  </>
                ) : (
                  <span className="btn primary lg ghosted" aria-disabled="true" style={{ width: "100%" }}>
                    <DownloadIcon size={18} /> Download for Windows
                    <span className="soon-pill">soon</span>
                  </span>
                )}
                <div className="dl-req">
                  <span>Windows 10 &amp; 11 · x64</span><span>8 GB RAM minimum</span><a href={BUILDS.checksums} target="_blank" rel="noreferrer">SHA-256 ↗</a>
                </div>
              </GlowCard>
            </Reveal>
          </div>
          <Reveal delay={200}>
            <div style={{ display: "flex", justifyContent: "center", gap: 26, marginTop: 30, flexWrap: "wrap" }}>
              <span className="chip"><Linux size={15} /> Linux — coming soon</span>
              <span className="chip"><Android size={15} /> Android companion — on the roadmap</span>
              <span className="chip"><Apple size={14} /> iOS companion — on the roadmap</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* three models */}
      <section className="section tight">
        <div className="container">
          <Reveal className="center" style={{ marginBottom: 46 }}>
            <span className="eyebrow"><span className="dot" />Three sizes, one intelligence</span>
            <h2 className="h-xl">Pick your Laro.<br /><span className="grad-text">Or let Veylaro pick for you.</span></h2>
            <p className="lede" style={{ marginTop: 16 }}>
              The signed app and each released model bundle are verified independently. Veylaro reads your
              machine on first launch, recommends a tier, and keeps unreleased tiers unavailable.
            </p>
          </Reveal>
          <div className="tier-cards">
            {[
              { id: "lite" as const, n: "Laro Lite", p: "4B", d: "3.6 GB", r: "8 GB minimum · 8 GB recommended", i: <Gauge size={22} />,
                b: "Runs on almost anything — old laptops, cheap Windows machines, a Pi with patience. Same agent, feather footprint, near-instant replies." },
              { id: "med" as const, n: "Laro Med", p: "12B", d: "7.6 GB", r: "12 GB minimum · 16 GB recommended", i: <Sparkle size={22} />, feat: true,
                b: "The one we measured hardest and the one most people should run. Best balance of smart and fast on an ordinary laptop." },
              { id: "max" as const, n: "Laro Max", p: "24B", d: "14 GB", r: "24 GB minimum · 32 GB recommended", i: <Bolt size={22} />,
                b: "Everything we know how to give it — the deepest reasoning, the longest context. For workstations that can feed it." },
            ].map((m, i) => (
              <Reveal key={m.n} delay={i * 110}>
                <GlowCard style={{ padding: 30, height: "100%", ...(m.feat ? { borderColor: "rgba(216,154,102,0.45)" } : {}) }}>
                  <div className="icon-tile">{m.i}</div>
                  <h3 style={{ fontSize: 21 }}>
                    {m.n} {m.feat && <span className="tier-pill">recommended</span>}
                    <span className={`release-pill ${tierOpen[m.id] ? "ready" : ""}`}>
                      {tierOpen[m.id] ? "release enabled" : "release gated"}
                    </span>
                  </h3>
                  <p style={{ marginTop: 8 }}>{m.b}</p>
                  <div className="dl-req" style={{ justifyContent: "flex-start", marginTop: 18 }}>
                    <span>{m.p} parameters</span><span>≈ {m.d} on disk</span><span>{m.r}</span>
                  </div>
                </GlowCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 3 steps */}
      <section className="section">
        <div className="container">
          <Reveal className="center" style={{ marginBottom: 50 }}>
            <span className="eyebrow"><span className="dot" />Setup</span>
            <h2 className="h-xl">Ninety seconds to<br /><span className="grad-text">your own AI.</span></h2>
          </Reveal>
          <div className="step-list">
            {[
              { t: "Install the app", b: "Install the signed, notarized app, then select a released model bundle whose hash and licence manifest have been verified." },
              { t: "Point it at a project", b: "Pick a file or folder. Veylaro indexes it on-device in seconds and locks its edits to that scope. Nothing is uploaded." },
              { t: "Give it real work", b: "\"Fix the flaky checkout test.\" \"Add dark mode.\" Watch an agent plan, edit, run and verify — all on your silicon." },
            ].map((s, i) => (
              <Reveal key={s.t} delay={i * 110}>
                <GlowCard className="step-card" style={{ height: "100%" }}>
                  <div className="step-num">{i + 1}</div>
                  <h3>{s.t}</h3>
                  <p>{s.b}</p>
                </GlowCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* requirements + trust */}
      <section className="section tight">
        <div className="container split">
          <Reveal variant="from-left">
            <span className="eyebrow"><span className="dot" />Requirements</span>
            <h2 className="h-lg">Runs on the machine<br />you already own.</h2>
            <p className="lede" style={{ marginTop: 14, fontSize: 16 }}>
              Veylaro auto-detects your hardware and recommends conservatively: Lite below
              12 GB, Med from 12 GB, and Max from 24 GB. More memory improves speed and
              context headroom; it does not change the local privacy boundary.
            </p>
            <ul style={{ listStyle: "none", marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "Laro Lite — 8 GB minimum and recommended",
                "Laro Med — 12 GB minimum, 16 GB recommended",
                "Laro Max — 24 GB minimum, 32 GB recommended",
                "Allow additional free disk space for indexes, projects and updates",
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
                { icon: <Shield size={20} />, t: "Release-gated", b: "Public downloads stay locked until platform signing, notarization, checksums and clean-machine launch checks all pass." },
                { icon: <Cpu size={20} />, t: "Local inference", b: "Model inference and project work run locally. Optional account, update and live-search features use the network only when disclosed." },
                { icon: <Bolt size={20} />, t: "Free tier inside", b: "Every download includes the free tier — no trial clock on the model itself. Upgrade to Pro inside the app when you're ready." },
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
              <h2>Still weighing it up?</h2>
              <p>See how Laro stacks up against the cloud frontier before you commit a single gigabyte.</p>
              <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
                <Link to="/benchmarks" className="btn primary lg">View benchmarks</Link>
                <Link to="/pricing" className="btn ghost lg">Compare plans</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
