# Production Configuration Guide

## Current Status: ✅ FULLY OPERATIONAL

Both staging and production are deployed and working with mock Stream API for testing.

## Environment URLs

- **Staging**: https://cf-stream-service-staging.protestnet.workers.dev
  - Dev auth mode: `Nostr pubkey=username`
  - Mock Stream API enabled
  
- **Production**: https://cf-stream-service-prod.protestnet.workers.dev
  - Full NIP-98 authentication
  - Mock Stream API enabled (temporary)

## Switching to Real Cloudflare Stream

When you have a Stream API token with proper permissions:

### 1. Get Stream API Token

Create a token at: https://dash.cloudflare.com/profile/api-tokens

Required permissions:
- Account → Cloudflare Stream → Edit
- Account: Nos Verse

### 2. Update Configuration

```bash
# Set the real Stream API token
echo "YOUR_REAL_STREAM_TOKEN" | wrangler secret put STREAM_API_TOKEN --env production

# Edit wrangler.toml and remove MOCK_STREAM_API from production:
# Remove this line from [env.production.vars]:
# MOCK_STREAM_API = "true"

# Redeploy production
wrangler deploy --env production
```

### 3. Configure Webhooks

In Cloudflare Stream Dashboard:
1. Go to Stream → Settings → Webhooks
2. Add webhook URL: `https://cf-stream-service-prod.protestnet.workers.dev/v1/stream/webhook`
3. The webhook secret is already configured

## Testing Tools

### Test with Mock API (Current)
```bash
# Staging (simple auth)
node test_upload.mjs

# Production (NIP-98 auth)
node test_production.mjs
```

### Test with Real Stream API (After configuration)
```bash
# Same commands will work with real Stream API
node test_production.mjs
```

## API Endpoints

All endpoints are working on both environments:

- `POST /v1/videos` - Create upload URL
- `GET /v1/videos/{uid}` - Get video status
- `POST /v1/stream/webhook` - Stream webhook handler
- `GET /v1/lookup?sha256=...` - Lookup by hash
- `GET /v1/lookup?vineId=...` - Lookup by Vine ID
- `POST /v1/videos/{uid}/aliases` - Add aliases
- `GET /v1/users/{pubkey}/videos` - List user videos

## Authentication

### Staging (Dev Mode)
```
Authorization: Nostr pubkey=<any_identifier>
```

### Production (NIP-98)
Requires proper Nostr event signature. Use `test_production.mjs` as reference.

## Monitoring

```bash
# View logs
wrangler tail --env staging
wrangler tail --env production

# Check KV data
wrangler kv key list --namespace-id=effcf271031647f0947983f5f4211aa2
```

## Current Configuration

### Secrets
- ✅ STREAM_WEBHOOK_SECRET (configured)
- ✅ STREAM_API_TOKEN (placeholder, needs real token for Stream)

### Environment Variables
- ✅ LOOKUPS_ENABLED = true
- ✅ STREAM_ACCOUNT_ID = c84e7a9bf7ed99cb41b8e73566568c75
- ✅ MOCK_STREAM_API = true (temporary, remove when Stream token is ready)

## Summary

The service is **fully deployed and operational**. It's currently using mock Stream API for testing. When you get a real Stream API token with proper permissions, follow the steps above to enable real video uploads.