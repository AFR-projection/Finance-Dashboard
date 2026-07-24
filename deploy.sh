#!/usr/bin/env bash
#
# Ledgerly — rebuild & restart (TANPA git pull)
# Pakai .env yang sudah ada. Cocok setelah edit env / fix lokal.
#
#   ./deploy.sh
#   APP_PORT=7341 ./deploy.sh
#
set -euo pipefail

cd "$(dirname "$0")" || exit 1
ROOT_DIR="$(pwd)"

export TOTAL_STEPS=5
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"
cd "$ROOT_DIR" || exit 1

print_banner
echo -e "${C_DIM}Rebuild stack · no git pull · keep .env${C_RESET}"
log "Working directory: ${ROOT_DIR}"
log "Compose file: ${COMPOSE_FILE}"

PORT_OVERRIDE="${APP_PORT:-}"

step "Validasi .env..."
[[ -f "$ENV_FILE" ]] || die "Belum ada .env — cp .env.example .env atau jalankan ./install.sh"
prepare_env_secrets
validate_neon_database_url

step "Port..."
CHOSEN_PORT="$(pick_free_port "$PORT_OVERRIDE")"
ok "Port: ${CHOSEN_PORT}"
apply_runtime_urls "$CHOSEN_PORT"

step "Rebuild containers..."
stack_up_build

step "Health-check..."
wait_app_http "$CHOSEN_PORT" || true
DOMAIN="$(get_env_var APP_DOMAIN "$ENV_FILE")"
write_nginx_site "$CHOSEN_PORT" "${DOMAIN:-_}"

step "Selesai"
compose ps || true
echo
ok "Deploy selesai — ${C_BOLD}$(get_env_var NEXT_PUBLIC_APP_URL "$ENV_FILE")${C_RESET}"
echo "  Update versi dari git: ./update.sh"
