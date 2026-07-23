# Setup Guide — Ledgerly AI Finance Agent

## Prerequisites

- Node.js 22+
- npm 10+
- Neon PostgreSQL database (or any Postgres 15+)
- Optional: Redis (recommended on VPS for rate limit + pairing codes)
- Telegram Bot token from [@BotFather](https://t.me/BotFather)
- WhatsApp account for Baileys (personal number used as bot inbox)

## VPS (disarankan)

Satu perintah — lihat [DEPLOYMENT.md](./DEPLOYMENT.md):

```bash
./deploy.sh          # pertama kali
./redeploy.sh        # setiap upgrade
```

## 1. Clone & install (local dev)

```bash
cd FInance
npm install
cp .env.example .env
```

## 2. Configure environment

Edit `.env`:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon / Postgres connection string |
| `AUTH_SECRET` | Yes | `openssl rand -base64 32` |
| `AUTH_URL` | Yes | e.g. `http://localhost:3000` or public HTTPS URL |
| `ENCRYPTION_KEY` | Yes | 64 hex chars or long passphrase |
| `WHATSAPP_WORKER_SECRET` | Yes | Shared secret for workers → app |
| `TELEGRAM_BOT_TOKEN` | For Telegram | From BotFather |
| `GEMINI_API_KEY` / `OPENROUTER_API_KEY` | Optional | Platform fallbacks; users can bring own keys |
| `REDIS_URL` | Recommended | `redis://localhost:6379` |
| `WHATSAPP_OWNER_USER_ID` | Optional | User cuid to sync QR status to dashboard |

## 3. Database

```bash
npx prisma generate
npx prisma db push
# optional seed
npm run db:seed
```

## 4. Run locally (dev)

Terminal 1 — web app (+ Socket.io):

```bash
npm run docker:data   # postgres + redis (kalau pakai Docker)
npm run dev
```

Terminal 2 — Telegram (optional):

```bash
npm run worker:telegram
```

Terminal 3 — WhatsApp “sender bot” (optional):

```bash
npm run worker:whatsapp
```

Open http://localhost:3000 → Register → Settings (AI key) → Channels.

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
