import { Reveal, GlowCard } from "../components/FX";

const RELEASES = [
  {
    v: "2.1.4", date: "July 2, 2026", tag: "Latest",
    items: [
      ["Improved", "Agent loop plans 22% faster on large monorepos"],
      ["New", "Inline diff review — approve or edit hunks before they land"],
      ["Fixed", "Memory dedupe when two projects share a package name"],
      ["Improved", "Apple Silicon: 15% faster token streaming on M3/M4"],
    ],
  },
  {
    v: "2.1.0", date: "June 18, 2026", tag: "Feature",
    items: [
      ["New", "Persistent memory v2 — inspect, edit and pin memories"],
      ["New", "Image understanding: paste screenshots straight into the agent"],
      ["New", "Local API endpoint (Pro) at localhost:4114"],
      ["Improved", "Indexer handles 1M+ line repos with incremental updates"],
    ],
  },
  {
    v: "2.0.2", date: "May 30, 2026", tag: "Fix",
    items: [
      ["Fixed", "Windows: CUDA fallback when VRAM is nearly full"],
      ["Fixed", "Git worktree detection on case-insensitive filesystems"],
      ["Improved", "Reduced idle memory footprint by 800 MB"],
    ],
  },
  {
    v: "2.0.0", date: "May 12, 2026", tag: "Major",
    items: [
      ["New", "Veylaro-2 model family — new training run, new reasoning core"],
      ["New", "Full agentic terminal: run, test, iterate autonomously"],
      ["New", "Reasoning visibility with live plan stream"],
      ["New", "Workspace sandboxing and permission prompts"],
    ],
  },
];

const badgeFor = (k: string) => (k === "New" ? "violet" : k === "Fixed" ? "amber" : "green");

export function Changelog() {
  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <Reveal>
            <span className="eyebrow"><span className="dot" />Changelog</span>
            <h1 className="h-display" style={{ fontSize: "clamp(40px, 6vw, 72px)" }}>
              Always shipping.<br /><span className="grad-text">Never phoning home.</span>
            </h1>
            <p className="lede">Every release, every model update — documented. Updates are always optional and never remove what you already have.</p>
          </Reveal>
        </div>
      </section>

      <section className="section tight" style={{ paddingTop: 10 }}>
        <div className="container" style={{ maxWidth: 780 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {RELEASES.map((r, i) => (
              <Reveal key={r.v} delay={i * 80}>
                <GlowCard>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: 24 }}>v{r.v}</h3>
                    <span className={`badge ${i === 0 ? "green" : "dim"}`}>{r.tag}</span>
                    <span style={{ color: "var(--dim)", fontSize: 13.5, marginLeft: "auto" }}>{r.date}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {r.items.map(([k, v]) => (
                      <div key={v} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span className={`badge ${badgeFor(k)}`} style={{ minWidth: 74, justifyContent: "center" }}>{k}</span>
                        <span style={{ color: "var(--muted)", fontSize: 14.5, paddingTop: 2 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </GlowCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
