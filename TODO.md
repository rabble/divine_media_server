# TODO

## Core API
- [ ] Scaffold Worker project structure (`src/`, `tests/`, `wrangler.toml`).
- [ ] Bind `MEDIA_KV` (KV), set secrets: `STREAM_ACCOUNT_ID`, `STREAM_API_TOKEN`, `STREAM_WEBHOOK_SECRET`.
- [ ] POST `/v1/videos`: NIP‑98 verify (extract `pubkey`), rate‑limit per pubkey, create Direct Upload (Stream API with `meta.pubkey`), write `video:{uid}` with `owner`.
- [ ] POST `/v1/stream/webhook`: validate signature, update status/URLs, idempotent writes.
- [ ] GET `/v1/videos/{uid}`: read status from KV; include playback/thumbnail URLs and `owner`.

## Lookups (Optional)
- [ ] KV helpers for indexes: `idx:sha256:*`, `idx:vine:*`, `idx:url:*`.
- [ ] KV sparse index per publisher: `idx:pubkey:{pubkey}:{uid}`.
- [ ] Canonical URL hashing (strip fragment, sort params, lowercase host, no default ports).
- [ ] GET `/v1/lookup` for `sha256|vineId|url`.
- [ ] POST `/v1/videos/{uid}/aliases` with 409 on conflicts.
- [ ] Optional: GET `/v1/users/{pubkey}/videos` (list via `idx:pubkey`).

## Auth & Limits
- [ ] NIP‑98 verification for write endpoints (toggleable for pre‑prod); store `pubkey` as owner.
- [ ] Rate limit per pubkey (e.g., 30/hour) using KV counters; structured logs on throttling.
  - [x] Default NIP‑98 stub: parses `Authorization: Nostr pubkey=<value>` for tests.
  - [x] Error: 400 on malformed Authorization; 403 on invalid.
  - [x] Default webhook verifier: header `x-webhook-secret` equals `STREAM_WEBHOOK_SECRET`.

## Quality & Ops
- [ ] Vitest + Miniflare tests (≥80% core coverage).
- [x] ESLint/Prettier config; `npm scripts` for dev/test/lint.
- [x] CI workflow runs tests + lint + format check.
- [ ] Structured logs; counters for uploads/webhooks/lookups; basic alerts.

## Deployment
- [ ] Stage on `wrangler dev` with sample secrets and KV.
- [ ] `wrangler deploy` to pre‑prod; run end‑to‑end verification.

## Progress (TDD)
- [x] Test: POST `/v1/videos` without NIP‑98 → 401.
- [x] Test: POST `/v1/videos` with invalid NIP‑98 → 403.
- [x] Test: POST `/v1/videos` with valid NIP‑98 → 200, creates Stream direct upload, writes KV owner.
- [x] Test: Webhook requires valid signature → 403.
- [x] Test: Webhook updates record to published with URLs; idempotent.
- [x] Test: GET `/v1/videos/{uid}` returns record; 404 when missing.
- [x] Test: GET `/v1/lookup` returns uid when enabled; 404 when disabled.
- [x] Test: POST `/v1/videos/{uid}/aliases` requires NIP‑98, owner‑only, writes indexes, 409 on conflict.
- [x] Test: GET `/v1/users/{pubkey}/videos` lists UIDs via `idx:pubkey`.
- [x] CI: GitHub Actions workflow running `npm test`.
