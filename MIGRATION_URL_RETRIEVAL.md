# Getting New URLs After R2 Migration

## Migration Response Format

When you migrate videos, each successful migration returns:

```json
{
  "uid": "f4b2c3d1e5a6...",
  "status": "migrated",
  "r2Key": "videos/vine123.mp4",
  "streamUrl": "https://customer-c84e7a9bf7ed99cb41b8e73566568c75.cloudflarestream.com/f4b2c3d1e5a6/manifest/video.m3u8",
  "thumbnailUrl": "https://customer-c84e7a9bf7ed99cb41b8e73566568c75.cloudflarestream.com/f4b2c3d1e5a6/thumbnails/thumbnail.jpg"
}
```

## 1. Batch Migration Results

The batch migration endpoint returns all URLs immediately:

```javascript
// Response from /v1/r2/migrate-batch
{
  "batchId": "batch_r2_1755728390290",
  "results": [
    {
      "r2Key": "videos/vine123.mp4",
      "uid": "abc123...",
      "status": "migrated",
      "streamUrl": "https://customer-{accountId}.cloudflarestream.com/{uid}/manifest/video.m3u8",
      "thumbnailUrl": "https://customer-{accountId}.cloudflarestream.com/{uid}/thumbnails/thumbnail.jpg"
    },
    // ... more videos
  ]
}
```

## 2. Lookup by VineId or SHA256

After migration, use the lookup endpoint to get URLs:

```bash
# Lookup by vineId
GET /v1/lookup?vineId=vine_123

# Lookup by SHA256
GET /v1/lookup?sha256=abc123def456...

# Response:
{
  "uid": "f4b2c3d1e5a6...",
  "status": "ready",
  "hlsUrl": "https://customer-{accountId}.cloudflarestream.com/{uid}/manifest/video.m3u8",
  "dashUrl": "https://customer-{accountId}.cloudflarestream.com/{uid}/manifest/video.mpd",
  "thumbnailUrl": "https://customer-{accountId}.cloudflarestream.com/{uid}/thumbnails/thumbnail.jpg",
  "mp4Url": "https://customer-{accountId}.cloudflarestream.com/{uid}/downloads/default.mp4"
}
```

## 3. Export All Migrated Videos

Create a script to export all migration mappings:

```javascript
// tools/export_migration_urls.mjs
#!/usr/bin/env node

const API_URL = 'https://cf-stream-service-prod.protestnet.workers.dev';
const TOKEN = 'your-migration-token';
const OUTPUT_FILE = 'migration_urls.jsonl';

async function exportAllUrls() {
  const fs = require('fs').promises;
  const output = [];
  
  // Get all migrated videos from your tracking system
  // You should have a list of all vineIds or SHA256s
  const videoList = await loadYourVideoList(); // Your existing video database
  
  for (const video of videoList) {
    try {
      // Lookup by vineId or sha256
      const lookupUrl = new URL(`${API_URL}/v1/lookup`);
      if (video.vineId) {
        lookupUrl.searchParams.set('vineId', video.vineId);
      } else if (video.sha256) {
        lookupUrl.searchParams.set('sha256', video.sha256);
      }
      
      const res = await fetch(lookupUrl);
      const data = await res.json();
      
      if (data.uid) {
        output.push({
          originalId: video.vineId || video.sha256,
          originalR2Url: video.r2Url,
          newStreamUid: data.uid,
          newHlsUrl: data.hlsUrl,
          newMp4Url: data.mp4Url,
          newThumbnailUrl: data.thumbnailUrl,
          status: data.status
        });
      }
    } catch (error) {
      console.error(`Failed to lookup ${video.vineId}:`, error);
    }
  }
  
  // Write to JSONL file for easy processing
  const jsonl = output.map(item => JSON.stringify(item)).join('\n');
  await fs.writeFile(OUTPUT_FILE, jsonl);
  
  console.log(`Exported ${output.length} video URLs to ${OUTPUT_FILE}`);
  return output;
}

exportAllUrls();
```

## 4. Direct Database Export

If you need a full export of all migrated videos:

