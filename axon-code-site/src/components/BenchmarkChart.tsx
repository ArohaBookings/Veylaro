import { CSSProperties, useEffect, useRef, useState } from "react";
import { VeylaroMark } from "./Logo";
import { ClaudeMark, OpenAIMark, GeminiMark, GrokMark } from "./Icons";

type Entry = { name: string; co: string; value: number; logo: "veylaro" | "claude" | "openai" | "gemini" | "grok"; note?: string };
type Suite = { id: string; label: string; desc: string; entries: Entry[] };

// Public, vendor-reported figures for the frontier cloud models (as of Jan 2026).
// Veylaro figures are preliminary internal evals — final numbers land with the public release.
export const SUITES: Suite[] = [
  {
    id: "swe",
    label: "SWE-bench Verified",
    desc: "Real-world software engineering — public leaderboard figures, July 2026. Laro numbers are Veylaro's on-device proxy run, not an official SWE-bench submission.",
    entries: [
      { name: "Claude Fable 5", co: "Anthropic", value: 95.0, logo: "claude" },
      { name: "Claude Opus 4.8", co: "Anthropic", value: 88.6, logo: "claude" },
      { name: "GPT-5.5", co: "OpenAI", value: 82.6, logo: "openai" },
      { name: "Gemini 3.5 Flash", co: "Google", value: 78.8, logo: "gemini" },
      { name: "Grok 4", co: "xAI", value: 75.0, logo: "grok" },
      { name: "Laro Max", co: "Veylaro Labs · runs locally", value: 62.0, logo: "veylaro", note: "on-device proxy" },
      { name: "Laro Lite", co: "Veylaro Labs · runs on 4 GB laptops", value: 48.0, logo: "veylaro", note: "on-device proxy" },
    ],
  },
  {
    id: "term",
    label: "Terminal-Bench 2.0",
    desc: "Agentic terminal work — vendor-reported figures, early 2026.",
    entries: [
      { name: "Claude Fable 5", co: "Anthropic", value: 64.1, logo: "claude" },
      { name: "Claude Opus 4.5", co: "Anthropic", value: 59.3, logo: "claude" },
      { name: "GPT-5.1 Codex Max", co: "OpenAI", value: 58.1, logo: "openai" },
      { name: "Gemini 3 Pro", co: "Google", value: 54.2, logo: "gemini" },
      { name: "Laro Max", co: "Veylaro Labs · runs locally", value: 51.8, logo: "veylaro", note: "preliminary" },
      { name: "Laro Lite", co: "Veylaro Labs · runs on 4 GB laptops", value: 39.6, logo: "veylaro", note: "preliminary" },
      { name: "Grok 4.1", co: "xAI", value: 46.5, logo: "grok" },
    ],
  },
  {
    id: "gpqa",
    label: "GPQA Diamond",
    desc: "Graduate-level scientific reasoning — vendor-reported figures, early 2026.",
    entries: [
      { name: "Claude Fable 5", co: "Anthropic", value: 92.1, logo: "claude" },
      { name: "Gemini 3 Pro", co: "Google", value: 91.9, logo: "gemini" },
      { name: "GPT-5.1 Codex Max", co: "OpenAI", value: 88.1, logo: "openai" },
      { name: "Grok 4.1", co: "xAI", value: 87.5, logo: "grok" },
      { name: "Claude Opus 4.5", co: "Anthropic", value: 87.0, logo: "claude" },
      { name: "Laro Max", co: "Veylaro Labs · runs locally", value: 68.9, logo: "veylaro", note: "preliminary" },
      { name: "Laro Lite", co: "Veylaro Labs · runs on 4 GB laptops", value: 52.7, logo: "veylaro", note: "preliminary" },
    ],
  },
];

function LogoFor({ logo }: { logo: Entry["logo"] }) {
  switch (logo) {
    case "veylaro": return <VeylaroMark size={22} />;
    case "claude": return <ClaudeMark size={19} />;
    case "openai": return <OpenAIMark size={19} />;
    case "gemini": return <GeminiMark size={19} />;
    case "grok": return <GrokMark size={17} />;
  }
}

export function BenchmarkChart({ compact = false }: { compact?: boolean }) {
  const [suite, setSuite] = useState(SUITES[0]);
  const [armed, setArmed] = useState(false);
  const [runId, setRunId] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setArmed(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const pick = (s: Suite) => {
    setSuite(s);
    setRunId((r) => r + 1); // remount rows at width 0…
    setArmed(false);
    setTimeout(() => setArmed(true), 60); // …then animate them back in
  };

  const sorted = [...suite.entries].sort((a, b) => b.value - a.value);
  const max = sorted[0].value;

  return (
    <div ref={ref}>
      {!compact && (
        <div className="bench-tabs" role="tablist">
          {SUITES.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === suite.id} className={s.id === suite.id ? "active" : ""} onClick={() => pick(s)}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      {!compact && <p className="lede" style={{ marginBottom: 36, fontSize: 16 }}>{suite.desc}</p>}
      <div className="bench-chart" key={runId}>
        {sorted.map((e, i) => {
          const isVeylaro = e.logo === "veylaro";
          return (
            <div className="bench-row" key={e.name}>
              <div className="bench-name">
                <span className="bench-logo"><LogoFor logo={e.logo} /></span>
                <span>
                  {e.name}
                  <span className="co">{e.co}{e.note ? ` · ${e.note}` : ""}</span>
                </span>
              </div>
              <div className="bench-track">
                <div
                  className={`bench-fill ${isVeylaro ? "veylaro" : "other"}`}
                  style={{
                    width: armed ? `${(e.value / max) * 96}%` : "0%",
                    "--d": `${i * 110}ms`,
                  } as CSSProperties}
                />
              </div>
              <div className={`bench-val ${isVeylaro ? "veylaro" : ""}`}>{e.value.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
