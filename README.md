# Ledgerly — AI Finance Agent

Personal AI finance assistant with WhatsApp (Baileys), Telegram, and a premium web dashboard.

**Reliability principle:** AI understands intent and calls tools. The **Finance Engine** validates and mutates data. **PostgreSQL** is the single source of truth.

## Stack

- Next.js 16 + TypeScript (strict) + Tailwind + Shadcn UI
- Prisma + Neon PostgreSQL
- Auth.js (credentials + optional Google)
- Gemini / OpenRouter (user-configurable encrypted API keys)
- Grammy (Telegram) + Baileys (WhatsApp)
- Docker Compose for VPS deployment

## Preview lokal (tanpa Docker)

```bash
npm run setup:local
# edit .env → isi DATABASE_URL dari Neon (gratis)
npx prisma db push
npm run db:seed
npm run dev
```

Buka http://localhost:3000 — detail: **[docs/SETUP.md](docs/SETUP.md)**.

## Deploy VPS (Docker — aman bareng project lain)

```bash
git clone <REPO> ledgerly && cd ledgerly
cp .env.example .env
chmod +x deploy.sh redeploy.sh scripts/*.sh
./deploy.sh
```

Satu perintah: install Docker (jika perlu), generate secrets, **auto-pilih port yang belum dipakai**, build & up.  
Postgres/Redis internal — tidak bentrok project lain. Lihat `deploy/generated/PORT.txt`.

Detail: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Local development

See **[docs/SETUP.md](docs/SETUP.md)**.

```bash
npm install
cp .env.example .env
npx prisma generate && npx prisma db push
npm run dev
```

## Docs

| Doc | Path |
|-----|------|
| Setup | [docs/SETUP.md](docs/SETUP.md) |
| API | [docs/API.md](docs/API.md) |
| Deployment (VPS) | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Testing | [docs/TESTING.md](docs/TESTING.md) |

## Scripts

```bash
./deploy.sh / ./redeploy.sh
./scripts/status.sh / ./scripts/logs.sh
npm run dev / npm test
```

## Architecture

```
WhatsApp / Telegram / Web
        ↓
   AI Agent (tools)
        ↓
  Finance Engine
        ↓
   Neon PostgreSQL
```

## License

Private / proprietary unless otherwise stated.
