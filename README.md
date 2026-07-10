# Veylaro

**The most powerful local AI coding agent in the world — private by physics, unlimited by design.**

Twin-blade V, copper star. Laro runs on *your* machine: no cloud, no meters, no telemetry.

| Part | Path | What it is |
| --- | --- | --- |
| Marketing site | [`axon-code-site/`](axon-code-site/) | veylaroai.com — Vite + React + TS, Firebase (auth, register-interest), Mission Control admin |
| Veylaro Code | [`veylaro-desktop/`](veylaro-desktop/) | The downloadable desktop app — Electron + React, drives the local Laro model via Ollama |

## Quick start

```bash
# site → http://localhost:5174
cd axon-code-site && npm install && npm run dev

# app → http://localhost:5176 (browser preview) / `npm run app` for the desktop window
cd veylaro-desktop && npm install && npm run dev
```

## The model

Veylaro Code auto-detects local Laro weights served by Ollama. The shipped identity is
**`veylaro-code`** — created from the trained base with one command (fully plug-and-play):

```bash
ollama create veylaro-code -f veylaro-desktop/model/Modelfile.veylaro-code
```

Update path: retrain / swap the base weights, re-run that command, bump
`axon-code-site/public/code-updates.json` — every installed app shows **Download update**.

## Launch switches

- `axon-code-site/src/config.ts` → `DOWNLOADS_ENABLED` — flips the ghosted download buttons live.
- `axon-code-site/FIREBASE-SETUP.md` — the three one-time Firebase console steps.

© 2026 Veylaro Labs.
