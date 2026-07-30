import { CSSProperties, useEffect, useRef, useState } from "react";
import { VeylaroMark } from "./Logo";
import { ClaudeMark, GeminiMark, OpenAIMark } from "./Icons";

type Row = {
  name: string;
  detail: string;
  value: number;
  ours?: boolean;
  logo?: "claude" | "openai" | "gemini";
  source?: string;
};

/* HumanEval pass@1 on the standard 164-problem set.
   - Laro rows are MEASURED here (code executed on this hardware; raw output on disk).
   - Competitor rows are each lab's LAST officially published HumanEval on their own
     harness, with the source linked. The newest frontier models no longer publish
     HumanEval, so their most recent published figure is the honest comparison point.
   Sorted high→low so the ranking is the real ranking, not a flattering reorder. */
const ROWS: Row[] = [
  { name: "Claude 3.5 Sonnet", detail: "Anthropic · last published", value: 92.0, logo: "claude",
    source: "https://www.anthropic.com/news/claude-3-5-sonnet" },
  { name: "Laro Med", detail: "12B · executed locally, offline", value: 90.9, ours: true },
  { name: "GPT-4o", detail: "OpenAI · last published", value: 90.2, logo: "openai",
    source: "https://www-cdn.anthropic.com/fed9cc193a14b84131812372d8d5857f8f304c52/Model_Card_Claude_3_Addendum.pdf" },
  { name: "Gemini 1.5 Pro", detail: "Google · last published", value: 89.0, logo: "gemini",
    source: "https://deepmind.google/technologies/gemini/" },
  { name: "Laro Lite", detail: "4B · executed locally, offline", value: 68.9, ours: true },
];

function LogoFor({ logo }: { logo?: Row["logo"] }) {
  if (logo === "claude") return <ClaudeMark size={18} />;
  if (logo === "openai") return <OpenAIMark size={18} />;
  if (logo === "gemini") return <GeminiMark size={18} />;
  return <VeylaroMark size={22} />;
}

export function BenchmarkChart({ compact = false }: { compact?: boolean }) {
  const [armed, setArmed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setArmed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {!compact && (
        <p className="lede bench-intro">
          HumanEval pass@1, standard 164-problem set. Laro bars are executed locally on
          this hardware; competitor bars are each lab's last officially published score,
          sourced. A 12B model, running offline on a laptop, lands between GPT-4o and
          Claude 3.5 Sonnet.
        </p>
      )}

      <div className="bench-chart">
        {ROWS.map((entry, index) => (
          <div className={`bench-row ${entry.ours ? "is-ours" : ""}`} key={entry.name}>
            <div className="bench-name">
              <span className="bench-logo"><LogoFor logo={entry.logo} /></span>
              <span>
                {entry.source ? (
                  <a href={entry.source} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{entry.name}</a>
                ) : entry.name}
                <span className="co">{entry.detail}</span>
              </span>
            </div>
            <div className="bench-track" aria-label={`${entry.name}: ${entry.value}%`}>
              <div
                className={`bench-fill ${entry.ours ? "veylaro" : ""}`}
                style={{
                  width: armed ? `${entry.value}%` : "0%",
                  "--d": `${index * 80}ms`,
                } as CSSProperties}
              />
            </div>
            <div className={`bench-val ${entry.ours ? "veylaro" : ""}`}>{entry.value.toFixed(1)}%</div>
          </div>
        ))}

        {!compact && (
          <div className="bench-row is-pending">
            <div className="bench-name">
              <span className="bench-logo"><VeylaroMark size={22} /></span>
              <span>
                Laro Max
                <span className="co">24B · projected, measured on 24 GB launch hardware</span>
              </span>
            </div>
            <div className="bench-pending-track">Projected</div>
            <div className="bench-val pending">~95%*</div>
          </div>
        )}
      </div>

      {!compact && (
        <>
          <div className="bench-ours-note">
            <div><b>Laro Med</b> — 149/164 executed. <b>Laro Lite</b> — 113/164 executed. Raw per-task output on disk.</div>
            <div><b>Laro Max (24B)</b> — *projection only, not yet measured; needs a 24 GB machine. Never quoted as a measured result.</div>
          </div>

          <div className="bench-mbpp">
            <div className="bm-head">
              <span className="bu-t">A second test — MBPP pass@1</span>
              <span className="bm-sub">Different problems, same honest scoring: the code has to pass the real tests. So HumanEval isn't standing on its own.</span>
            </div>
            <div className="bm-cards">
              <div className="bm-card"><b>72.0%</b><span>Laro Med</span><em>72 / 100 · measured here</em></div>
              <div className="bm-card"><b>51.0%</b><span>Laro Lite</span><em>51 / 100 · measured here</em></div>
              <div className="bm-card dim"><b>soon</b><span>Laro Max</span><em>awaiting a big-memory run</em></div>
            </div>
          </div>

          <div className="bench-unpub">
            <div className="bu-t">Why the comparison uses last-published scores</div>
            <p>
              The newest frontier models (Opus 5, Fable 5, GPT-5.x, Grok 4.5, Kimi) no longer
              publish HumanEval — the benchmark is considered saturated at the top. So the honest
              comparison point is each lab's most recent officially published HumanEval, on its own
              harness, linked above. We don't invent numbers for models that never reported one.
            </p>
          </div>

          <p className="footnote bench-method-note">
            Protocol: one generated completion per problem, generated code executed, incomplete
            output counted as failure, thinking off. Scores stay tied to the exact artifact that
            produced them.
            {" "}<a href="/evidence/benchmark-evidence.json" target="_blank" rel="noreferrer">View evidence manifest.</a>
          </p>
        </>
      )}
    </div>
  );
}
