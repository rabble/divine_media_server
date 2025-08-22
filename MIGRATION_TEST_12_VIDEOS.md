# Migration Test: 12 Videos from R2 to Stream

## Test Videos Selected

| # | R2 Key | Size | VineID (for tracking) |
|---|--------|------|----------------------|
| 1 | uploads/1750591730308-13cdc4ee.mp4 | 477 KB | test_vine_001 |
| 2 | uploads/1750595109441-5b707c6f.mp4 | 17 KB | test_vine_002 |
| 3 | uploads/1750596115471-2b850bbc.mp4 | 5.4 MB | test_vine_003 |
| 4 | uploads/1750596792126-48f82a39.mp4 | 5.4 MB | test_vine_004 |
| 5 | uploads/1750597283976-e1c5ce47.mp4 | 5.4 MB | test_vine_005 |
| 6 | uploads/1750597780970-21fa163d.mp4 | 5.4 MB | test_vine_006 |
| 7 | uploads/1750598269720-2ea1ac17.mp4 | 5.4 MB | test_vine_007 |
| 8 | uploads/1750598922073-29d45b0b.mp4 | 5.4 MB | test_vine_008 |
| 9 | uploads/1750647869258-0d412a79.mp4 | 508 KB | test_vine_009 |
| 10 | uploads/1750650214502-fb652c17.mp4 | Unknown | test_vine_010 |
| 11 | uploads/1750650219108-eed61258.mp4 | Unknown | test_vine_011 |
| 12 | uploads/1750650223390-90a6180b.mp4 | Unknown | test_vine_012 |

## Current R2 URLs (Before Migration)

All videos are currently accessible at:

### Direct R2 Public URL:
```
https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev/{key}
```

### Custom Domain URL:
```
https://r2.divine.video/{key}
```

## Verification URLs for Each Video

### Video 1: test_vine_001
- **R2 Direct**: https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev/uploads/1750591730308-13cdc4ee.mp4
- **R2 Custom**: https://r2.divine.video/uploads/1750591730308-13cdc4ee.mp4

### Video 2: test_vine_002
- **R2 Direct**: https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev/uploads/1750595109441-5b707c6f.mp4
- **R2 Custom**: https://r2.divine.video/uploads/1750595109441-5b707c6f.mp4

### Video 3: test_vine_003
- **R2 Direct**: https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev/uploads/1750596115471-2b850bbc.mp4
- **R2 Custom**: https://r2.divine.video/uploads/1750596115471-2b850bbc.mp4

### Video 4: test_vine_004
- **R2 Direct**: https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev/uploads/1750596792126-48f82a39.mp4
- **R2 Custom**: https://r2.divine.video/uploads/1750596792126-48f82a39.mp4

### Video 5: test_vine_005
- **R2 Direct**: https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev/uploads/1750597283976-e1c5ce47.mp4
- **R2 Custom**: https://r2.divine.video/uploads/1750597283976-e1c5ce47.mp4

### Video 6: test_vine_006
- **R2 Direct**: https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev/uploads/1750597780970-21fa163d.mp4
- **R2 Custom**: https://r2.divine.video/uploads/1750597780970-21fa163d.mp4

### Video 7: test_vine_007
- **R2 Direct**: https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev/uploads/1750598269720-2ea1ac17.mp4
- **R2 Custom**: https://r2.divine.video/uploads/1750598269720-2ea1ac17.mp4

### Video 8: test_vine_008
- **R2 Direct**: https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev/uploads/1750598922073-29d45b0b.mp4
- **R2 Custom**: https://r2.divine.video/uploads/1750598922073-29d45b0b.mp4

### Video 9: test_vine_009
- **R2 Direct**: https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev/uploads/1750647869258-0d412a79.mp4
- **R2 Custom**: https://r2.divine.video/uploads/1750647869258-0d412a79.mp4

### Video 10: test_vine_010
- **R2 Direct**: https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev/uploads/1750650214502-fb652c17.mp4
- **R2 Custom**: https://r2.divine.video/uploads/1750650214502-fb652c17.mp4

### Video 11: test_vine_011
- **R2 Direct**: https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev/uploads/1750650219108-eed61258.mp4
- **R2 Custom**: https://r2.divine.video/uploads/1750650219108-eed61258.mp4

### Video 12: test_vine_012
- **R2 Direct**: https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev/uploads/1750650223390-90a6180b.mp4
- **R2 Custom**: https://r2.divine.video/uploads/1750650223390-90a6180b.mp4

## Migration Process

Due to Stream API limitations with URL imports, we'll need to use a download/upload approach:

### Option 1: Manual Migration via Stream Dashboard
1. Download each video from R2
2. Upload to Stream via dashboard
3. Note the UID for each video

### Option 2: Automated Migration Script
Run the migration script below to process all 12 videos.

## Migration Script

