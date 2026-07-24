# Self-Host Ledgerly di VPS

Panduan deploy **produksi** di VPS mana pun (DigitalOcean, Contabo, Vultr, AWS Lightsail, VPS Indonesia, dll.).  
Target: **Linux x86_64** — paling mulus di **Ubuntu 22.04 / 24.04** atau **Debian 12**.

Alur singkat:

```text
clone repo → cp .env.example .env → ./deploy.sh → buka URL → /setup
```

Repo:

```text
https://github.com/AFR-projection/Finance-Dashboard
```

---

## Apa yang kamu dapat setelah deploy

| Komponen | Di mana | Catatan |
|----------|---------|---------|
| Web app (Next.js + Socket.io) | 1 port host (auto) | Satu-satunya port yang keluar ke VPS |
| PostgreSQL | Internal Docker | **Tidak** di-publish (aman bareng project lain) |
| Redis | Internal Docker | **Tidak** di-publish |
| Telegram worker | Container | Idle jika token kosong |
| WhatsApp worker | Container | Scan QR lewat logs |

`./deploy.sh` otomatis:

1. Install Docker (Ubuntu/Debian) jika belum ada  
2. Generate secrets yang masih placeholder  
3. Pilih **port host yang belum dipakai** (hindari 22, 80, 443, 3000, 8080, …)  
4. Build & start seluruh stack  
5. Tulis `deploy/generated/PORT.txt` + snippet Nginx  

---

## 0) Syarat VPS

- Akses SSH (`root` atau user + `sudo`)  
- OS: Ubuntu 22.04+ / Debian 12+ (distro lain: install Docker manual dulu)  
- RAM: **minimal 2 GB** (disarankan 4 GB saat build pertama)  
- Disk: **~10 GB** bebas  
- Port SSH (22) jangan diubah oleh script — Ledgerly **tidak** memakai 22/80/443  

Opsional tapi disarankan:

- Domain (A record → IP VPS)  
- Firewall terbuka untuk port yang dipilih script (atau hanya 80/443 jika pakai reverse proxy)

---

## 1) Masuk VPS & clone

```bash
ssh user@IP_VPS
# atau: ssh root@IP_VPS

git clone https://github.com/AFR-projection/Finance-Dashboard.git ledgerly
cd ledgerly
```

Pastikan `git` ada:

```bash
sudo apt-get update -y && sudo apt-get install -y git curl ca-certificates
```

---

## 2) Siapkan `.env`

```bash
cp .env.example .env
nano .env   # atau: vim .env
```

### Wajib dipahami

| Variabel | Isi |
|----------|-----|
| `APP_PORT` | Biarkan `auto` — script pilih port bebas. Atau paksa mis. `7341` |
| `TELEGRAM_BOT_TOKEN` | Opsional sekarang; bisa diisi nanti di `/setup` UI |
| Password / `AUTH_SECRET` / `ENCRYPTION_KEY` | **Jangan** biarkan placeholder jika kamu mau set manual — kalau dibiarkan, `./deploy.sh` **generate otomatis** |

### Yang diisi otomatis oleh `./deploy.sh`

- `AUTH_SECRET`, `ENCRYPTION_KEY`, `WHATSAPP_WORKER_SECRET`, `POSTGRES_PASSWORD` (jika masih placeholder)  
- `DATABASE_URL` → `postgres:5432` (jaringan Docker)  
- `REDIS_URL` → `redis:6379`  
- `NEXT_PUBLIC_APP_URL` / `AUTH_URL` → `http://IP:PORT` atau `https://DOMAIN`  

**Jangan** pakai Neon `DATABASE_URL` di mode Docker VPS — biarkan script mengarahkan ke Postgres container.

Simpan file, keluar editor.

---

## 3) Jalankan deploy

```bash
chmod +x deploy.sh redeploy.sh scripts/*.sh
./deploy.sh
```

Build pertama bisa **2–5 menit** (download image + `npm` build).

Kalau sukses, terminal mencetak kurang lebih:

```text
PORT HOST YANG DIPAKAI: 3047
URL: http://xxx.xxx.xxx.xxx:3047
```

Catat **port** itu. Juga tersimpan di:

```text
deploy/generated/PORT.txt
```

### Opsi berguna

```bash
# Pakai domain (setelah DNS siap)
APP_DOMAIN=finance.domainkamu.com ./deploy.sh

# Paksa port tertentu
APP_PORT=7341 ./deploy.sh

# Jangan git pull
SKIP_PULL=1 ./deploy.sh
```

---

## 4) Buka aplikasi & setup owner

1. Browser: `http://IP_VPS:PORT` (atau domain jika sudah di-proxy)  
2. Pertama kali → **`/setup`**  
   - Nama owner  
   - Bot Telegram (token + chat ID) dan/atau WhatsApp  
3. Lanjut **`/access`** → minta izin → di Telegram: `/approve KODE`  
4. Dashboard terbuka  

Cek status:

```bash
./scripts/status.sh
./scripts/doctor.sh
./scripts/logs.sh app
```

WhatsApp QR (jika dipakai):

```bash
./scripts/logs.sh whatsapp-worker
```

---

## 5) Firewall (penting)

Script **tidak** mengubah firewall. Kamu yang buka port.

### UFW (Ubuntu)

Tanpa reverse proxy (akses langsung IP:PORT):

```bash
sudo ufw allow OpenSSH
sudo ufw allow PORT/tcp    # ganti PORT dari deploy/generated/PORT.txt
sudo ufw enable
sudo ufw status
```

Dengan Nginx/Caddy (disarankan produksi):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

