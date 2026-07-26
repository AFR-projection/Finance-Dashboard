#!/bin/sh
# Runtime entry — sync Neon schema lalu start app / worker command.
set -e

if [ "${SKIP_DB_PUSH:-0}" != "1" ] && [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] prisma db push (Neon)…"
  npx prisma db push --skip-generate || {
    echo "[entrypoint] ERROR: prisma db push gagal — app tidak akan dijalankan"
    exit 1
  }
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec npx tsx server.ts
