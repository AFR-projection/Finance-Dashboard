#!/usr/bin/env bash
# Shared helpers — Ledgerly Docker Deploy
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/.env"
ENV_EXAMPLE="${ROOT_DIR}/.env.example"
DEPLOY_LOCK="${ROOT_DIR}/.deployed"
GENERATED_DIR="${ROOT_DIR}/deploy/generated"

# Ports never used by Ledgerly (common on shared VPS / other stacks)
BLOCKED_PORTS="22 25 53 80 443 3306 5432 6379 8000 8080 8081 8443 27017 3000"

if [[ -t 1 ]]; then
  C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[0;31m'
  C_CYAN='\033[0;36m'; C_BOLD='\033[1m'; C_DIM='\033[2m'; C_RESET='\033[0m'
else
  C_GREEN=''; C_YELLOW=''; C_RED=''; C_CYAN=''; C_BOLD=''; C_DIM=''; C_RESET=''
fi

STEP=0
TOTAL_STEPS="${TOTAL_STEPS:-8}"

log()   { echo -e "${C_CYAN}➜${C_RESET} $*"; }
ok()    { echo -e "${C_GREEN}✔${C_RESET} $*"; }
warn()  { echo -e "${C_YELLOW}!${C_RESET} $*"; }
err()   { echo -e "${C_RED}✖${C_RESET} $*" >&2; }
die()   { err "$*"; exit 1; }
step()  { STEP=$((STEP + 1)); echo -e "\n${C_BOLD}[$STEP/$TOTAL_STEPS]${C_RESET} $*"; }

sudo_cmd() {
  if [[ "$(id -u)" -eq 0 ]]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  else die "Butuh root/sudo untuk: $*"
  fi
}

docker_bin() {
  if docker info >/dev/null 2>&1; then
    echo "docker"
  elif sudo_cmd docker info >/dev/null 2>&1; then
    echo "sudo docker"
  else
    die "Docker daemon tidak bisa diakses. Coba: newgrp docker  atau logout/login."
  fi
}

compose() {
  local db
  db="$(docker_bin)"
  if $db compose version >/dev/null 2>&1; then
    $db compose -f "$COMPOSE_FILE" --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    # shellcheck disable=SC2086
    $db-compose -f "$COMPOSE_FILE" --project-directory "$ROOT_DIR" "$@"
  else
    die "Docker Compose plugin tidak ditemukan"
  fi
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1 && (docker info >/dev/null 2>&1 || sudo_cmd docker info >/dev/null 2>&1); then
    ok "Docker OK: $(docker --version 2>/dev/null | head -n1 || echo installed)"
    return 0
  fi

  warn "Docker belum ada — install otomatis..."
  [[ -f /etc/os-release ]] || die "Auto-install Docker hanya untuk Linux (/etc/os-release)."
  # shellcheck disable=SC1091
  . /etc/os-release

  case "${ID:-}" in
    ubuntu|debian)
      sudo_cmd apt-get update -y
      sudo_cmd apt-get install -y ca-certificates curl gnupg
      sudo_cmd install -m 0755 -d /etc/apt/keyrings
      curl -fsSL "https://download.docker.com/linux/${ID}/gpg" | sudo_cmd gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      sudo_cmd chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
        | sudo_cmd tee /etc/apt/sources.list.d/docker.list >/dev/null
      sudo_cmd apt-get update -y
      sudo_cmd apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
      ;;
    *)
      die "Distro ${ID:-unknown}: install Docker manual dulu, lalu jalankan ulang ./deploy.sh"
      ;;
  esac

  sudo_cmd systemctl enable --now docker
  if [[ "$(id -u)" -ne 0 ]]; then
    sudo_cmd usermod -aG docker "$USER" || true
    warn "User ditambahkan ke group docker (penuh setelah logout/login). Sementara pakai sudo."
  fi
  ok "Docker terpasang"
}

rand_b64() { openssl rand -base64 32 2>/dev/null | tr -d '\n' || head -c 32 /dev/urandom | base64 | tr -d '\n'; }
rand_hex() { openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
rand_pass() { openssl rand -base64 24 2>/dev/null | tr -d '\n/+' | head -c 32; }

set_env_var() {
  local key="$1" value="$2" file="$3"
  local escaped
  escaped="$(printf '%s' "$value" | sed -e 's/[\/&|]/\\&/g')"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=\"${escaped}\"|" "$file"
    rm -f "${file}.bak"
  else
    printf '%s="%s"\n' "$key" "$value" >> "$file"
  fi
}

get_env_var() {
  local key="$1" file="$2"
  grep -E "^${key}=" "$file" 2>/dev/null | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true
}

load_dotenv() {
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^[A-Z0-9_]+=' "$ENV_FILE" | sed 's/\r$//' || true)
  set +a
}

port_in_use() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -H -tuln 2>/dev/null | grep -qE ":${p}([[:space:]]|$)" && return 0
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 && return 0
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -tuln 2>/dev/null | grep -qE ":${p}([[:space:]]|$)" && return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    # exit 0 = bind OK = free → port_in_use false
    if python3 -c "import socket,sys;s=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(('0.0.0.0',$p))" 2>/dev/null; then
      return 1
    fi
    return 0
  fi
  return 1
}

