# Veylaro Code MCP

An MCP (Model Context Protocol) server that exposes Veylaro Code's **real** local
build engine to any MCP client, headlessly — no Electron window required. It
imports the exact modules the desktop app ships (`runtime`, `agentLoop`,
`charter`, `contractCompiler`, `verificationPlan`, `failureKernel`,
`commandPolicy`), so what it runs is the shipped pipeline, not a reimplementation.

Purpose: let an agent drive Veylaro Code and **check its output** — build a task,
run the anti-cheat course, and read back the produced files — repeatably.

## Tools

| Tool | What it does | Loads a model? |
|------|--------------|----------------|
| `status` | Endpoints up, installed models mapped to tier (Lite/Med/Max), RAM headroom | No |
| `build` | Runs the real headless agent loop: compile contract → stream model through the `@@FILE`/`@@RUN` protocol → write files into an isolated workspace → run repo-derived verification → bounded repair on real failure evidence. Returns files, command results, and an evidence-based grade. | Yes |
| `course` | Runs `evaluation/production_course.py` (three execution-graded fixtures with hidden-test hashing) against a tier's endpoint and returns the measured score. | Yes |
| `inspect` | Reads back the files under a build workspace so the output can be checked. | No |

`build` and `course` execute a local model and use RAM. `status`/`inspect` are free.

### `build` arguments
- `task` (required) — what to build or fix.
- `tier` — `lite` \| `med` \| `max` (default `med`). Ignored when `model` is set.
- `model` — pin an exact served model id (the engine reports the GGUF path) to benchmark an alternative base.
- `endpoint` — engine URL (default: the Veylaro engine on `:8080`).
- `dir` — workspace dir (default: an isolated temp dir under the OS temp).
- `maxSteps` — max model turns (1–16, default 8).
- `repairTurns` — bounded repair turns on failure (0–4, default 2).

The grade is evidence-based and honest:
- `no-output` — the model wrote no files.
- `unverified` — files written but the project declares no automated verifier.
- `failing` — files written; some/all verification commands failed.
- `verified` — files written and every verification command passed.

## Run it

Registered as a project MCP server in the repo-root `.mcp.json` (server name
`veylaro-code`). Clients that read that file launch it automatically.

Directly, for a manual smoke:

```bash
cd veylaro-desktop && npm run mcp
```

It speaks JSON-RPC 2.0 over stdio (newline-framed). `stdout` carries only
protocol frames; all logs go to `stderr`.

## Requirements

- The Veylaro engine already running on `:8080` (Veylaro Code starts it, or run
  the bundled `llama-server` directly against a tier GGUF). The MCP
  never starts or downloads a model — it drives an endpoint that already exists.
- `tsx` (already a devDependency).
