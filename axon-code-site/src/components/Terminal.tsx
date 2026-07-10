import { useEffect, useRef, useState } from "react";

type Line = { kind: "cmd" | "out"; parts: { cls: string; text: string }[]; pause?: number };

// A staged agentic coding session, typed out live.
const SCRIPT: Line[] = [
  { kind: "cmd", parts: [{ cls: "c-cmd", text: "veylaro \"add rate limiting to the api and write tests\"" }], pause: 500 },
  { kind: "out", parts: [{ cls: "c-star", text: "✦ " }, { cls: "c-dim", text: "Veylaro · Laro Max · running locally · 0 bytes leave this machine" }], pause: 550 },
  { kind: "out", parts: [{ cls: "c-blue", text: "◆ Reading" }, { cls: "c-dim", text: "  src/server/api.ts · middleware/ · 14 files scanned" }], pause: 600 },
  { kind: "out", parts: [{ cls: "c-blue", text: "◆ Planning" }, { cls: "c-dim", text: " token-bucket limiter → per-route config → tests" }], pause: 700 },
  { kind: "out", parts: [{ cls: "c-ok", text: "✓ Created" }, { cls: "c-dim", text: "  middleware/rateLimit.ts " }, { cls: "c-ok", text: "+86" }], pause: 420 },
  { kind: "out", parts: [{ cls: "c-ok", text: "✓ Edited" }, { cls: "c-dim", text: "   src/server/api.ts " }, { cls: "c-ok", text: "+12" }, { cls: "c-dim", text: " " }, { cls: "c-warn", text: "-3" }], pause: 420 },
  { kind: "out", parts: [{ cls: "c-ok", text: "✓ Created" }, { cls: "c-dim", text: "  tests/rateLimit.test.ts " }, { cls: "c-ok", text: "+124" }], pause: 500 },
  { kind: "out", parts: [{ cls: "c-blue", text: "◆ Running" }, { cls: "c-dim", text: "  npm test — 18 passed, 0 failed (2.4s)" }], pause: 650 },
  { kind: "out", parts: [{ cls: "c-star", text: "✦ " }, { cls: "c-cmd", text: "Done. Rate limiting live on all /api routes, fully tested." }], pause: 300 },
  { kind: "out", parts: [{ cls: "c-dim", text: "  ↳ tokens used: unlimited · cloud calls: 0 · your code: still yours" }], pause: 2600 },
];

export function Terminal() {
  const [lines, setLines] = useState<{ parts: Line["parts"]; typed: number; kind: string }[]>([]);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // reset on every (re)mount so StrictMode's double-invoke restarts cleanly
    setLines([]);
    setDone(false);

    let li = 0;
    const nextLine = () => {
      if (li >= SCRIPT.length) {
        // hold, then loop
        timer.current = setTimeout(() => {
          setLines([]);
          setDone(false);
          li = 0;
          timer.current = setTimeout(nextLine, 600);
        }, 6000);
        setDone(true);
        return;
      }
      const line = SCRIPT[li];
      const full = line.parts.map((p) => p.text).join("");
      if (line.kind === "cmd") {
        // type character by character
        setLines((prev) => [...prev, { parts: line.parts, typed: 0, kind: "cmd" }]);
        let c = 0;
        const typeChar = () => {
          c += 1 + Math.floor(Math.random() * 2);
          const cc = Math.min(c, full.length);
          setLines((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { ...copy[copy.length - 1], typed: cc };
            return copy;
          });
          if (cc < full.length) {
            timer.current = setTimeout(typeChar, 22 + Math.random() * 40);
          } else {
            li++;
            timer.current = setTimeout(nextLine, line.pause ?? 400);
          }
        };
        timer.current = setTimeout(typeChar, 300);
      } else {
        setLines((prev) => [...prev, { parts: line.parts, typed: full.length, kind: "out" }]);
        li++;
        timer.current = setTimeout(nextLine, line.pause ?? 400);
      }
    };
    timer.current = setTimeout(nextLine, 900);
    return () => clearTimeout(timer.current);
  }, []);

  return (
    <div className="term" role="img" aria-label="Veylaro terminal session demo">
      <div className="term-bar">
        <span className="dot r" /><span className="dot y" /><span className="dot g" />
        <span className="title">veylaro — ~/projects/api — 100% local</span>
      </div>
      <div className="term-body">
        {lines.map((l, i) => {
          // render typed slice across styled parts
          let remaining = l.typed;
          return (
            <span className="ln" key={i}>
              {l.kind === "cmd" && <span className="c-prompt">❯ </span>}
              {l.parts.map((p, j) => {
                const take = Math.max(0, Math.min(p.text.length, remaining));
                remaining -= take;
                return (
                  <span className={p.cls} key={j}>
                    {p.text.slice(0, take)}
                  </span>
                );
              })}
              {i === lines.length - 1 && !done && <span className="caret" />}
            </span>
          );
        })}
        {done && (
          <span className="ln">
            <span className="c-prompt">❯ </span>
            <span className="caret" />
          </span>
        )}
      </div>
    </div>
  );
}
