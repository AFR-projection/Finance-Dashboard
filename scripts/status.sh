#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"
compose ps
echo
PORT="$(get_env_var APP_PORT "$ENV_FILE" 2>/dev/null || true)"
PORT="${PORT:-3001}"
echo "Host port: ${PORT}"
[[ -f "$ROOT_DIR/deploy/generated/PORT.txt" ]] && cat "$ROOT_DIR/deploy/generated/PORT.txt"
