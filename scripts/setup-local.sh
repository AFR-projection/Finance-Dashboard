#!/usr/bin/env bash
# Setup cepat local tanpa Docker
set -euo pipefail
cd "$(dirname "$0")/.."

echo "➜ Ledgerly local setup (no Docker)"

if [[ ! -f .env ]]; then
  if [[ -f .env.local.example ]]; then
    cp .env.local.example .env
    echo "✔ .env dibuat dari .env.local.example"
  else
    cp .env.example .env
    echo "✔ .env dibuat dari .env.example"
  fi
  echo "! Edit .env → isi DATABASE_URL (Neon gratis)"
else
  echo "✔ .env sudah ada"
fi

npm install --legacy-peer-deps
npx prisma generate

echo
echo "Lanjut:"
echo "  1) Edit .env isi DATABASE_URL dari Neon"
echo "  2) npx prisma db push"
echo "  3) npm run dev"
echo "  4) Buka http://localhost:3000"
