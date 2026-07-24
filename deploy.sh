#!/usr/bin/env bash
#
# Ledgerly — rebuild & restart (TANPA git pull)
# Pakai .env yang sudah ada. Cocok setelah edit env / fix lokal.
#
#   ./deploy.sh
#   APP_PORT=7341 ./deploy.sh
#
set -euo pipefail

export TOTAL_STEPS=5
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"

print_banner
echo -e "${C_DIM}Rebuild stack · no git pull · keep .env${C_RESET}"
cd "$ROOT_DIR"

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
