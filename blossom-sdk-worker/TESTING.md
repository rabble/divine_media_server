# Testing Guide for blossom-sdk-worker

## Local Testing

### Unit/Integration Tests

Run the comprehensive test suite:
```bash
npm test
```

**Coverage:**
- 17 tests covering all endpoints
- Mock R2 and KV storage
- CORS, authentication, error handling
- See `TEST_COVERAGE.md` for details

### Local Development Server

Start the dev server:
```bash
npm run dev
```

Server runs on http://localhost:8787

#### Manual Testing Examples

```bash
# List blobs
curl http://localhost:8787/list/0000000000000000000000000000000000000000000000000000000000000000

# Upload blob
echo "test content" | curl -X PUT http://localhost:8787/upload \
  -H "Authorization: Nostr pubkey=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  -H "Content-Type: text/plain" \
  --data-binary @-

# Get blob (use SHA-256 from upload response)
curl http://localhost:8787/<sha256>

# Delete blob
curl -X DELETE http://localhost:8787/<sha256> \
  -H "Authorization: Nostr pubkey=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

## Live Deployment Testing

### Automated Test Script

Run comprehensive tests against any deployment:

```bash
# Test staging
./test-live.sh

# Test production
./test-live.sh https://blossom-sdk-worker-prod.workers.dev

# Test custom URL
./test-live.sh https://your-worker.workers.dev
```

**The script tests:**
1. ✅ CORS preflight
2. ✅ Empty list endpoint
3. ✅ Upload without auth (401)
4. ✅ Upload with auth (200)
5. ✅ HEAD request
6. ✅ GET blob retrieval
7. ✅ List user's blobs
8. ✅ Delete without auth (401)
9. ✅ Delete with wrong owner (403)
10. ✅ Delete with correct owner (204)
11. ✅ Verify deletion (404)

### Manual Live Testing

#### Test Upload and Retrieval
```bash
WORKER_URL="https://blossom-sdk-worker-staging.protestnet.workers.dev"
PUBKEY="your_pubkey_hex_here"

# Upload
RESPONSE=$(curl -s -X PUT "$WORKER_URL/upload" \
  -H "Authorization: Nostr pubkey=$PUBKEY" \
  -H "Content-Type: text/plain" \
  --data-binary "Hello Blossom!")

# Extract hash
HASH=$(echo $RESPONSE | jq -r '.sha256')
echo "Uploaded: $HASH"

# Retrieve
curl "$WORKER_URL/$HASH"

# List your blobs
curl "$WORKER_URL/list/$PUBKEY" | jq

# Delete
curl -X DELETE "$WORKER_URL/$HASH" \
  -H "Authorization: Nostr pubkey=$PUBKEY"
```

## External Validation

### Blossom Audit Tool

Run the official Blossom compliance audit:

```bash
# Basic audit (no auth - will test up to auth requirement)
npx blossom-audit audit https://blossom-sdk-worker-staging.protestnet.workers.dev bitcoin

# Full audit with authentication
npx blossom-audit audit https://blossom-sdk-worker-staging.protestnet.workers.dev bitcoin --sec nsec1...

# Verbose output
npx blossom-audit audit https://blossom-sdk-worker-staging.protestnet.workers.dev bitcoin --verbose
```

**Expected Results:**
- ✅ CORS compliance
- ✅ Authentication working
- ✅ BUD-01 (server endpoints)
- ✅ BUD-02 (upload endpoint)
- ✅ BUD-04 (deletion)
- ⚠️ Optional improvements (X-Reason headers, etc.)

See `BLOSSOM_AUDIT.md` for detailed audit results and recommendations.

## Testing with Real Nostr Keys

### Generate Test Key
```bash
# Install nak (Nostr Army Knife)
npm install -g nak

# Generate key pair
nak key generate

# Example output:
# nsec1... (private key - keep secret!)
# npub1... (public key - shareable)
```

### Upload with Real Signature

For production testing with proper Nostr event signatures:

```bash
# Create a properly signed kind 24242 event
# Use a Nostr client or signing tool

# Example with manual event creation (simplified):
EVENT=$(cat <<EOF
{
  "kind": 24242,
  "created_at": $(date +%s),
  "tags": [["t", "upload"]],
  "content": "Upload request",
  "pubkey": "your_pubkey_hex"
}
EOF
)

# Sign event (use proper Nostr signing library)
# Base64 encode and include in Authorization header
```

## Performance Testing

### Load Testing

Test concurrent uploads:
```bash
# Install hey (HTTP load generator)
brew install hey  # macOS
# or apt-get install hey  # Linux

# Run load test
echo "test data" > test.txt
hey -n 100 -c 10 -m PUT \
  -H "Authorization: Nostr pubkey=test" \
  -H "Content-Type: text/plain" \
  -T "text/plain" \
  -D test.txt \
  https://blossom-sdk-worker-staging.protestnet.workers.dev/upload
```

### Monitoring

Check Cloudflare Workers metrics:
1. Go to Cloudflare Dashboard
2. Navigate to Workers & Pages
3. Select `blossom-sdk-worker-staging`
4. View analytics for:
   - Request rate
   - Error rate
   - CPU time
   - Duration

## Debugging

### View Logs

Tail logs from deployed worker:
```bash
wrangler tail --env staging
```

### Common Issues

**401 Unauthorized:**
- Check Authorization header format: `Nostr pubkey=<64-char-hex>`
- Verify DEV_AUTH_MODE is enabled for simple pubkey format
- For production, use properly signed kind 24242 events

**404 Not Found:**
- Verify SHA-256 hash is exactly 64 hex characters
- Check blob was successfully uploaded first
- Verify blob wasn't deleted

**403 Forbidden:**
- Trying to delete blob owned by different pubkey
- Use same pubkey that uploaded the blob

**500 Internal Server Error:**
- Check R2 bucket accessibility
- Verify KV namespace bindings
- Check wrangler tail logs for stack traces

## CI/CD Testing

Add to GitHub Actions:
```yaml
- name: Test blossom-sdk-worker
  run: |
    cd blossom-sdk-worker
    npm install
    npm test
    wrangler deploy --env staging
    ./test-live.sh https://blossom-sdk-worker-staging.protestnet.workers.dev
```

## Test Data Cleanup

Clean up test data from staging:
```bash
# List all blobs for test pubkey
PUBKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
BLOBS=$(curl -s "https://blossom-sdk-worker-staging.protestnet.workers.dev/list/$PUBKEY" | jq -r '.[].sha256')

# Delete each blob
for hash in $BLOBS; do
  echo "Deleting $hash..."
  curl -X DELETE "https://blossom-sdk-worker-staging.protestnet.workers.dev/$hash" \
    -H "Authorization: Nostr pubkey=$PUBKEY"
done
```
