#!/usr/bin/env bash
# Shared helpers — Ledgerly (Neon + Docker + Nginx)
set -euo pipefail

# Caller (install/deploy/update) may already set ROOT_DIR after cd ke project root.
# Fallback: parent of scripts/
_LEDGERLY_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "${_LEDGERLY_SCRIPTS_DIR}/.." && pwd)}"
COMPOSE_FILE="${ROOT_DIR}/docker/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/.env"
ENV_EXAMPLE="${ROOT_DIR}/.env.example"
DEPLOY_LOCK="${ROOT_DIR}/.deployed"
GENERATED_DIR="${ROOT_DIR}/deploy/generated"
ENV_BACKUP_DIR="${ROOT_DIR}/.env-backups"
NGINX_SITE_AVAILABLE="/etc/nginx/sites-available/ledgerly"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/ledgerly"

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
    die "Docker daemon tidak bisa diakses. Coba: newgrp docker atau logout/login."
  fi
}

compose() {
  local db
  db="$(docker_bin)"
  # Pastikan CWD = project root + path absolut (hindari resolve ke /opt/docker)
  cd "$ROOT_DIR" || die "Tidak bisa cd ke ROOT_DIR=$ROOT_DIR"
  [[ -f "$COMPOSE_FILE" ]] || die "Compose file tidak ditemukan: $COMPOSE_FILE"
  [[ -f "$ENV_FILE" ]] || die ".env tidak ada — cp .env.example .env lalu isi DATABASE_URL Neon"
  if $db compose version >/dev/null 2>&1; then
    $db compose \
      -f "$COMPOSE_FILE" \
      --project-directory "$ROOT_DIR" \
      --env-file "$ENV_FILE" \
      "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    # shellcheck disable=SC2086
    $db-compose \
      -f "$COMPOSE_FILE" \
      --project-directory "$ROOT_DIR" \
      --env-file "$ENV_FILE" \
      "$@"
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
  [[ -f /etc/os-release ]] || die "Auto-install Docker hanya untuk Linux."
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
      die "Distro ${ID:-unknown}: install Docker manual, lalu ulang script."
      ;;
  esac

  sudo_cmd systemctl enable --now docker
  if [[ "$(id -u)" -ne 0 ]]; then
    sudo_cmd usermod -aG docker "$USER" || true
    warn "User ditambah ke group docker (penuh setelah logout/login)."
  fi
  ok "Docker terpasang"
}

ensure_nginx_certbot() {
  if ! command -v nginx >/dev/null 2>&1; then
    log "Install Nginx..."
    sudo_cmd apt-get update -y
    sudo_cmd apt-get install -y nginx
  fi
  if ! command -v certbot >/dev/null 2>&1; then
    log "Install Certbot..."
    sudo_cmd apt-get install -y certbot python3-certbot-nginx
  fi
  ok "Nginx + Certbot siap"
}

rand_b64() { openssl rand -base64 32 2>/dev/null | tr -d '\n' || head -c 32 /dev/urandom | base64 | tr -d '\n'; }
rand_hex() { openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

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
  die "load_dotenv is disabled: .env is not a shell script"
}

secure_env_file() {
  [[ -f "$ENV_FILE" ]] || return 0
  chmod 600 "$ENV_FILE" || die "Tidak bisa mengamankan permission .env"
}

validate_port() {
  local port="$1"
  [[ "$port" =~ ^[0-9]+$ ]] || die "APP_PORT harus angka (1024-65535), bukan: ${port}"
  (( port >= 1024 && port <= 65535 )) || die "APP_PORT harus di rentang 1024-65535"
}

