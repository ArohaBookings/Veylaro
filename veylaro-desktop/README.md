# Veylaro Desktop

The Veylaro local coding-agent app for **Laro Lite**, **Laro Med**, and **Laro Max**.
Warm-charcoal + copper design system, matching the marketing site (`../axon-code-site`).

## Run it

```bash
npm install
npm run dev        # browser preview (Vite prints the selected local port)
npm run app        # Electron window (uses dist/ — run `npm run build` first, or set VITE_DEV_SERVER_URL)
npm run dist       # production package; fails closed until signed artifacts exist
```

Production packaging requires a self-contained MLX runtime, a strict release
manifest, hash-pinned model bundles, signing, and notarization. The preflight
intentionally blocks metadata-only and developer-machine builds.

## What's inside

- **Verified model manager** — shows Lite/Med/Max separately and permits a tier
  only when its exact checkpoint is installed and integrity-matched. Downloads
  stream to disk and are accepted only after pinned size and SHA-256 checks.
- **Sessions with scope lock** — every session is pinned to one file/folder; the agent only
  edits inside it. Native file pickers in Electron, graceful fallbacks in browser.
- **Permission modes** — Ask everything / Accept edits / **Bypass (full auto, never stops)**.
- **Free-tier gating** — 50 agent messages/week; composer locks at 0
  with an upgrade banner. Pro/Team license keys (`VEY-PRO-…`, `VEY-TEAM-…`) unlock unlimited (∞).
- **Sign-in UI** — account and billing integration is not production-complete yet.
- **Dual-language narration** — every agent step has a plain-English line *and* a dev line;
  Both/Plain/Dev toggle in the header. Dev terms get hover glossary tooltips.
- **Personality** — Laro thinks out loud ("silly me — wrong import path, fixing…"), toggleable.
- **Live file activity** — sidebar shows the file being worked on (pulsing dot) with running
  +added/−removed line counts, green dot once verified.
- **Question cards** — the agent can ask up to 4 clarifying questions at once; answers
  constrain the run.
- **Time machine** — a checkpoint is snapped before/after each edit; the timeline scrubber
  restores any checkpoint (file counters roll back).
- **Auto-verify** — after edits it runs the code and shows a green Verified card:
  behavior confirmed, not assumed.
- **Recap cards** — what changed and why, plus a ready-to-copy commit message.
- **Privacy HUD** — 0 bytes to cloud · live tok/s · RAM · $-saved-vs-cloud counter ·
  offline badge that proudly keeps working.
- **Voice typing** — Web Speech API with live waveform. **Drag-in screenshots** from anywhere
  (window-level drop overlay) plus paste support.

## Engine

`src/engine/demo.ts` is the browser-only preview brain. Production inference uses
the bundled MLX runtime through an OpenAI-compatible localhost API. The desktop
process starts only an integrity-verified tier artifact and has no Ollama
protocol fallback. The guarded event loop handles repository reads, edits,
commands, tests, rollback, and evidence reporting.

## State

Everything persists to `localStorage` (`veylaro.v1`): account, plan, settings, sessions,
usage week-key. Clear site data to factory-reset.
