#!/usr/bin/env bash
# Shared helpers — Ledgerly Autopilot Deploy
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/.env"
ENV_EXAMPLE="${ROOT_DIR}/.env.example"
DEPLOY_LOCK="${ROOT_DIR}/.deployed"

if [[ -t 1 ]]; then
  C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[0;31m'
  C_CYAN='\033[0;36m'; C_BOLD='\033[1m'; C_DIM='\033[2m'; C_RESET='\033[0m'
else
  C_GREEN=''; C_YELLOW=''; C_RED=''; C_CYAN=''; C_BOLD=''; C_DIM=''; C_RESET=''
fi

STEP=0
TOTAL_STEPS="${TOTAL_STEPS:-12}"

log()   { echo -e "${C_CYAN}➜${C_RESET} $*"; }
ok()    { echo -e "${C_GREEN}✔${C_RESET} $*"; }
warn()  { echo -e "${C_YELLOW}!${C_RESET} $*"; }
err()   { echo -e "${C_RED}✖${C_RESET} $*" >&2; }
die()   { err "$*"; exit 1; }
step()  { STEP=$((STEP + 1)); echo -e "\n${C_BOLD}[$STEP/$TOTAL_STEPS]${C_RESET} $*"; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Command not found: $1"; }

sudo_cmd() {
  if [[ "$(id -u)" -eq 0 ]]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  else die "Butuh root/sudo untuk: $*"
  fi
}

# Docker may need sudo right after install (before re-login)
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

  warn "Menginstall Docker Engine otomatis..."
  [[ -f /etc/os-release ]] || die "Hanya mendukung Linux dengan /etc/os-release"
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
      die "Distro ${ID:-unknown} belum di-support auto-install Docker. Install manual dulu."
      ;;
  esac

  sudo_cmd systemctl enable --now docker
  if [[ "$(id -u)" -ne 0 ]]; then
    sudo_cmd usermod -aG docker "$USER" || true
    warn "User ditambahkan ke group docker (aktif penuh setelah logout/login)."
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
  # Export key vars for child processes (compose interpolation)
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^[A-Z0-9_]+=' "$ENV_FILE" | sed 's/\r$//' || true)
  set +a
}

prepare_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    [[ -f "$ENV_EXAMPLE" ]] || die ".env.example tidak ada"
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    ok "Membuat .env dari template"
  else
    ok ".env sudah ada — secrets yang valid tidak ditimpa"
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
    local pgpass
    pgpass="$(rand_pass)"
    set_env_var POSTGRES_PASSWORD "$pgpass" "$ENV_FILE"
    set_env_var POSTGRES_USER "ledgerly" "$ENV_FILE"
    set_env_var POSTGRES_DB "ledgerly" "$ENV_FILE"
    set_env_var POSTGRES_PORT "5432" "$ENV_FILE"
    ok "POSTGRES_PASSWORD digenerate (kuat)"
  fi

  # PM2 jalan di host → Redis/Postgres via localhost
  set_env_var REDIS_URL "redis://127.0.0.1:6379" "$ENV_FILE"
  set_env_var WHATSAPP_AUTH_DIR "${ROOT_DIR}/workers/.wa-auth" "$ENV_FILE"
  set_env_var SECURITY_LOG_DIR "${ROOT_DIR}/logs" "$ENV_FILE"
  set_env_var HOSTNAME "0.0.0.0" "$ENV_FILE"
  if [[ -z "$(get_env_var APP_PORT "$ENV_FILE")" ]]; then
    set_env_var APP_PORT "3000" "$ENV_FILE"
  fi

  local pguser pgpass pgdb pgport
  pguser="$(get_env_var POSTGRES_USER "$ENV_FILE")"; pguser="${pguser:-ledgerly}"
  pgpass="$(get_env_var POSTGRES_PASSWORD "$ENV_FILE")"
  pgdb="$(get_env_var POSTGRES_DB "$ENV_FILE")"; pgdb="${pgdb:-ledgerly}"
  pgport="$(get_env_var POSTGRES_PORT "$ENV_FILE")"; pgport="${pgport:-5432}"

  local local_db="postgresql://${pguser}:${pgpass}@127.0.0.1:${pgport}/${pgdb}"
  local current_db
  current_db="$(get_env_var DATABASE_URL "$ENV_FILE")"
  if [[ -z "$current_db" || "$current_db" == *"user:password@host"* || "$current_db" == *"ledgerly_secret_change_me"* ]]; then
    set_env_var DATABASE_URL "$local_db" "$ENV_FILE"
    ok "DATABASE_URL → Postgres lokal VPS"
  fi

  if [[ -n "${APP_DOMAIN:-}" ]]; then
    set_env_var NEXT_PUBLIC_APP_URL "https://${APP_DOMAIN}" "$ENV_FILE"
    set_env_var AUTH_URL "https://${APP_DOMAIN}" "$ENV_FILE"
    ok "Domain: https://${APP_DOMAIN}"
  else
    local app_url
    app_url="$(get_env_var NEXT_PUBLIC_APP_URL "$ENV_FILE")"
    if [[ -z "$app_url" || "$app_url" == "http://localhost:3000" ]]; then
      # Detect public IP for first boot convenience
      local ip
      ip="$(curl -4 -fsS --max-time 3 https://ifconfig.me 2>/dev/null || curl -4 -fsS --max-time 3 https://api.ipify.org 2>/dev/null || echo "")"
      if [[ -n "$ip" ]]; then
        set_env_var NEXT_PUBLIC_APP_URL "http://${ip}:3000" "$ENV_FILE"
        set_env_var AUTH_URL "http://${ip}:3000" "$ENV_FILE"
        warn "Belum ada APP_DOMAIN — sementara pakai http://${ip}:3000"
        warn "Produksi: APP_DOMAIN=finance.example.com ./deploy.sh"
      fi
    fi
  fi

  load_dotenv
}

