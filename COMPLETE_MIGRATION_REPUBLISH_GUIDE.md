# Complete Vine Migration & Nostr Republishing Guide

## Overview
Migrate 150k Vine videos from OpenVine to Cloudflare Stream and republish updated Nostr kind 32222 events (replaceable/addressable) with new URLs and auto-generated thumbnails. The same d-tag ensures events are replaced, not duplicated.

## Phase 1: Migration Preparation

### 1.1 Get Video List from OpenVine
```javascript
// Extract all video IDs from your OpenVine system
// Option A: Database query
SELECT file_id, vine_id, original_url, sha256_hash, created_at 
FROM videos 
ORDER BY created_at;

// Option B: API with NIP-98 auth
GET https://api.openvine.co/v1/media/list
Authorization: Nostr {base64_nip98_event}
```

### 1.2 Get Original Nostr Events
```javascript
// Query your Nostr relays for existing kind 32222 video events
const getOriginalEvents = async (videoId) => {
  const filter = {
    kinds: [32222],  // Your custom replaceable vine event kind
    "#t": ["vine", "nostrvine"],
    // or search by d-tag if you know it
    "#d": [`${vineId}`]
  };
  
  return await relay.list(filter);
};
```

### 1.3 Create Migration Mapping File
```json
{
  "videos": [
    {
      "openvine_id": "1",
      "vine_id": "original_vine_abc123", 
      "nostr_event_id": "event_id_xyz",
      "original_url": "https://api.openvine.co/media/1",
      "sha256": "original_file_hash",
      "metadata": {
        "title": "Original Vine Title",
        "description": "6 second loop",
        "creator": "npub1...",
        "created_at": 1234567890
      }
    }
  ]
}
```

## Phase 2: Migration Process

### 2.1 Migration API Call
```bash
curl -X POST "https://cf-stream-service-prod.protestnet.workers.dev/v1/openvine/migrate" \
  -H "Authorization: Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "1",
    "vineId": "original_vine_abc123"
  }'
```

### 2.2 Migration Response Format
```json
{
  "status": "migrated",
  "uid": "74133e6c3bc6b94d3dd64fd7c08b9b2a",
  "videoId": "1",
  "sourceUrl": "https://api.openvine.co/media/1",
  "hlsUrl": "https://cdn.divine.video/74133e6c3bc6b94d3dd64fd7c08b9b2a/manifest/video.m3u8",
  "dashUrl": "https://cdn.divine.video/74133e6c3bc6b94d3dd64fd7c08b9b2a/manifest/video.mpd",
  "mp4Url": "https://cdn.divine.video/74133e6c3bc6b94d3dd64fd7c08b9b2a/downloads/default.mp4",
  "thumbnailUrl": "https://cdn.divine.video/74133e6c3bc6b94d3dd64fd7c08b9b2a/thumbnails/thumbnail.jpg",
  "animatedThumbnailUrl": "https://cdn.divine.video/74133e6c3bc6b94d3dd64fd7c08b9b2a/thumbnails/thumbnail.gif"
}
```

### 2.3 Cloudflare Stream Auto-Generated Assets

**Thumbnails Generated Automatically:**
- `thumbnail.jpg` - Default thumbnail at 1 second
- `thumbnail.jpg?time=2s` - Thumbnail at specific time
- `thumbnail.jpg?height=120` - Specific size
- `thumbnail.gif` - Animated GIF preview

**Multiple Formats Available:**
```
https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg
https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg?time=0s
https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg?time=3s
https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg?height=360
https://cdn.divine.video/{uid}/thumbnails/thumbnail.gif
```

## Phase 3: Nostr Event Republishing

