#!/usr/bin/env bash
#
# Ledgerly — instalasi pertama (fresh VPS)
#
#   git clone … /opt/ledgerly && cd /opt/ledgerly
#   cp .env.example .env && nano .env   # wajib: DATABASE_URL Neon
#   chmod +x install.sh deploy.sh update.sh
#   ./install.sh
#
# Opsi:
#   APP_DOMAIN=finance.example.com ./install.sh
#   APP_PORT=7341 ./install.sh
#   SKIP_SSL=1 ./install.sh
#
set -euo pipefail

# Selalu kerja dari root project (folder tempat install.sh berada)
cd "$(dirname "$0")" || exit 1
ROOT_DIR="$(pwd)"

# The repository may be cloned from a filesystem that does not preserve mode bits.
chmod +x install.sh deploy.sh update.sh redeploy.sh scripts/*.sh docker/entrypoint.sh

export TOTAL_STEPS=9
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"
cd "$ROOT_DIR" || exit 1

print_banner
echo -e "${C_DIM}Fresh install · Neon PostgreSQL · Redis Docker · Nginx/SSL${C_RESET}"
log "Working directory: ${ROOT_DIR}"
log "Compose file: ${COMPOSE_FILE}"

PORT_OVERRIDE="${APP_PORT:-}"

step "Cek Docker..."
ensure_docker

step "Validasi .env..."
[[ -f "$ENV_FILE" ]] || die "Belum ada .env — jalankan: cp .env.example .env && nano .env (isi DATABASE_URL Neon)"
prepare_env_secrets
validate_neon_database_url

step "Pilih port host kosong..."
CHOSEN_PORT="$(pick_free_port "$PORT_OVERRIDE")"
ok "Port: ${C_BOLD}${CHOSEN_PORT}${C_RESET}"

step "Set URL runtime..."
if [[ -n "${APP_DOMAIN:-}" ]]; then
  set_env_var APP_DOMAIN "$APP_DOMAIN" "$ENV_FILE"
fi
apply_runtime_urls "$CHOSEN_PORT"

step "Build & up stack..."
stack_up_build

step "Health-check..."
wait_app_http "$CHOSEN_PORT"
compose ps || true

step "Nginx + SSL..."
DOMAIN="$(get_env_var APP_DOMAIN "$ENV_FILE")"
if [[ "${SKIP_SSL:-0}" == "1" ]]; then
  write_nginx_site "$CHOSEN_PORT" "${DOMAIN:-_}"
  warn "SKIP_SSL=1 — config Nginx digenerate di deploy/generated/ saja"
else
  install_nginx_ssl "$CHOSEN_PORT" "$DOMAIN"
fi

step "Firewall hint..."
if command -v ufw >/dev/null 2>&1; then
  warn "Kalau UFW aktif: sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable"
fi

step "Selesai"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$DEPLOY_LOCK" 2>/dev/null || true
PUBLIC_URL="$(get_env_var NEXT_PUBLIC_APP_URL "$ENV_FILE")"

echo
echo -e "${C_GREEN}${C_BOLD}══════════════════════════════════════════════${C_RESET}"
echo -e "${C_GREEN}${C_BOLD}  LEDGERLY INSTALLED${C_RESET}"
echo -e "${C_GREEN}${C_BOLD}══════════════════════════════════════════════${C_RESET}"
echo
echo "  URL       : ${PUBLIC_URL}"
echo "  App port  : ${CHOSEN_PORT} (Nginx → 127.0.0.1)"
echo "  Database  : Neon (DATABASE_URL)"
echo "  Redis     : internal Docker"
echo
echo "  Setup     : buka URL → /setup"
echo "  Rebuild   : ./deploy.sh"
echo "  Update    : ./update.sh"
echo
ok "Data keuangan di Neon — aman meski VPS diganti."
