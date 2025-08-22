# Cloudflare Stream–Native Media Service (PRD)

## Overview
Build a pre‑production media service for the Divine media server using Cloudflare Stream for ingestion/transcoding and CF CDN for delivery. Use a Cloudflare Worker for API endpoints, webhooks, and lightweight state in KV. Design is Stream‑native: clients use Stream `uid` and playback URLs directly. Writes are attributed to open Nostr clients via NIP‑98, recording the publisher `pubkey` in Stream `meta` and KV.

## Goals
- Direct uploads via Stream Direct Upload URLs; no media proxying.
- Minimal API: create upload, webhook, status.
- Optional lookup indexes (sha256, vineId, original URL) to resolve `uid`.
- Simple, fast reads via KV; low operational overhead.

## Non‑Goals (initial)
- R2 storage or MP4 proxying.
- Worker‑proxied playback/thumbnail routes.
- Hard dedup enforcement (best‑effort via indexes only).

## Users & Flows
- Open clients (Nostr): request upload with NIP‑98 → upload to Stream → poll status → play HLS; ownership is the verified `pubkey`.
- Admin/ingest tools may attach aliases (sha256/vineId/url) post‑facto.

- POST `/v1/videos` → `{ uid, uploadURL, expiresAt, owner: pubkey }` (accept optional `{ sha256, vineId, originalUrl, meta }`).
- POST `/v1/stream/webhook` → Stream callback; validates signature; updates KV record.
- GET `/v1/videos/{uid}` → `{ status, owner: pubkey }` plus `{ hlsUrl, dashUrl?, thumbnailUrl? }` when available.
- Optional: GET `/v1/lookup?sha256=...|vineId=...|url=...` → `{ uid }`; POST `/v1/videos/{uid}/aliases`; GET `/v1/users/{pubkey}/videos`.
  - POST `/v1/videos` accepts optional `{ sha256, vineId, originalUrl }`; indexes them. If any provided alias conflicts, respond 409.

## Data Model (KV)
- `video:{uid}` → `{ status, owner: pubkey, createdAt, hlsUrl, dashUrl?, thumbnailUrl?, sha256?, vineId?, originalUrl?, meta? }`
- `idx:sha256:{hex}` → `{ uid }`
- `idx:vine:{vineId}` → `{ uid }`
- `idx:url:{sha256(canonicalUrl)}` → `{ uid, url }`
- `idx:pubkey:{pubkey}:{uid}` → `1` (sparse index for listing a publisher’s videos)
- `rl:pub:{pubkey}:{hourBucket}` → integer count for simple rate limiting

## Ownership & Aliases
- Owner is the verified NIP‑98 `pubkey` used to create the upload ticket.
- Only the owner may attach aliases to a video via `POST /v1/videos/{uid}/aliases`.
- Idempotent writes are allowed; conflicting aliases return 409.
- URL aliases are stored canonically and indexed by SHA‑256 of the canonical URL.

## Auth, Security, Limits
- NIP‑98 on write endpoints; verified `pubkey` becomes the owner (can be relaxed in pre‑prod).
- Rate‑limit by pubkey (e.g., 30/hour) using KV counters.
- Webhook signatures: header `webhook-signature: t=<unix>,v1=<hex>` must match `HMAC_SHA256(secret, `${t}.${rawBody}`)` within 5‑minute clock skew; fallback `x-webhook-secret` equality allowed in pre‑prod.
- Secrets via Wrangler; never committed.

### Error Model
- 401 `{ error: "unauthorized", reason: "missing_nip98" }` when Authorization absent.
- 400 `{ error: "bad_request", reason: "malformed_nip98" }` when Authorization is not NIP‑98 format.
- 403 `{ error: "forbidden", reason: "invalid_nip98" }` when signature invalid.
- 429 `{ error: "rate_limited" }` when quota exceeded.
- 502 `{ error: "stream_error" }` when Stream API fails.

## Success Criteria
- TTFP: publish to first playable HLS manifest < 60s (Stream‑dependent).
- Webhook update success ≥ 99.9%; endpoint p95 latency < 100ms.
- Lookup hit ratio ≥ 95% for provided aliases.

## Open Questions / Future
- GIF output requirement? If needed, separate path or drop.
- MP4 downloads? Use Stream downloads if required.
- NIP‑96 coexistence strategy for images vs. videos.
