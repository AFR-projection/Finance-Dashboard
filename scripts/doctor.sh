#!/usr/bin/env bash
# Post-deploy doctor
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"

echo -e "${C_BOLD}Ledgerly Doctor${C_RESET}"
cd "$ROOT_DIR"

[[ -f "$ENV_FILE" ]] && ok ".env ada" || err ".env hilang"

if command -v docker >/dev/null 2>&1 && (docker info >/dev/null 2>&1 || sudo_cmd docker info >/dev/null 2>&1); then
  ok "docker"
  compose ps || true
else
  err "docker tidak siap"
fi

port="$(get_env_var APP_PORT "$ENV_FILE")"; port="${port:-}"
if [[ -n "$port" ]] && curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
  ok "App HTTP OK :${port}"
else
  err "App tidak merespons :${port:-?}"
fi

if [[ -n "$port" ]] && curl -fsS "http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling" >/dev/null 2>&1; then
  ok "Socket.io endpoint merespons"
else
  warn "Socket.io belum merespons"
fi

echo
ok "Doctor selesai"
