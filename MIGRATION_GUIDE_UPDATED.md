# R2 to Cloudflare Stream Migration Guide (Updated)

## ⚠️ Important Note

The Cloudflare Stream API's URL import feature (`/stream/copy`) requires additional permissions that standard Stream API tokens don't have. 

## Migration Options

### Option 1: Direct Upload (Recommended)
Instead of URL import, download videos from R2 and upload them directly to Stream:

```javascript
// 1. Get upload URL from our service
const uploadResponse = await fetch('/v1/videos', {
  method: 'POST',
  headers: { 'Authorization': 'Nostr ...' },
  body: JSON.stringify({ sha256, vineId })
});
const { uploadURL } = await uploadResponse.json();

// 2. Download from R2
const videoData = await fetch(r2Url);
const videoBlob = await videoData.blob();

// 3. Upload to Stream
await fetch(uploadURL, {
  method: 'PUT',
  body: videoBlob
});
```

### Option 2: Use Cloudflare Workers for Migration
Create a Worker that has access to both R2 and Stream:

```javascript
export default {
  async fetch(request, env) {
    const { r2Key } = await request.json();
    
    // Get from R2
    const object = await env.R2_BUCKET.get(r2Key);
    
    // Create Stream upload
    const formData = new FormData();
    formData.append('file', object.body);
    
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/stream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.STREAM_TOKEN}`
        },
        body: formData
      }
    );
    
    return response;
  }
}
```

### Option 3: Client-Side Migration Script
Use the regular upload flow but from a migration script:

```javascript
import fs from 'fs';
import fetch from 'node-fetch';

async function migrateVideo(r2Url, metadata) {
  // 1. Download video
  const response = await fetch(r2Url);
  const buffer = await response.buffer();
  
  // 2. Get upload URL
  const uploadResponse = await fetch('https://cf-stream-service-prod.protestnet.workers.dev/v1/videos', {
    method: 'POST',
    headers: {
      'Authorization': await createNip98Auth(...),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });
  
  const { uploadURL } = await uploadResponse.json();
  
  // 3. Upload to Stream
  await fetch(uploadURL, {
    method: 'PUT',
    body: buffer,
    headers: {
      'Content-Length': buffer.length
    }
  });
  
  return uploadURL;
}
```

## Simplified Migration Process

Since URL import isn't available with standard tokens, here's the recommended approach:

### 1. Export R2 Inventory
Get list of all videos in R2:
```bash
aws s3 ls s3://your-r2-bucket/ --recursive > r2_inventory.txt
```

### 2. Create Migration Script
```javascript
const videos = [
  { url: 'https://r2.example.com/video1.mp4', sha256: 'hash1', vineId: 'vine1' },
  // ... more videos
];

for (const video of videos) {
  // Download from R2
  const videoData = await downloadVideo(video.url);
  
  // Upload to Stream via our service
  const result = await uploadToStream(videoData, video);
  
  console.log(`Migrated ${video.vineId}: ${result.uid}`);
}
```

### 3. Use Existing Endpoints
The service's existing `/v1/videos` endpoint handles everything needed:
- Creates Stream upload URL
- Preserves metadata (sha256, vineId)
- Creates lookup indexes
- Tracks ownership

## Alternative: R2-to-Stream Worker

If you need server-side migration, create a dedicated Worker with R2 bindings:

```toml
# wrangler.toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "your-videos"
```

Then migrate directly within Cloudflare's network for faster transfers.

## Current Status

The migration endpoints (`/v1/migrate` and `/v1/migrate/batch`) are deployed but require Stream URL import permissions. For now, use the standard upload flow with your existing R2 URLs.

## Questions?

The service fully supports:
- ✅ Creating upload URLs with metadata
- ✅ Direct uploads to Stream
- ✅ Metadata preservation and indexing
- ✅ Video lookups by sha256/vineId
- ⚠️ URL imports (requires additional permissions)

For 150k videos, we recommend:
1. Batch processing (50-100 at a time)
2. Using the standard upload flow
3. Running migrations in parallel workers
4. Tracking progress in a database