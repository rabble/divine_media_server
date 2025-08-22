# Domain Setup Checklist for Divine Video

## Required DNS Records

### 1. Cloudflare Stream CDN Domains

#### Production: `cdn.divine.video`
```
Type: CNAME
Name: cdn
Value: customer-c84e7a9bf7ed99cb41b8e73566568c75.cloudflarestream.com
Proxy: Yes (Orange Cloud ON)
```

#### Staging: `cdn-staging.divine.video`
```
Type: CNAME
Name: cdn-staging
Value: customer-c84e7a9bf7ed99cb41b8e73566568c75.cloudflarestream.com
Proxy: Yes (Orange Cloud ON)
```

### 2. R2 Public Access Domains

#### Production: `r2.divine.video`

First, enable public access for your R2 bucket:
```bash
# Enable public access
npx wrangler r2 bucket update nostrvine-media --public

# Get the public URL
npx wrangler r2 bucket info nostrvine-media
```

The public URL will be something like:
- `https://pub-{bucket-id}.r2.dev` 
- Or custom: `https://nostrvine-media.{account-subdomain}.r2.cloudflarestorage.com`

Then add CNAME:
```
Type: CNAME
Name: r2
Value: [Your R2 public URL from above]
Proxy: Yes (Orange Cloud ON)
```

#### Staging: `r2-staging.divine.video`
```
Type: CNAME
Name: r2-staging
Value: [Same as production R2 URL since using same bucket]
Proxy: Yes (Orange Cloud ON)
```

## Setup Steps

### Step 1: Enable R2 Public Access
```bash
# Make R2 bucket public
npx wrangler r2 bucket update nostrvine-media --public

# Verify public access
npx wrangler r2 bucket info nostrvine-media
```

### Step 2: Configure Cloudflare Stream Custom Domain
1. Go to Cloudflare Dashboard → Stream → Settings
2. Add custom hostname: `cdn.divine.video`
3. Add staging hostname: `cdn-staging.divine.video`

### Step 3: Add DNS Records
Add all 4 CNAME records in your DNS provider (Cloudflare DNS recommended)

### Step 4: Test Each Domain

#### Test Stream CDN:
```bash
# Production
curl -I https://cdn.divine.video/{test-video-uid}/manifest/video.m3u8

# Staging  
curl -I https://cdn-staging.divine.video/{test-video-uid}/manifest/video.m3u8
```

#### Test R2 Access:
```bash
# Production
curl -I https://r2.divine.video/videos/test.mp4

# Staging
curl -I https://r2-staging.divine.video/videos/test.mp4
```

## URL Formats After Setup

### Stream URLs (via CDN):
- **HLS**: `https://cdn.divine.video/{uid}/manifest/video.m3u8`
- **MP4**: `https://cdn.divine.video/{uid}/downloads/default.mp4`
- **Thumbnail**: `https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg`

### R2 Direct URLs:
- **Original files**: `https://r2.divine.video/videos/{vineId}.mp4`
- **Public access**: `https://r2.divine.video/{any-path-in-bucket}`

## Important Notes

### About R2 Public Access:
- **Option 1**: Make entire bucket public (easier, but exposes all files)
- **Option 2**: Use Worker to proxy R2 requests (more control, but adds latency)
- **Option 3**: Generate signed URLs for temporary access (most secure)

### Current Configuration:
The service is configured to use these domains but will fall back to Cloudflare domains if DNS is not set up:
- Falls back to: `customer-c84e7a9bf7ed99cb41b8e73566568c75.cloudflarestream.com`
- Falls back to: `pub-{bucket-id}.r2.dev`

### Security Consideration:
If your R2 bucket contains sensitive content, you might NOT want to make it fully public. Instead:
1. Keep R2 private
2. Serve videos only through Stream after migration
3. Remove `R2_PUBLIC_DOMAIN` from config

## Verification Checklist

- [ ] R2 bucket public access enabled (if desired)
- [ ] Stream custom domains configured in dashboard
- [ ] DNS records added for `cdn.divine.video`
- [ ] DNS records added for `cdn-staging.divine.video`
- [ ] DNS records added for `r2.divine.video` (if using public R2)
- [ ] DNS records added for `r2-staging.divine.video` (if using public R2)
- [ ] Test Stream URL works with custom domain
- [ ] Test R2 URL works with custom domain (if public)
- [ ] Deploy Worker with domain configuration

## Summary of All Domains

| Domain | Purpose | Points To |
|--------|---------|-----------|
| `cdn.divine.video` | Production Stream CDN | Cloudflare Stream |
| `cdn-staging.divine.video` | Staging Stream CDN | Cloudflare Stream |
| `r2.divine.video` | Production R2 public access | R2 bucket (optional) |
| `r2-staging.divine.video` | Staging R2 public access | R2 bucket (optional) |

## Alternative: Single Domain Approach

If you prefer simplicity, you could use just one domain with paths:
- `media.divine.video/stream/{uid}/video.m3u8` → Stream
- `media.divine.video/r2/{path}` → R2 files

This would require a Worker to route requests appropriately.