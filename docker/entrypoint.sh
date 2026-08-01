#!/bin/sh
# Runtime entry — terapkan migrasi Neon lalu start app / worker command.
set -e

# `migrate deploy` hanya menjalankan file migrasi yang sudah ada dan tidak
# pernah menghapus kolom. `db push` sebelumnya menyamakan skema secara paksa —
# pada database yang dipakai bersama lokal dan produksi, itu bisa membuang
# kolom berisi data nyata hanya karena schema.prisma sedikit berbeda.
if [ "${SKIP_DB_MIGRATE:-0}" != "1" ] && [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] prisma migrate deploy (Neon)…"
  npx prisma migrate deploy || {
    echo "[entrypoint] ERROR: migrate deploy gagal — app tidak akan dijalankan"
    exit 1
  }
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec npx tsx server.ts
