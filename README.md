# Ledgerly — AI Finance Agent

Self-hosted personal finance assistant. Catat pengeluaran lewat **chat** (Telegram / WhatsApp) atau dashboard web. Bukan SaaS publik — satu owner, akses tiap kunjungan lewat izin bot.

> **Prinsip keandalan:** AI hanya memahami intent & memanggil tools. **Finance Engine** yang memvalidasi & menulis data. **PostgreSQL** adalah sumber kebenaran tunggal.

---

## Fitur

| Area | Apa yang kamu dapat |
|------|---------------------|
| **Chat finance** | Kirim bahasa natural: *“beli makan 35 ribu”*, *“gaji masuk 7 juta”* → transaksi tersimpan |
| **Telegram** | Bot Grammy: notifikasi akses, `/approve` / `/reject`, catat transaksi |
| **WhatsApp** | Worker Baileys (scan QR sekali) — chat sama seperti Telegram |
| **Dashboard** | Overview saldo, cashflow, health score |
| **Transactions** | Riwayat, filter, edit transaksi |
| **Analytics** | Tren pengeluaran / pemasukan |
| **AI insights** | Analisis dengan API key milikmu (Gemini atau OpenRouter) — key dienkripsi |
| **Akses aman** | Tidak ada register publik. Tiap browser minta izin owner via bot (kode + fingerprint + IP) |
| **Self-host** | Docker + Nginx/SSL · data di **Neon PostgreSQL** (bukan DB di dalam VPS) · Redis internal |

---

## Desain website

UI mengarah ke **dashboard keuangan premium**, bukan landing SaaS:

- Tipografi display + layout bersih (Tailwind + Shadcn)
- Navigasi ringkas: **Overview · Transactions · Analytics · Settings**
- Alur gerbang: `/setup` (bootstrap sekali) → `/access` (minta izin) → dashboard
- Realtime lewat Socket.io (halaman access langsung terbuka saat owner approve)
- Mobile-friendly (sidebar + sheet nav)

Halaman penting:

| Route | Fungsi |
|-------|--------|
| `/setup` | Setup pertama: nama owner + token Telegram / nomor WhatsApp |
| `/access` | Minta akses → tunggu `/approve KODE` di bot |
| `/dashboard` | Overview keuangan |
| `/dashboard/transactions` | Daftar transaksi |
| `/dashboard/analytics` | Grafik & tren |
| `/settings` | AI key, bot, preferensi owner |

---

## Cara memakai (setelah app hidup)

### 1) Setup owner (sekali)

1. Buka URL instance → otomatis ke **`/setup`** jika belum dikonfigurasi  
2. Isi nama owner  
3. Hubungkan **Telegram** (bot token + chat ID) dan/atau **WhatsApp**  
4. Simpan → instance siap

### 2) Masuk dashboard

1. Buka **`/access`**  
2. Minta izin → bot owner dapat notifikasi (kode, IP, perangkat)  
3. Di Telegram kirim: `/approve KODE` (atau kirim kode saja)  
4. Browser otomatis masuk dashboard  

Tolak: `/reject KODE`

### 3) Catat keuangan

- **Dari chat:** `beli kopi 25rb`, `transfer masuk 500000`, dll.  
- **Dari web:** Transactions / agent di dashboard  
- **Settings:** tempel API key Gemini atau OpenRouter untuk insight AI  

### 4) Upgrade & operasional (VPS)

```bash
./redeploy.sh
./scripts/status.sh
./scripts/logs.sh app
```

---

## Mulai cepat

### Preview lokal (tanpa Docker)

```bash
npm run setup:local
# edit .env → DATABASE_URL dari Neon (gratis): https://console.neon.tech
npx prisma db push
npm run db:seed
npm run dev
```

Buka http://localhost:3000 — panduan lengkap: **[docs/SETUP.md](docs/SETUP.md)**

### Deploy self-host di VPS (produksi)

```bash
git clone https://github.com/AFR-projection/Finance-Dashboard.git /opt/ledgerly
cd /opt/ledgerly
cp .env.example .env && nano .env   # WAJIB: DATABASE_URL Neon
chmod +x install.sh deploy.sh update.sh
./install.sh
```

Update versi nanti: `cd /opt/ledgerly && ./update.sh`

Panduan lengkap: **[DEPLOY.md](./DEPLOY.md)** · detail tambahan: **[SELF_HOST.md](./SELF_HOST.md)**

---

## Stack

- **Web:** Next.js + TypeScript + Tailwind + Shadcn UI + Socket.io  
- **Data:** Prisma + **Neon PostgreSQL** (produksi) / Neon atau Postgres lokal (dev)  
- **AI:** Gemini / OpenRouter (key user, dienkripsi at-rest)  
- **Messaging:** Grammy (Telegram) + Baileys (WhatsApp)  
- **Deploy:** Docker Compose + `install.sh` / `deploy.sh` / `update.sh` + Nginx SSL

```
WhatsApp / Telegram / Web
          ↓
     AI Agent (tools)
          ↓
    Finance Engine
          ↓
   Neon PostgreSQL
```

---

## Dokumentasi

| Dokumen | Isi |
|---------|-----|
| **[DEPLOY.md](./DEPLOY.md)** | Deploy VPS production (utama) |
| **[SELF_HOST.md](./SELF_HOST.md)** | Catatan self-host tambahan |
| **[docs/SETUP.md](docs/SETUP.md)** | Setup local / development |
| **[docs/API.md](docs/API.md)** | API reference |
| **[docs/TESTING.md](docs/TESTING.md)** | Testing |

---

## License

Private / proprietary unless otherwise stated.
