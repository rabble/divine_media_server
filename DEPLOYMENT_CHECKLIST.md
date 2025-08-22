# Production Deployment Checklist

## Current Status
- ✅ KV namespaces created (dev, staging, production)
- ✅ STREAM_WEBHOOK_SECRET configured (all environments)
- ❌ STREAM_API_TOKEN missing (all environments)
- ⚠️ 1 failing test (NIP-98 method/URL validation)
- ✅ Dependencies installed
- ✅ Wrangler configuration complete

## Required Actions Before Production

### 1. Critical - Set STREAM_API_TOKEN
Get your Cloudflare Stream API token from the dashboard:
```bash
# For default/dev environment
wrangler secret put STREAM_API_TOKEN

# For staging
wrangler secret put STREAM_API_TOKEN --env staging

# For production
wrangler secret put STREAM_API_TOKEN --env production
```

### 2. Fix Failing Test
- Test: "NIP-98: wrong method or url is rejected"
- Location: tests/nip98.test.mjs:12:3
- Issue: Returns 404 instead of expected 400
- Priority: Medium (auth validation edge case)

### 3. Testing Before Deployment

#### Local Testing
```bash
# Run tests
npm test

# Start local dev server
wrangler dev

# Test with staging config
wrangler dev --env staging
```

#### Manual API Testing
```bash
# Test upload request (pre-prod auth stub)
curl -X POST "http://localhost:8787/v1/videos" \
  -H 'Authorization: Nostr pubkey=npub_example' \
  -H 'content-type: application/json' \
  -d '{"sha256":"abc123","vineId":"v1"}'

# Test status endpoint
curl "http://localhost:8787/v1/videos/{uid}"

# Test lookup (if enabled)
curl "http://localhost:8787/v1/lookup?sha256=abc123"
```

### 4. Deploy to Staging First
```bash
# Deploy to staging
wrangler deploy --env staging

# Test staging endpoints
# Monitor logs: wrangler tail --env staging
```

### 5. Production Deployment
```bash
# Only after staging validation
wrangler deploy --env production

# Monitor production logs
wrangler tail --env production
```

## Post-Deployment Verification

### Health Checks
1. Create test upload via POST /v1/videos
2. Verify webhook processing works
3. Check status endpoint returns correct data
4. Test lookup endpoints if enabled
5. Verify rate limiting works (30/hour per pubkey)

### Monitoring Setup
- [ ] Set up alerts for webhook failures
- [ ] Monitor Stream API errors (502 responses)
- [ ] Track rate limit violations (429 responses)
- [ ] Monitor KV usage and quotas

## Configuration Notes

### Current Settings
- Account ID: c84e7a9bf7ed99cb41b8e73566568c75
- LOOKUPS_ENABLED: true (all environments)
- Rate limit: 30 uploads/hour per pubkey
- Webhook signature window: 5 minutes

### KV Namespace IDs
- Dev: 4ace4c1ed363421984c61ccb9d92382c
- Staging: 6272b0c564f141c5ae6c60ad179ec544
- Production: 3ce7784c8df84a6bac8833ca275e756a

## Security Checklist
- ✅ Webhook signature validation implemented
- ✅ NIP-98 authentication for write endpoints
- ✅ Rate limiting per pubkey
- ✅ Secrets managed via Wrangler (not in code)
- ⚠️ Ensure STREAM_API_TOKEN has minimal required permissions

## Known Issues/Limitations
1. Pre-prod auth stub accepts simplified format
2. No hard deduplication enforcement (best-effort via indexes)
3. KV eventual consistency may cause brief lookup misses
4. No R2 storage or MP4 proxying (Stream-native only)