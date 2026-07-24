#!/bin/sh
# Runtime entry — sync Neon schema lalu start app / worker command.
set -e

if [ "${SKIP_DB_PUSH:-0}" != "1" ] && [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] prisma db push (Neon)…"
  npx prisma db push --skip-generate || {
    echo "[entrypoint] WARN: prisma db push gagal — cek DATABASE_URL Neon"
    # App may still boot if schema already synced; fail hard only if FORCE_DB_PUSH=1
    if [ "${FORCE_DB_PUSH:-0}" = "1" ]; then
      exit 1
    fi
  }
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec npx tsx server.ts
