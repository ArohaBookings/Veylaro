import { WebResult } from "../types";

/* ============================================================
   Real internet search for Veylaro Code.
   Desktop: goes through the Electron main process (no CORS) to
   DuckDuckGo — only the query leaves the machine, never code.
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

/** Compact search results into model-readable grounding context. */
export function resultsToContext(query: string, results: WebResult[]): string {
  return [
    `[web search — "${query}" — fetched locally, cite when used]`,
    ...results.map((r, i) => `${i + 1}. ${r.title} (${r.url})\n   ${r.snippet}`),
  ].join("\n");
}
