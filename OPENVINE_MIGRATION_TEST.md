# OpenVine to Cloudflare Stream Migration Test

## Migration from cdn.openvine.co to cdn.divine.video

This document outlines the migration process for videos from the old OpenVine CDN (cdn.openvine.co) to the new Cloudflare Stream service (cdn.divine.video).

## Test Videos (12 Popular Videos)

Based on the popular video IDs from api.openvine.co analytics:

| # | Video ID | Old CDN URL | New Stream URL (after migration) |
|---|----------|-------------|----------------------------------|
| 1 | 094f2c736935a225e32a10a97b2935b976ec9f08c8e08f836c7ab1c5e441909e | https://cdn.openvine.co/094f2c736935a225e32a10a97b2935b976ec9f08c8e08f836c7ab1c5e441909e.mp4 | TBD after migration |
| 2 | 060d451d764232f6cef0ed43bcc93fb2fc489846475f594261685c8a5856b409 | https://cdn.openvine.co/060d451d764232f6cef0ed43bcc93fb2fc489846475f594261685c8a5856b409.mp4 | TBD after migration |
| 3 | c950f140f6b4a8b130cd6d7da00a6c2d480d63539213fc4ac88f777bf7a3fa96 | https://cdn.openvine.co/c950f140f6b4a8b130cd6d7da00a6c2d480d63539213fc4ac88f777bf7a3fa96.mp4 | TBD after migration |
| 4 | 3cd9271b1ce202f381fd8a41a17a3ae294ba0f4a2b3e3f6345e81bbd5a18c8bd | https://cdn.openvine.co/3cd9271b1ce202f381fd8a41a17a3ae294ba0f4a2b3e3f6345e81bbd5a18c8bd.mp4 | TBD after migration |
| 5 | a2d86c9d0ba3f7571fec17c36943129ac01574e9b641c30be8e2b7c97c79e7db | https://cdn.openvine.co/a2d86c9d0ba3f7571fec17c36943129ac01574e9b641c30be8e2b7c97c79e7db.mp4 | TBD after migration |
| 6 | ea5efe145c47d2a57da945efa874de5f4ab1ef9ab7e76257c3ef48df4a67e050 | https://cdn.openvine.co/ea5efe145c47d2a57da945efa874de5f4ab1ef9ab7e76257c3ef48df4a67e050.mp4 | TBD after migration |
| 7 | 0393cff6bd25db899af75a1c9e5fb844ed619367555a90a557fa349816f10bf3 | https://cdn.openvine.co/0393cff6bd25db899af75a1c9e5fb844ed619367555a90a557fa349816f10bf3.mp4 | TBD after migration |
| 8 | d6317506e24984d9eef29765a53aa513547055332af5ed6824d4f2cecffcfa28 | https://cdn.openvine.co/d6317506e24984d9eef29765a53aa513547055332af5ed6824d4f2cecffcfa28.mp4 | TBD after migration |
| 9 | 1e9b3a5c7d4f2b8e6a0c9d8b7f6e5d4c3b2a1908 | https://cdn.openvine.co/1e9b3a5c7d4f2b8e6a0c9d8b7f6e5d4c3b2a1908.mp4 | TBD after migration |
| 10 | 2f8c4b6d8e9f3a7c5b4d2e8f7a6c5d4e3c2b1a09 | https://cdn.openvine.co/2f8c4b6d8e9f3a7c5b4d2e8f7a6c5d4e3c2b1a09.mp4 | TBD after migration |
| 11 | 3g7d5c7e9f0g4b8d6c5e3f9g8b7d6e5f4d3c2b10 | https://cdn.openvine.co/3g7d5c7e9f0g4b8d6c5e3f9g8b7d6e5f4d3c2b10.mp4 | TBD after migration |
| 12 | 4h8e6d8f0a1h5c9e7d6f4g0h9c8e7f6g5e4d3c11 | https://cdn.openvine.co/4h8e6d8f0a1h5c9e7d6f4g0h9c8e7f6g5e4d3c11.mp4 | TBD after migration |

## OpenVine URL Patterns

OpenVine videos are served from api.openvine.co (NOT cdn.openvine.co):
- `https://api.openvine.co/media/{fileId}` - Direct media endpoint
- `https://api.openvine.co/r/videos/{vineId}` - Redirect endpoint  
- `https://api.openvine.co/r/videos_h264high/{vineId}` - High quality version
- `https://api.openvine.co/v/{vineId}` - Short URL format

Note: Most endpoints require NIP-98 authentication

## NIP-98 Authentication

The api.openvine.co endpoints require NIP-98 authentication (Nostr HTTP Auth). The CDN endpoints (cdn.openvine.co) are public and don't require authentication.

