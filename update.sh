#!/usr/bin/env bash
#
# Ledgerly — update versi aman
#
#   cd /opt/ledgerly && ./update.sh
#
# Otomatis: git pull → backup .env → rebuild → prisma db push (entrypoint) → health
#
set -euo pipefail

cd "$(dirname "$0")" || exit 1
ROOT_DIR="$(pwd)"

export TOTAL_STEPS=6
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"
cd "$ROOT_DIR" || exit 1

DO_PULL=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) DO_PULL=0 ;;
    -h|--help) echo "Usage: ./update.sh [--no-pull]"; exit 0 ;;
  esac
done

print_banner
echo -e "${C_DIM}Safe update · git pull · backup .env · Neon schema sync${C_RESET}"
log "Working directory: ${ROOT_DIR}"
log "Compose file: ${COMPOSE_FILE}"

[[ -f "$ENV_FILE" ]] || die "Belum ada .env — jalankan ./install.sh dulu."

step "Backup .env..."
backup_env

step "Pull kode..."
if [[ "$DO_PULL" -eq 1 && -d .git ]]; then
  git pull --ff-only || die "git pull gagal. Perbaiki konflik/koneksi, atau pilih eksplisit: ./update.sh --no-pull"
  ok "git pull OK"
else
  ok "Skip pull"
fi

[[ -f "$ENV_FILE" ]] || die ".env hilang setelah pull — restore dari .env-backups/"

step "Validasi Neon + secrets..."
prepare_env_secrets
validate_neon_database_url

PORT="$(get_env_var APP_PORT "$ENV_FILE")"
if [[ -z "$PORT" || "$PORT" == "auto" ]]; then
  PORT="$(pick_free_port "")"
else
  ok "Reuse APP_PORT=${PORT}"
fi
apply_runtime_urls "$PORT"

step "Rebuild & restart..."
stack_up_build
ok "Schema sync via entrypoint (prisma db push → Neon)"

step "Health-check..."
wait_app_http "$PORT"
DOMAIN="$(get_env_var APP_DOMAIN "$ENV_FILE")"
write_nginx_site "$PORT" "${DOMAIN:-_}"
if [[ -n "$DOMAIN" && -f "$NGINX_SITE_AVAILABLE" ]]; then
  sync_nginx_upstream "$PORT" "$DOMAIN"
fi

step "Selesai"
compose ps || true
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$DEPLOY_LOCK" 2>/dev/null || true
echo
ok "Update selesai"
echo "  URL     : $(get_env_var NEXT_PUBLIC_APP_URL "$ENV_FILE")"
echo "  Backup  : .env-backups/"
echo "  Logs    : ./scripts/logs.sh app"
