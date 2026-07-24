# Deploy Ledgerly di VPS (Docker)

Alur yang diinginkan:

```bash
git clone <REPO> ledgerly && cd ledgerly
cp .env.example .env          # opsional: isi TELEGRAM_BOT_TOKEN
chmod +x deploy.sh redeploy.sh scripts/*.sh
./deploy.sh                   # selesai — web produksi
```

Dengan domain (setelah Nginx/Caddy siap):

```bash
APP_DOMAIN=finance.example.com ./deploy.sh
```

## Apa yang dilakukan `./deploy.sh`

1. Install Docker (Ubuntu/Debian) jika belum ada  
2. Generate secrets yang masih placeholder  
3. **Auto-pilih port host yang belum dipakai** (hindari 22, 80, 443, 3000, 8080, 8081, …)  
4. Postgres + Redis **internal** Docker (tidak publish — aman bareng project lain)  
5. Build & start: `app` + `telegram-worker` + `whatsapp-worker`  
6. Tulis `deploy/generated/` (PORT + snippet Nginx)

Port favorit (jika bebas): `3047`, `3184`, `4093`, `5183`, `6291`, `7341`, …  
Kalau semua sibuk, scan range `3100–3199`, `5100–5199`, dll.

Paksa port:

```bash
APP_PORT=7341 ./deploy.sh
```

## Setelah deploy

- Buka URL yang dicetak script → `/setup` (owner + bot)  
- File penting:
  - `deploy/generated/PORT.txt`
  - `deploy/generated/nginx-proxy-snippet.conf` → proxy domain ke `127.0.0.1:<PORT>` (wajib WebSocket `/socket.io/`)

## Upgrade

```bash
./redeploy.sh                 # port & volume tetap
./redeploy.sh --no-pull
```

## Operasional

```bash
./scripts/status.sh
./scripts/doctor.sh
./scripts/logs.sh app
./scripts/logs.sh whatsapp-worker   # QR WhatsApp
./scripts/stop.sh                   # stop containers (data aman)
```
