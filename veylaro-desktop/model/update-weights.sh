#!/usr/bin/env bash
# ============================================================
#  Swap in updated Laro weights — the systems stay perfectly intact.
#
#  Every system in Veylaro Code (the agent loop, verify-and-repair,
#  the UI-taste loop, the memory guard, the file protocol) talks to
#  the model ONLY through a stable tag: laro-lite / laro-med / laro-max.
#  So to ship better weights you just re-register that tag — nothing
#  in the app or the systems changes, and no rebuild is needed.
#
#  Usage:
#     ./update-weights.sh med  /path/to/new-laro-med.gguf
#     ./update-weights.sh lite huggingface-base-or-gguf
#
#  After it finishes, restart Veylaro Code (or it picks the new
#  weights up on the next model load). The charter/personality and
#  runtime params are carried over from the shipped Modelfile.
# ============================================================
set -euo pipefail

TIER="${1:-}"; SRC="${2:-}"
if [[ -z "$TIER" || -z "$SRC" ]]; then
  echo "usage: $0 <lite|med|max> <path-to-weights.gguf | base-model-name>"
  exit 1
fi
case "$TIER" in lite|med|max) ;; *) echo "tier must be lite, med or max"; exit 1;; esac

TAG="laro-$TIER"
DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_MF="$DIR/Modelfile.$TAG"
TMP_MF="$(mktemp -t veylaro-modelfile)"

# New weights on the first line…
echo "FROM $SRC" > "$TMP_MF"
# …then carry over SYSTEM / TEMPLATE / PARAMETER from the shipped Modelfile so the
# charter and tuning survive the weight swap unchanged.
if [[ -f "$BASE_MF" ]]; then
  awk '/^(SYSTEM|TEMPLATE|PARAMETER)/{p=1} p' "$BASE_MF" >> "$TMP_MF" || true
fi

echo "→ Registering $TAG from: $SRC"
echo "  (tag stays the same → every Veylaro system keeps working, no code change)"
ollama create "$TAG" -f "$TMP_MF"
rm -f "$TMP_MF"
echo "✓ $TAG updated. Restart Veylaro Code to load the new weights."