```javascript
// This would need to be added as a new endpoint
// /v1/migration/export

async function exportMigrationData(req, env) {
  const results = [];
  
  // List all migration records
  const list = await env.MEDIA_KV.list({ prefix: 'migration:r2:' });
  
  for (const key of list.keys) {
    const uid = key.name.replace('migration:r2:', '');
    const migrationData = await env.MEDIA_KV.get(key.name);
    const videoData = await env.MEDIA_KV.get(`video:${uid}`);
    
    const migration = JSON.parse(migrationData);
    const video = JSON.parse(videoData);
    
    results.push({
      uid,
      r2Key: migration.r2Key,
      vineId: video.vineId,
      sha256: video.sha256,
      hlsUrl: `https://customer-${env.STREAM_ACCOUNT_ID}.cloudflarestream.com/${uid}/manifest/video.m3u8`,
      mp4Url: `https://customer-${env.STREAM_ACCOUNT_ID}.cloudflarestream.com/${uid}/downloads/default.mp4`,
      thumbnailUrl: `https://customer-${env.STREAM_ACCOUNT_ID}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`,
      migratedAt: migration.timestamp
    });
  }
  
  return json(200, { 
    count: results.length,
    videos: results 
  });
}
```

## 5. Nostr Event Republishing Script

Once you have the URL mappings, republish Nostr events:

```javascript
// tools/republish_nostr_events.mjs
import { SimplePool, nip19, getSignature } from 'nostr-tools';

async function republishWithNewUrls(urlMappings) {
  const pool = new SimplePool();
  const relays = ['wss://relay.damus.io', 'wss://nos.lol', /* your relays */];
  
  for (const mapping of urlMappings) {
    // Find original Nostr event (kind 34235 or 1063)
    const filters = [
      { 
        kinds: [34235, 1063],
        '#x': [mapping.sha256] // or use vineId tag
      }
    ];
    
    const events = await pool.querySync(relays, filters);
    
    for (const originalEvent of events) {
      // Create new event with updated URLs
      const newEvent = {
        kind: originalEvent.kind,
        created_at: Math.floor(Date.now() / 1000),
        tags: originalEvent.tags.map(tag => {
          // Update URL tags
          if (tag[0] === 'url') {
            return ['url', mapping.newHlsUrl];
          }
          if (tag[0] === 'thumb') {
            return ['thumb', mapping.newThumbnailUrl];
          }
          if (tag[0] === 'stream') {
            return ['stream', mapping.newStreamUid];
          }
          return tag;
        }),
        content: originalEvent.content.replace(
          mapping.originalR2Url,
          mapping.newHlsUrl
        )
      };
      
      // Add new tags if not present
      if (!newEvent.tags.find(t => t[0] === 'stream')) {
        newEvent.tags.push(['stream', mapping.newStreamUid]);
      }
      
      // Sign and publish
      const signedEvent = await signEvent(newEvent, privateKey);
      await pool.publish(relays, signedEvent);
      
      console.log(`Republished event for ${mapping.vineId}`);
    }
  }
}
```

## Quick URL Format Reference

After migration, each video gets these URLs:

- **HLS Streaming**: `https://customer-{accountId}.cloudflarestream.com/{uid}/manifest/video.m3u8`
- **DASH Streaming**: `https://customer-{accountId}.cloudflarestream.com/{uid}/manifest/video.mpd`
- **MP4 Download**: `https://customer-{accountId}.cloudflarestream.com/{uid}/downloads/default.mp4`
- **Thumbnail**: `https://customer-{accountId}.cloudflarestream.com/{uid}/thumbnails/thumbnail.jpg`
- **Iframe Embed**: `https://customer-{accountId}.cloudflarestream.com/{uid}/iframe`

Where:
- `accountId` = `c84e7a9bf7ed99cb41b8e73566568c75`
- `uid` = Unique Stream video ID returned from migration

## Summary

1. **During Migration**: Save the batch results with all new URLs
2. **After Migration**: Use `/v1/lookup` endpoint to get URLs by vineId/sha256
3. **For Republishing**: Export all mappings and update Nostr events with new URLs
4. **URL Format**: All videos follow the same Stream URL pattern with their unique UID