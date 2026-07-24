#!/usr/bin/env bash
#
# Ledgerly — produksi di VPS (Docker)
#
# Alur:
#   1) git clone … && cd ledgerly
#   2) cp .env.example .env   # opsional: isi TELEGRAM_BOT_TOKEN, APP_DOMAIN
#   3) chmod +x deploy.sh redeploy.sh scripts/*.sh
#   4) ./deploy.sh
#
# Script otomatis:
#   • install Docker jika belum ada
#   • generate secrets yang masih placeholder
#   • pilih port host yang BELUM dipakai (hindari 22/80/443/3000/8080/…)
#   • Postgres + Redis internal (tidak publish — aman bareng project lain)
#   • build & up app + bot workers
#
# Opsi:
#   APP_DOMAIN=finance.example.com ./deploy.sh
#   APP_PORT=7341 ./deploy.sh          # paksa port
#   SKIP_PULL=1 ./deploy.sh
#
set -euo pipefail

export TOTAL_STEPS=8
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"

print_banner
echo -e "${C_DIM}clone → .env → ./deploy.sh  ·  1 port publik · DB/Redis internal${C_RESET}"
cd "$ROOT_DIR"

# Capture CLI override BEFORE prepare_env/load_dotenv fills APP_PORT from file
PORT_OVERRIDE="${APP_PORT:-}"

# ─── 1. Docker ────────────────────────────────────────────
step "Pastikan Docker siap..."
ensure_docker

# ─── 2. Kode ──────────────────────────────────────────────
step "Sinkron kode..."
if [[ "${SKIP_PULL:-0}" != "1" && -d .git ]]; then
  git pull --ff-only && ok "git pull OK" || warn "lanjut dengan kode lokal"
else
  ok "Skip pull"
fi

# ─── 3. .env + secrets ────────────────────────────────────
step "Siapkan .env & secrets..."
prepare_env

# ─── 4. Port otomatis ─────────────────────────────────────
step "Pilih port host yang belum dipakai..."
CHOSEN_PORT="$(pick_free_port "$PORT_OVERRIDE")"
ok "Port terpilih: ${C_BOLD}${CHOSEN_PORT}${C_RESET}"

# ─── 5. URL Docker ────────────────────────────────────────
step "Wire DATABASE_URL / REDIS_URL / public URL..."
apply_docker_urls "$CHOSEN_PORT"
check_required_env
ok ".env siap untuk Docker"

# ─── 6. Build & up ────────────────────────────────────────
step "Build & start stack (app + postgres + redis + bots)..."
compose up -d --build --remove-orphans
ok "Containers starting..."

# ─── 7. Health ────────────────────────────────────────────
step "Health-check..."
wait_app_http "$CHOSEN_PORT" || true
compose ps || true

# ─── 8. Helper + summary ──────────────────────────────────
step "Tulis panduan reverse proxy..."
write_proxy_helpers "$CHOSEN_PORT"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$DEPLOY_LOCK" 2>/dev/null || true

PUBLIC_URL="$(get_env_var NEXT_PUBLIC_APP_URL "$ENV_FILE")"

echo
echo -e "${C_GREEN}${C_BOLD}══════════════════════════════════════════════${C_RESET}"
echo -e "${C_GREEN}${C_BOLD}  LEDGERLY LIVE${C_RESET}"
echo -e "${C_GREEN}${C_BOLD}══════════════════════════════════════════════${C_RESET}"
echo
echo -e "  ${C_BOLD}Port host : ${CHOSEN_PORT}${C_RESET}"
echo -e "  URL      : ${PUBLIC_URL}"
echo
echo "  Setup owner : buka URL → /setup (Telegram / WhatsApp)"
echo "  Nginx       : deploy/generated/nginx-proxy-snippet.conf"
echo "  Port file   : deploy/generated/PORT.txt"
echo
echo "  Upgrade     : ./redeploy.sh"
echo "  Status      : ./scripts/status.sh"
echo "  Logs        : ./scripts/logs.sh app"
echo "  WA QR       : ./scripts/logs.sh whatsapp-worker"
echo
ok "Postgres/Redis tidak di-publish — tidak bentrok project Docker lain."
