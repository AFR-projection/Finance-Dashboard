# Panduan Rilis Ledgerly

Urutan yang harus diikuti untuk menaikkan Ledgerly ke produksi. Setiap langkah
bergantung pada yang sebelumnya — jangan dilompati.

## 1. DNS (lakukan dulu, tunggu propagasi)

Certbot memverifikasi lewat DNS, jadi ketiga record harus sudah aktif **sebelum**
`install.sh` dijalankan. Semua menunjuk ke IP VPS yang sama.

| Tipe | Nama | Nilai |
|---|---|---|
| A | `@` | IP VPS |
| A | `app` | IP VPS |
| A | `admin` | IP VPS |

Cek propagasi: `dig +short dataku.id app.dataku.id admin.dataku.id`

## 2. Deploy

```bash
git clone <repo> && cd FInance
cp .env.example .env
```

Isi minimal di `.env`:

- `APP_DOMAIN` — **apex saja** (`dataku.id`, bukan `app.dataku.id`)
- `DATABASE_URL` — connection string Neon
- `AUTH_SECRET` — `openssl rand -base64 32`
- `ENCRYPTION_KEY` — 64 hex char, `openssl rand -hex 32`
- `WORKER_SECRET` — rahasia bersama antara app dan worker Telegram
- `TELEGRAM_BOT_TOKEN` — dari BotFather

Lalu:

```bash
./install.sh
```

Script akan: pilih port kosong, pasang Nginx untuk ketiga host, minta satu
sertifikat SSL yang mencakup apex + `app.` + `admin.`, jalankan migrasi, dan
menyalakan container.

Setelah selesai, `NEXT_PUBLIC_SITE_URL` (apex) dan `NEXT_PUBLIC_APP_URL`
(`app.`) terisi otomatis dan berbeda — itu memang disengaja: canonical tag dan
sitemap harus menunjuk apex, bukan subdomain dashboard.

## 3. Akun admin

Belum ada UI untuk ini, dan memang disengaja: password panel admin membuka data
semua pengguna, jadi hanya bisa diset dari mesin yang memegang database.

```bash
# Akun harus sudah ADMIN dan punya telegramChatId
npx tsx scripts/set-admin-password.ts <username>
```

## 4. Konfigurasi lewat panel admin

Buka `https://admin.<domain>/login` → login dengan username + password → setujui
notifikasi di Telegram.

| Halaman | Yang diisi |
|---|---|
| `/ai` | API key OpenRouter, model utama, model cadangan |
| `/plans` | Kuota token FREE & PREMIUM, harga Premium, Server Key + Client Key Midtrans |

Selama key Midtrans kosong, tombol Upgrade tidak muncul di dashboard pengguna —
ini disengaja supaya tidak ada tombol mati.

## 5. Webhook Midtrans

Di dashboard Midtrans → Settings → Configuration, isi **Payment Notification URL**:

```
https://<domain>/api/payments/midtrans/notification
```

Endpoint ini memverifikasi signature sha512 dan idempoten — notifikasi ganda
tidak akan menambah masa aktif dua kali.

Mulai dengan mode **sandbox** (matikan "Mode produksi" di `/plans`), uji sekali
pembayaran, baru pindah ke key produksi.

## 6. Checklist setelah live

Uji dari browser incognito, bukan dari curl:

- [ ] `https://<domain>` menampilkan landing page
- [ ] Daftar akun baru → tekan Start di bot → salin Chat ID → tempel → masuk dashboard
- [ ] Dashboard akun baru **kosong** (bukan berisi data akun lain)
- [ ] Logout, lalu login lewat `/masuk` → setujui di Telegram → masuk
- [ ] `https://app.<domain>/admin` → 404
- [ ] `https://admin.<domain>` dengan cookie pengguna biasa → ditolak ke login
- [ ] Kirim pesan ke bot ("beli kopi 25 ribu") → tercatat, muncul di dashboard
- [ ] Panel admin `/usage` mencatat token dari percakapan barusan
- [ ] Checkout Midtrans sandbox → bayar simulasi → tier naik jadi Premium

## Catatan operasional

- **Token bot Telegram tidak boleh dipakai dua instance sekaligus.** Kalau dev
  lokal dan VPS memakai token yang sama, salah satunya akan kena error 409
  `getUpdates`. Matikan yang lokal, atau pakai bot terpisah untuk development.
- **Kuota reset sendiri** tiap awal bulan karena kuncinya berisi periode
  (`2026-08`). Tidak ada cron yang bisa gagal.
- **Penurunan tier dihitung saat request**, bukan oleh penjadwal. Langganan yang
  lewat masa aktif otomatis diperlakukan sebagai FREE.
- Update berikutnya: `./update.sh` (mempertahankan sertifikat TLS yang ada).