is_blocked_port() {
  local p="$1" b
  for b in $BLOCKED_PORTS; do
    [[ "$p" == "$b" ]] && return 0
  done
  return 1
}

# Prefer rare host ports so we don't collide with other websites / stacks.
# $1 = optional hard override from CLI (APP_PORT=7341 ./deploy.sh)
# Values already in .env are reused only if still free.
pick_free_port() {
  local override="${1:-}"
  local preferred existing p

  if [[ -n "$override" ]]; then
    is_blocked_port "$override" && die "APP_PORT=${override} terlarang (umum dipakai stack lain). Contoh aman: 3047, 5183, 7341"
    port_in_use "$override" && die "APP_PORT=${override} sedang dipakai. Biarkan kosong agar auto-pilih, atau pilih port lain."
    echo "$override"
    return
  fi

  # Reuse previous deploy port if still free (skip empty / placeholder)
  existing="$(get_env_var APP_PORT "$ENV_FILE" 2>/dev/null || true)"
  if [[ -n "$existing" && "$existing" != "auto" ]] && ! is_blocked_port "$existing" && ! port_in_use "$existing"; then
    echo "$existing"
    return
  fi
  if [[ -n "$existing" && "$existing" != "auto" ]] && port_in_use "$existing"; then
    warn "Port lama ${existing} sibuk — mencari port baru..."
  fi

  preferred="${APP_PORT_CANDIDATES:-3047 3184 4093 5183 6291 7341 8472 9127 9250 9411}"
  for p in $preferred; do
    is_blocked_port "$p" && continue
    if ! port_in_use "$p"; then
      echo "$p"
      return
    fi
    warn "Port $p sibuk — lanjut..."
  done

  for p in $(seq 3100 3199) $(seq 5100 5199) $(seq 7200 7299) $(seq 9100 9199); do
    is_blocked_port "$p" && continue
    if ! port_in_use "$p"; then
      echo "$p"
      return
    fi
  done

  die "Tidak ketemu port bebas. Set manual: APP_PORT=7341 ./deploy.sh"
}

detect_public_ip() {
  curl -4 -fsS --max-time 3 https://ifconfig.me 2>/dev/null \
    || curl -4 -fsS --max-time 3 https://api.ipify.org 2>/dev/null \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || echo "127.0.0.1"
}

# Create/refresh .env for Docker production (never clobber user secrets that look real).
prepare_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    [[ -f "$ENV_EXAMPLE" ]] || die ".env.example tidak ada — clone repo tidak lengkap?"
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    ok "Membuat .env dari .env.example"
  else
    ok ".env ditemukan"
  fi

  local v

  v="$(get_env_var AUTH_SECRET "$ENV_FILE")"
  if [[ -z "$v" || "$v" == "generate-with-openssl-rand-base64-32" ]]; then
    set_env_var AUTH_SECRET "$(rand_b64)" "$ENV_FILE"
    ok "AUTH_SECRET digenerate"
  fi

  v="$(get_env_var ENCRYPTION_KEY "$ENV_FILE")"
  if [[ -z "$v" || "$v" == "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" ]]; then
    set_env_var ENCRYPTION_KEY "$(rand_hex)" "$ENV_FILE"
    ok "ENCRYPTION_KEY digenerate"
  fi

  v="$(get_env_var WHATSAPP_WORKER_SECRET "$ENV_FILE")"
  if [[ -z "$v" || "$v" == "change-me-shared-secret" ]]; then
    set_env_var WHATSAPP_WORKER_SECRET "$(rand_hex)" "$ENV_FILE"
    ok "WHATSAPP_WORKER_SECRET digenerate"
  fi

  v="$(get_env_var POSTGRES_PASSWORD "$ENV_FILE")"
  if [[ -z "$v" || "$v" == "ledgerly_secret_change_me" ]]; then
    set_env_var POSTGRES_PASSWORD "$(rand_pass)" "$ENV_FILE"
    set_env_var POSTGRES_USER "ledgerly" "$ENV_FILE"
    set_env_var POSTGRES_DB "ledgerly" "$ENV_FILE"
    ok "POSTGRES_PASSWORD digenerate"
  fi

  [[ -n "$(get_env_var POSTGRES_USER "$ENV_FILE")" ]] || set_env_var POSTGRES_USER "ledgerly" "$ENV_FILE"
  [[ -n "$(get_env_var POSTGRES_DB "$ENV_FILE")" ]] || set_env_var POSTGRES_DB "ledgerly" "$ENV_FILE"

  set_env_var HOSTNAME "0.0.0.0" "$ENV_FILE"
  set_env_var WHATSAPP_AUTH_DIR "/data/wa-auth" "$ENV_FILE"
  set_env_var TELEGRAM_EMBEDDED "0" "$ENV_FILE"
  set_env_var SECURITY_LOG_DIR "./logs" "$ENV_FILE"

  load_dotenv
}

