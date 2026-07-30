# Testing Documentation

## Automated

```bash
npm test
```

Currently covers Zod schemas for transactions, budgets, goals, and share defaults.

## Manual smoke tests

### Auth

1. Register at `/register`
2. Login at `/login`
3. Confirm redirect to `/dashboard`
4. Sidebar **Keluar** signs out; protected routes redirect to `/login`

### Finance Engine (API)

With session cookie:

```bash
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"EXPENSE\",\"amount\":25000,\"category\":\"Food\",\"description\":\"Kopi\"}"
```

Assert:

- amount stored as Decimal
- category auto-created / matched
- user isolation (another user cannot PATCH this id)

### AI Agent

1. Configure OpenRouter key in Settings
2. Open `/dashboard/agent`
3. Send: `Saya beli kopi 25 ribu`
4. Expect tool `createTransaction` and confirmation reply
5. Verify row appears in Transactions

### Budget & Goals

1. Create budget for Food; add expenses near limit
2. `/dashboard/budgets` shows warning/over status
3. Create a goal on `/dashboard/goals` and bump progress
4. Agent: `Apakah saya over budget?`

### Share

1. Set visibility PUBLIC, disable `showBalance`
2. Open `/share/:token` in private window
3. Confirm balance hidden and no raw transactions

### Telegram

1. Start `npm run worker:telegram`
2. Channels → Generate pairing code → `/link KODE` in Telegram
3. Send `bayar listrik 300 ribu`
4. Confirm reply + DB row with `channel=TELEGRAM`

## Reliability invariants

1. No Prisma writes inside `src/ai/**` except read for AI settings / memory helpers called from tools/engine.
2. All financial mutations call `FinanceEngine.*`.
3. Channel ingress rejects missing/invalid worker secret.
4. Public share never returns transaction line items.
