#!/usr/bin/env bash
#
# ════════════════════════════════════════════════════════════════
#  Ledgerly — Docker Deploy (aman di VPS yang sudah ada project)
# ════════════════════════════════════════════════════════════════
#
#  Port host yang DIHINDARI (sudah dipakai di VPS kamu):
#    22, 80, 443, 3000, 8080, 8081
#
#  Port default Ledgerly: 3001 (auto-cari alternatif jika sibuk)
#  Postgres/Redis: INTERNAL Docker saja (tidak bentrok 5432/6379)
#
#  Usage:
#    chmod +x deploy.sh redeploy.sh scripts/*.sh
#    ./deploy.sh
#    APP_DOMAIN=finance.example.com ./deploy.sh
#    APP_PORT=3002 ./deploy.sh          # paksa port tertentu
#
set -euo pipefail

export TOTAL_STEPS=10
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/common.sh"

# Port candidates — skip yang user bilang sudah terpakai
BLOCKED_PORTS="22 80 443 3000 8080 8081"
CANDIDATE_PORTS="${APP_PORT_CANDIDATES:-3001 3002 5000 8082 9000}"

print_banner
echo -e "${C_DIM}Mode: Docker Compose · shared VPS friendly · 1 public port saja${C_RESET}"
cd "$ROOT_DIR"

port_in_use() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tuln 2>/dev/null | grep -qE ":${p}\\b" && return 0
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 && return 0
  fi
  # Fallback: try bind via bash /dev/tcp not reliable for listen check
  return 1
}

is_blocked() {
  local p="$1"
  for b in $BLOCKED_PORTS; do
    [[ "$p" == "$b" ]] && return 0
  done
  return 1
}

pick_free_port() {
  # Explicit override
  if [[ -n "${APP_PORT:-}" ]]; then
    if is_blocked "$APP_PORT"; then
      die "APP_PORT=${APP_PORT} termasuk port terlarang (22/80/443/3000/8080/8081). Pilih port lain."
    fi
    if port_in_use "$APP_PORT"; then
      die "APP_PORT=${APP_PORT} sedang dipakai. Coba: APP_PORT=3002 ./deploy.sh"
    fi
    echo "$APP_PORT"
    return
  fi

  local p
  for p in $CANDIDATE_PORTS; do
    is_blocked "$p" && continue
    if ! port_in_use "$p"; then
      echo "$p"
      return
    fi
    warn "Port $p sibuk — coba berikutnya..."
  done
  die "Tidak ada port bebas dari: $CANDIDATE_PORTS"
}

# ─── 1. Docker ────────────────────────────────────────────
step "Pastikan Docker tersedia..."
ensure_docker
ok "Docker siap"

# ─── 2. Pull ──────────────────────────────────────────────
step "Sinkron kode..."
if [[ "${SKIP_PULL:-0}" != "1" && -d .git ]]; then
  git pull --ff-only && ok "git pull OK" || warn "lanjut kode lokal"
else
  ok "Skip pull"
fi

# ─── 3. Pick port ─────────────────────────────────────────
step "Pilih port host yang belum dipakai..."
CHOSEN_PORT="$(pick_free_port)"
export APP_PORT="$CHOSEN_PORT"
ok "Port terpilih: ${C_BOLD}${CHOSEN_PORT}${C_RESET}"

# ─── 4. Env + secrets ─────────────────────────────────────
step "Siapkan .env & secrets..."
prepare_env
# Override URLs for Docker host port (workers talk to app via docker network)
set_env_var APP_PORT "$CHOSEN_PORT" "$ENV_FILE"
set_env_var REDIS_URL "redis://redis:6379" "$ENV_FILE"

pguser="$(get_env_var POSTGRES_USER "$ENV_FILE")"; pguser="${pguser:-ledgerly}"
pgpass="$(get_env_var POSTGRES_PASSWORD "$ENV_FILE")"
pgdb="$(get_env_var POSTGRES_DB "$ENV_FILE")"; pgdb="${pgdb:-ledgerly}"
# Internal docker DNS — app container pakai ini (compose juga inject)
set_env_var DATABASE_URL "postgresql://${pguser}:${pgpass}@postgres:5432/${pgdb}" "$ENV_FILE"

if [[ -n "${APP_DOMAIN:-}" ]]; then
  set_env_var NEXT_PUBLIC_APP_URL "https://${APP_DOMAIN}" "$ENV_FILE"
  set_env_var AUTH_URL "https://${APP_DOMAIN}" "$ENV_FILE"
  ok "Public URL: https://${APP_DOMAIN} → proxy ke :${CHOSEN_PORT}"
