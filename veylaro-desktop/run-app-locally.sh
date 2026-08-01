#!/usr/bin/env bash
# Launch the source-development build without changing quarantine, signatures,
# Gatekeeper, or any other macOS security setting. Old release/*.zip artifacts
# are intentionally not opened: they are not Developer-ID signed or notarized.
set -euo pipefail
cd "$(dirname "$0")"

if ! curl -fsS http://127.0.0.1:5173/ >/dev/null 2>&1; then
  echo "Start the local UI first: npm run dev -- --host 127.0.0.1 --port 5173"
  exit 1
fi

ELECTRON_APP="node_modules/electron/dist/Electron.app"
if [ -d "$ELECTRON_APP" ] && spctl --assess --type execute "$ELECTRON_APP" >/dev/null 2>&1; then
  echo "Launching the trusted source-development app."
  VITE_DEV_SERVER_URL=http://127.0.0.1:5173 exec npm run app
fi

echo "macOS does not trust this unsigned development runtime, so it will not be opened or de-quarantined."
echo "Opening the same local UI in your browser instead. Public downloads remain blocked until Developer ID signing and Apple notarization are configured."
open http://127.0.0.1:5173/
