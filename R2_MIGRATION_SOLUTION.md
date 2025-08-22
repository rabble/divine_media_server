# R2 to Stream Migration - The Real Solution

## The Problem
Cloudflare Stream's public API doesn't support direct URL imports. The `/stream/copy` and `/media/assets` endpoints either don't exist or require special permissions.

## The Solution: R2 Worker Binding

Since your videos are in R2, the fastest way is to create a Worker with **R2 bindings** that can directly access R2 and upload to Stream without external downloads.

### Step 1: Add R2 Binding to Your Worker

Edit `wrangler.toml`:
```toml
[[r2_buckets]]
binding = "R2_VIDEOS"
bucket_name = "your-video-bucket-name"
```

### Step 2: Create R2 Migration Endpoint

```javascript
// src/handlers/migrate_r2.mjs
export async function migrateFromR2(req, env, deps) {
  const { r2Key, sha256, vineId } = await req.json();
  
  // Get video directly from R2 (no external download!)
  const object = await env.R2_VIDEOS.get(r2Key);
  
  if (!object) {
    return json(404, { error: "not_found", r2Key });
  }
  
  // Create Stream direct upload URL
  const uploadUrl = await createStreamUpload(env);
  
  // Stream the R2 object directly to Stream
  // This happens within Cloudflare's network - FAST!
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: object.body,
    headers: {
      'Content-Length': object.size
    }
  });
  
  return json(200, { 
    uid: extractUid(uploadUrl),
    status: "migrated",
    r2Key 
  });
}
```

### Step 3: Batch Migration Within CF Network

```javascript
export async function migrateR2Batch(req, env) {
  const { prefix } = await req.json();
  
  // List all videos with prefix
  const list = await env.R2_VIDEOS.list({ prefix });
  
  const results = [];
  for (const object of list.objects) {
    // Each video streams directly from R2 to Stream
    // No external bandwidth, no downloads!
    const result = await migrateOneVideo(object.key, env);
    results.push(result);
  }
  
  return json(200, { migrated: results.length, results });
}
```

## Alternative: Use Cloudflare's Internal Transfer

If you have enterprise support, ask Cloudflare to:
1. Enable Stream URL import for your account
2. Or do a direct R2-to-Stream migration internally

## Immediate Workaround: Stream from R2

While migrating, you can serve videos directly from R2:

```javascript
// Serve from R2 while migrating to Stream
export async function serveVideo(req, env) {
  const { id } = req.params;
  
  // Check if in Stream
  let video = await env.MEDIA_KV.get(`video:${id}`);
  if (video?.hlsUrl) {
    return Response.redirect(video.hlsUrl);
  }
  
  // Fallback to R2
  const r2Object = await env.R2_VIDEOS.get(`videos/${id}.mp4`);
  if (r2Object) {
    return new Response(r2Object.body, {
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  }
  
  return new Response('Not found', { status: 404 });
}
```

## The Fastest Migration Path

1. **Add R2 binding** to your Worker
2. **Create R2 migration endpoint** that streams directly to Stream
3. **Run migration batches** within Cloudflare's network
4. **No external downloads** = fast migration!

## Migration Script for R2 Binding

```javascript
// tools/migrate_with_r2_binding.mjs
async function migrateAllVideos() {
  // Get list from R2
  const response = await fetch('/v1/r2/list');
  const { objects } = await response.json();
  
  // Migrate in batches
  for (let i = 0; i < objects.length; i += 100) {
    const batch = objects.slice(i, i + 100);
    
    await fetch('/v1/r2/migrate-batch', {
      method: 'POST',
      body: JSON.stringify({ keys: batch.map(o => o.key) })
    });
    
    console.log(`Migrated ${i + batch.length} / ${objects.length}`);
  }
}
```

## Why This Is Better

1. **No external bandwidth** - Transfer within Cloudflare
2. **Much faster** - Internal network speeds
3. **No memory limits** - Streaming, not buffering
4. **Cost effective** - No R2 egress charges
5. **Reliable** - No external network issues

## Next Steps

1. Add R2 bucket binding to `wrangler.toml`
2. Deploy the R2 migration endpoints
3. Run migration batches
4. 150k videos can migrate in hours, not weeks!