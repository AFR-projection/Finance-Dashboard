# Deploy Ledgerly di VPS Ubuntu (Production Guide)

Panduan production untuk user non-developer.  
Target: VPS Ubuntu fresh + domain/IP → `./install.sh` → selesai dengan SSL/HTTPS.

**Database produksi = Neon PostgreSQL (eksternal).**  
Tidak ada Postgres di dalam Docker — data keuangan aman meski VPS down/corrupt.

Repo: https://github.com/AFR-projection/Finance-Dashboard

---

## 🔁 Redeploy / Update Versi Aplikasi

Cukup 1 baris untuk naikkan fitur/fix terbaru:

```bash
cd /opt/ledgerly && ./update.sh
```

Script otomatis: `git pull` → backup `.env` → rebuild container → sync schema DB Neon (`prisma db push`) → health check.

Tanpa `git pull` (hanya rebuild):

```bash
./deploy.sh
```

---

## 🚀 Instalasi Pertama (Fresh Install)

### 1) Clone repo

```bash
git clone https://github.com/AFR-projection/Finance-Dashboard.git /opt/ledgerly
cd /opt/ledgerly
```

### 2) Buat & isi file `.env`

```bash
cp .env.example .env
nano .env
```

Pastikan **`DATABASE_URL`** berisi **1 baris utuh** connection string dari [Neon](https://console.neon.tech).

Contoh bentuk (jangan commit secret asli):

```env
DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require"
APP_DOMAIN="finance.domainkamu.com"
```

Opsional di `.env` / CLI:

| Variabel | Keterangan |
|----------|------------|
| `APP_DOMAIN` | Domain untuk Nginx + Let's Encrypt |
| `APP_PORT` | `auto` (default) atau angka port kosong |
| `TELEGRAM_BOT_TOKEN` | Boleh dikosongkan — isi nanti di `/setup` |

### 3) Jalankan installer

```bash
bash ./install.sh
```

Atau dengan domain eksplisit:

```bash
APP_DOMAIN=finance.domainkamu.com bash ./install.sh
```

Installer akan:

1. Install Docker (jika belum)  
2. Validasi `DATABASE_URL` Neon  
3. Generate secrets kosong  
4. **Auto-detect port kosong** (aman di VPS multi-app)  
5. Build & up: `app` + `redis` + `telegram-worker`  
6. Generate Nginx + Certbot HTTPS (jika `APP_DOMAIN` diisi)  
7. Health-check PostgreSQL + Redis melalui `/api/health`; instalasi berhenti jika tidak sehat

### 4) Setup owner

Buka URL yang dicetak script → **`/setup`** → lalu **`/access`** → approve di Telegram.

---

## ⚙️ Ringkasan Arsitektur Deploy

```text
Internet → Nginx (:443 / SSL) → Next.js App (auto-port host)
                              ↘ Redis (internal Docker)
Neon PostgreSQL (external DB)
Telegram worker (Grammy)
```

| Komponen | Lokasi | Catatan |
|----------|--------|---------|
| Next.js + Socket.io | Container `app` | 1 port host (auto) |
| Redis | Container internal | Session/cache worker |
| PostgreSQL | **Neon cloud** | Sumber kebenaran data |
| Telegram bot | Container `telegram-worker` | Grammy long polling |

---

## Perintah operasional

```bash
./install.sh              # pertama kali
./deploy.sh               # rebuild tanpa git pull
./update.sh               # git pull + rebuild + sync Neon
./scripts/status.sh
./scripts/logs.sh app
./scripts/logs.sh telegram-worker
./scripts/stop.sh
```

---

## Troubleshooting singkat

| Masalah | Solusi |
|---------|--------|
| Build Prisma / `DATABASE_URL` | Build pakai dummy URL; Neon hanya di **runtime**. Pastikan `.env` benar. |
| `DATABASE_URL` ditolak script | Jangan pakai host `postgres` Docker — wajib Neon. |
| Installer berhenti di Certbot | Pastikan DNS A/AAAA sudah ke VPS, lalu ulangi `bash ./install.sh`. Installer tidak akan mengklaim sukses tanpa HTTPS. |
| `/approve` bot diam | Jalankan `./deploy.sh`, lalu cek `./scripts/logs.sh telegram-worker`. Worker membaca token dari `.env` atau `/setup`. |
| Port bentrok | `APP_PORT=7341 ./deploy.sh` |

Detail tambahan: [SELF_HOST.md](./SELF_HOST.md) · fitur produk: [README.md](./README.md)
