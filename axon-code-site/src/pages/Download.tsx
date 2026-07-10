import { Reveal, GlowCard } from "../components/FX";
import { VeylaroMark } from "../components/Logo";
import { Apple, Windows, Linux, Android, DownloadIcon, Check, Shield, Cpu, Bolt, Sparkle, Gauge } from "../components/Icons";
import { Link } from "react-router-dom";
import { DOWNLOADS_ENABLED, MAC_BUILD } from "../config";
import { RegisterInterest } from "../components/Interest";

export function Download() {
  const soon = (e: React.MouseEvent) => {
    e.preventDefault();
    alert("The Windows build of Veylaro Code is coming right behind the Mac build.");
  };

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
              One download.<br /><span className="grad-text">The whole intelligence.</span>
            </h1>
            <p className="lede">
              The installer ships with the full Laro model inside. No account, no API keys,
              no setup wizard from hell. Install, open a project, start building.
            </p>
            {!DOWNLOADS_ENABLED && (
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
                {DOWNLOADS_ENABLED ? (
                  <a href={MAC_BUILD} download className="btn primary lg" style={{ width: "100%" }}>
                    <DownloadIcon size={18} /> Download for Mac
                  </a>
                ) : (
                  <span className="btn primary lg ghosted" aria-disabled="true" style={{ width: "100%" }}>
                    <DownloadIcon size={18} /> Download for Mac
                    <span className="soon-pill">soon</span>
                  </span>
                )}
                <div className="dl-req">
                  <span>Laro Max &amp; Lite included</span><span>Lite runs on 4 GB RAM</span><span>SHA-256 published</span>
                </div>
              </GlowCard>
            </Reveal>
            <Reveal delay={120}>
              <GlowCard className="dl-card">
                <div className="os-icon"><Windows size={30} /></div>
                <h3>Windows</h3>
                <div className="os-meta">Windows 11 / 10 (64-bit) · NVIDIA, AMD or CPU · .exe</div>
                {DOWNLOADS_ENABLED ? (
                  <a href="#" onClick={soon} className="btn primary lg" style={{ width: "100%" }}>
                    <DownloadIcon size={18} /> Download for Windows
                  </a>
                ) : (
                  <span className="btn primary lg ghosted" aria-disabled="true" style={{ width: "100%" }}>
                    <DownloadIcon size={18} /> Download for Windows
                    <span className="soon-pill">soon</span>
                  </span>
                )}
                <div className="dl-req">
                  <span>Coming right behind Mac</span><span>8 GB VRAM or 16 GB RAM</span><span>Signed installer</span>
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

      {/* two models */}
      <section className="section tight">
        <div className="container">
          <Reveal className="center" style={{ marginBottom: 46 }}>
            <span className="eyebrow"><span className="dot" />Two models, one intelligence</span>
            <h2 className="h-xl">Pick your Laro.<br /><span className="grad-text">Or let Veylaro pick for you.</span></h2>
            <p className="lede" style={{ marginTop: 16 }}>
              Both ship in the same download. A slider inside the app switches between them —
              Veylaro reads your hardware on first launch and recommends the right one.
            </p>
          </Reveal>
          <div className="dl-cards" style={{ maxWidth: 940 }}>
            <Reveal delay={0}>
              <GlowCard style={{ padding: 34 }}>
                <div className="icon-tile"><Gauge size={22} /></div>
                <h3 style={{ fontSize: 22 }}>Laro Lite</h3>
                <p style={{ marginTop: 8 }}>
                  The featherweight. Tuned for everyday laptops — down to 4 GB of RAM —
                  and smaller projects. Same agentic brain, smaller footprint, instant startup.
                </p>
                <div className="dl-req" style={{ justifyContent: "flex-start", marginTop: 20 }}>
                  <span>≈ 1.9 GB on disk</span><span>4 GB RAM or less</span><span>Great for single-repo work</span>
                </div>
              </GlowCard>
            </Reveal>
            <Reveal delay={120}>
              <GlowCard style={{ padding: 34, borderColor: "rgba(216,154,102,0.45)" }}>
                <div className="icon-tile"><Sparkle size={22} /></div>
                <h3 style={{ fontSize: 22 }}>Laro Max</h3>
                <p style={{ marginTop: 8 }}>
                  The full weights. The most powerful local coding model we know how to build —
                  deep multi-file reasoning, long sessions, heavy refactors. This is the flagship.
                </p>
                <div className="dl-req" style={{ justifyContent: "flex-start", marginTop: 20 }}>
                  <span>≈ 9.4 GB on disk</span><span>16 GB RAM recommended</span><span>Built for real engineering</span>
                </div>
              </GlowCard>
            </Reveal>
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
              { t: "Install the app", b: "Open the installer and drag Veylaro into place. The full model comes bundled — the download is the setup." },
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
              Veylaro auto-detects your hardware and loads the strongest Laro it can run well:
              Max on 16 GB+ machines, Lite everywhere else — down to 4 GB. More power means faster tokens —
              the privacy story is identical on both.
            </p>
            <ul style={{ listStyle: "none", marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "Laro Max — Apple Silicon M1+, 16 GB unified memory",
                "Laro Lite — any Mac or PC with 4 GB RAM",
                "Windows GPU: NVIDIA/AMD with 8 GB+ VRAM for Max",
                "12 GB free SSD space (Max) · 2.5 GB (Lite)",
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
                { icon: <Shield size={20} />, t: "Signed & verifiable", b: "Every build is code-signed and published with SHA-256 checksums. What we ship is what you run." },
                { icon: <Cpu size={20} />, t: "Yours after install", b: "Once installed, Veylaro needs the network for nothing. License checks are periodic and code-free; the model never expires." },
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
