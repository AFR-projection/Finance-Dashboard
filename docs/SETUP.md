# Setup Guide — Ledgerly AI Finance Agent

## Local dulu (TANPA Docker) — direkomendasikan sebelum VPS

Cukup **Node.js 22+** dan database Postgres gratis (Neon). Redis **tidak wajib**.

### 1) Install dependency + buat .env

```bash
npm run setup:local
```

Atau manual:

```bash
npm install --legacy-peer-deps
copy .env.local.example .env
```

### 2) Isi DATABASE_URL (Neon gratis, tanpa install Postgres)

1. Buka https://console.neon.tech → buat project → copy connection string  
2. Paste ke `.env`:

```env
DATABASE_URL="postgresql://...@ep-xxxx.neon.tech/neondb?sslmode=require"
```

Pastikan di `.env` local:

```env
AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
# REDIS_URL=   ← biarkan kosong / hapus baris ini
```

### 3) Push schema + jalankan

```bash
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Buka: **http://localhost:3000**

Alur baru (single owner, tanpa daftar publik):

1. Pertama kali → otomatis ke **`/setup`** (isi nama owner + Telegram dan/atau WhatsApp)
2. Lalu **`/access`** → minta izin → bot kirim detail perangkat/lokasi → owner `/approve KODE`
3. Dashboard terbuka (menu: Overview · Transactions · Analytics · Settings)

```bash
# terminal lain (opsional, untuk approve via bot)
npm run worker:telegram
# dan/atau
npm run worker:whatsapp
```

---

## VPS (Docker / self-host + Neon)

Panduan produksi: **[DEPLOY.md](../DEPLOY.md)**  
`DATABASE_URL` wajib Neon → lalu `./install.sh`

## Prerequisites

- Node.js 22+
- npm 10+
- Neon PostgreSQL (atau Postgres lokal) — **wajib**
- Redis — opsional di local
- Telegram / WhatsApp — opsional

## 1. Clone & install (local dev)

```bash
cd FInance
npm install --legacy-peer-deps
cp .env.local.example .env
```

## 2. Configure environment

Edit `.env`:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon connection string |
| `AUTH_SECRET` | Yes | string random panjang |
| `AUTH_URL` | Yes | `http://localhost:3000` |
| `ENCRYPTION_KEY` | Yes | 64 hex chars |
| `WHATSAPP_WORKER_SECRET` | Yes | bebas untuk local |
| `REDIS_URL` | No | kosongkan di local |
| `OPENROUTER_API_KEY` | No | atau isi di Settings UI |

## 3. Database

```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

## 4. Run locally (dev)

```bash
npm run dev
```

Open http://localhost:3000 → Register → Settings (AI key).

### Cara menambah / menghubungkan sender WhatsApp (Baileys)

WhatsApp **bukan** seperti BotFather. “Bot”-nya = **nomor HP yang kamu scan QR** (bisa nomor spare / kedua). Nomor itu jadi inbox yang membalas user.

1. Isi di `.env`:
   - `WHATSAPP_WORKER_SECRET` (sama dengan yang dipakai app)
   - `NEXT_PUBLIC_APP_URL=http://localhost:3000`
   - `WHATSAPP_AUTH_DIR=./workers/.wa-auth`
2. Pastikan app sudah jalan (`npm run dev`).
3. Jalankan `npm run worker:whatsapp`.
4. **QR muncul di terminal** → buka WhatsApp di HP → Linked Devices → Link a device → scan.
5. Session tersimpan di `workers/.wa-auth` (jangan dihapus; ini biar tidak logout terus).
6. Di dashboard → **Channels** → Generate pairing code.
7. Dari HP **lain** (atau kontak kamu), kirim chat ke nomor yang baru di-link:
   - `link KODE` — tautkan akun web
   - lalu coba: `beli kopi 25 ribu`
   - login confirm: `approve KODE` / `reject KODE`

Tips:
- Pakai **nomor kedua** untuk bot, nomor utama untuk testing sebagai user.
- Kalau QR tidak muncul / logged out: hapus folder `workers/.wa-auth` lalu jalankan ulang worker.
- Di VPS sama saja: `pm2 logs ledgerly-whatsapp` untuk lihat QR.

## 5. Architecture reminder

```
User message (WA/TG/Web)
  → AI Agent (intent + tools)
  → Finance Engine (Zod + business rules)
  → PostgreSQL (source of truth)
  → response
```

AI never writes the database directly.

## 6. First WhatsApp connect

1. Start `whatsapp-worker`
2. Scan QR printed in the terminal (or dashboard if `WHATSAPP_OWNER_USER_ID` set)
3. Generate pairing code in Channels
4. Message the connected WhatsApp: `link ABC123`

## 7. Tests

```bash
npm test
```

See [TESTING.md](./TESTING.md) for smoke tests.