else
  ip="$(curl -4 -fsS --max-time 3 https://ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")"
  set_env_var NEXT_PUBLIC_APP_URL "http://${ip}:${CHOSEN_PORT}" "$ENV_FILE"
  set_env_var AUTH_URL "http://${ip}:${CHOSEN_PORT}" "$ENV_FILE"
  warn "Belum ada domain — akses sementara: http://${ip}:${CHOSEN_PORT}"
fi

load_dotenv
check_required_env
ok ".env siap"

# ─── 5. Build & up ────────────────────────────────────────
step "Build & start stack Docker (app + postgres + redis + bots)..."
compose up -d --build --remove-orphans
ok "Containers starting..."

# ─── 6. Wait healthy ──────────────────────────────────────
step "Tunggu app healthy..."
log "Ini bisa 1–3 menit (build pertama)..."
for i in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${CHOSEN_PORT}/login" >/dev/null 2>&1; then
    ok "App merespons di port ${CHOSEN_PORT}"
    break
  fi
  if [[ "$i" -eq 90 ]]; then
    warn "Timeout — cek logs:"
    echo "  docker compose -f docker/docker-compose.yml logs --tail=80 app"
  fi
  sleep 2
done

# ─── 7. Write helper files ────────────────────────────────
step "Tulis file panduan reverse proxy..."
mkdir -p deploy/generated
cat > "${ROOT_DIR}/deploy/generated/PORT.txt" <<EOF
LEDGERLY_HOST_PORT=${CHOSEN_PORT}
EOF

cat > "${ROOT_DIR}/deploy/generated/nginx-proxy-snippet.conf" <<EOF
# ══════════════════════════════════════════════════════════
#  Tempel ke Nginx YANG SUDAH ADA di VPS kamu
#  Ledgerly listen di: 127.0.0.1:${CHOSEN_PORT}
# ══════════════════════════════════════════════════════════

# Pastikan map ini ada di http {} (sekali saja di nginx.conf):
# map \$http_upgrade \$connection_upgrade {
#     default upgrade;
#     '' close;
# }

server {
    listen 80;
    server_name ${APP_DOMAIN:-finance.YOUR-DOMAIN.com};

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:${CHOSEN_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        proxy_buffering off;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:${CHOSEN_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        proxy_buffering off;
    }
}
EOF

cat > "${ROOT_DIR}/deploy/generated/README.md" <<EOF
# Ledgerly — Deploy Info

## Port yang dipakai

**Host port: \`${CHOSEN_PORT}\`**

Hanya port ini yang dibuka ke VPS.  
Postgres & Redis tetap **internal** Docker (tidak ganggu project lain).

## Akses cepat

- Langsung IP: \`http://SERVER_IP:${CHOSEN_PORT}\`
- Setelah domain + reverse proxy: \`https://your-domain\`

## Reverse proxy

Lihat file: \`nginx-proxy-snippet.conf\`  
Arahkan domain → \`http://127.0.0.1:${CHOSEN_PORT}\` (wajib WebSocket untuk Socket.io).

## Perintah berguna

\`\`\`bash
./redeploy.sh                                          # upgrade
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs -f app
docker compose -f docker/docker-compose.yml logs -f whatsapp-worker   # QR WA
\`\`\`
EOF

ok "Tersimpan di deploy/generated/"

# ─── 8. Status ────────────────────────────────────────────
step "Status containers..."
compose ps || true

# ─── 9–10. Summary ────────────────────────────────────────
step "Selesai"
echo
echo -e "${C_GREEN}${C_BOLD}══════════════════════════════════════════════${C_RESET}"
echo -e "${C_GREEN}${C_BOLD}  LEDGERLY LIVE${C_RESET}"
echo -e "${C_GREEN}${C_BOLD}══════════════════════════════════════════════${C_RESET}"
echo
echo -e "  ${C_BOLD}PORT HOST YANG DIPAKAI: ${CHOSEN_PORT}${C_RESET}"
echo
echo "  Akses sementara : http://SERVER_IP:${CHOSEN_PORT}"
if [[ -n "${APP_DOMAIN:-}" ]]; then
  echo "  Domain target   : https://${APP_DOMAIN}"
  echo "  → Proxy domain ke 127.0.0.1:${CHOSEN_PORT}"
fi
echo
echo "  Snippet Nginx   : deploy/generated/nginx-proxy-snippet.conf"
echo "  Info port       : deploy/generated/PORT.txt"
echo "  Panduan         : deploy/generated/README.md"
echo
echo "  WhatsApp QR     : docker compose -f docker/docker-compose.yml logs -f whatsapp-worker"
echo "  Upgrade nanti   : ./redeploy.sh"
echo
ok "Tidak memakai port 22/80/443/3000/8080/8081 — aman bersama project Docker lain."
