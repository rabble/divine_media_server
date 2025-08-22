# Migration Test Guide

## Issue: Stream API Token Not Working

The STREAM_API_TOKEN is either invalid or doesn't have the correct permissions.

## How to Fix and Test Migration

### Step 1: Create New Stream API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click on your profile icon (top right) → **My Profile**
3. Go to **API Tokens** tab
4. Click **Create Token**
5. Use **Custom token** template
6. Configure:
   - **Token name**: Stream Migration Token
   - **Permissions**: 
     - Account → Cloudflare Stream → Edit
     - Account → Account Settings → Read (optional)
   - **Account Resources**: Include → Your account
   - **IP Address Filtering**: Optional (leave blank for testing)
7. Click **Continue to summary** → **Create Token**
8. **COPY THE TOKEN** (you won't see it again!)

### Step 2: Update the Secret

```bash
npx wrangler secret put STREAM_API_TOKEN --env production
# Paste the new token when prompted

npx wrangler secret put STREAM_API_TOKEN --env staging
# Paste the same token
```

### Step 3: Test Migration

Once the token is updated, test with:

```bash
# Test 1: Migrate from R2 (direct streaming)
curl -X POST "https://cf-stream-service-prod.protestnet.workers.dev/v1/r2/migrate" \
  -H "Authorization: Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c" \
  -H "Content-Type: application/json" \
  -d '{
    "r2Key": "uploads/1750591730308-13cdc4ee.mp4",
    "vineId": "test_migration_001",
    "sha256": "test_hash_001"
  }'

# Test 2: URL-based migration
curl -X POST "https://cf-stream-service-prod.protestnet.workers.dev/v1/migrate" \
  -H "Authorization: Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUrl": "https://r2.divine.video/uploads/1750591730308-13cdc4ee.mp4",
    "vineId": "test_migration_002",
    "sha256": "test_hash_002"
  }'
```

## Expected Result

After successful migration, you'll get:
```json
{
  "uid": "abc123...",
  "status": "migrated",
  "streamUrl": "https://cdn.divine.video/abc123.../manifest/video.m3u8",
  "thumbnailUrl": "https://cdn.divine.video/abc123.../thumbnails/thumbnail.jpg",
  "r2Key": "uploads/1750591730308-13cdc4ee.mp4"
}
```

## Test the CDN

Once you have the UID, test your custom domain:
```bash
# Should work immediately
curl -I https://cdn.divine.video/{UID}/manifest/video.m3u8
```

## Alternative: Manual Upload Test

If you want to test the CDN without fixing the API token:

1. Go to Stream dashboard
2. Upload any small video manually
3. Copy the video UID from the dashboard
4. Test: `https://cdn.divine.video/{UID}/manifest/video.m3u8`

This will at least verify the CDN proxy is working correctly.

## Current Status

✅ **Working:**
- R2 custom domains (r2.divine.video)
- CDN proxy for Stream (cdn.divine.video)
- Migration endpoints deployed
- R2 bucket bindings configured

❌ **Not Working:**
- Stream API token (needs to be recreated with proper permissions)

Once you create a new Stream API token with Edit permissions, the migration will work!