# Veylaro — Marketing Site

The public-facing site for **Veylaro**: landing page, features, benchmarks, pricing,
download, legal pages, and an internal admin dashboard (demo data). Pure front end —
no backend required. Dark aurora theme built around the Veylaro logo (purple → blue).

## Run it

```bash
cd "/Volumes/Dev SSD/Veylaro AI/veylaro-code-site"
npm install        # first time only
npm run dev        # local dev server
npm run build      # production build → dist/
```

The build in `dist/` is fully static and uses hash routing (`/#/pricing`), so it works on
any static host (Vercel, Netlify, GitHub Pages, S3) — or even opened straight from disk —
with zero server configuration.

## Pages

| Route | What it is |
|---|---|
| `/` | Landing — animated logo hero, live terminal demo, scroll story, bento features, benchmark preview, comparison table, CTA |
| `/features` | Feature deep-dive (4 pillars + capability grid) |
| `/benchmarks` | Animated benchmark charts vs Claude / GPT / Gemini / Grok + comparison table + methodology |
| `/local` | "Why Local" — the privacy/unlimited/offline pitch |
| `/pricing` | Free / Pro $29 / Team / Enterprise, annual toggle ($290/yr), value math, FAQ |
| `/download` | macOS + Windows download cards, requirements, 3-step setup |
| `/changelog` | Release notes |
| `/privacy`, `/terms` | Full legal pages |
| `/admin` | Mission Control — users, downloads, revenue, releases, support (sample data, linked from footer) |

## Things to know

- **Logo** is a vector recreation of the brand mark in `src/components/Logo.tsx`
  (transparent background, draw-on + pulse animation). Same art is `public/favicon.svg`.
- **Benchmark numbers** for the cloud models are public vendor-reported figures (Jan 2026).
  Veylaro's numbers are placeholders labeled "preliminary" — swap them in
  `src/components/BenchmarkChart.tsx` when real evals exist.
- **Download buttons** show a "builds coming soon" notice — wire them to real installers in
  `src/pages/Download.tsx` (`soon` handler) when binaries exist.
- Design system lives in `src/styles.css` (CSS variables at the top control the whole theme).
- Scroll effects: `Reveal`, `CountUp`, `GlowCard`, `Tilt`, `WordReveal`, starfield `Backdrop`
  in `src/components/FX.tsx` — no animation libraries, all hand-rolled.
