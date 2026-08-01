import { VeylaroMark } from "./Logo";

type ReleaseRow = {
  name: string;
  detail: string;
  status: string;
};

const RELEASE_ROWS: ReleaseRow[] = [
  { name: "Laro Lite", detail: "Gemma 4 E2B MLX artifact", status: "benchmark pending" },
  { name: "Laro Med", detail: "Gemma 4 12B MLX artifact", status: "checkpoint unavailable on this host" },
  { name: "Laro Max", detail: "24B MLX artifact", status: "requires 24 GB+ test hardware" },
];

export function BenchmarkChart({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      {!compact && (
        <p className="lede bench-intro">
          A benchmark belongs to one exact checkpoint, quantization, runtime, prompt protocol,
          and evaluator. The current release candidates have not completed that chain, so they
          do not receive inherited or projected scores.
        </p>
      )}

      <div className="bench-chart">
        {RELEASE_ROWS.map((entry) => (
          <div className="bench-row is-pending" key={entry.name}>
            <div className="bench-name">
              <span className="bench-logo"><VeylaroMark size={22} /></span>
              <span>
                {entry.name}
                <span className="co">{entry.detail}</span>
              </span>
            </div>
            <div className="bench-pending-track">Not scored</div>
            <div className="bench-val pending">pending</div>
          </div>
        ))}
      </div>

      {!compact && (
        <>
          <div className="bench-ours-note">
            <div><b>Runtime status</b> — Lite is locally runnable. Med and Max are configured but do not have independent runnable checkpoints on this 16 GB host.</div>
            <div><b>Latest completed course</b> — Lite solved 0/3 unseen local repair fixtures on 2 August 2026, before the assertion-guided repair lane was added. A separate bounded repair tournament later passed one fixture; the full course has not been rerun.</div>
          </div>

          <div className="bench-mbpp">
            <div className="bm-head">
              <span className="bu-t">Historical research runs</span>
              <span className="bm-sub">Useful engineering records, not scores for the current Laro release artifacts.</span>
            </div>
            <div className="bm-cards">
              <div className="bm-card"><b>90.9%</b><span>Gemma 4 12B via Ollama</span><em>HumanEval 149/164 · historical runtime</em></div>
              <div className="bm-card"><b>68.9%</b><span>Gemma 3 4B base</span><em>HumanEval 113/164 · historical checkpoint</em></div>
              <div className="bm-card dim"><b>0/3</b><span>Current Lite + prior execution system</span><em>latest completed small course · not SWE-bench</em></div>
            </div>
          </div>

          <div className="bench-unpub">
            <div className="bu-t">What blocks a public release score</div>
            <p>
              The exact downloadable model bundle must run the complete benchmark on a clean,
              supported machine. The report, task-level outcomes, runtime configuration, and model
              artifact hashes must then agree. Renaming a base model or wrapping it with tools does
              not transfer an earlier score.
            </p>
          </div>

          <p className="footnote bench-method-note">
            Historical reports and the current evidence status are indexed in the
            {" "}<a href="/evidence/benchmark-evidence.json" target="_blank" rel="noreferrer">evidence manifest.</a>
          </p>
        </>
      )}
    </div>
  );
}
