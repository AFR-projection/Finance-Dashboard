#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"
[[ -f "$ENV_FILE" ]] || die "Belum deploy (.env hilang)"
compose ps
echo
PORT="$(get_env_var APP_PORT "$ENV_FILE")"
PORT="${PORT:-?}"
URL="$(get_env_var NEXT_PUBLIC_APP_URL "$ENV_FILE")"
echo "Host port : ${PORT}"
echo "Public URL: ${URL}"
[[ -f "${GENERATED_DIR}/PORT.txt" ]] && cat "${GENERATED_DIR}/PORT.txt"
if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  ok "Health OK"
else
  warn "Health belum OK — ./scripts/logs.sh app"
fi
