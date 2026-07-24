# Self-Host — catatan tambahan

Panduan production utama ada di **[DEPLOY.md](./DEPLOY.md)**.

## Arsitektur (wajib dipahami)

```text
Internet → Nginx (:443 / SSL) → Next.js App (auto-port)
                              ↘ Redis (Docker internal)
Neon PostgreSQL (external)  ← satu-satunya database produksi
```

- **Jangan** mengandalkan Postgres di dalam container VPS untuk data keuangan.  
- `DATABASE_URL` di `.env` **harus** connection string Neon.  
- Redis tetap di Docker (ephemeral / cache) — volume `redis_data` + `wa_auth`.

## Script CLI

| Script | Fungsi |
|--------|--------|
| `./install.sh` | Fresh install: Docker, validasi Neon, auto-port, up stack, Nginx/SSL |
| `./deploy.sh` | Rebuild & restart **tanpa** `git pull` |
| `./update.sh` | `git pull` → backup `.env` → rebuild → `prisma db push` (Neon) → health |

## Docker build & Prisma

Build image memakai `DATABASE_URL` dummy (tidak hit Neon).  
Schema sync terjadi di **runtime** lewat `docker/entrypoint.sh` → `prisma db push`.

## Firewall singkat

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Restore `.env`

Backup otomatis di `.env-backups/` setiap `./update.sh`.
