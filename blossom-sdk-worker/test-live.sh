#!/bin/bash
# ABOUTME: Test script for live blossom-sdk-worker deployment
# ABOUTME: Tests all endpoints against staging or production worker

set -e

# Configuration
WORKER_URL="${1:-https://blossom-sdk-worker-staging.protestnet.workers.dev}"
TEST_PUBKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

echo "=========================================="
echo "Testing Blossom SDK Worker"
echo "URL: $WORKER_URL"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Test 1: CORS Preflight
echo "Test 1: CORS Preflight (OPTIONS /upload)"
RESPONSE=$(curl -s -i -X OPTIONS "$WORKER_URL/upload" 2>&1)
if echo "$RESPONSE" | grep -q "access-control-allow-origin: \*"; then
    success "CORS headers present"
else
    error "CORS headers missing"
fi
echo ""

# Test 2: List endpoint with no blobs
echo "Test 2: GET /list/<pubkey> (empty)"
RESPONSE=$(curl -s "$WORKER_URL/list/0000000000000000000000000000000000000000000000000000000000000000")
if [ "$RESPONSE" = "[]" ]; then
    success "Empty list returned correctly"
else
    error "Expected empty array, got: $RESPONSE"
fi
echo ""

# Test 3: Upload without auth (should fail)
echo "Test 3: PUT /upload without auth (should return 401)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$WORKER_URL/upload" \
    -H "Content-Type: text/plain" \
    --data-binary "test")
if [ "$STATUS" = "401" ]; then
    success "Correctly rejected upload without auth"
else
    error "Expected 401, got: $STATUS"
fi
echo ""

# Test 4: Upload with auth
echo "Test 4: PUT /upload with auth"
TEST_CONTENT="Test blob uploaded at $(date)"
UPLOAD_RESPONSE=$(curl -s -X PUT "$WORKER_URL/upload" \
    -H "Authorization: Nostr pubkey=$TEST_PUBKEY" \
    -H "Content-Type: text/plain" \
    --data-binary "$TEST_CONTENT")

BLOB_HASH=$(echo "$UPLOAD_RESPONSE" | jq -r '.sha256')
BLOB_URL=$(echo "$UPLOAD_RESPONSE" | jq -r '.url')
BLOB_SIZE=$(echo "$UPLOAD_RESPONSE" | jq -r '.size')

if [ -n "$BLOB_HASH" ] && [ "$BLOB_HASH" != "null" ]; then
    success "Upload successful"
    info "SHA-256: $BLOB_HASH"
    info "URL: $BLOB_URL"
    info "Size: $BLOB_SIZE bytes"
else
    error "Upload failed: $UPLOAD_RESPONSE"
fi
echo ""

# Test 5: HEAD request
echo "Test 5: HEAD /<sha256>"
HEAD_RESPONSE=$(curl -s -I "$WORKER_URL/$BLOB_HASH")
if echo "$HEAD_RESPONSE" | grep -q "HTTP/[0-9.]* 200"; then
    success "HEAD request returned 200"
    CONTENT_TYPE=$(echo "$HEAD_RESPONSE" | grep -i "content-type:" | cut -d' ' -f2 | tr -d '\r')
    CONTENT_LENGTH=$(echo "$HEAD_RESPONSE" | grep -i "content-length:" | cut -d' ' -f2 | tr -d '\r')
    info "Content-Type: $CONTENT_TYPE"
    info "Content-Length: $CONTENT_LENGTH"
else
    error "HEAD request failed"
fi
echo ""

# Test 6: GET request (retrieve blob)
echo "Test 6: GET /<sha256>"
RETRIEVED_CONTENT=$(curl -s "$WORKER_URL/$BLOB_HASH")
if [ "$RETRIEVED_CONTENT" = "$TEST_CONTENT" ]; then
    success "Retrieved blob matches uploaded content"
else
    error "Content mismatch!"
    echo "Expected: $TEST_CONTENT"
    echo "Got: $RETRIEVED_CONTENT"
fi
echo ""

# Test 7: List user's blobs
echo "Test 7: GET /list/<pubkey> (with blobs)"
LIST_RESPONSE=$(curl -s "$WORKER_URL/list/$TEST_PUBKEY")
BLOB_COUNT=$(echo "$LIST_RESPONSE" | jq length)
if [ "$BLOB_COUNT" -gt 0 ]; then
    success "Found $BLOB_COUNT blob(s) for user"
    echo "$LIST_RESPONSE" | jq -r '.[] | "  - \(.sha256) (\(.size) bytes, \(.type))"'
else
    error "No blobs found for user"
fi
echo ""

# Test 8: DELETE without auth (should fail)
echo "Test 8: DELETE /<sha256> without auth (should return 401)"
DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$WORKER_URL/$BLOB_HASH")
if [ "$DELETE_STATUS" = "401" ]; then
    success "Correctly rejected delete without auth"
else
    error "Expected 401, got: $DELETE_STATUS"
fi
echo ""

# Test 9: DELETE with wrong owner (should fail with 403)
echo "Test 9: DELETE /<sha256> with wrong owner (should return 403)"
WRONG_PUBKEY="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$WORKER_URL/$BLOB_HASH" \
    -H "Authorization: Nostr pubkey=$WRONG_PUBKEY")
if [ "$DELETE_STATUS" = "403" ]; then
    success "Correctly rejected delete from non-owner"
else
    error "Expected 403, got: $DELETE_STATUS"
fi
echo ""

# Test 10: DELETE with correct owner
echo "Test 10: DELETE /<sha256> with correct owner"
DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$WORKER_URL/$BLOB_HASH" \
    -H "Authorization: Nostr pubkey=$TEST_PUBKEY")
if [ "$DELETE_STATUS" = "204" ]; then
    success "Delete successful"
else
    error "Expected 204, got: $DELETE_STATUS"
fi
echo ""

# Test 11: Verify deletion
echo "Test 11: Verify blob was deleted (GET should return 404)"
GET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL/$BLOB_HASH")
if [ "$GET_STATUS" = "404" ]; then
    success "Blob correctly deleted"
else
    error "Expected 404, got: $GET_STATUS"
fi
echo ""

# Summary
echo "=========================================="
echo -e "${GREEN}All tests passed!${NC}"
echo "=========================================="
echo ""
echo "To run blossom-audit against this worker:"
echo "  npx blossom-audit audit $WORKER_URL bitcoin"
echo ""
