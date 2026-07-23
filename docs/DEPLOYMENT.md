# Deploy Ledgerly di VPS yang sudah ada Docker project lain

## Port

| Port | Status |
|------|--------|
| 22, 80, 443, 3000, 8080, 8081 | **Tidak dipakai** (sudah ada project lain) |
| **3001** (default) | Ledgerly app |
| 3002 / 5000 / 8082 / 9000 | Cadangan jika 3001 sibuk |
| 5432 / 6379 | **Tidak di-publish** (Postgres/Redis internal Docker) |

## Satu perintah

```bash
git clone <REPO> ledgerly && cd ledgerly
chmod +x deploy.sh redeploy.sh scripts/*.sh
./deploy.sh
```

Dengan domain (setelah reverse proxy siap):

```bash
APP_DOMAIN=finance.example.com ./deploy.sh
```

Paksa port:

```bash
APP_PORT=3002 ./deploy.sh
```

## Setelah deploy

Script menulis:

- `deploy/generated/PORT.txt` → port yang dipakai
- `deploy/generated/nginx-proxy-snippet.conf` → tempel ke Nginx existing
- `deploy/generated/README.md`

Contoh: jika port **3001**, arahkan domain ke `http://127.0.0.1:3001` (wajib WebSocket untuk `/socket.io/`).

## Upgrade

```bash
./redeploy.sh
```

## Logs

```bash
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs -f app
docker compose -f docker/docker-compose.yml logs -f whatsapp-worker
```