App cukup listen di `127.0.0.1:PORT` lewat proxy — **tidak perlu** buka PORT ke publik.

### Provider panel

Di Contabo / DO / Vultr / dll.: pastikan security group / firewall panel mengizinkan 80/443 (atau PORT kalau akses langsung).

---

## 6) Domain + HTTPS (produksi beneran)

### 6.1 DNS

Di DNS domain:

| Type | Name | Value |
|------|------|-------|
| A | `finance` (atau `@`) | IP VPS |

Tunggu propagasi (bisa beberapa menit).

### 6.2 Nginx (paling umum)

Install:

```bash
sudo apt-get install -y nginx
```

Snippet sudah digenerate:

```bash
cat deploy/generated/nginx-proxy-snippet.conf
```

Contoh file site (ganti domain + PORT):

```bash
sudo nano /etc/nginx/sites-available/ledgerly
```

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name finance.domainkamu.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_buffering off;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_buffering off;
    }
}
```

Aktifkan:

```bash
sudo ln -sf /etc/nginx/sites-available/ledgerly /etc/nginx/sites-enabled/ledgerly
sudo nginx -t && sudo systemctl reload nginx
```

SSL gratis (Let's Encrypt):

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d finance.domainkamu.com
```

Lalu set URL publik & redeploy env:

```bash
APP_DOMAIN=finance.domainkamu.com ./deploy.sh
# atau edit .env:
# NEXT_PUBLIC_APP_URL="https://finance.domainkamu.com"
# AUTH_URL="https://finance.domainkamu.com"
./redeploy.sh --no-pull
```

### 6.3 Caddy (lebih pendek)

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
# ikuti docs Caddy untuk repo, lalu:
```

`Caddyfile`:

```text
finance.domainkamu.com {
    reverse_proxy 127.0.0.1:PORT
}
```

Caddy otomatis HTTPS. Tetap set `APP_DOMAIN=...` seperti di atas.

### 6.4 Cloudflare

- DNS A → IP VPS (Proxied atau DNS only)  
- Kalau Proxied: SSL mode **Full** (bukan Flexible) setelah origin punya sertifikat  
- WebSocket harus enabled (default Cloudflare OK)

---

## 7) VPS yang sudah ada project Docker lain

Ledgerly dirancang untuk ini:

- Hanya **satu** port host yang di-publish  
- Port dipilih dari daftar **jarang dipakai** / scan range aman  
- Postgres/Redis **tidak** bentrok dengan 5432/6379 host  

Cek port terpakai:

```bash
ss -tuln
./scripts/status.sh
```

Paksa port yang kamu tahu kosong:

```bash
APP_PORT=7341 ./deploy.sh
```

Stop tanpa hapus data:

```bash
./scripts/stop.sh
```

---

## 8) Upgrade versi baru

```bash
cd ~/ledgerly   # path clone kamu
./redeploy.sh
```

- Port & volume (DB, Redis, sesi WA) **tetap**  
- Skip git pull: `./redeploy.sh --no-pull`

---

## 9) Backup & restore (ringkas)

Volume Docker penting:

- `ledgerly_postgres_data`  
- `ledgerly_redis_data`  
- `ledgerly_wa_auth`  

Backup Postgres contoh:

```bash
docker compose -f docker/docker-compose.yml --env-file .env exec -T postgres \
  pg_dump -U ledgerly ledgerly > backup-$(date +%F).sql
```

Simpan juga file `.env` di tempat aman (berisi secret).

---

## 10) Troubleshooting

| Gejala | Cek |
|--------|-----|
| `./deploy.sh` gagal Docker | Ubuntu/Debian? Atau install Docker manual lalu ulang |
| Build OOM / killed | Naikkan RAM / tambah swap 2G |
| Browser tidak buka | Firewall / security group; cek `./scripts/status.sh` |
| `/approve` bot tidak respon | Isi token di `/setup` atau `.env`, lalu `./redeploy.sh`; cek `./scripts/logs.sh telegram-worker` |
| Halaman access stuck | Socket.io / proxy: pastikan `Upgrade` headers (lihat snippet Nginx) |
| 502 dari Nginx | PORT salah — cocokkan dengan `deploy/generated/PORT.txt` |
| WhatsApp tidak connect | `./scripts/logs.sh whatsapp-worker` → scan QR |

Logs mentah:

```bash
docker compose -f docker/docker-compose.yml --env-file .env logs -f --tail=100 app
```

Health lokal di VPS:

```bash
curl -fsS http://127.0.0.1:PORT/api/health
```

---

## 11) Checklist go-live

- [ ] `./deploy.sh` selesai, health OK  
- [ ] `/setup` owner + bot selesai  
- [ ] `/access` + `/approve` berhasil masuk dashboard  
- [ ] (Opsional) Domain + HTTPS  
- [ ] Firewall hanya buka yang perlu  
- [ ] `.env` di-backup, tidak di-commit ke Git  
- [ ] Settings → API key AI (jika mau insight)  

---

## Perintah cepat

```bash
./deploy.sh                 # install + first run
./redeploy.sh               # upgrade
./scripts/status.sh         # port + health
./scripts/doctor.sh         # diagnosa
./scripts/logs.sh app
./scripts/logs.sh telegram-worker
./scripts/logs.sh whatsapp-worker
./scripts/stop.sh           # stop (data aman)
```

---

## Lihat juga

- Fitur & cara pakai produk: **[README.md](./README.md)**  
- Setup development lokal: **[docs/SETUP.md](./docs/SETUP.md)**  
- Ringkasan satu layar: **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)**