validate_domain() {
  local domain="$1"
  local label
  [[ ${#domain} -le 253 ]] || die "APP_DOMAIN terlalu panjang"
  [[ "$domain" == *.* ]] || die "APP_DOMAIN harus FQDN, contoh: finance.example.com"
  IFS='.' read -r -a labels <<< "$domain"
  for label in "${labels[@]}"; do
    [[ ${#label} -ge 1 && ${#label} -le 63 ]] || die "Label APP_DOMAIN tidak valid: ${domain}"
    [[ "$label" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$ ]] \
      || die "APP_DOMAIN tidak valid: ${domain}"
  done
}

port_in_use() {
  local p="$1"
  validate_port "$p"
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
    if python3 -c "import socket;s=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(('0.0.0.0',$p))" 2>/dev/null; then
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

# $1 = optional CLI override
pick_free_port() {
  local override="${1:-}"
  local preferred existing p

  if [[ -n "$override" && "$override" != "auto" ]]; then
    validate_port "$override"
    is_blocked_port "$override" && die "APP_PORT=${override} terlarang. Contoh aman: 3047, 5183, 7341"
    port_in_use "$override" && die "APP_PORT=${override} sedang dipakai."
    echo "$override"
    return
  fi

  existing="$(get_env_var APP_PORT "$ENV_FILE" 2>/dev/null || true)"
  if [[ -n "$existing" && "$existing" != "auto" ]] && ! is_blocked_port "$existing" && ! port_in_use "$existing"; then
    echo "$existing"
    return
  fi
  if [[ -n "$existing" && "$existing" != "auto" ]] && port_in_use "$existing"; then
    # Jika port dipakai oleh container ledgerly sendiri, tetap reuse
    if compose ps --status running 2>/dev/null | grep -q "ledgerly"; then
      echo "$existing"
      return
    fi
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

  die "Tidak ketemu port bebas. Set: APP_PORT=7341"
}

detect_public_ip() {
  curl -4 -fsS --max-time 3 https://ifconfig.me 2>/dev/null \
    || curl -4 -fsS --max-time 3 https://api.ipify.org 2>/dev/null \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || echo "127.0.0.1"
}

validate_neon_database_url() {
  local db
  db="$(get_env_var DATABASE_URL "$ENV_FILE")"
  [[ -n "$db" ]] || die "DATABASE_URL kosong di .env — paste connection string Neon (1 baris utuh)."
  [[ "$db" != *"user:password@host"* ]] || die "DATABASE_URL masih placeholder — ganti dengan Neon."
  [[ "$db" != *"@postgres:"* && "$db" != *"@postgres/"* ]] || die "DATABASE_URL mengarah ke Postgres Docker internal. Wajib Neon eksternal."
  [[ "$db" == postgresql://* || "$db" == postgres://* ]] || die "DATABASE_URL harus postgresql://… (Neon)."
  ok "DATABASE_URL Neon / eksternal valid"
}

# Generate secrets; keep Neon DATABASE_URL untouched.
prepare_env_secrets() {
  [[ -f "$ENV_FILE" ]] || die ".env tidak ada. Jalankan: cp .env.example .env && nano .env"
  secure_env_file

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

  set_env_var HOSTNAME "0.0.0.0" "$ENV_FILE"
  set_env_var WHATSAPP_AUTH_DIR "/data/wa-auth" "$ENV_FILE"
  set_env_var TELEGRAM_EMBEDDED "0" "$ENV_FILE"
  set_env_var REDIS_URL "redis://redis:6379" "$ENV_FILE"
  secure_env_file
}

apply_runtime_urls() {
  local port="$1"
  local domain ip

  validate_port "$port"

  set_env_var APP_PORT "$port" "$ENV_FILE"
  set_env_var REDIS_URL "redis://redis:6379" "$ENV_FILE"

  domain="${APP_DOMAIN:-$(get_env_var APP_DOMAIN "$ENV_FILE")}"
  if [[ -n "$domain" && "$domain" != "your.domain.com" ]]; then
    validate_domain "$domain"
    set_env_var APP_DOMAIN "$domain" "$ENV_FILE"
    set_env_var NEXT_PUBLIC_APP_URL "https://${domain}" "$ENV_FILE"
    set_env_var AUTH_URL "https://${domain}" "$ENV_FILE"
    # Nginx yang menghadap publik — app cukup didengar dari loopback.
    set_env_var APP_BIND "127.0.0.1" "$ENV_FILE"
    ok "Public URL: https://${domain}"
  else
    ip="$(detect_public_ip)"
    set_env_var NEXT_PUBLIC_APP_URL "http://${ip}:${port}" "$ENV_FILE"
    set_env_var AUTH_URL "http://${ip}:${port}" "$ENV_FILE"
    # Belum ada domain — port harus terbuka agar bisa diakses via IP.
    set_env_var APP_BIND "0.0.0.0" "$ENV_FILE"
    warn "Tanpa domain — sementara: http://${ip}:${port}"
    warn "Port ${port} terbuka ke internet. Isi APP_DOMAIN lalu ./update.sh untuk menutupnya."
  fi

  secure_env_file
}

backup_env() {
  mkdir -p "$ENV_BACKUP_DIR"
  chmod 700 "$ENV_BACKUP_DIR" || die "Tidak bisa mengamankan ${ENV_BACKUP_DIR}"
  local stamp dest
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  dest="${ENV_BACKUP_DIR}/.env.${stamp}"
  cp "$ENV_FILE" "$dest"
  chmod 600 "$dest" || die "Tidak bisa mengamankan backup .env"
  ok "Backup .env → ${dest}"
}

wait_app_http() {
  local port="$1" i
  log "Menunggu app :${port}/api/health …"
  for i in $(seq 1 120); do
    if curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
      ok "App sehat di port ${port}"
      return 0
    fi
    sleep 3
  done
  warn "Timeout — cek: ./scripts/logs.sh app"
  return 1
}

write_nginx_site() {
  local port="$1"
  local domain="$2"
  mkdir -p "$GENERATED_DIR"

  cat > "${GENERATED_DIR}/nginx-ledgerly.conf" <<EOF
# Generated by Ledgerly install.sh — do not edit by hand (re-run install/update)
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    '' close;
}

upstream ledgerly_upstream {
    server 127.0.0.1:${port};
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    client_max_body_size 20M;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location / {
        proxy_pass http://ledgerly_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_buffering off;
    }

    location /socket.io/ {
        proxy_pass http://ledgerly_upstream;
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

    access_log /var/log/nginx/ledgerly.access.log;
    error_log  /var/log/nginx/ledgerly.error.log;
}
EOF

  echo "LEDGERLY_HOST_PORT=${port}" > "${GENERATED_DIR}/PORT.txt"
  ok "Nginx config → deploy/generated/nginx-ledgerly.conf"
}

# Only change the active upstream. Copying the generated HTTP template over the
# active site would erase the TLS directives maintained by Certbot.
sync_nginx_upstream() {
  local port="$1" domain="${2:-}"
  local backup="${NGINX_SITE_AVAILABLE}.ledgerly-backup"

  [[ -f "$NGINX_SITE_AVAILABLE" ]] || {
    warn "Site Nginx belum terpasang; config hanya tersedia di deploy/generated/"
    return 0
  }

  if [[ -n "$domain" && "$domain" != "_" ]]; then
    validate_domain "$domain"
    sudo_cmd grep -qE "^[[:space:]]*server_name[[:space:]]+${domain//./\\.};" "$NGINX_SITE_AVAILABLE" \
      || die "APP_DOMAIN berubah. Jalankan ./install.sh agar sertifikat domain baru dibuat dengan aman."
  fi

  sudo_cmd cp "$NGINX_SITE_AVAILABLE" "$backup"
  if ! sudo_cmd sed -i -E "s/server 127\\.0\\.0\\.1:[0-9]+;/server 127.0.0.1:${port};/" "$NGINX_SITE_AVAILABLE"; then
    sudo_cmd cp "$backup" "$NGINX_SITE_AVAILABLE"
    die "Gagal memperbarui upstream Nginx"
  fi
  if ! sudo_cmd grep -q "server 127.0.0.1:${port};" "$NGINX_SITE_AVAILABLE"; then
    sudo_cmd cp "$backup" "$NGINX_SITE_AVAILABLE"
    die "Upstream Nginx tidak ditemukan; konfigurasi lama dipulihkan"
  fi
  if ! sudo_cmd nginx -t; then
    sudo_cmd cp "$backup" "$NGINX_SITE_AVAILABLE"
    sudo_cmd nginx -t || true
    die "Konfigurasi Nginx tidak valid; konfigurasi lama dipulihkan"
  fi
  sudo_cmd systemctl reload nginx
  sudo_cmd rm -f "$backup"
  ok "Nginx mempertahankan TLS dan mengarah ke 127.0.0.1:${port}"
}

install_nginx_ssl() {
  local port="$1"
  local domain="$2"

  [[ -n "$domain" && "$domain" != "your.domain.com" ]] || {
    warn "APP_DOMAIN kosong — skip Nginx/SSL. Akses via http://IP:${port}"
    return 0
  }

  ensure_nginx_certbot
  write_nginx_site "$port" "$domain"

  sudo_cmd cp "${GENERATED_DIR}/nginx-ledgerly.conf" "$NGINX_SITE_AVAILABLE"
  sudo_cmd ln -sf "$NGINX_SITE_AVAILABLE" "$NGINX_SITE_ENABLED"
  sudo_cmd nginx -t
  sudo_cmd systemctl reload nginx
  ok "Nginx proxy → 127.0.0.1:${port}"

  log "Minta sertifikat Let's Encrypt untuk ${domain}…"
  if ! sudo_cmd certbot --nginx -d "$domain" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
    err "Certbot gagal. Pastikan DNS A/AAAA sudah mengarah ke VPS, lalu jalankan ./install.sh lagi."
    return 1
  fi
  ok "HTTPS aktif: https://${domain}"
}

print_banner() {
  echo -e "${C_BOLD}"
  echo "╔════════════════════════════════════════════════════╗"
  echo "║   Ledgerly — Neon DB · Docker · Nginx/SSL          ║"
  echo "╚════════════════════════════════════════════════════╝"
  echo -e "${C_RESET}"
}

stack_up_build() {
  log "Build & start containers (app + redis + workers)…"
  compose up -d --build --remove-orphans
  ok "Stack starting"
}
