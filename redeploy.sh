#!/usr/bin/env bash
#
# Ledgerly — Redeploy (Docker)
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
echo -e "${C_DIM}Docker upgrade · port & volume tetap aman${C_RESET}"
cd "$ROOT_DIR"

[[ -f "$ENV_FILE" ]] || die "Belum deploy. Jalankan ./deploy.sh dulu."

PORT="$(get_env_var APP_PORT "$ENV_FILE")"
PORT="${PORT:-3001}"

step "Pull kode..."
if [[ "$DO_PULL" -eq 1 && -d .git ]]; then
  git pull --ff-only && ok "updated" || warn "lanjut lokal"
else
  ok "skip pull"
fi

step "Load env..."
load_dotenv
# Keep docker-internal DB/redis URLs
pguser="$(get_env_var POSTGRES_USER "$ENV_FILE")"; pguser="${pguser:-ledgerly}"
pgpass="$(get_env_var POSTGRES_PASSWORD "$ENV_FILE")"
pgdb="$(get_env_var POSTGRES_DB "$ENV_FILE")"; pgdb="${pgdb:-ledgerly}"
set_env_var DATABASE_URL "postgresql://${pguser}:${pgpass}@postgres:5432/${pgdb}" "$ENV_FILE"
set_env_var REDIS_URL "redis://redis:6379" "$ENV_FILE"
load_dotenv

step "Rebuild & restart containers..."
compose up -d --build --remove-orphans
ok "Stack di-upgrade (volume postgres/redis/wa_auth tidak dihapus)"

step "Health-check port ${PORT}..."
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/login" >/dev/null 2>&1; then
    ok "App OK di :${PORT}"
    break
  fi
  [[ "$i" -eq 60 ]] && warn "Belum merespons — cek logs app"
  sleep 2
done

step "Selesai"
compose ps || true
echo
ok "Redeploy selesai"
echo "  Port tetap   : ${PORT}"
echo "  Proxy snippet: deploy/generated/nginx-proxy-snippet.conf"
echo "  WA logs      : docker compose -f docker/docker-compose.yml logs -f whatsapp-worker"
