#!/usr/bin/env bash
# Extract, ad-hoc-sign, de-quarantine and launch the locally-built Veylaro Code
# app so macOS Gatekeeper doesn't block it with the "malware" dialog.
#
# WHY this is needed: `npm run dist` builds the app UNSIGNED (no Apple cert), so
# macOS quarantines it and refuses to open it. An ad-hoc signature (`codesign
# --sign -`) plus clearing the quarantine flag lets YOU run it on THIS machine.
#
# THIS IS NOT ENOUGH TO SELL IT. For customers who download the app, you must
# sign with a real Apple Developer ID and notarize it — otherwise every one of
# them hits the same wall. See notarize steps at the bottom.
set -euo pipefail
cd "$(dirname "$0")/release"

ZIP="$(ls VeylaroCode-1.0.0-arm64-mac.zip Veylaro-1.0.0-arm64-mac.zip 2>/dev/null | head -1)"
[ -z "$ZIP" ] && { echo "No arm64 build zip found. Run: npm run dist"; exit 1; }

rm -rf run-arm64 && mkdir -p run-arm64
ditto -x -k "$ZIP" run-arm64
APP="run-arm64/$(ls run-arm64 | grep '\.app$' | head -1)"

xattr -cr "$APP"
codesign --force --deep --sign - "$APP"
codesign --verify --verbose=1 "$APP"
pkill -f "Veylaro Code" 2>/dev/null || true
sleep 1
open "$APP"
echo "Launched $APP"

# ------------------------------------------------------------------
# TO SHIP TO CUSTOMERS (one-time, needs your Apple Developer account):
#   1. Get a "Developer ID Application" certificate in your Apple account.
#   2. In package.json build config set mac.identity to that cert name.
#   3. Add notarize creds as env vars (APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD,
#      APPLE_TEAM_ID) and enable afterSign notarization in electron-builder.
#   4. npm run dist  ->  produces a signed+notarized app the download button
#      can serve without any Gatekeeper warning.
# ------------------------------------------------------------------
