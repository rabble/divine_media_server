# Custom Domain Setup for Video Streaming

## Current Hardcoded URLs (Should Change)

Currently, the service returns Cloudflare's default Stream URLs:
- `https://customer-c84e7a9bf7ed99cb41b8e73566568c75.cloudflarestream.com/{uid}/manifest/video.m3u8`
- `https://customer-c84e7a9bf7ed99cb41b8e73566568c75.cloudflarestream.com/{uid}/thumbnails/thumbnail.jpg`

## Setting Up Custom Domain (cdn.divine.video)

### Step 1: Add Custom Domain in Cloudflare Stream

1. Go to Cloudflare Dashboard → Stream → Settings
2. Add custom domain: `cdn.divine.video`
3. Cloudflare will provide a CNAME record to add

### Step 2: Configure DNS

Add to your DNS (in Cloudflare DNS or your provider):
```
Type: CNAME
Name: cdn
Value: customer-c84e7a9bf7ed99cb41b8e73566568c75.cloudflarestream.com
Proxy: Yes (orange cloud ON)
```

### Step 3: Update Environment Variables

Add to wrangler.toml:
```toml
[vars]
STREAM_DOMAIN = "cdn.divine.video"

[env.staging.vars]
STREAM_DOMAIN = "cdn-staging.divine.video"

[env.production.vars]
STREAM_DOMAIN = "cdn.divine.video"
```

### Step 4: Update Code to Use Custom Domain

Instead of hardcoding, use the environment variable:

```javascript
// src/utils/stream_urls.mjs
export function getStreamUrls(uid, env) {
  const domain = env.STREAM_DOMAIN || `customer-${env.STREAM_ACCOUNT_ID}.cloudflarestream.com`;
  
  return {
    hlsUrl: `https://${domain}/${uid}/manifest/video.m3u8`,
    dashUrl: `https://${domain}/${uid}/manifest/video.mpd`,
    mp4Url: `https://${domain}/${uid}/downloads/default.mp4`,
    thumbnailUrl: `https://${domain}/${uid}/thumbnails/thumbnail.jpg`,
    iframeUrl: `https://${domain}/${uid}/iframe`
  };
}
```

## Files That Need Updating

All these files have hardcoded Cloudflare Stream URLs that should use the custom domain:

1. **src/handlers/migrate_r2.mjs** - Lines 188-189
2. **src/handlers/migrate.mjs** - Lines 173-174  
3. **src/handlers/migrate_batch.mjs** - Line 179
4. **src/handlers/lookup.mjs** - Lines 33-36
5. **src/handlers/webhook.mjs** - Stream URL construction
6. **tools/export_migration_urls.mjs** - URL generation

## Benefits of Custom Domain

1. **Branding**: URLs show your domain, not Cloudflare's
2. **Control**: Can change CDN providers without breaking URLs
3. **Analytics**: Better tracking of your content
4. **Trust**: Users see your domain, not a third-party CDN
5. **Flexibility**: Can add custom headers, caching rules, etc.

## Example After Setup

Instead of:
```
https://customer-c84e7a9bf7ed99cb41b8e73566568c75.cloudflarestream.com/abc123/manifest/video.m3u8
```

You'll have:
```
https://cdn.divine.video/abc123/manifest/video.m3u8
```

## Alternative Subdomain Options

- `stream.divine.video` - Clear purpose
- `media.divine.video` - More general
- `video.divine.video` - Specific to video
- `cdn.divine.video` - Standard CDN naming

## SSL/TLS

Cloudflare automatically provides SSL certificates for your custom domain when proxied through Cloudflare (orange cloud ON).

## Testing Custom Domain

After setup, test with:
```bash
curl -I https://cdn.divine.video/{test-video-uid}/manifest/video.m3u8
```

Should return HTTP 200 with proper headers.