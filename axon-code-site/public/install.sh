#!/bin/sh
# ============================================================
#  Veylaro CLI installer
#    curl -fsSL https://veylaroai.com/install.sh | sh
#
#  Puts the `veylaro` command on your PATH. Everything still
#  runs locally — this just installs the launcher.
# ============================================================
set -eu

COPPER='\033[38;5;180m'
DIM='\033[2m'
RED='\033[38;5;203m'
GREEN='\033[38;5;114m'
OFF='\033[0m'

printf "\n  ${COPPER}◤◢${OFF}  Veylaro CLI installer\n\n"

# --- node check -------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  printf "  ${RED}×${OFF} Node.js 18+ is required and wasn't found.\n"
  printf "  ${DIM}Install it from https://nodejs.org and run this again.${OFF}\n\n"
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  printf "  ${RED}×${OFF} Node 18+ required (found v$(node -v)).\n\n"
  exit 1
fi

# --- where the app keeps the CLI --------------------------------
APP_CLI="/Applications/Veylaro Code.app/Contents/Resources/cli/veylaro.cjs"
LOCAL_CLI="$(pwd)/cli/veylaro.cjs"

if [ -f "$APP_CLI" ]; then
  SRC="$APP_CLI"
elif [ -f "$LOCAL_CLI" ]; then
  SRC="$LOCAL_CLI"
else
  printf "  ${RED}×${OFF} Couldn't find Veylaro Code.\n"
  printf "  ${DIM}Install the desktop app first — the CLI ships inside it.${OFF}\n"
  printf "  ${DIM}https://veylaroai.com/#/download${OFF}\n\n"
  exit 1
fi

# --- pick a bin dir we can actually write to --------------------
for DIR in "$HOME/.local/bin" "/usr/local/bin"; do
  if [ -d "$DIR" ] && [ -w "$DIR" ]; then BIN="$DIR"; break; fi
done
if [ -z "${BIN:-}" ]; then
  BIN="$HOME/.local/bin"
  mkdir -p "$BIN"
fi

printf "#!/bin/sh\nexec node \"%s\" \"\$@\"\n" "$SRC" > "$BIN/veylaro"
chmod +x "$BIN/veylaro"

printf "  ${GREEN}✓${OFF} Installed to ${BIN}/veylaro\n"

case ":$PATH:" in
  *":$BIN:"*) ;;
  *)
    printf "\n  ${DIM}%s isn't on your PATH yet. Add this to your shell profile:${OFF}\n" "$BIN"
    printf "    export PATH=\"%s:\$PATH\"\n" "$BIN"
    ;;
esac

printf "\n  Try it:  ${COPPER}veylaro doctor${OFF}\n\n"
