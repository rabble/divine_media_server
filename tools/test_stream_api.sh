#!/bin/bash
# Test Stream API directly

echo "Testing Stream API token..."
echo ""

# Get the token from production
TOKEN=$(npx wrangler secret:get STREAM_API_TOKEN --env production 2>/dev/null | tail -1)

if [ -z "$TOKEN" ]; then
  echo "❌ Could not retrieve STREAM_API_TOKEN"
  echo "Please set it with: npx wrangler secret put STREAM_API_TOKEN --env production"
  exit 1
fi

echo "1. Testing Stream API list videos:"
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/c84e7a9bf7ed99cb41b8e73566568c75/stream" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.success // .errors[0].message' 

echo ""
echo "2. Testing create direct upload:"
RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/c84e7a9bf7ed99cb41b8e73566568c75/stream/direct_upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "maxDurationSeconds": 3600,
    "requireSignedURLs": false,
    "allowedOrigins": ["*"]
  }')

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo "✅ Stream API token is working!"
  echo ""
  UID=$(echo "$RESPONSE" | jq -r '.result.uid')
  UPLOAD_URL=$(echo "$RESPONSE" | jq -r '.result.uploadURL')
  echo "Created upload:"
  echo "  UID: $UID"
  echo "  Upload URL: ${UPLOAD_URL:0:80}..."
else
  echo "❌ Stream API error:"
  echo "$RESPONSE" | jq -r '.errors[0].message // .error // "Unknown error"'
  echo ""
  echo "You may need to create a new API token with Stream:Edit permissions"
fi