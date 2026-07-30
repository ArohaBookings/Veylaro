import { ReactNode, useEffect, useState } from "react";

/* Shared shell for the legal pages.

   Two jobs:
   1. Navigation that survives HashRouter. The old version used <a href="#s1">,
      which on a hash-routed site rewrites the route hash and drops you off the
      page entirely — that was the "privacy links don't work" bug.
   2. Fill the screen. The content column stretches to the container; only the
      prose measure is capped, so a 32" monitor and a phone both look deliberate.
*/

export function LegalShell({
  prefix,
  sections,
  children,
}: {
  prefix: string;
  sections: string[];
  children: ReactNode;
}) {
  const [active, setActive] = useState(1);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting);
        if (seen.length) setActive(Number(seen[0].target.id.slice(prefix.length)));
      },
      { rootMargin: "-90px 0px -70% 0px", threshold: 0 }
    );
    sections.forEach((_, i) => {
      const el = document.getElementById(`${prefix}${i + 1}`);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [prefix, sections]);

  const goTo = (i: number) => {
    const el = document.getElementById(`${prefix}${i + 1}`);
    if (!el) return;
    // behavior:"instant" is deliberate. The site sets `html { scroll-behavior: smooth }`,
    // and under that rule an animated scrollIntoView gets cancelled mid-flight in some
    // engines (the link then appears to do nothing — the exact bug we're fixing). An
    // instant jump always lands and sticks; scroll-margin-top on the heading clears the
    // fixed nav so the title isn't tucked underneath.
    el.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
    setActive(i + 1);
  };

  return (
    <div className="legal-layout">
      <aside className="legal-nav">
        <div className="ln-t">On this page</div>
        {sections.map((t, i) => (
          <button
            key={t}
            type="button"
            className={active === i + 1 ? "active" : ""}
            onClick={() => goTo(i)}
          >
            <span className="ln-n">{i + 1}</span> {t}
          </button>
        ))}
      </aside>
      <div className="legal">
        <div className="legal-toc">
          {sections.map((t, i) => (
            <button key={t} type="button" onClick={() => goTo(i)}>
              {i + 1}. {t}
            </button>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
