#!/bin/bash

echo "🔍 Finding Real OpenVine Videos"
echo "================================="
echo ""

# These endpoints might have real video references
echo "Checking available endpoints..."
echo ""

# Check if there are any public videos in the Vine compatibility endpoints
echo "1. Checking Vine compatibility endpoints:"
for endpoint in "r/videos" "r/videos_h264high" "v" "t"; do
  echo "   Testing /api.openvine.co/$endpoint/test..."
  curl -s -I "https://api.openvine.co/$endpoint/test" 2>&1 | grep "HTTP" | head -1
done
echo ""

# Check media endpoint with a test ID
echo "2. Testing media endpoint with common patterns:"
for pattern in "test" "demo" "sample" "1" "001" "video1" "test-video"; do
  echo -n "   /media/$pattern: "
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://api.openvine.co/media/$pattern")
  if [ "$STATUS" = "200" ]; then
    echo "✅ Found!"
    echo "   URL: https://api.openvine.co/media/$pattern"
  else
    echo "$STATUS"
  fi
done
echo ""

# Check if there's a public list endpoint
echo "3. Checking for public endpoints:"
for endpoint in "api/videos" "api/media" "videos" "list" "api/public"; do
  echo -n "   /$endpoint: "
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://api.openvine.co/$endpoint")
  echo "$STATUS"
done
echo ""

# Check the upload endpoint info
echo "4. Checking NIP-96 upload info:"
curl -s "https://api.openvine.co/.well-known/nostr/nip96.json" | jq '{
  api_url,
  download_url,
  supported_nips,
  tos_url,
  content_types
}' 2>/dev/null
echo ""

echo "================================="
echo ""
echo "To get real video IDs, you need to either:"
echo "1. Check your OpenVine database/KV storage for actual file IDs"
echo "2. Use the OpenVine admin panel if available"
echo "3. Create a NIP-98 authenticated request to list media"
echo "4. Upload a test video first to get a known file ID"
echo ""
echo "NIP-98 Authentication example:"
echo "----------------------------------------"
cat << 'EOF'
// Create a NIP-98 auth event:
const event = {
  kind: 27235,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ["u", "https://api.openvine.co/v1/media/list"],
    ["method", "GET"]
  ],
  content: "",
  pubkey: "your_nostr_pubkey"
};
// Sign the event and base64 encode it
// Then use: Authorization: Nostr <base64_event>
EOF