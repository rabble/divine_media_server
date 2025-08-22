
Real Requirements

- Upload:
    - Auth: NIP-98 for all write endpoints.
    - Dedup: Preflight by SHA-256; return existing URL if found.
    - Rate-limit: Per pubkey (e.g., 30/hour).
    - Video handling: Direct to Stream; support progress/status; allow client to upload without proxying through Worker.
- Processing:
    - Stream transcodes to HLS/DASH; we don’t handle heavy transforms in Worker.
    - Thumbnails: Use Stream thumbnails via Cloudflare Images transformation for sizes.
- Serving:
    - Primary: Stream CDN playback (HLS; DASH optional).
    - Compatibility: Keep /media/{fileId} and /thumbnail/{fileId} working; redirect to Stream if migrated, otherwise serve from R2.
- Metadata:
    - Keep KV mappings: sha256→fileId, vine_id→fileId, filename→fileId.
    - Add mappings for Stream: fileId→streamUid and streamUid→fileId.
- Webhooks/Status:
    - Webhook to mark completed, populate playback/thumbnail URLs.
    - Status polling endpoint for clients.
- Security:
    - Webhook signature validation.
    - Optional short-lived signed URLs only if needed; otherwise rely on Stream’s secured playback URLs.

New Stream Service (API Surface)

- POST /v1/media/request-upload
    - Auth NIP-98; returns { videoId (UUID for our KV), uploadURL, expiresAt }.
    - Stores KV v1:video:{videoId} with status=pending_upload.
- POST /v1/webhooks/stream-complete
    - Validates signature; updates KV to processing → async moderation → published.
    - Saves Stream uid, playback URLs, thumbnail URL.
- GET /v1/media/status/{videoId}
    - Returns { status }; for published, includes hlsUrl, dashUrl, thumbnailUrl.
- GET /api/check/{sha256} and POST /api/check
    - Preflight dedup (already implemented).
- GET /api/media/lookup
    - Preflight by vine_id or filename (already implemented).

Notes:

- NIP-96 /api/upload: For images or legacy flows keep as-is. For videos, respond with “processing” and instruct client to use Stream upload route, or transparently create a Stream direct_upload and return that in a
NIP-96-compatible processing response. We can phase this.

Serving Strategy

- GET /media/{fileId}
    - If KV stream:file:{fileId} exists → 302 redirect to HLS playlist https://videodelivery.net/{uid}/manifest/video.m3u8 (or configurable format=hls|dash).
    - Else → serve from R2 (current behavior).
- GET /thumbnail/{fileId}
    - If mapped → redirect to https://imagedelivery.net/{accountHash}/{uid}/w=400,h=300 (or param-driven sizes).
    - Else → serve R2 image fallback.
- Optional: keep /video/{fileId} as MP4 proxy for strict MP4 consumers; prefer HLS for primary playback.

KV/Data Model

- Existing:
    - sha256:{hash} -> fileId
    - vine_id:{vineId} -> { fileId, uploadedAt, ... }
    - filename:{name} -> { fileId, vineId?, uploadedAt }
- New:
    - stream:file:{fileId} -> { uid, state, migratedAt }
    - stream:uid:{uid} -> { fileId } (reverse lookup if needed)
    - Reuse v1:video:{videoId} structure used by Stream endpoints for status/playback URLs.
- Analytics unchanged (UPLOAD_ANALYTICS/VIDEO_ANALYTICS).

Migration Plan

- Discovery:
    - List R2 uploads/ objects; filter video types.
    - For each, derive fileId from key; find sha256 and vine/filename mappings if present.
- Import to Stream:
    - Generate temporary signed URL to the R2 object.
    - Call Stream “create video” with { input: signedUrl, meta: { fileId, sha256, originalFilename } }.
    - Store stream:file:{fileId} -> { uid, state: importing }.
- Webhook completion:
    - On ready, update v1:video:{uid} to published with playback URLs, save reverse mapping stream:uid:{uid} -> { fileId }, and set stream:file:{fileId}.state = published.
- Cutover serving:
    - Update /media/{fileId} and /thumbnail/{fileId} to redirect if mapping exists.
    - Leave R2 serving as fallback for unmigrated items.
- Validation:
    - Sample verify playback and thumbnails.
    - Backfill any missing sha256 mappings (if needed) using known values; avoid full re-hash unless necessary.
- Decommission (optional, later):
    - After confidence period, optionally remove R2 originals or keep as cold backup.

Gaps to Resolve

- Env naming: code uses STREAM_WEBHOOK_SECRET; wrangler vars list WEBHOOK_SECRET. We should standardize on one and update references.
- NIP-96 coexistence: decide UX for video uploads (either NIP-96 returns a processing handoff to Stream, or the app uses Stream endpoints for videos; images continue via NIP-96).
- GIF conversion: Stream does not emit GIFs. If GIFs are required, we need a separate path or drop GIF output in favor of short MP4/HLS. Confirm requirement.
- MP4 direct download: If clients require MP4 files, enable Stream “downloads” and either expose mp4Url or continue proxy via /video/{fileId}.

Suggested Work Breakdown

- Stream Upload Service
    - Finalize env secrets and config; unify webhook secret.
    - Implement/confirm: request-upload, webhook, status (largely present).
    - Extend: mapping storage stream:file:{fileId} and redirects in /media and /thumbnail.
- Migration Script (Worker task or one-off tool)
    - Iterate R2 objects, create Stream imports with signed URLs, store mappings.
    - Idempotency and resume capability (skip if mapping exists).
- Compatibility & Cleanup
    - /media and /thumbnail redirect logic; fallback to R2.
    - Keep sha256/vine_id/filename KV as-is.
    - Optional: dashboard/metrics for migration progress.