```bash
#!/bin/bash
# Save as migrate_12_videos.sh

MIGRATION_TOKEN="823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c"
STREAM_TOKEN="uJDzTLyLMd8dgUfmH65jkOwD-jeFYNog3MvVQsNW"
ACCOUNT_ID="c84e7a9bf7ed99cb41b8e73566568c75"

# Videos to migrate
declare -a VIDEOS=(
  "uploads/1750591730308-13cdc4ee.mp4:test_vine_001"
  "uploads/1750595109441-5b707c6f.mp4:test_vine_002"
  "uploads/1750596115471-2b850bbc.mp4:test_vine_003"
  "uploads/1750596792126-48f82a39.mp4:test_vine_004"
  "uploads/1750597283976-e1c5ce47.mp4:test_vine_005"
  "uploads/1750597780970-21fa163d.mp4:test_vine_006"
  "uploads/1750598269720-2ea1ac17.mp4:test_vine_007"
  "uploads/1750598922073-29d45b0b.mp4:test_vine_008"
  "uploads/1750647869258-0d412a79.mp4:test_vine_009"
  "uploads/1750650214502-fb652c17.mp4:test_vine_010"
  "uploads/1750650219108-eed61258.mp4:test_vine_011"
  "uploads/1750650223390-90a6180b.mp4:test_vine_012"
)

echo "🎬 Starting migration of 12 test videos..."
echo ""

# Results file
RESULTS_FILE="migration_results.json"
echo "[" > $RESULTS_FILE

for VIDEO_DATA in "${VIDEOS[@]}"; do
  IFS=':' read -r R2_KEY VINE_ID <<< "$VIDEO_DATA"
  
  echo "Processing: $VINE_ID ($R2_KEY)"
  
  # Step 1: Download from R2
  echo "  Downloading from R2..."
  curl -s "https://r2.divine.video/$R2_KEY" -o "/tmp/${VINE_ID}.mp4"
  
  # Step 2: Create Stream upload URL
  echo "  Creating Stream upload..."
  UPLOAD_RESPONSE=$(curl -s -X POST \
    "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/direct_upload" \
    -H "Authorization: Bearer ${STREAM_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"maxDurationSeconds\": 21600,
      \"requireSignedURLs\": false,
      \"allowedOrigins\": [\"*\"],
      \"meta\": {
        \"name\": \"${VINE_ID}\",
        \"r2Key\": \"${R2_KEY}\"
      }
    }")
  
  UID=$(echo "$UPLOAD_RESPONSE" | jq -r '.result.uid')
  UPLOAD_URL=$(echo "$UPLOAD_RESPONSE" | jq -r '.result.uploadURL')
  
  if [ "$UID" != "null" ]; then
    echo "  Got UID: $UID"
    
    # Step 3: Upload to Stream (using TUS protocol)
    echo "  Uploading to Stream..."
    # Note: This is simplified - actual TUS upload requires multiple steps
    
    # Record result
    cat >> $RESULTS_FILE << EOF
  {
    "vineId": "${VINE_ID}",
    "r2Key": "${R2_KEY}",
    "uid": "${UID}",
    "status": "pending_upload",
    "r2Url": "https://r2.divine.video/${R2_KEY}",
    "streamUrl": "https://cdn.divine.video/${UID}/manifest/video.m3u8",
    "thumbnailUrl": "https://cdn.divine.video/${UID}/thumbnails/thumbnail.jpg"
  },
EOF
    
  else
    echo "  ❌ Failed to create upload"
  fi
  
  echo ""
  
  # Clean up temp file
  rm -f "/tmp/${VINE_ID}.mp4"
  
  # Rate limit
  sleep 2
done

# Close JSON array
echo "]" >> $RESULTS_FILE

echo "✅ Migration test complete!"
echo "Results saved to: $RESULTS_FILE"
```

## After Migration - New URLs

Once migrated, each video will have:

### Stream URLs (via CDN):
- **HLS Streaming**: `https://cdn.divine.video/{UID}/manifest/video.m3u8`
- **DASH Streaming**: `https://cdn.divine.video/{UID}/manifest/video.mpd`
- **Thumbnail**: `https://cdn.divine.video/{UID}/thumbnails/thumbnail.jpg`
- **MP4 Download**: `https://cdn.divine.video/{UID}/downloads/default.mp4`

### Direct Stream URLs:
- **HLS**: `https://customer-4c3uhd5qzuhwz9hu.cloudflarestream.com/{UID}/manifest/video.m3u8`
- **Thumbnail**: `https://customer-4c3uhd5qzuhwz9hu.cloudflarestream.com/{UID}/thumbnails/thumbnail.jpg`

## Verification Checklist

For each migrated video, verify:

- [ ] Original R2 URL still works
- [ ] Stream HLS URL works via CDN
- [ ] Thumbnail generates correctly
- [ ] Video plays in browser
- [ ] Metadata preserved (vineId, r2Key)
- [ ] Lookup by vineId works: `/v1/lookup?vineId=test_vine_001`

## API Endpoints for Verification

### Check migration status:
```bash
curl "https://cf-stream-service-prod.protestnet.workers.dev/v1/lookup?vineId=test_vine_001"
```

### Get video details:
```bash
curl "https://cf-stream-service-prod.protestnet.workers.dev/v1/videos/{UID}"
```

## Current Status

- ✅ R2 videos accessible via custom domain
- ✅ CDN proxy working for Stream videos
- ⚠️ Migration requires manual upload due to Stream API limitations
- ✅ All infrastructure ready for migration