### 3.1 Updated Event Structure
```javascript
const createUpdatedNostrEvent = (original, migration) => {
  // Extract the d-tag from original event - this is crucial for replaceable events
  const dTag = original.tags.find(t => t[0] === 'd')?.[1];
  
  return {
    kind: 32222,  // Always use kind 32222 for vine events
    created_at: Math.floor(Date.now() / 1000),
    content: original.content || "Classic Vine 🎬",
    tags: [
      // CRITICAL: Same d-tag makes it replace the old event
      ["d", dTag || `vine_${migration.videoId}`],
      // CRITICAL: The imeta tag with all URLs
      [
        "imeta",
        `url ${migration.hlsUrl}`,                    // Primary HLS stream
        `m ${migration.hlsUrl}`,                       // Duplicate for compatibility
        `fallback ${migration.mp4Url}`,                // MP4 fallback
        `x ${original.sha256 || ''}`,                  // Original file hash
        `ox ${original.sha256 || ''}`,                 // Original hash backup
        `size ${original.size || ''}`,                 // File size
        `dim 480x480`,                                 // Vine dimensions
        `duration 6`,                                  // Always 6 seconds
        `thumb ${migration.thumbnailUrl}`,             // Auto-generated thumbnail
        `image ${migration.thumbnailUrl}`,             // Duplicate for compatibility
        `animated_thumb ${migration.animatedThumbnailUrl}`, // GIF preview
        `summary ${original.title || 'Vine video'}`,   // Description
        `alt ${original.description || 'Short video'}` // Alt text
      ],
      
      // Stream URLs for different clients
      ["url", migration.hlsUrl],
      ["streaming", migration.hlsUrl, "hls"],
      ["r", migration.mp4Url, "download"],
      ["r", migration.dashUrl, "dash"],
      
      // Thumbnails
      ["thumb", migration.thumbnailUrl],
      ["preview", migration.animatedThumbnailUrl],
      
      // Metadata
      ["title", original.title || ""],
      ["published_at", String(original.created_at || "")],
      ["duration", "6"],
      ["dim", "480x480"],
      
      // Platform tags
      ["t", "vine"],
      ["t", "nostrvine"],
      ["t", "6seconds"],
      ["client", "divine.video"],
      
      // Migration tracking
      ["migration", "openvine-to-stream", new Date().toISOString()],
      ["original_url", original.url],
      ["original_id", original.openvine_id],
      ["stream_uid", migration.uid],
      ["original_event", original.event_id],
      
      // Preserve original tags that aren't URLs
      ...original.tags.filter(tag => 
        !['imeta', 'url', 'r', 'thumb', 'preview', 'streaming'].includes(tag[0])
      )
    ]
  };
};
```

### 3.2 Complete Migration & Republish Script
```javascript
// complete_migration.js
import { SimplePool } from 'nostr-tools';
import fs from 'fs';

const MIGRATION_API = 'https://cf-stream-service-prod.protestnet.workers.dev';
const MIGRATION_TOKEN = '823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c';
const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.nostrvine.com'
];

async function migrateAndRepublish(video) {
  // Step 1: Migrate to Stream
  const migrationResponse = await fetch(`${MIGRATION_API}/v1/openvine/migrate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MIGRATION_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      videoId: video.openvine_id,
      vineId: video.vine_id
    })
  });
  
  const migration = await migrationResponse.json();
  
  if (migration.status !== 'migrated') {
    console.error(`Failed to migrate ${video.openvine_id}:`, migration.error);
    return null;
  }
  
  // Step 2: Get original Nostr event
  const pool = new SimplePool();
  const originalEvents = await pool.list(RELAYS, [{
    kinds: [32222],
    "#d": [video.vine_id]  // Use d-tag to find the replaceable event
  }]);
  
  const originalEvent = originalEvents[0];
  if (!originalEvent) {
    console.warn(`No original event found for ${video.nostr_event_id}`);
  }
  
  // Step 3: Create updated event
  const dTag = originalEvent?.tags.find(t => t[0] === 'd')?.[1] || video.vine_id;
  
  const updatedEvent = {
    kind: 32222,  // Always kind 32222 for replaceable vine events
    created_at: Math.floor(Date.now() / 1000),
    content: originalEvent?.content || video.metadata.title || "Classic Vine 🎬",
    tags: [
      // CRITICAL: Same d-tag makes it replace the old event
      ["d", dTag],
      // The complete imeta tag
      [
        "imeta",
        `url ${migration.hlsUrl}`,
        `m ${migration.hlsUrl}`,
        `fallback ${migration.mp4Url}`,
        `x ${video.sha256 || ''}`,
        `size ${video.size || ''}`,
        `dim 480x480`,
        `duration 6`,
        `thumb ${migration.thumbnailUrl}`,
        `image ${migration.thumbnailUrl}`,
        `animated_thumb ${migration.animatedThumbnailUrl}`,
        `summary ${video.metadata.title || 'Vine video'}`,
        `alt ${video.metadata.description || 'Short video'}`
      ],
      
      // Additional tags
      ["url", migration.hlsUrl],
      ["streaming", migration.hlsUrl, "hls"],
      ["r", migration.mp4Url, "download"],
      ["thumb", migration.thumbnailUrl],
      ["preview", migration.animatedThumbnailUrl],
      ["t", "vine"],
      ["t", "nostrvine"],
      ["migration", "openvine-to-stream", new Date().toISOString()],
      ["original_url", video.original_url],
      ["stream_uid", migration.uid],
      
      // Preserve non-URL tags from original (except d-tag which we already added)
      ...(originalEvent?.tags || []).filter(tag => 
        !['d', 'imeta', 'url', 'r', 'thumb', 'preview', 'streaming'].includes(tag[0])
      )
    ]
  };
  
  // Step 4: Sign event (you need to implement this with your private key)
  const signedEvent = await signNostrEvent(updatedEvent, PRIVATE_KEY);
  
  // Step 5: Publish to relays
  await pool.publish(RELAYS, signedEvent);
  
  // Step 6: Store mapping
  return {
    original_id: video.openvine_id,
    vine_id: video.vine_id,
    stream_uid: migration.uid,
    nostr_event_id: signedEvent.id,
    migration_date: new Date().toISOString(),
    urls: {
      hls: migration.hlsUrl,
      mp4: migration.mp4Url,
      thumbnail: migration.thumbnailUrl,
      animated_thumbnail: migration.animatedThumbnailUrl
    }
  };
}

