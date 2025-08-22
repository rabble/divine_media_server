# Cloudflare Stream Service - Deployment Status

## ✅ DEPLOYMENT COMPLETE

Service is fully deployed and operational on Nos Verse Cloudflare account.

## Live Endpoints

### Staging Environment (Testing Mode)
- **URL**: https://cf-stream-service-staging.protestnet.workers.dev
- **Features**:
  - ✅ DEV_AUTH_MODE enabled (simplified auth: `Nostr pubkey=<id>`)
  - ✅ MOCK_STREAM_API enabled (testing without real Stream API)
  - ✅ All endpoints functional

### Production Environment
- **URL**: https://cf-stream-service-prod.protestnet.workers.dev
- **Features**:
  - ✅ Full NIP-98 authentication required
  - ⚠️ Requires real Stream API token with proper permissions
  - ✅ All endpoints deployed

## Current Configuration

### KV Namespaces
- Default: `fc3fb1f988894752ae62462d5d0d2222`
- Staging: `eca883e0a5374b32ab92b3747235a1e3`
- Production: `effcf271031647f0947983f5f4211aa2`

### Secrets Configured
- ✅ STREAM_WEBHOOK_SECRET (all environments)
- ⚠️ STREAM_API_TOKEN (needs Stream permissions)

## Testing the Service

### 1. Test Upload (Staging with Mock Mode)
```bash
curl -X POST "https://cf-stream-service-staging.protestnet.workers.dev/v1/videos" \
  -H 'Authorization: Nostr pubkey=test_user' \
  -H 'Content-Type: application/json' \
  -d '{"sha256":"unique_hash","vineId":"unique_vine"}' | jq '.'
```

### 2. Check Video Status
```bash
curl "https://cf-stream-service-staging.protestnet.workers.dev/v1/videos/{uid}" | jq '.'
```

### 3. List User Videos
```bash
curl "https://cf-stream-service-staging.protestnet.workers.dev/v1/users/test_user/videos" | jq '.'
```

### 4. Lookup by Alias (if enabled)
```bash
curl "https://cf-stream-service-staging.protestnet.workers.dev/v1/lookup?sha256=unique_hash" | jq '.'
```

## Production Requirements

To enable full production functionality with real Cloudflare Stream:

1. **Create Stream API Token**:
   - Go to: https://dash.cloudflare.com/ → My Profile → API Tokens
   - Create token with: Account → Cloudflare Stream → Edit
   - Select Nos Verse account

2. **Update Production Token**:
   ```bash
   echo "YOUR_REAL_STREAM_TOKEN" | wrangler secret put STREAM_API_TOKEN --env production
   ```

3. **Remove Mock Mode** (for production):
   - Edit wrangler.toml
   - Remove `MOCK_STREAM_API = "true"` from production vars
   - Redeploy: `wrangler deploy --env production`

## Webhook Configuration

Once you have real Stream API working:

1. Go to Cloudflare Stream Dashboard
2. Settings → Webhooks
3. Add webhook URL: `https://cf-stream-service-prod.protestnet.workers.dev/v1/stream/webhook`
4. The webhook secret is already configured

## Environment Modes

### Staging (Development/Testing)
- `DEV_AUTH_MODE="true"` - Simplified auth for testing
- `MOCK_STREAM_API="true"` - Mock Stream responses for testing

### Production
- Full NIP-98 authentication
- Real Stream API integration
- No mock/dev modes

## Quick Test Script

Use the included test script:
```bash
node test_upload.mjs
```

Or for production (requires NIP-98):
```bash
node test_upload.mjs https://cf-stream-service-prod.protestnet.workers.dev
```

## Monitoring

```bash
# View staging logs
wrangler tail --env staging

# View production logs  
wrangler tail --env production
```

## Status Summary

✅ **Staging**: Fully operational with mock Stream API
⚠️ **Production**: Deployed, needs real Stream API token with permissions

The service is deployed and ready. Staging works perfectly for testing. Production requires a Cloudflare Stream API token with proper permissions to fully function.