check_required_env() {
  local db
  db="$(get_env_var DATABASE_URL "$ENV_FILE")"
  [[ -n "$db" && "$db" != *"user:password@host"* ]] || die "DATABASE_URL belum valid di .env"
}

wait_postgres() {
  log "Menunggu Postgres healthy..."
  local i
  for i in $(seq 1 60); do
    if compose exec -T postgres pg_isready -U "$(get_env_var POSTGRES_USER "$ENV_FILE" || echo ledgerly)" >/dev/null 2>&1; then
      ok "Postgres ready"
      return 0
    fi
    sleep 2
  done
  die "Postgres tidak siap. Cek: $(docker_bin) compose -f docker/docker-compose.yml logs postgres"
}

wait_redis() {
  log "Menunggu Redis..."
  local i
  for i in $(seq 1 30); do
    if (command -v redis-cli >/dev/null 2>&1 && redis-cli -h 127.0.0.1 ping 2>/dev/null | grep -q PONG) \
      || compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
      ok "Redis ready"
      return 0
    fi
    sleep 1
  done
  warn "Redis belum merespons ping — lanjut (app tetap bisa fallback memory)"
}

wait_healthy() {
  local port
  port="$(get_env_var APP_PORT "$ENV_FILE")"
  port="${port:-3000}"
  log "Health-check app :${port} ..."
  local i
  for i in $(seq 1 90); do
    if curl -fsS "http://127.0.0.1:${port}/login" >/dev/null 2>&1 \
      || curl -fsS "http://127.0.0.1:${port}" >/dev/null 2>&1; then
      ok "App online"
      return 0
    fi
    sleep 2
  done
  warn "App belum merespons — cek: pm2 logs ledgerly-web"
  pm2 status || true
}

print_banner() {
  echo -e "${C_BOLD}"
  echo "╔════════════════════════════════════════════════════╗"
  echo "║   Ledgerly Autopilot Deploy                        ║"
  echo "║   One command → production VPS                     ║"
  echo "╚════════════════════════════════════════════════════╝"
  echo -e "${C_RESET}${C_DIM}Postgres · Redis · PM2 · Socket.io · Nginx · Fail2Ban${C_RESET}"
}

print_done() {
  local port url
  port="$(get_env_var APP_PORT "$ENV_FILE")"; port="${port:-3000}"
  url="$(get_env_var NEXT_PUBLIC_APP_URL "$ENV_FILE")"
  echo
  echo -e "${C_GREEN}${C_BOLD}════════════════════════════════════════${C_RESET}"
  ok "SEMUA SIAP — Ledgerly running"
  echo -e "${C_GREEN}${C_BOLD}════════════════════════════════════════${C_RESET}"
  echo
  echo "  URL          : ${url:-http://SERVER_IP:${port}}"
  echo "  PM2          : pm2 status"
  echo "  WhatsApp QR  : pm2 logs ledgerly-whatsapp --lines 80"
  echo "  Security log : tail -f logs/security.log"
  echo "  Upgrade      : ./redeploy.sh"
  echo
  echo "  Setelah register user:"
  echo "  1) Settings → isi AI API key"
  echo "  2) Channels → pairing code"
  echo "  3) Scan QR WhatsApp (pm2 logs)"
  echo
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$DEPLOY_LOCK" 2>/dev/null || true
}

setup_pm2_startup() {
  local cmd
  cmd="$(pm2 startup systemd -u "$USER" --hp "$HOME" 2>/dev/null | grep -oE 'sudo .*' || true)"
  if [[ -n "$cmd" ]]; then
    # shellcheck disable=SC2086
    eval "$cmd" >/dev/null 2>&1 || warn "pm2 startup perlu dijalankan manual: $cmd"
  fi
  pm2 save >/dev/null 2>&1 || true
  ok "PM2 auto-start on reboot dikonfigurasi"
}
