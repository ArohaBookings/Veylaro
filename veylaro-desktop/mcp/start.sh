#!/usr/bin/env bash
# Launch the Veylaro Code MCP server. Self-locating: cd to veylaro-desktop
# (this script's parent's parent) so the local tsx + engine sources resolve
# no matter what working directory the MCP client spawns us from.
set -euo pipefail
cd "$(dirname "$0")/.."
exec npx --no-install tsx mcp/veylaro-code.mts "$@"