# Wire Docker-internal DB/Redis + public URL for chosen host port.
apply_docker_urls() {
  local port="$1"
  local pguser pgpass pgdb ip

  pguser="$(get_env_var POSTGRES_USER "$ENV_FILE")"; pguser="${pguser:-ledgerly}"
  pgpass="$(get_env_var POSTGRES_PASSWORD "$ENV_FILE")"
  pgdb="$(get_env_var POSTGRES_DB "$ENV_FILE")"; pgdb="${pgdb:-ledgerly}"

  set_env_var APP_PORT "$port" "$ENV_FILE"
  set_env_var DATABASE_URL "postgresql://${pguser}:${pgpass}@postgres:5432/${pgdb}" "$ENV_FILE"
  set_env_var REDIS_URL "redis://redis:6379" "$ENV_FILE"

  if [[ -n "${APP_DOMAIN:-}" ]]; then
    set_env_var NEXT_PUBLIC_APP_URL "https://${APP_DOMAIN}" "$ENV_FILE"
    set_env_var AUTH_URL "https://${APP_DOMAIN}" "$ENV_FILE"
    ok "Public URL: https://${APP_DOMAIN} → proxy ke :${port}"
  else
    ip="$(detect_public_ip)"
    set_env_var NEXT_PUBLIC_APP_URL "http://${ip}:${port}" "$ENV_FILE"
    set_env_var AUTH_URL "http://${ip}:${port}" "$ENV_FILE"
    warn "Tanpa domain — akses: http://${ip}:${port}"
  fi

  load_dotenv
}

check_required_env() {
  local db
  db="$(get_env_var DATABASE_URL "$ENV_FILE")"
  [[ -n "$db" && "$db" == *"@postgres:"* ]] || die "DATABASE_URL belum mengarah ke postgres Docker. Jalankan ulang ./deploy.sh"
}

wait_app_http() {
  local port="$1" i
  log "Menunggu app di :${port} (build pertama bisa 2–5 menit)..."
  for i in $(seq 1 120); do
    if curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
      ok "App sehat di port ${port}"
      return 0
    fi
    sleep 3
  done
  warn "Timeout health-check — cek: docker compose -f docker/docker-compose.yml logs --tail=100 app"
  return 1
}

write_proxy_helpers() {
  local port="$1"
  mkdir -p "$GENERATED_DIR"

  cat > "${GENERATED_DIR}/PORT.txt" <<EOF
LEDGERLY_HOST_PORT=${port}
EOF

  cat > "${GENERATED_DIR}/nginx-proxy-snippet.conf" <<EOF
# Ledgerly — tempel ke Nginx yang sudah ada di VPS
# Upstream: 127.0.0.1:${port}  (Socket.io wajib WebSocket)

# Di http {} (sekali saja):
# map \$http_upgrade \$connection_upgrade {
#     default upgrade;
#     '' close;
# }

server {
    listen 80;
    server_name ${APP_DOMAIN:-ledgerly.YOUR-DOMAIN.com};

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:${port};
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
        proxy_pass http://127.0.0.1:${port};
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

  cat > "${GENERATED_DIR}/README.md" <<EOF
# Ledgerly deploy

- **Host port:** \`${port}\`
- Postgres & Redis: internal Docker only (tidak publish ke host)
- Akses IP: \`http://SERVER_IP:${port}\`
- Nginx snippet: \`nginx-proxy-snippet.conf\`

\`\`\`bash
./redeploy.sh
./scripts/status.sh
./scripts/logs.sh app
./scripts/stop.sh
\`\`\`
EOF

  ok "Helper tertulis di deploy/generated/"
}

print_banner() {
  echo -e "${C_BOLD}"
  echo "╔════════════════════════════════════════════════════╗"
  echo "║   Ledgerly — satu perintah → production            ║"
  echo "║   Docker · auto port · aman di VPS shared          ║"
  echo "╚════════════════════════════════════════════════════╝"
  echo -e "${C_RESET}"
}
