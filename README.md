# Cloudflare Stream–Native Media Service

This Worker issues Cloudflare Stream direct upload URLs, processes webhooks, exposes status, and provides optional lookup/alias endpoints. It is Stream‑native: clients upload directly to Stream and play via HLS URLs.

## Quick Start

- 1) Create KV namespaces and bind them in `wrangler.toml`
  - `wrangler kv namespace create MEDIA_KV`
  - Paste the returned id into `[[kv_namespaces]]` (for dev) and under `[env.staging]`/`[env.production]`.
- 2) Set secrets per environment
  - `wrangler secret put STREAM_API_TOKEN`
  - `wrangler secret put STREAM_WEBHOOK_SECRET`
  - For staging/prod: add `--env staging` or `--env production` to the above commands.
- 3) Set account variables in `wrangler.toml`
  - `STREAM_ACCOUNT_ID = "<your-account-id>"`
  - Toggle `LOOKUPS_ENABLED` as needed.

Run locally

- `npm test` — Node built‑in tests (no bundling needed)
- `wrangler dev` — start the Worker (uses default config)
- `wrangler dev --env staging` — start with staging bindings

## Endpoints

- POST `/v1/videos`
  - Auth: `Authorization: Nostr ...` (NIP‑98). Pre‑prod stub accepts `Nostr pubkey=<npub>`.
  - Body (optional): `{ sha256?, vineId?, originalUrl? }` — indexed if provided; 409 on conflicts.
  - Response: `{ uid, uploadURL, expiresAt, owner }`
- POST `/v1/stream/webhook`
  - Verify header: `webhook-signature: t=<unix>,v1=<hex>` (HMAC SHA256 over `t + '.' + rawBody`) within 5‑minute window. Fallback `x-webhook-secret` allowed (pre‑prod).
- GET `/v1/videos/{uid}` — returns `{ status, owner, hlsUrl?, dashUrl?, thumbnailUrl? }`
- GET `/v1/lookup?sha256=...|vineId=...|url=...` — returns `{ uid }` when enabled
- POST `/v1/videos/{uid}/aliases` — owner‑only; adds `{ sha256|vineId|url }`; 409 on conflicts
- GET `/v1/users/{pubkey}/videos` — lists UIDs via `idx:pubkey`

## Notes

- Primary ID is Stream `uid`. No R2 proxy.
- Rate limit uploads to 30/hour per pubkey (KV counters).
- All behavior is covered by tests (`node --test`).

## Deploy

- Staging: `wrangler deploy --env staging`
- Production: `wrangler deploy --env production`

## Example cURL

- Request upload (pre‑prod auth stub shown):
  - `curl -X POST "$URL/v1/videos" -H 'Authorization: Nostr pubkey=npub_example' -H 'content-type: application/json' -d '{"sha256":"abc...","vineId":"v1"}'`
- Webhook (HMAC):
  - Compute signature: `v1 = HEX(HMAC_SHA256(secret, t + '.' + body))`
  - `curl -X POST "$URL/v1/stream/webhook" -H 'content-type: application/json' -H 'webhook-signature: t=1690000000,v1=deadbeef...' -d '{"id":"uid","status":"ready","playback":{"hls":"..."}}'`