// Batch processing
async function processBatch(videos, batchSize = 10) {
  const results = [];
  
  for (let i = 0; i < videos.length; i += batchSize) {
    const batch = videos.slice(i, i + batchSize);
    
    console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(videos.length / batchSize)}`);
    
    const batchResults = await Promise.all(
      batch.map(video => migrateAndRepublish(video))
    );
    
    results.push(...batchResults);
    
    // Save progress
    fs.writeFileSync('migration_progress.json', JSON.stringify(results, null, 2));
    
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return results;
}
```

## Phase 4: Verification

### 4.1 Verify Migration
```bash
# Check if video is accessible
curl -I "https://cdn.divine.video/{uid}/manifest/video.m3u8"

# Check thumbnail generation
curl -I "https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg"

# Verify KV storage
curl "https://cf-stream-service-prod.protestnet.workers.dev/v1/lookup?vineId={vine_id}" \
  -H "Authorization: Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c"
```

### 4.2 Verify Nostr Events
```javascript
// Check if new events are propagating
const verifyNostrEvent = async (dTag) => {
  const pool = new SimplePool();
  const events = await pool.list(RELAYS, [{ 
    kinds: [32222],
    "#d": [dTag]  // Find by d-tag for replaceable events
  }]);
  
  if (events.length > 0) {
    const event = events[0];
    const imetaTag = event.tags.find(t => t[0] === 'imeta');
    
    // Verify URLs are present
    console.log('HLS URL found:', imetaTag?.includes('manifest/video.m3u8'));
    console.log('MP4 URL found:', imetaTag?.includes('downloads/default.mp4'));
    console.log('Thumbnail found:', imetaTag?.includes('thumbnails/thumbnail.jpg'));
  }
};
```

## Phase 5: Monitoring & Rollback

### 5.1 Progress Tracking
```json
// migration_status.json
{
  "total_videos": 150000,
  "migrated": 12453,
  "failed": 23,
  "pending": 137524,
  "last_processed": "2025-08-22T10:30:00Z",
  "errors": [
    {
      "video_id": "xyz",
      "error": "404 not found",
      "timestamp": "2025-08-22T10:25:00Z"
    }
  ]
}
```

### 5.2 Rollback Plan
If needed, original URLs are preserved in tags:
```javascript
// Extract original URL from migrated event
const getOriginalUrl = (event) => {
  const originalTag = event.tags.find(t => t[0] === 'original_url');
  return originalTag ? originalTag[1] : null;
};
```

## Complete Data Flow

```
OpenVine Video → Cloudflare Stream → Auto Thumbnails → Updated Kind 32222 Event
     ↓                    ↓                  ↓                    ↓
 /media/1         uid: abc123         .jpg/.gif      Same d-tag replaces old
     ↓                    ↓                  ↓                    ↓
 6 seconds          HLS + MP4          Multiple       No duplicates created
                                       sizes
```

## Cost Summary

- **Storage**: 150k × 0.1 min = 15,000 minutes = $75/month
- **Delivery**: Variable based on views ($1 per 1,000 minutes watched)
- **Thumbnails**: Free (included with Stream)
- **Transcoding**: Free (included with Stream)

## Timeline Estimate

- **Migration Rate**: ~20 videos/second (with rate limiting)
- **Total Time**: 150,000 ÷ 20 ÷ 60 = ~125 minutes
- **With retries/errors**: ~3-4 hours
- **Nostr republishing**: Additional 2-3 hours
- **Total**: ~6-8 hours for complete migration

## Success Metrics

✅ All videos accessible via HLS  
✅ Thumbnails auto-generated  
✅ Kind 32222 events updated with same d-tag (replaced, not duplicated)  
✅ Fallback MP4 URLs working  
✅ Original metadata preserved  
✅ Migration tracking in place