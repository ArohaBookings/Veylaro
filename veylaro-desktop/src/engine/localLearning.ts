export type VerifiedPrecedent = {
  id: string;
  prompt: string;
  scopeLabel: string;
  check: string;
  evidence: string;
  model: string;
  createdAt: number;
};

const KEY = "veylaro.verified-precedents.v1";
const MAX_RECORDS = 200;

function read(): VerifiedPrecedent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function write(rows: VerifiedPrecedent[]) {
  localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX_RECORDS)));
}

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .match(/[a-z][a-z0-9_-]{2,}/g)
      ?.filter((term) => !["the", "and", "for", "with", "this", "that", "from"].includes(term)) || [],
  );
}

export function recordVerifiedPrecedent(input: Omit<VerifiedPrecedent, "id" | "createdAt">) {
  const duplicateKey = `${input.prompt}\n${input.scopeLabel}\n${input.check}\n${input.evidence}`;
  const existing = read().filter(
    (row) => `${row.prompt}\n${row.scopeLabel}\n${row.check}\n${row.evidence}` !== duplicateKey,
  );
  write([
    {
      ...input,
      id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      createdAt: Date.now(),
    },
    ...existing,
  ]);
}

export function retrieveVerifiedPrecedents(query: string, limit = 3): VerifiedPrecedent[] {
  const queryTerms = terms(query);
  if (!queryTerms.size) return [];
  return read()
    .map((row) => {
      const rowTerms = terms(`${row.prompt} ${row.check} ${row.evidence}`);
      let overlap = 0;
      queryTerms.forEach((term) => {
        if (rowTerms.has(term)) overlap += 1;
      });
      return { row, score: overlap / Math.max(1, queryTerms.size) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.row.createdAt - a.row.createdAt)
    .slice(0, limit)
    .map((item) => item.row);
}

export function verifiedPrecedentCount() {
  return read().length;
}

export function clearVerifiedPrecedents() {
  localStorage.removeItem(KEY);
}

export function exportVerifiedPrecedents() {
  const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), records: read() }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `veylaro-verified-learning-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function precedentsAsPrompt(query: string): string {
  const rows = retrieveVerifiedPrecedents(query);
  if (!rows.length) return "";
  const body = rows.map((row, index) => (
    `${index + 1}. Prior task: ${row.prompt}\n` +
    `   Observed check: ${row.check}\n` +
    `   Evidence: ${row.evidence}`
  )).join("\n");
  return `VERIFIED LOCAL PRECEDENTS\n${body}\nUse these only as hypotheses. Re-run current checks before claiming success.`;
}
