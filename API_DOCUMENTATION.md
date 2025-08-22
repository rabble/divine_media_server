# Cloudflare Stream Service API Documentation

## Overview
This service provides video upload and management via Cloudflare Stream. Videos are uploaded directly to Cloudflare Stream using direct upload URLs, avoiding proxy overhead. The service uses NIP-98 authentication to identify video owners.

## Base URLs
- **Production**: `https://cf-stream-service-prod.protestnet.workers.dev`
- **Staging**: `https://cf-stream-service-staging.protestnet.workers.dev`

## Authentication

### Production (NIP-98 Required)
All write endpoints require NIP-98 HTTP authentication (Nostr event kind 27235).

**Header Format:**
```
Authorization: Nostr <base64_encoded_event>
```

**Event Structure:**
```json
{
  "id": "<sha256_of_serialized_event>",
  "pubkey": "<hex_public_key>",
  "created_at": <unix_timestamp>,
  "kind": 27235,
  "tags": [
    ["u", "<full_request_url>"],
    ["method", "<HTTP_METHOD>"],
    ["payload", "<sha256_of_request_body>"]  // Only if body present
  ],
  "content": "",
  "sig": "<schnorr_signature>"
}
```

### Staging (Simplified Dev Mode)
For testing only:
```
Authorization: Nostr pubkey=<any_identifier>
```

## Endpoints

### 1. Create Video Upload URL
Creates a direct upload URL for Cloudflare Stream.

**Request:**
```http
POST /v1/videos
Authorization: Nostr <base64_event>
Content-Type: application/json

{
  "sha256": "optional_file_hash",      // Optional: SHA-256 of video file
  "vineId": "optional_vine_id",        // Optional: Vine-style video ID
  "originalUrl": "https://example.com" // Optional: Original video URL
}
```

**Response (200 OK):**
```json
{
  "uid": "03c0ddc7d34f4a9ab8c3ba19b60fe263",
  "uploadURL": "https://upload.cloudflarestream.com/03c0ddc7d34f4a9ab8c3ba19b60fe263",
  "expiresAt": null,
  "owner": "85354676535b5a1f9d82443d88c70643b73657f79d4a0a15fa0d5176c4a680a6"
}
```

**Upload Process:**
1. Use the `uploadURL` to upload video directly to Cloudflare Stream
2. Upload method: `PUT` or `POST` with video file
3. Stream will process the video and make it available for playback

**Error Responses:**
- `401`: Missing authentication
- `403`: Invalid NIP-98 signature
- `409`: Conflict - sha256, vineId, or URL already exists
- `429`: Rate limited (30 uploads/hour per pubkey)
- `502`: Stream API error

### 2. Get Video Status
Retrieve video information and playback URLs.

**Request:**
```http
GET /v1/videos/{uid}
```

**Response (200 OK):**
```json
{
  "uid": "03c0ddc7d34f4a9ab8c3ba19b60fe263",
  "status": "ready",
  "owner": "85354676535b5a1f9d82443d88c70643b73657f79d4a0a15fa0d5176c4a680a6",
  "hlsUrl": "https://customer-abc.cloudflarestream.com/03c0ddc7d34f4a9ab8c3ba19b60fe263/manifest/video.m3u8",
  "dashUrl": "https://customer-abc.cloudflarestream.com/03c0ddc7d34f4a9ab8c3ba19b60fe263/manifest/video.mpd",
  "thumbnailUrl": "https://customer-abc.cloudflarestream.com/03c0ddc7d34f4a9ab8c3ba19b60fe263/thumbnails/thumbnail.jpg"
}
```

**Status Values:**
- `pending_upload`: Waiting for video upload
- `uploading`: Upload in progress
- `processing`: Stream is processing video
- `ready`: Video ready for playback
- `error`: Processing failed

### 3. Lookup Video by Alias
Find video UID by sha256, vineId, or URL.

**Request:**
```http
GET /v1/lookup?sha256=<hash>
GET /v1/lookup?vineId=<vine_id>
GET /v1/lookup?url=<encoded_url>
```

**Response (200 OK):**
```json
{
  "uid": "03c0ddc7d34f4a9ab8c3ba19b60fe263"
}
```

**Response (404):**
```json
{
  "error": "not_found"
}
```

### 4. Add Aliases to Video
Owner can add aliases after video creation.

**Request:**
```http
POST /v1/videos/{uid}/aliases
Authorization: Nostr <base64_event>
Content-Type: application/json

{
  "sha256": "optional_hash",
  "vineId": "optional_vine_id",
  "url": "https://example.com/video"
}
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Error Responses:**
- `403`: Not the video owner
- `409`: Alias already exists for different video

### 5. List User Videos
Get all video UIDs for a specific publisher.

**Request:**
```http
GET /v1/users/{pubkey}/videos
```

**Response (200 OK):**
```json
{
  "pubkey": "85354676535b5a1f9d82443d88c70643b73657f79d4a0a15fa0d5176c4a680a6",
  "uids": [
    "03c0ddc7d34f4a9ab8c3ba19b60fe263",
    "a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9"
  ]
}
```

### 6. Stream Webhook Handler
Receives status updates from Cloudflare Stream.

**Request:**
```http
POST /v1/stream/webhook
Content-Type: application/json
webhook-signature: t=<timestamp>,v1=<hmac_signature>

