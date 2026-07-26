# Catatan Self-Host Ledgerly

Panduan utama tetap [DEPLOY.md](./DEPLOY.md). Dokumen ini menjelaskan perilaku operasional setelah instalasi.

## Syarat produksi

- VPS Ubuntu/Debian 64-bit dengan minimal 2 GB RAM dan akses `sudo`.
- Domain dengan DNS A/AAAA yang sudah mengarah ke VPS sebelum meminta sertifikat.
- PostgreSQL eksternal (Neon direkomendasikan); Redis dijalankan hanya di network Docker internal.
- Port 80 dan 443 dapat dijangkau dari internet.

## Jaminan skrip

- `.env` dan backup-nya dipaksa memakai permission privat.
- Build, sinkronisasi schema, readiness PostgreSQL/Redis, `nginx -t`, dan Certbot bersifat fail-closed.
- Update hanya mengganti upstream Nginx dan mempertahankan konfigurasi TLS yang dikelola Certbot.
- Container berjalan sebagai user non-root dan log Docker dibatasi ukurannya.

## Operasi rutin

```bash
cd /opt/ledgerly
./update.sh
./scripts/doctor.sh
./scripts/status.sh
./scripts/logs.sh app
```

Untuk rebuild tanpa mengambil commit baru:

```bash
./deploy.sh
```

Jika `APP_DOMAIN` berubah, jalankan kembali `bash ./install.sh`; jangan hanya menjalankan update karena domain baru membutuhkan sertifikat baru.

## Database

Saat ini entrypoint memakai `prisma db push` tanpa `--accept-data-loss` untuk kompatibilitas dengan instalasi yang sudah ada. Kegagalan sinkronisasi menghentikan container. Sebelum perubahan schema yang destruktif, buat backup/PITR Neon dan tinjau perubahan Prisma secara manual.

## Recovery singkat

- Update kode gagal: perbaiki `git pull --ff-only`, atau gunakan `./update.sh --no-pull` secara eksplisit untuk kode lokal.
- Nginx gagal divalidasi: skrip mengembalikan konfigurasi sebelumnya sebelum berhenti.
- Aplikasi tidak sehat: jalankan `./scripts/logs.sh app` lalu `./scripts/doctor.sh`.
- Certbot gagal: perbaiki DNS/firewall dan ulangi installer; status sukses tidak dicetak sebelum HTTPS aktif.
