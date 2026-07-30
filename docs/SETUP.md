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

1. Pertama kali → otomatis ke **`/setup`** (isi nama owner + Telegram)
2. Lalu **`/access`** → minta izin → bot kirim detail perangkat/lokasi → owner `/approve KODE`
3. Dashboard terbuka (menu: Overview · Transactions · Analytics · Settings)

```bash
# terminal lain (opsional, untuk approve via bot)
npm run worker:telegram
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
- Telegram bot token — **wajib** (dibuat lewat BotFather)

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
| `WORKER_SECRET` | Yes | bebas untuk local |
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

Perintah ini menjalankan web dan Telegram worker sekaligus. Untuk web saja,
gunakan `npm run dev:web`.

Open http://localhost:3000 → `/setup` → Settings (AI key + bot Telegram).

## 5. Architecture reminder

```
User message (Telegram/Web)
  → AI Agent (intent + tools)
  → Finance Engine (Zod + business rules)
  → PostgreSQL (source of truth)
  → response
```

AI never writes the database directly.

## 6. Tests

```bash
npm test
```

See [TESTING.md](./TESTING.md) for smoke tests.
