#!/usr/bin/env bash
#
# Ledgerly — update versi aman
#
#   cd /opt/ledgerly && ./update.sh
#
# Otomatis: git pull → backup .env → rebuild → prisma db push (entrypoint) → health
#
set -euo pipefail

export TOTAL_STEPS=6
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"

DO_PULL=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) DO_PULL=0 ;;
    -h|--help) echo "Usage: ./update.sh [--no-pull]"; exit 0 ;;
  esac
done

print_banner
echo -e "${C_DIM}Safe update · git pull · backup .env · Neon schema sync${C_RESET}"
cd "$ROOT_DIR"

[[ -f "$ENV_FILE" ]] || die "Belum ada .env — jalankan ./install.sh dulu."

step "Backup .env..."
backup_env

step "Pull kode..."
if [[ "$DO_PULL" -eq 1 && -d .git ]]; then
  # Jaga .env tidak tertimpa
  git pull --ff-only && ok "git pull OK" || warn "git pull gagal — lanjut kode lokal"
else
  ok "Skip pull"
fi

# Pastikan .env masih ada setelah pull
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
# Schema sync: docker/entrypoint.sh menjalankan prisma db push ke Neon
ok "Schema sync via entrypoint (prisma db push → Neon)"

step "Health-check..."
wait_app_http "$PORT" || true
DOMAIN="$(get_env_var APP_DOMAIN "$ENV_FILE")"
write_nginx_site "$PORT" "${DOMAIN:-_}"
# Refresh nginx upstream port if site already installed
if [[ -n "$DOMAIN" && -f "$NGINX_SITE_AVAILABLE" ]]; then
  sudo_cmd cp "${GENERATED_DIR}/nginx-ledgerly.conf" "$NGINX_SITE_AVAILABLE" 2>/dev/null || true
  sudo_cmd nginx -t 2>/dev/null && sudo_cmd systemctl reload nginx 2>/dev/null || true
fi

step "Selesai"
compose ps || true
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$DEPLOY_LOCK" 2>/dev/null || true
echo
ok "Update selesai"
echo "  URL     : $(get_env_var NEXT_PUBLIC_APP_URL "$ENV_FILE")"
echo "  Backup  : .env-backups/"
echo "  Logs    : ./scripts/logs.sh app"
