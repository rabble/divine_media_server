#!/bin/bash

# Test MP4 download functionality for CDN proxy

echo "Testing MP4 Download Functionality"
echo "=================================="

# Test video UID (using the one we successfully migrated)
UID="74133e6c3bc6b94d3dd64fd7c08b9b2a"
BASE_URL="https://cdn.divine.video"

echo ""
echo "1. Testing inline playback (default behavior):"
echo "   URL: $BASE_URL/$UID/downloads/default.mp4"
echo ""
curl -I "$BASE_URL/$UID/downloads/default.mp4" 2>/dev/null | grep -E "HTTP|Content-Type|Content-Disposition|Access-Control"

echo ""
echo "2. Testing forced download (?download=true):"
echo "   URL: $BASE_URL/$UID/downloads/default.mp4?download=true"
echo ""
curl -I "$BASE_URL/$UID/downloads/default.mp4?download=true" 2>/dev/null | grep -E "HTTP|Content-Type|Content-Disposition|Access-Control"

echo ""
echo "3. Testing CORS headers with Origin:"
echo ""
curl -I "$BASE_URL/$UID/downloads/default.mp4" \
  -H "Origin: https://example.com" 2>/dev/null | grep -E "Access-Control"

echo ""
echo "4. Testing actual download (first 1KB):"
echo ""
curl -s --range 0-1024 "$BASE_URL/$UID/downloads/default.mp4" | file -

echo ""
echo "5. Testing HLS manifest (should still work):"
echo "   URL: $BASE_URL/$UID/manifest/video.m3u8"
echo ""
curl -I "$BASE_URL/$UID/manifest/video.m3u8" 2>/dev/null | grep -E "HTTP|Content-Type"

echo ""
echo "=================================="
echo "Test complete!"
echo ""
echo "To manually test in browser:"
echo "  Inline playback: $BASE_URL/$UID/downloads/default.mp4"
echo "  Force download:  $BASE_URL/$UID/downloads/default.mp4?download=true"