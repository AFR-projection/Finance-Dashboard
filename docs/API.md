# API Documentation

Base URL: `/api`

All authenticated endpoints require an Auth.js session cookie (except public share + worker ingress).

Response envelope:

```json
{ "ok": true, "data": {} }
```

Error:

```json
{ "ok": false, "error": { "code": "UNAUTHORIZED", "message": "..." } }
```

## Secure login (Socket.io + bot)

### `POST /api/auth/login-challenge`

```json
{ "email": "...", "password": "...", "fingerprintId": "..." }
```

Returns `approved` + ticket, or `awaiting_bot` + `confirmCode` (Redis TTL session).

### `POST /api/auth/login-confirm` (worker)

Header: `x-worker-secret`

```json
{ "action": "approve"|"reject", "code": "A1B2C3" }
```

Emits Socket.io `login:confirmed` / `login:rejected`.

### `POST /api/auth/login-ticket`

Exchange ticket; re-checks geo/IP drift → may return `REVALIDATE`.

### `GET /api/auth/login-status?sessionId=`

Polling fallback.

## Auth

### `POST /api/auth/register`

```json
{ "name": "Ada", "email": "ada@example.com", "password": "secret123" }
```

### `POST /api/auth/[...nextauth]`

Auth.js handlers (credentials / optional Google OAuth).

## Transactions

### `GET /api/transactions`

Query: `type`, `categoryId`, `search`, `from`, `to`, `limit`, `offset`

### `POST /api/transactions`

```json
{
  "type": "EXPENSE",
  "amount": 25000,
  "category": "Food",
  "description": "Kopi",
  "channel": "WEB"
}
```

### `PATCH /api/transactions/:id`

### `DELETE /api/transactions/:id`

## Dashboard & Insights

### `GET /api/dashboard`

Overview, cashflow, budgets, prediction, goals.

### `GET /api/insights`

Generates and persists period insights (non-sensitive summaries).

## Goals

### `GET|POST|PATCH /api/goals`

### `DELETE /api/goals?id=`

## AI Agent

### `POST /api/agent`

```json
{ "message": "Beli kopi 25 ribu", "channel": "WEB" }
```

Tools (always via Finance Engine):

- `createTransaction`
- `getTransactions`
- `generateFinancialReport`
- `analyzeBudget`
- `financialCoach`
- `predictFinances`

## Settings

### `GET /api/settings`

### `PUT /api/settings`

```json
{
  "aiModel": "openai/gpt-4o-mini",
  "apiKey": "optional-new-key",
  "currency": "IDR",
  "timezone": "Asia/Jakarta"
}
```

API keys are AES-GCM encrypted at rest.

## Budgets / Categories / Share

- `GET|POST /api/budgets`
- `GET /api/categories`
- `GET|PUT /api/share`
- `GET /api/share/:token` (public aggregates only)

## Channels (Telegram)

### `GET /api/channels`

### `POST /api/channels`

Manual link:

```json
{ "channel": "TELEGRAM", "externalId": "123456789" }
```

Pairing code:

```json
{ "action": "pair-code" }
```

### `PUT /api/channels`

Worker-only pairing (`x-worker-secret`):

```json
{ "channel": "TELEGRAM", "externalId": "123", "code": "A1B2C3" }
```

### `POST /api/channels/ingress`

Worker-only message processing (`x-worker-secret`).
