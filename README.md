# Veylaro

Local-first coding-agent research and product workspace.

Twin-blade V, copper star. Laro runs on *your* machine: no cloud, no meters, no telemetry.

| Part | Path | What it is |
| --- | --- | --- |
| Marketing site | [`axon-code-site/`](axon-code-site/) | veylaroai.com — Vite + React + TS, Supabase (auth, register-interest), Mission Control admin |
| Veylaro Code | [`veylaro-desktop/`](veylaro-desktop/) | Electron + React desktop app with guarded local MLX inference |
| Evaluation | [`evaluation/`](evaluation/) | Execution-backed debug, SaaS, and game-state course with hidden-test integrity |

## Quick start

```bash
# site (Vite prints the selected local port)
cd axon-code-site && npm install && npm run dev

# browser preview; use `npm run app` for Electron
cd veylaro-desktop && npm install && npm run dev
```

## The model

The current locally executable tier is Laro Lite, backed by the Apache-2.0
`mlx-community/gemma-4-e2b-it-4bit` checkpoint. Veylaro's agent systems run
outside the checkpoint and bind claims to repository and execution evidence.
Med and Max remain release-gated until complete checkpoints are acquired,
licensed, benchmarked, and packaged. No benchmark from a historical base is
automatically inherited by the current product tier.

Production inference is independent of Ollama. A packaged release must contain
a signed MLX runtime manifest, exact per-file hashes, license notices, and model
bundle manifests. `npm run dist` fails closed until those artifacts exist.

## Launch switches

- `axon-code-site/src/config.ts` contains the public launch switches. Do not
  enable downloads until `veylaro-desktop/build/releasePreflight.cjs` passes on
  the exact release artifact.
- `axon-code-site/SUPABASE-SETUP.md` — confirm the admin email + run one migration.

© 2026 Veylaro Labs.
