#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"
echo -e "${C_BOLD}Ledgerly Doctor${C_RESET}"
cd "$ROOT_DIR"
[[ -f "$ENV_FILE" ]] && ok ".env ada" || err ".env hilang"
if [[ -f "$ENV_FILE" ]]; then
  db="$(get_env_var DATABASE_URL "$ENV_FILE")"
  if [[ -z "$db" || "$db" == *"@postgres"* ]]; then
    err "DATABASE_URL harus Neon eksternal (bukan Postgres Docker)"
  else
    ok "DATABASE_URL terlihat eksternal"
  fi
fi
if command -v docker >/dev/null 2>&1 && (docker info >/dev/null 2>&1 || sudo_cmd docker info >/dev/null 2>&1); then
  ok "docker"
  compose ps || true
else
  err "docker tidak siap"
fi
port="$(get_env_var APP_PORT "$ENV_FILE")"; port="${port:-}"
if [[ -n "$port" && "$port" != "auto" ]] && curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
  ok "App HTTP OK :${port}"
else
  err "App tidak merespons :${port:-?}"
fi
echo
ok "Doctor selesai"