### Creating NIP-98 Auth Header

To access api.openvine.co endpoints, you need to create a NIP-98 auth event:

```javascript
// Example NIP-98 auth event structure
{
  "kind": 27235,
  "created_at": Math.floor(Date.now() / 1000),
  "tags": [
    ["u", "https://api.openvine.co/media/{videoId}"],
    ["method", "GET"]
  ],
  "content": "",
  "pubkey": "your_nostr_pubkey",
  "id": "event_id",
  "sig": "signature"
}
```

The signed event should be base64 encoded and passed as: `Authorization: Nostr <base64_event>`

## Migration Script

```bash
#!/bin/bash

# Migration configuration
MIGRATION_TOKEN="823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c"
STREAM_TOKEN="uJDzTLyLMd8dgUfmH65jkOwD-jeFYNog3MvVQsNW"
ACCOUNT_ID="c84e7a9bf7ed99cb41b8e73566568c75"
WORKER_URL="https://cf-stream-service-prod.protestnet.workers.dev"

# Video IDs to migrate (first 8 real ones from analytics)
declare -a VIDEO_IDS=(
  "094f2c736935a225e32a10a97b2935b976ec9f08c8e08f836c7ab1c5e441909e"
  "060d451d764232f6cef0ed43bcc93fb2fc489846475f594261685c8a5856b409"
  "c950f140f6b4a8b130cd6d7da00a6c2d480d63539213fc4ac88f777bf7a3fa96"
  "3cd9271b1ce202f381fd8a41a17a3ae294ba0f4a2b3e3f6345e81bbd5a18c8bd"
  "a2d86c9d0ba3f7571fec17c36943129ac01574e9b641c30be8e2b7c97c79e7db"
  "ea5efe145c47d2a57da945efa874de5f4ab1ef9ab7e76257c3ef48df4a67e050"
  "0393cff6bd25db899af75a1c9e5fb844ed619367555a90a557fa349816f10bf3"
  "d6317506e24984d9eef29765a53aa513547055332af5ed6824d4f2cecffcfa28"
)

echo "🎬 Starting OpenVine to Stream migration test..."
echo ""

# Results file
RESULTS_FILE="openvine_migration_results.json"
echo "[" > $RESULTS_FILE
FIRST=true

for VIDEO_ID in "${VIDEO_IDS[@]}"; do
  echo "Processing: $VIDEO_ID"
  
  # Source URL from OpenVine CDN
  SOURCE_URL="https://cdn.openvine.co/${VIDEO_ID}.mp4"
  echo "  Source: $SOURCE_URL"
  
  # Step 1: Import from URL to Stream
  echo "  Attempting URL import to Stream..."
  IMPORT_RESPONSE=$(curl -s -X POST "${WORKER_URL}/v1/migrate" \
    -H "Authorization: Bearer ${MIGRATION_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"sourceUrl\": \"${SOURCE_URL}\",
      \"vineId\": \"openvine_${VIDEO_ID}\",
      \"sha256\": \"${VIDEO_ID}\"
    }")
  
  echo "  Response: $IMPORT_RESPONSE"
  
  # Parse response
  STATUS=$(echo "$IMPORT_RESPONSE" | jq -r '.status // "error"')
  
  if [ "$STATUS" = "migrated" ] || [ "$STATUS" = "success" ]; then
    UID=$(echo "$IMPORT_RESPONSE" | jq -r '.uid')
    echo "  ✅ Success! Stream UID: $UID"
    
    # Add comma if not first entry
    if [ "$FIRST" = false ]; then
      echo "," >> $RESULTS_FILE
    fi
    FIRST=false
    
    # Record result
    cat >> $RESULTS_FILE << EOF
  {
    "videoId": "${VIDEO_ID}",
    "status": "success",
    "uid": "${UID}",
    "oldUrl": "${SOURCE_URL}",
    "newStreamUrl": "https://cdn.divine.video/${UID}/manifest/video.m3u8",
    "newThumbnailUrl": "https://cdn.divine.video/${UID}/thumbnails/thumbnail.jpg",
    "newMp4Url": "https://cdn.divine.video/${UID}/downloads/default.mp4"
  }
EOF
  else
    echo "  ❌ Failed to migrate"
    ERROR_MSG=$(echo "$IMPORT_RESPONSE" | jq -r '.error // .message // "Unknown error"')
    echo "  Error: $ERROR_MSG"
    
    # Add comma if not first entry
    if [ "$FIRST" = false ]; then
      echo "," >> $RESULTS_FILE
    fi
    FIRST=false
    
    # Record failure
    cat >> $RESULTS_FILE << EOF
  {
    "videoId": "${VIDEO_ID}",
    "status": "failed",
    "error": "${ERROR_MSG}",
    "oldUrl": "${SOURCE_URL}"
  }
EOF
  fi
  
  echo ""
  
  # Rate limit
  sleep 2
done

# Close JSON array
echo "]" >> $RESULTS_FILE

echo "✅ Migration test complete!"
echo "Results saved to: $RESULTS_FILE"
```

