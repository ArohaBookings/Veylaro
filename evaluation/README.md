# Veylaro Production Capability Course

This directory contains a bounded, execution-backed course for comparing an already-running local model endpoint. It does not train weights, start models, download artifacts, invoke Docker, or modify application source.

## What It Measures

The three fixtures cover:

1. Debugging an immutable shopping-cart implementation.
2. SaaS authorization, tenant isolation, validation, and untrusted-field handling.
3. Deterministic game-state transitions, validation, immutability, wins, and draws.

For every fixture the harness:

1. Copies the fixture to a temporary directory.
2. verifies the committed SHA-256 hashes of all hidden tests.
3. Executes the baseline and refuses to continue unless it fails.
4. Sends only the contract, allowlisted source, and observed failure to a localhost OpenAI-compatible endpoint.
5. Accepts complete `@@FILE path ... @@END` replacements on the exact allowlist, plus one unambiguous fenced file when the allowlist contains exactly one path.
6. Rejects filesystem, process, networking, dynamic-code, or scope-escape capabilities.
7. Re-hashes hidden tests before and after execution.
8. Runs `node --test` sequentially with time, file-size, and descriptor limits.
9. Permits a bounded number of fresh-context repair turns using compact actual failure evidence and a compiled public-contract checklist.
10. Emits a score only when all three tasks produced executable measured evidence.

## Offline Validation

These commands do not contact or load a model:

```bash
python3 -m unittest discover -s evaluation/tests -v
python3 evaluation/production_course.py --dry-run --output /tmp/veylaro-course-dry-run.json
```

The self-tests prove that all broken baselines fail, fixed reference implementations pass, path traversal is rejected, unsafe runtime access is rejected, and hidden-test modifications are detected.

## Evaluate An Already-Running Endpoint

The endpoint must already exist and must be bound to localhost. The harness never starts it.

```bash
python3 evaluation/production_course.py \
  --endpoint http://127.0.0.1:8080/v1 \
  --model laro-lite \
  --min-memory-free 30 \
  --repair-turns 2
```

Results are written to `evaluation/runs/` unless `--output` is supplied. `measured` means every fixture reached real execution. `unavailable` means infrastructure, memory admission, fixture integrity, or endpoint evidence was incomplete; in that case the harness deliberately issues no aggregate percentage.

This is a small internal, system-assisted capability course, not SWE-bench and not a frontier-model comparison. A score measures the named model plus this evaluator's bounded prompting and repair loop. Its results must never be presented as a raw-weight score, official benchmark result, or frontier-model comparison.