{
  "id": "03c0ddc7d34f4a9ab8c3ba19b60fe263",
  "status": "ready",
  "playback": {
    "hls": "https://customer.cloudflarestream.com/.../video.m3u8",
    "dash": "https://customer.cloudflarestream.com/.../video.mpd"
  },
  "thumbnail": "https://customer.cloudflarestream.com/.../thumbnail.jpg"
}
```

## Rate Limits
- 30 video uploads per hour per pubkey
- No limits on read operations

## Example Implementation

### JavaScript/TypeScript Client
```javascript
// Create NIP-98 authentication
async function createNip98Auth(url, method, body) {
  const privKey = getPrivateKey(); // Your Nostr private key
  const pubKey = getPublicKey(privKey);
  
  const event = {
    pubkey: pubKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 27235,
    tags: [
      ['u', url],
      ['method', method],
      body ? ['payload', sha256(body)] : null
    ].filter(Boolean),
    content: ''
  };
  
  event.id = sha256(JSON.stringify([
    0, event.pubkey, event.created_at, 
    event.kind, event.tags, event.content
  ]));
  
  event.sig = schnorrSign(event.id, privKey);
  
  return 'Nostr ' + btoa(JSON.stringify(event));
}

// Upload video
async function uploadVideo(videoFile) {
  // Step 1: Get upload URL
  const response = await fetch('https://cf-stream-service-prod.protestnet.workers.dev/v1/videos', {
    method: 'POST',
    headers: {
      'Authorization': await createNip98Auth(url, 'POST', body),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sha256: await sha256(videoFile)
    })
  });
  
  const { uid, uploadURL } = await response.json();
  
  // Step 2: Upload to Cloudflare Stream
  await fetch(uploadURL, {
    method: 'PUT',
    body: videoFile
  });
  
  // Step 3: Poll for status
  let status = 'pending_upload';
  while (status !== 'ready') {
    await sleep(5000);
    const statusRes = await fetch(`/v1/videos/${uid}`);
    const data = await statusRes.json();
    status = data.status;
  }
  
  return uid;
}
```

### Python Client
```python
import hashlib
import json
import base64
import time
from nostr import PrivateKey, Event

def create_nip98_auth(url: str, method: str, body: str = None) -> str:
    private_key = PrivateKey()
    
    tags = [
        ['u', url],
        ['method', method]
    ]
    
    if body:
        body_hash = hashlib.sha256(body.encode()).hexdigest()
        tags.append(['payload', body_hash])
    
    event = Event(
        public_key=private_key.public_key.hex(),
        created_at=int(time.time()),
        kind=27235,
        tags=tags,
        content=""
    )
    
    event.sign(private_key)
    
    event_json = json.dumps(event.to_dict())
    return f"Nostr {base64.b64encode(event_json.encode()).decode()}"

# Create upload URL
def create_upload(sha256: str = None, vine_id: str = None):
    url = "https://cf-stream-service-prod.protestnet.workers.dev/v1/videos"
    body = json.dumps({"sha256": sha256, "vineId": vine_id})
    
    headers = {
        "Authorization": create_nip98_auth(url, "POST", body),
        "Content-Type": "application/json"
    }
    
    response = requests.post(url, headers=headers, data=body)
    return response.json()
```

## Video Playback

Once a video is ready, use the HLS or DASH URLs for playback:

### HLS (m3u8)
```html
<video controls>
  <source src="{hlsUrl}" type="application/x-mpegURL">
</video>
```

### With HLS.js
```javascript
if (Hls.isSupported()) {
  const video = document.getElementById('video');
  const hls = new Hls();
  hls.loadSource(hlsUrl);
  hls.attachMedia(video);
}
```

## Error Handling

All errors follow this format:
```json
{
  "error": "error_type",
  "reason": "detailed_reason",  // Optional
  "fields": ["field1", "field2"] // For validation errors
}
```

Common error types:
- `unauthorized`: Missing authentication
- `forbidden`: Invalid authentication or permission denied
- `bad_request`: Malformed request
- `not_found`: Resource doesn't exist
- `conflict`: Resource already exists
- `rate_limited`: Too many requests
- `stream_error`: Cloudflare Stream API error
- `server_error`: Internal server error

## Best Practices

1. **Store UIDs**: Always store the video UID after creation
2. **Poll Status**: Check video status periodically until ready
3. **Handle Rate Limits**: Implement exponential backoff on 429 errors
4. **Cache Playback URLs**: HLS/DASH URLs are stable once generated
5. **Use Aliases**: Set sha256/vineId during creation to enable lookups
6. **Webhook Integration**: Configure webhooks for real-time status updates

## Testing

Use staging environment with simplified auth for development:
```bash
curl -X POST https://cf-stream-service-staging.protestnet.workers.dev/v1/videos \
  -H 'Authorization: Nostr pubkey=test_user' \
  -H 'Content-Type: application/json' \
  -d '{"sha256":"test_hash"}'
```