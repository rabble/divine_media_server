#!/bin/bash

# Test OpenVine to Stream Migration
# This script tests migrating videos from cdn.openvine.co to Cloudflare Stream

MIGRATION_TOKEN="823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c"
# Use the Worker URL for API calls (migration endpoints)
API_URL="https://cf-stream-service-prod.protestnet.workers.dev"
# Production CDN URL for serving videos
CDN_URL="https://cdn.divine.video"

echo "🎬 Testing OpenVine to Stream Migration"
echo "========================================"
echo ""

# Test single video migration from OpenVine CDN (public access)
echo "Test 1: Migrate single video from cdn.openvine.co"
echo "-------------------------------------------------"

VIDEO_ID="1"  # Real video that exists at api.openvine.co/media/1
echo "Video ID: $VIDEO_ID"
echo "Source URL: https://api.openvine.co/media/${VIDEO_ID}"
echo ""

echo "Attempting migration..."
RESPONSE=$(curl -s -X POST "${API_URL}/v1/openvine/migrate" \
  -H "Authorization: Bearer ${MIGRATION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"videoId\": \"${VIDEO_ID}\",
    \"vineId\": \"test_openvine_001\"
  }")

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Check if migration was successful
STATUS=$(echo "$RESPONSE" | jq -r '.status' 2>/dev/null)
if [ "$STATUS" = "migrated" ]; then
  UID=$(echo "$RESPONSE" | jq -r '.uid' 2>/dev/null)
  echo "✅ Migration successful!"
  echo "Stream UID: $UID"
  echo ""
  echo "New URLs:"
  echo "- HLS: https://cdn.divine.video/${UID}/manifest/video.m3u8"
  echo "- Thumbnail: https://cdn.divine.video/${UID}/thumbnails/thumbnail.jpg"
  echo "- MP4: https://cdn.divine.video/${UID}/downloads/default.mp4"
  echo ""
  
  # Test CDN access
  echo "Testing CDN access..."
  curl -I "https://cdn.divine.video/${UID}/manifest/video.m3u8" 2>/dev/null | head -n 1
else
  echo "❌ Migration failed"
  ERROR=$(echo "$RESPONSE" | jq -r '.error' 2>/dev/null)
  echo "Error: $ERROR"
fi

echo ""
echo "========================================"
echo ""

# Test batch migration
echo "Test 2: Batch migration of multiple videos"
echo "-----------------------------------------"

cat > /tmp/batch_videos.json << EOF
{
  "videoIds": [
    "060d451d764232f6cef0ed43bcc93fb2fc489846475f594261685c8a5856b409",
    "c950f140f6b4a8b130cd6d7da00a6c2d480d63539213fc4ac88f777bf7a3fa96",
    "3cd9271b1ce202f381fd8a41a17a3ae294ba0f4a2b3e3f6345e81bbd5a18c8bd"
  ],
  "limit": 3
}
EOF

echo "Migrating 3 videos in batch..."
BATCH_RESPONSE=$(curl -s -X POST "${API_URL}/v1/openvine/migrate-batch" \
  -H "Authorization: Bearer ${MIGRATION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @/tmp/batch_videos.json)

echo "Batch Response:"
echo "$BATCH_RESPONSE" | jq '.' 2>/dev/null || echo "$BATCH_RESPONSE"

# Count successful migrations
SUCCESS_COUNT=$(echo "$BATCH_RESPONSE" | jq '[.results[] | select(.status == "migrated" or .status == "already_migrated")] | length' 2>/dev/null)
TOTAL_COUNT=$(echo "$BATCH_RESPONSE" | jq '.results | length' 2>/dev/null)

echo ""
echo "Results: $SUCCESS_COUNT/$TOTAL_COUNT videos migrated successfully"

# Clean up
rm -f /tmp/batch_videos.json

echo ""
echo "========================================"
echo "Test complete!"
echo ""
echo "To verify migrations, you can:"
echo "1. Check lookup endpoint: curl '${API_URL}/v1/lookup?vineId=test_openvine_001' -H 'Authorization: Bearer ${MIGRATION_TOKEN}'"
echo "2. Test video playback in browser using the CDN URLs above"
echo "3. Check Stream dashboard at https://dash.cloudflare.com/?to=/:account/stream"