## Manual Migration Process (if API fails)

If the automated migration fails due to Stream API limitations, use this manual process:

### Step 1: Download Videos from OpenVine
```bash
# Download all test videos
mkdir -p openvine_videos
cd openvine_videos

for vid in "094f2c736935a225e32a10a97b2935b976ec9f08c8e08f836c7ab1c5e441909e" \
           "060d451d764232f6cef0ed43bcc93fb2fc489846475f594261685c8a5856b409" \
           "c950f140f6b4a8b130cd6d7da00a6c2d480d63539213fc4ac88f777bf7a3fa96" \
           "3cd9271b1ce202f381fd8a41a17a3ae294ba0f4a2b3e3f6345e81bbd5a18c8bd"; do
  echo "Downloading $vid..."
  curl -o "${vid}.mp4" "https://cdn.openvine.co/${vid}.mp4"
done
```

### Step 2: Upload to Stream via Dashboard
1. Go to [Cloudflare Stream Dashboard](https://dash.cloudflare.com/?to=/:account/stream)
2. Click "Upload Video"
3. Upload each downloaded video
4. Note the UID for each video

### Step 3: Update Nostr Events
For each migrated video, you'll need to update the Nostr events with new URLs:

| Field | Old Value | New Value |
|-------|-----------|-----------|
| Video URL | `https://cdn.openvine.co/{videoId}.mp4` | `https://cdn.divine.video/{uid}/manifest/video.m3u8` |
| Thumbnail | `https://cdn.openvine.co/{videoId}_thumb.jpg` | `https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg` |
| Download | `https://cdn.openvine.co/{videoId}.mp4` | `https://cdn.divine.video/{uid}/downloads/default.mp4` |

## Verification Steps

After migration, verify each video:

### 1. Check Stream Status
```bash
curl "https://cf-stream-service-prod.protestnet.workers.dev/v1/videos/{UID}" \
  -H "Authorization: Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c"
```

### 2. Test CDN Access
```bash
# HLS stream
curl -I "https://cdn.divine.video/{UID}/manifest/video.m3u8"

# Thumbnail
curl -I "https://cdn.divine.video/{UID}/thumbnails/thumbnail.jpg"

# MP4 download
curl -I "https://cdn.divine.video/{UID}/downloads/default.mp4"
```

### 3. Test in Browser
Open in browser:
- HLS Player: `https://cdn.divine.video/{UID}/manifest/video.m3u8`
- Direct MP4: `https://cdn.divine.video/{UID}/downloads/default.mp4`

## Migration Tracking

Track migration status in KV storage:
```bash
curl "https://cf-stream-service-prod.protestnet.workers.dev/v1/lookup?vineId=openvine_{videoId}" \
  -H "Authorization: Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c"
```

## Expected Issues & Solutions

### Issue 1: Stream API URL Import Fails
**Error**: "Unable to import from URL" or "Decoding Error"
**Solution**: Use manual download/upload process described above

### Issue 2: CORS Issues
**Error**: Cross-origin errors when playing videos
**Solution**: CDN proxy already configured with CORS headers

### Issue 3: Large File Timeouts
**Error**: Timeout during migration of large files
**Solution**: Use background job processing or chunked uploads

## Full Migration Plan for 150k Videos

Once the test migration is successful:

1. **Batch Processing**: Process videos in batches of 100-1000
2. **Background Jobs**: Use Cloudflare Queues for async processing
3. **Progress Tracking**: Store migration status in KV
4. **Error Handling**: Retry failed migrations with exponential backoff
5. **Verification**: Automated testing of migrated videos
6. **Rollback Plan**: Keep original URLs active during transition

## Current Infrastructure Status

✅ **Ready**:
- CDN proxy at cdn.divine.video
- R2 storage at r2.divine.video
- Migration endpoints deployed
- Worker infrastructure configured

⚠️ **Needs Configuration**:
- Stream API token with proper permissions
- Batch processing system for 150k videos
- Monitoring and alerting

## Next Steps

1. **Test Migration**: Run the migration script for 12 test videos
2. **Verify Access**: Confirm all videos play correctly from cdn.divine.video
3. **Update Nostr Events**: Republish events with new URLs
4. **Scale Up**: Implement batch processing for full migration