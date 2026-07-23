#!/usr/bin/env bash
# Post-deploy doctor — cek kesehatan stack
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"

echo -e "${C_BOLD}Ledgerly Doctor${C_RESET}"
cd "$ROOT_DIR"

[[ -f "$ENV_FILE" ]] && ok ".env ada" || err ".env hilang"
command -v node >/dev/null && ok "node $(node -v)" || err "node missing"
command -v pm2 >/dev/null && ok "pm2 $(pm2 -v)" || err "pm2 missing"
command -v docker >/dev/null && ok "docker" || warn "docker missing"

if docker info >/dev/null 2>&1 || sudo_cmd docker info >/dev/null 2>&1; then
  compose ps || true
fi

pm2 status || true

port="$(get_env_var APP_PORT "$ENV_FILE")"; port="${port:-3000}"
if curl -fsS "http://127.0.0.1:${port}/login" >/dev/null 2>&1; then
  ok "App HTTP OK :${port}"
else
  err "App tidak merespons :${port}"
fi

if curl -fsS "http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling" >/dev/null 2>&1; then
  ok "Socket.io endpoint merespons"
else
  warn "Socket.io polling belum merespons (cek ledgerly-web)"
fi

[[ -d workers/.wa-auth ]] && ok "WA auth dir ada" || warn "WA auth dir belum ada (normal sebelum scan QR)"
[[ -f logs/security.log ]] && ok "security.log" || warn "security.log belum ada"

echo
ok "Doctor selesai"
