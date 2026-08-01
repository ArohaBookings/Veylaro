import { WebResult } from "../types";

/* ============================================================
   Real internet search for Veylaro Code.
   Desktop: goes through the Electron main process (no CORS) to
   DuckDuckGo. The query leaves the machine only after the privacy filter below
   rejects code-like, path-like, credential-like, or personally identifying text.
   Browser preview: CORS blocks real search, so callers fall back
   to the simulated results from the demo engine.
   ============================================================ */

export async function webSearch(query: string): Promise<WebResult[] | null> {
  if (!navigator.onLine) return null;
  const bridge = window.veylaro as any;
  if (bridge?.search) {
    try {
      const res = await bridge.search(query);
      if (res?.ok && res.results?.length) {
        return res.results.map((r: any) => ({
          title: String(r.title || "").slice(0, 120),
          url: String(r.url || ""),
          snippet: String(r.snippet || ""),
        }));
      }
    } catch {
      /* fall through */
    }
  }
  return null; // caller falls back to simulated results
}

const SECRET_SHAPE = /(?:sk|ghp|github_pat|xox[baprs]|AIza)[-_a-z0-9]{12,}|bearer\s+[a-z0-9._~-]{12,}|(?:api[_-]?key|token|password|secret)\s*[:=]/i;
const CODE_SHAPE = /(?:^|\n)\s*(?:import|export|function|class|def|const|let|var|from)\b|[{};]{2,}|=>|<\/?[a-z][^>]*>/i;
const PRIVATE_SHAPE = /\b[A-Z]:\\|(?:^|\s)\/(?:Users|home|private|Volumes)\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
const STOP = new Set(["please", "could", "would", "should", "search", "lookup", "look", "find", "latest", "current", "about", "with", "from", "this", "that", "what", "when", "where", "does", "have", "into", "using"]);

/** Build a deliberately lossy public-web query. If the request resembles code,
 * credentials, a local path, or personal data, nothing is transmitted. */
export function privacySafeSearchQuery(input: string): string | null {
  const text = input.trim();
  if (!text || SECRET_SHAPE.test(text) || CODE_SHAPE.test(text) || PRIVATE_SHAPE.test(text)) return null;
  const terms = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .match(/[a-z0-9][a-z0-9.+#_-]{1,30}/g)
    ?.filter((term) => !STOP.has(term)) || [];
  const unique = [...new Set(terms)].slice(0, 12);
  return unique.length >= 2 ? unique.join(" ").slice(0, 120) : null;
}

/** Compact search results into model-readable grounding context. */
export function resultsToContext(query: string, results: WebResult[]): string {
  return [
    `[web search — "${query}" — fetched by the local app from public web sources; cite when used]`,
    ...results.map((r, i) => `${i + 1}. ${r.title} (${r.url})\n   ${r.snippet}`),
  ].join("\n");
}
