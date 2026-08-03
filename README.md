# Veylaro

Local-first coding-agent research and product workspace.

Twin-blade V, copper star. Laro runs on *your* machine: no cloud, no meters, no telemetry.

| Part | Path | What it is |
| --- | --- | --- |
| Marketing site | [`axon-code-site/`](axon-code-site/) | veylaroai.com — Vite + React + TS, Supabase (auth, register-interest), Mission Control admin |
| Veylaro Code | [`veylaro-desktop/`](veylaro-desktop/) | Electron + React desktop app; bundles its own llama.cpp engine and runs Laro GGUF weights locally |
| Evaluation | [`evaluation/`](evaluation/) | Execution-backed debug, SaaS, and game-state course with hidden-test integrity |

## Quick start

```bash
# site (Vite prints the selected local port)
cd axon-code-site && npm install && npm run dev

# browser preview; use `npm run app` for Electron
cd veylaro-desktop && npm install && npm run dev
```

## The model

Veylaro runs its OWN engine — a bundled llama.cpp binary plus a GGUF weight file.
No Python, no third-party model runtime, nothing for the user to install.

| Tier | Checkpoint | Weights | Floor |
| --- | --- | --- | --- |
| Laro Lite | `unsloth/gemma-3n-E2B-it-GGUF` | 3.0 GB | 8 GB RAM |
| Laro Med | `unsloth/gemma-3-12b-it-GGUF` | 7.3 GB | 12 GB RAM |
| Laro Max | `unsloth/gemma-3-27b-it-GGUF` | 16.5 GB | 24 GB RAM |

Weights are downloaded on first run and verified by exact size + SHA-256 into
`userData/models/<tier>/model.gguf`. Veylaro's agent systems run OUTSIDE the
checkpoint and bind every claim to repository and execution evidence — that is
what the product is. No benchmark from a historical base is inherited by the
current product tier.

A packaged release must contain a self-contained engine (see
`build/bundleEngineDeps.cjs` — no absolute links to anything outside the app
bundle), exact per-file hashes and license notices. `npm run dist` fails closed
until those artifacts exist.

## Launch switches

- `axon-code-site/src/config.ts` contains the public launch switches. Do not
  enable downloads until `veylaro-desktop/build/releasePreflight.cjs` passes on
  the exact release artifact.
- `axon-code-site/SUPABASE-SETUP.md` — confirm the admin email + run one migration.

© 2026 Veylaro Labs.
