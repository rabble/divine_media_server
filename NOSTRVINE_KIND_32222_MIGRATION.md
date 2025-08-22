# NostrVine Kind 32222 Migration Guide

## Kind 32222 - Parameterized Replaceable Short Video

You created kind 32222 as a replaceable/addressable version of kind 22 (short videos). This allows updating the same video with new URLs after migration.

### Why Kind 32222?
- **32222** = 30000 (parameterized replaceable range) + 2222
- **Replaceable**: Can update the same video with new URLs
- **Addressable**: Uses `d` tag as unique identifier
- **Perfect for migration**: Update existing events without creating duplicates

## Event Structure for Migration

### Before Migration (OpenVine)
```json
{
  "kind": 32222,
  "pubkey": "{creator_pubkey}",
  "content": "Original Vine caption",
  "tags": [
    ["d", "{unique_vine_id}"],  // This stays the same!
    ["title", "Original Vine Title"],
    ["url", "https://api.openvine.co/media/{videoId}"],
    ["m", "video/mp4"],
    ["dim", "480x480"],
    ["duration", "6"],
    ["t", "vine"],
    ["t", "nostrvine"]
  ]
}
```

### After Migration (Cloudflare Stream)
```json
{
  "kind": 32222,
  "pubkey": "{creator_pubkey}",
  "content": "Original Vine caption",
  "tags": [
    ["d", "{unique_vine_id}"],  // SAME d-tag - this is key!
    ["title", "Original Vine Title"],
    
    // New Stream URLs with imeta
    [
      "imeta",
      "url https://cdn.divine.video/{uid}/manifest/video.m3u8",
      "m application/x-mpegURL",
      "fallback https://cdn.divine.video/{uid}/downloads/default.mp4",
      "x {sha256_hash}",
      "dim 480x480",
      "duration 6",
      "thumb https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg",
      "image https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg",
      "preview https://cdn.divine.video/{uid}/thumbnails/thumbnail.gif",
      "service cloudflare-stream"
    ],
    
    // Additional URLs for compatibility
    ["url", "https://cdn.divine.video/{uid}/manifest/video.m3u8"],
    ["streaming", "https://cdn.divine.video/{uid}/manifest/video.m3u8", "hls"],
    ["fallback", "https://cdn.divine.video/{uid}/downloads/default.mp4"],
    ["thumb", "https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg"],
    ["preview", "https://cdn.divine.video/{uid}/thumbnails/thumbnail.gif"],
    
    // Metadata
    ["dim", "480x480"],
    ["duration", "6"],
    ["published_at", "{original_timestamp}"],
    
    // Tags
    ["t", "vine"],
    ["t", "nostrvine"],
    
    // Migration tracking
    ["openvine_id", "{videoId}"],
    ["stream_uid", "{uid}"],
    ["migrated_at", "{timestamp}"],
    ["original_url", "https://api.openvine.co/media/{videoId}"]
  ]
}
```

## Migration Process

### 1. Find Existing Kind 32222 Events
```javascript
const findVineEvents = async (relay) => {
  const filter = {
    kinds: [32222],
    "#t": ["vine", "nostrvine"]
  };
  
  const events = await relay.list(filter);
  
  // Extract OpenVine IDs from events
  return events.map(event => {
    const urlTag = event.tags.find(t => t[0] === 'url');
    const dTag = event.tags.find(t => t[0] === 'd');
    
    // Parse OpenVine ID from URL
    const match = urlTag?.[1]?.match(/openvine\.co\/media\/(\w+)/);
    
    return {
      dTag: dTag?.[1],  // Unique identifier
      openvineId: match?.[1],  // Video ID to migrate
      event: event
    };
  });
};
```

### 2. Migrate Video to Stream
```javascript
async function migrateVideo(openvineId, vineId) {
  const response = await fetch(
    'https://cf-stream-service-prod.protestnet.workers.dev/v1/openvine/migrate',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        videoId: openvineId,  // The ID from api.openvine.co/media/{id}
        vineId: vineId         // Your internal vine ID for tracking
      })
    }
  );
  
  return await response.json();
}
```

### 3. Create Updated Kind 32222 Event
```javascript
function createUpdatedEvent(originalEvent, migration) {
  const dTag = originalEvent.tags.find(t => t[0] === 'd')?.[1];
  
  return {
    kind: 32222,
    pubkey: originalEvent.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    content: originalEvent.content,
    tags: [
      // CRITICAL: Same d-tag makes it replace the old event
      ["d", dTag],
      
      // Preserve original metadata
      ...originalEvent.tags.filter(t => 
        ['title', 'published_at', 'alt', 'p'].includes(t[0])
      ),
      
      // New imeta tag with all URLs
      [
        "imeta",
        `url ${migration.hlsUrl}`,
        `m application/x-mpegURL`,
        `fallback ${migration.mp4Url}`,
        `x ${originalEvent.tags.find(t => t[0] === 'x')?.[1] || ''}`,
        `dim 480x480`,
        `duration 6`,
        `thumb ${migration.thumbnailUrl}`,
        `image ${migration.thumbnailUrl}`,
        `preview ${migration.animatedThumbnailUrl}`,
        `service cloudflare-stream`
      ],
      
      // Individual URL tags for compatibility
      ["url", migration.hlsUrl],
      ["streaming", migration.hlsUrl, "hls"],
      ["fallback", migration.mp4Url],
      ["thumb", migration.thumbnailUrl],
      ["preview", migration.animatedThumbnailUrl],
      
      // Keep vine tags
      ["t", "vine"],
      ["t", "nostrvine"],
      
      // Migration metadata
      ["openvine_id", migration.videoId],
      ["stream_uid", migration.uid],
      ["migrated_at", new Date().toISOString()],
      ["original_url", migration.sourceUrl]
    ]
  };
}
```

### 4. Complete Migration Script
```javascript
async function migrateAllVines() {
  // Get all existing kind 32222 events
  const vines = await findVineEvents(relay);
  
  for (const vine of vines) {
    if (!vine.openvineId) continue;
    
    // Migrate to Stream
    const migration = await migrateVideo(vine.openvineId, vine.dTag);
    
    if (migration.status === 'migrated') {
      // Create updated event (replaces old one due to same d-tag)
      const updatedEvent = createUpdatedEvent(vine.event, migration);
      
      // Sign and publish
      const signed = await nostr.signEvent(updatedEvent, privateKey);
      await relay.publish(signed);
      
      console.log(`Migrated vine ${vine.dTag}: ${vine.openvineId} -> ${migration.uid}`);
    }
  }
}
```

## Why This Works

1. **Same `d` tag** = Relays treat it as an update, not a new event
2. **Higher timestamp** = Newer version takes precedence
3. **Same kind (32222)** = Clients know it's the same type of content
4. **Preserved metadata** = Title, tags, participants stay the same
5. **New URLs** = Videos now served from Cloudflare Stream

## What is videoId?

In your migration context:
- **videoId** = The ID from your OpenVine system (e.g., "1", "17")
- This is what's in `https://api.openvine.co/media/{videoId}`
- NOT a Cloudflare Stream ID
- NOT the d-tag value

## Example Migration Call

```bash
# Migrate OpenVine video ID "1" with vine ID "vine_abc123"
curl -X POST "https://cf-stream-service-prod.protestnet.workers.dev/v1/openvine/migrate" \
  -H "Authorization: Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "1",
    "vineId": "vine_abc123"
  }'
```

## Result

- Old event with OpenVine URL gets replaced
- New event with Stream URLs takes its place
- Same `d` tag means it's the same video
- Clients automatically use new URLs
- No duplicate events created!