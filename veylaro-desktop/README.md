# Veylaro Desktop

The downloadable Veylaro app — a local AI coding agent UI for **Laro Lite** and **Laro Max**.
Warm-charcoal + copper design system, matching the marketing site (`../axon-code-site`).

## Run it

```bash
npm install
npm run dev        # browser preview at http://localhost:5176
npm run app        # Electron window (uses dist/ — run `npm run build` first, or set VITE_DEV_SERVER_URL)
npm run dist       # package → release/Veylaro-1.0.0-arm64-mac.zip
```

The packaged zip is copied to `../axon-code-site/public/downloads/` and linked from the
site's Download page (SHA-256 in `SHA256SUMS.txt` next to it).

## What's inside

- **Model slider** — Laro Lite ⟷ Laro Max with spring thumb, spark burst and a
  "swapping weights" toast. Hardware fit check (reads real RAM via Electron, `deviceMemory` in browser)
  recommends the right model.
- **Sessions with scope lock** — every session is pinned to one file/folder; the agent only
  edits inside it. Native file pickers in Electron, graceful fallbacks in browser.
- **Permission modes** — Ask everything / Accept edits / **Bypass (full auto, never stops)**.
- **Free-tier gating** — 120 agent messages/week with animated ring meter; composer locks at 0
  with an upgrade banner. Pro/Team license keys (`VEY-PRO-…`, `VEY-TEAM-…`) unlock unlimited (∞).
- **Sign-in** — syncs the plan from a veylaro.ai account (simulated until the backend exists).
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

`src/engine/demo.ts` is the **preview brain** — a scripted agent that exercises the entire UX.
`src/engine/ollama.ts` is the **live adapter**: when the real Laro weights are served
(Ollama / OpenAI-compatible on localhost), flip **Settings → Engine → Live Laro weights** and
point it at the endpoint + model name. Chat then streams from the real model
(`LARO_SYSTEM_PROMPT` in the same file). The agentic tool-loop swaps in behind the same
event types (`src/types.ts` → `AgentEvent`), so the UI needs zero changes.

## State

Everything persists to `localStorage` (`veylaro.v1`): account, plan, settings, sessions,
usage week-key. Clear site data to factory-reset.
