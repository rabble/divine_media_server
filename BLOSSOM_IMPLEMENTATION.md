# Blossom Protocol Implementation

## Overview

This service now implements the **Blossom Protocol** (BUD-01 and BUD-02) for decentralized blob storage compatible with Nostr.

## Changes Made

### 1. BUD-02 Compliant Upload (`PUT /upload`)

**Location:** `src/handlers/blossom.mjs:87-209`

**Implementation:**
- Accepts raw binary data in request body (not JSON metadata)
- Calculates SHA-256 hash of uploaded data server-side
- Validates auth event `x` tag matches calculated hash
- Stores blob directly to R2 bucket
- Returns proper Blossom blob descriptor

**Request Format:**
```http
PUT /upload HTTP/1.1
Authorization: Nostr <base64-encoded-event>
Content-Type: video/mp4
Content-Length: <bytes>

<binary video data>
```

**Auth Event Format:**
```json
{
  "kind": 24242,
  "tags": [
    ["t", "upload"],
    ["x", "<sha256-hash>"],
    ["expiration", "<unix-timestamp>"]
  ],
  "content": "Upload video to Blossom server"
}
```

**Response Format:**
```json
{
  "url": "https://cdn.divine.video/<sha256>.mp4",
  "sha256": "<hash>",
  "size": <bytes>,
  "type": "video/mp4",
  "uploaded": <unix-timestamp>
}
```

### 2. BUD-01 Compliant Retrieval (`GET /<sha256>`)

**Location:** `src/handlers/blossom.mjs:10-82`

**Features:**
- Retrieves blob directly from R2
- Supports file extensions (e.g., `/<sha256>.mp4`)
- Returns proper CORS headers
- Supports HTTP range requests for video streaming
- Returns `206 Partial Content` for range requests

**Response Headers:**
```
Content-Type: video/mp4
Content-Length: <bytes>
Access-Control-Allow-Origin: *
Cache-Control: public, max-age=31536000
Accept-Ranges: bytes
ETag: <r2-etag>
```

### 3. BUD-01 Compliant HEAD Endpoint

**Location:** `src/handlers/blossom.mjs:87-129`

**Features:**
- Returns metadata without body
- Includes Content-Type and Content-Length
- Signals range request support

### 4. Deprecated Code Removed

**Removed:**
- Redirect to `/v1/videos` endpoint
- JSON metadata parsing in upload
- Two-step upload flow (uploadURL pattern)
- Cloudflare Stream dependency

## Testing

### Local Testing

```bash
# Start dev server
wrangler dev

# Run test script
./test_blossom_upload.mjs
```

### Production Testing

```bash
TEST_SERVER=https://cf-stream-service-prod.protestnet.workers.dev ./test_blossom_upload.mjs
```

## Flutter Client Changes Required

### Before (Incorrect):
```dart
// ❌ Old approach - doesn't work
final response = await http.post(
  Uri.parse('$baseUrl/upload'),
  headers: {'Authorization': 'Nostr $authEvent'},
  body: jsonEncode({'sha256': hash})
);
```

### After (Correct):
```dart
// ✅ New BUD-02 compliant approach
final response = await http.put(
  Uri.parse('$baseUrl/upload'),
  headers: {
    'Authorization': 'Nostr $authEvent',
    'Content-Type': 'video/mp4',
    'Content-Length': videoBytes.length.toString(),
  },
  body: videoBytes  // Raw binary data
);
```

## Spec Compliance

### BUD-01 (Blob Retrieval)
- ✅ `GET /<sha256>` returns blob
- ✅ Optional file extension support
- ✅ `HEAD /<sha256>` returns metadata
- ✅ CORS headers (`Access-Control-Allow-Origin: *`)
- ✅ Range request support
- ✅ Proper Content-Type headers

### BUD-02 (Upload and Management)
- ✅ `PUT /upload` accepts binary data
- ✅ Returns Blob Descriptor with required fields
- ✅ Authorization with kind 24242 events
- ✅ `t` tag validation (upload verb)
- ✅ `x` tag validation (SHA-256 match)
- ✅ Expiration checking
- ✅ Deduplication (returns existing blob if hash matches)
- ✅ `GET /list/<pubkey>` lists user's blobs
- ✅ `DELETE /<sha256>` removes blobs

## Architecture

```
Client (Flutter)
    ↓ PUT /upload (binary data)
Worker (blossom.mjs)
    ↓ Calculate SHA-256
    ↓ Validate auth
    ↓ Store to R2
    ↓ Store metadata to KV
    ↓ Return blob descriptor
Client receives URL
    ↓ GET /<sha256>.mp4
Worker serves from R2
```

## Storage

- **R2 Bucket:** `nostrvine-media`
- **R2 Key Pattern:** `videos/<sha256>.mp4`
- **KV Indexes:**
  - `video:<uid>` → Full video metadata
  - `idx:sha256:<hash>` → UID lookup
  - `idx:pubkey:<pubkey>:<uid>` → User's blobs

## Security

1. **Authorization Required:** All uploads require valid kind 24242 Nostr event
2. **Hash Verification:** Server calculates SHA-256 and validates against auth event
3. **Ownership:** Delete operations verify pubkey ownership
4. **Expiration:** Auth events must have valid expiration timestamp

## Performance

- **Deduplication:** Identical files (same SHA-256) are only stored once
- **Caching:** Blobs cached for 1 year (`max-age=31536000`)
- **Range Requests:** Enables efficient video streaming
- **Direct R2 Serving:** No intermediate proxies or redirects

## Monitoring

Check logs for:
- `🌸 Upload:` - Upload operations
- `✅` - Successful operations
- `❌` - Failed operations

## Next Steps

1. Deploy updated worker to production
2. Update Flutter client to use PUT with binary data
3. Test end-to-end upload and retrieval
4. Monitor logs for any issues
