#!/usr/bin/env bash
#
# Ledgerly — upgrade tanpa ganti port / volume
#   ./redeploy.sh
#   ./redeploy.sh --no-pull
#
set -euo pipefail

export TOTAL_STEPS=5
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"

DO_PULL=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) DO_PULL=0 ;;
    -h|--help) echo "Usage: ./redeploy.sh [--no-pull]"; exit 0 ;;
  esac
done

print_banner
echo -e "${C_DIM}Upgrade stack · port & volume tetap${C_RESET}"
cd "$ROOT_DIR"

[[ -f "$ENV_FILE" ]] || die "Belum ada .env — jalankan ./deploy.sh dulu."

PORT="$(get_env_var APP_PORT "$ENV_FILE")"
PORT="${PORT:-}"
[[ -n "$PORT" ]] || die "APP_PORT kosong di .env — jalankan ./deploy.sh dulu."

step "Pull kode..."
if [[ "$DO_PULL" -eq 1 && -d .git ]]; then
  git pull --ff-only && ok "updated" || warn "lanjut lokal"
else
  ok "skip pull"
fi

step "Refresh Docker URLs..."
apply_docker_urls "$PORT"

step "Rebuild & restart..."
compose up -d --build --remove-orphans
ok "Stack di-upgrade (volume postgres/redis/wa_auth aman)"

step "Health-check :${PORT}..."
wait_app_http "$PORT" || true
write_proxy_helpers "$PORT"

step "Selesai"
compose ps || true
echo
ok "Redeploy selesai — port tetap ${PORT}"
echo "  URL : $(get_env_var NEXT_PUBLIC_APP_URL "$ENV_FILE")"
