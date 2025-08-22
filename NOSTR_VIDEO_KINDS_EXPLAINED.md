# NostrVine Kind 32222 Video Events

## Kind 32222 - Your Custom Replaceable Vine Event

### What is Kind 32222?
NostrVine uses **kind 32222** - a parameterized replaceable event for Vine videos:
- **32222** = In the 30000-39999 range (parameterized replaceable)
- Based on kind 22 (short videos) but replaceable/addressable
- Uses `d` tag as unique identifier
- Perfect for migration - update URLs without creating duplicates
### Event Structure After Migration
```json
{
  "kind": 32222,
  "pubkey": "{creator_pubkey}",
  "created_at": 1234567890,
  "content": "Original Vine caption",
  "tags": [
    ["d", "{unique_vine_id}"],  // SAME d-tag - makes it replaceable
    ["title", "Original Vine Title"],
    
    // imeta tag with all Stream URLs
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

## What is videoId?

**videoId** = The ID from your OpenVine system:
- What's in `https://api.openvine.co/media/{videoId}`
- Examples: "1", "17", etc.
- NOT a Cloudflare Stream ID
- NOT the d-tag value

### Migration Mapping:
```
OpenVine videoId → Cloudflare Stream UID → Update kind 32222 event
       "1"       →     "abc123..."      → Same d-tag, new URLs
```

## Migration Process

### Step 1: Find Existing Kind 32222 Events
```javascript
const findVideoEvents = async (relays) => {
  const filter = {
    kinds: [32222],  // Correct video event kind
    authors: ["{pubkey}"],  // Your pubkey
    "#t": ["vine", "nostrvine"]  // Your tags
  };
  
  return await pool.list(relays, filter);
};
```

### Step 2: Migrate to Cloudflare Stream
```javascript
const migrateVideo = async (openvineId, vineId) => {
  const response = await fetch(
    'https://cf-stream-service-prod.protestnet.workers.dev/v1/openvine/migrate',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        videoId: openvineId,  // e.g., "1", "17"
        vineId: vineId        // Your vine ID for tracking
      })
    }
  );
  return await response.json();
};
```

### Step 3: Create Updated Kind 32222 Event
```javascript
const createUpdatedEvent = (originalEvent, migration) => {
  const dTag = originalEvent.tags.find(t => t[0] === 'd')?.[1];
  
  return {
    kind: 32222,
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
        `dim 480x480`,
        `duration 6`,
        `thumb ${migration.thumbnailUrl}`,
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
};
```

## Why Kind 32222 Works for Migration

1. **Same `d` tag** = Relays treat it as an update, not a new event
2. **Higher timestamp** = Newer version takes precedence
3. **Same kind (32222)** = Clients know it's the same type of content
4. **Preserved metadata** = Title, tags, participants stay the same
5. **New URLs** = Videos now served from Cloudflare Stream

## Complete Migration Flow

```javascript
async function migrateAllVines() {
  // 1. Get all existing kind 32222 events
  const events = await relay.list({ kinds: [32222], "#t": ["vine"] });
  
  for (const event of events) {
    // Extract OpenVine ID from URL
    const urlTag = event.tags.find(t => t[0] === 'url');
    const match = urlTag?.[1]?.match(/openvine\.co\/media\/(\w+)/);
    const openvineId = match?.[1];
    
    if (!openvineId) continue;
    
    // 2. Migrate to Stream
    const migration = await migrateVideo(openvineId, event.tags.find(t => t[0] === 'd')?.[1]);
    
    if (migration.status === 'migrated') {
      // 3. Create updated event (replaces old one due to same d-tag)
      const updatedEvent = createUpdatedEvent(event, migration);
      
      // 4. Sign and publish
      const signed = await nostr.signEvent(updatedEvent, privateKey);
      await relay.publish(signed);
      
      console.log(`Migrated: ${openvineId} -> ${migration.uid}`);
    }
  }
}
```

## Result

- Old event with OpenVine URL gets replaced
- New event with Stream URLs takes its place
- Same `d` tag means it's the same video
- Clients automatically use new URLs
- No duplicate events created!