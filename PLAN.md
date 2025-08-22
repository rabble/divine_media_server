# Implementation Plan

## Architecture (Recap)
- Stream‑native: Stream `uid` as primary ID, direct playback URLs.
- Worker responsibilities: create direct upload, handle webhook, serve status, optional lookups.
- State: Cloudflare KV for video status and alias indexes.

## Milestones
1) Design Stream‑native API and routes
- Define request/response schemas; pick error model.
- NIP‑98 auth model (owner=pubkey) and error codes.
- Confirm env vars: `STREAM_ACCOUNT_ID`, `STREAM_API_TOKEN`, `STREAM_WEBHOOK_SECRET`, `LOOKUPS_ENABLED`.

### Error Model (auth & Stream)
- 401 `{ error: "unauthorized", reason: "missing_nip98" }` when header absent.
- 400 `{ error: "bad_request", reason: "malformed_nip98" }` when Authorization is not NIP‑98 format.
- 403 `{ error: "forbidden", reason: "invalid_nip98" }` when signature invalid.
- 429 `{ error: "rate_limited" }` when per‑pubkey quota exceeded.
- 502 `{ error: "stream_error" }` when Stream API fails.

### Rate Limiting (KV-based)
- Key: `rl:pub:{pubkey}:{hourBucket}` stores a simple integer counter.
- Limit: default 30/hour; best‑effort increment (no atomicity guaranteed).

2) Scaffold Wrangler Worker and bindings
- Create `wrangler.toml`, KV namespace `MEDIA_KV`.
- Project layout: `src/` (routes, handlers, utils), `tests/`.

3) Implement create direct upload endpoint (POST /v1/videos)
- NIP‑98 verification (extract `pubkey`) and per‑pubkey rate limit.
- Call Stream Direct Upload API; include `meta` `{ pubkey, sha256?, vineId?, originalUrl? }`.
- Persist `video:{uid}` with `pending_upload`, `owner: pubkey`.
- If provided, index `sha256`, `vineId`, `originalUrl`; write `idx:pubkey:{pubkey}:{uid}`.
- Conflict policy: if provided alias already maps to a different `uid`, return 409.

4) Implement Stream webhook handler (POST /v1/stream/webhook)
- Validate signature; update `video:{uid}` → `published` with URLs.
- Backfill indexes from metadata if missing.

5) Implement status endpoint (GET /v1/videos/{uid})
- Read from KV; include HLS/DASH/thumbnail URLs when ready.
- Optionally fetch Stream status on cache miss and persist.

6) Optional lookup endpoints
- GET `/v1/lookup` supporting `sha256|vineId|url`.
- POST `/v1/videos/{uid}/aliases` (NIP‑98 protected) with conflict detection (409 on collisions).
- Optional: GET `/v1/users/{pubkey}/videos` lists UIDs via `idx:pubkey`.

### Aliases Policy
- Only the owner `pubkey` may attach aliases to a `uid`.
- Idempotent writes are allowed; conflicting writes return 409.
- URL alias stored by canonical URL and indexed by SHA‑256 digest.

7) Testing, Linting, CI
- Vitest + Miniflare for routes and KV; coverage ≥80% core paths.
- ESLint/Prettier; GitHub Actions (or Wrangler CI) for type/lint/test.
 - GitHub Actions added: Node 22, run `npm test`.

### Webhook Handling
- Verify via HMAC header `webhook-signature: t=<unix>,v1=<hex>` with 5‑minute window; reject with 403 when invalid. Fallback to `x-webhook-secret` in pre‑prod.
- Merge updates into existing `video:{uid}`; preserve owner and prior fields.
- Idempotent: repeated events keep state consistent.

8) Observability & Ops
- Structured logs; counters for uploads, webhook success/fail, lookup hits; per‑pubkey rate‑limit metrics.
- Alerts on webhook failure spikes and auth errors.

9) Deploy & Validate
- Stage with `wrangler dev`; deploy via `wrangler deploy`.
- Manual verification: upload → status → playback; alias lookups.

## Risks & Mitigations
- Webhook delivery issues → idempotent handler, retries ok, detect duplicates.
- Metadata conflicts in indexes → explicit 409 policy and admin tooling.
- Token leakage → secrets via Wrangler only; short‑lived direct uploads.

## Deliverables
- Worker code with endpoints, KV helpers, and tests.
- `wrangler.toml` with bindings, `README` snippets, and runbook.
- Migration/alias tools (if needed) as `tools/` scripts.
