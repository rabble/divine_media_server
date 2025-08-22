# Nostr Video Events with HLS URLs

## Current Nostr Video Event Standards

### NIP-71: Video Events (Kind 34235/34236)
The newer standard for video events that supports streaming URLs.

### Kind 1 with Video Tags
Regular notes with video attachments.

## How to Include HLS in Nostr Events

### Option 1: Using imeta Tag (Recommended)
The `imeta` tag (from NIP-92) can include multiple URL variants:

```json
{
  "kind": 1,
  "content": "Check out this classic Vine!",
  "tags": [
    [
      "imeta",
      "url https://cdn.divine.video/{uid}/manifest/video.m3u8",
      "m https://cdn.divine.video/{uid}/manifest/video.m3u8",
      "fallback https://cdn.divine.video/{uid}/downloads/default.mp4",
      "x {sha256_hash}",
      "ox {original_sha256}",
      "size 1048576",
      "dim 480x480",
      "duration 6",
      "thumb https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg",
      "image https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg",
      "summary Original Vine video",
      "alt Short description of video content"
    ]
  ]
}
```

### Option 2: Video Event (Kind 34235)
For dedicated video events:

```json
{
  "kind": 34235,
  "content": "{video_description}",
  "tags": [
    ["d", "{unique_identifier}"],
    ["url", "https://cdn.divine.video/{uid}/manifest/video.m3u8"],
    ["m", "application/x-mpegURL"],
    ["fallback", "https://cdn.divine.video/{uid}/downloads/default.mp4"],
    ["fallback_m", "video/mp4"],
    ["thumb", "https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg"],
    ["duration", "6"],
    ["dim", "480x480"],
    ["published_at", "{timestamp}"],
    ["client", "divine.video"],
    ["title", "{vine_title}"],
    ["summary", "{vine_description}"],
    ["content-warning", ""],
    ["t", "vine"],
    ["t", "6seconds"],
    ["original_url", "https://api.openvine.co/media/{id}"],
    ["stream_url", "https://cdn.divine.video/{uid}/manifest/video.m3u8"],
    ["download_url", "https://cdn.divine.video/{uid}/downloads/default.mp4"]
  ]
}
```

### Option 3: Multiple URL Formats
Provide both HLS and MP4 for maximum compatibility:

```json
{
  "tags": [
    ["r", "https://cdn.divine.video/{uid}/manifest/video.m3u8", "stream"],
    ["r", "https://cdn.divine.video/{uid}/downloads/default.mp4", "download"],
    ["r", "https://cdn.divine.video/{uid}/manifest/video.mpd", "dash"],
    ["proxy", "https://cdn.divine.video/{uid}/downloads/default.mp4", "mp4"],
    ["streaming", "https://cdn.divine.video/{uid}/manifest/video.m3u8", "hls"]
  ]
}
```

## Client Implementation

### How Nostr Clients Should Handle HLS:

```javascript
// Parse video URLs from event
function getVideoUrls(event) {
  const urls = {
    hls: null,
    mp4: null,
    dash: null,
    thumbnail: null
  };

  // Check imeta tag
  const imetaTag = event.tags.find(t => t[0] === 'imeta');
  if (imetaTag) {
    // Parse imeta fields
    for (let i = 1; i < imetaTag.length; i++) {
      const [key, ...values] = imetaTag[i].split(' ');
      const value = values.join(' ');
      
      if (key === 'url' || key === 'm') {
        if (value.includes('.m3u8')) {
          urls.hls = value;
        } else if (value.includes('.mp4')) {
          urls.mp4 = value;
        }
      } else if (key === 'fallback') {
        urls.mp4 = value;
      } else if (key === 'thumb' || key === 'image') {
        urls.thumbnail = value;
      }
    }
  }

  // Check other tags
  event.tags.forEach(tag => {
    const [tagName, value, hint] = tag;
    
    if (tagName === 'url' && value.includes('.m3u8')) {
      urls.hls = value;
    } else if (tagName === 'streaming' && hint === 'hls') {
      urls.hls = value;
    } else if (tagName === 'fallback' || (tagName === 'r' && hint === 'download')) {
      urls.mp4 = value;
    }
  });

  return urls;
}

// Play video with HLS support
function playVideo(urls, videoElement) {
  // Prefer HLS if available and supported
  if (urls.hls) {
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(urls.hls);
      hls.attachMedia(videoElement);
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (iOS/Safari)
      videoElement.src = urls.hls;
    } else {
      // Fall back to MP4
      videoElement.src = urls.mp4;
    }
  } else {
    // Only MP4 available
    videoElement.src = urls.mp4;
  }
}
```

## Migration Script Update

When migrating your videos and updating Nostr events:

```javascript
// After successful migration
const updateNostrEvent = async (originalEvent, migrationResult) => {
  const { uid, hlsUrl, mp4Url, thumbnailUrl } = migrationResult;
  
  // Create updated event
  const updatedEvent = {
    ...originalEvent,
    tags: [
      ...originalEvent.tags.filter(t => 
        t[0] !== 'imeta' && 
        t[0] !== 'url' && 
        t[0] !== 'r'
      ),
      // Add new URLs
      [
        "imeta",
        `url ${hlsUrl}`,
        `m ${hlsUrl}`,
        `fallback ${mp4Url}`,
        `thumb ${thumbnailUrl}`,
        `duration 6`,
        `dim 480x480`,
        `alt ${originalEvent.content || 'Vine video'}`
      ],
      ["migration", "openvine-to-stream", new Date().toISOString()],
      ["original_platform", "vine"],
      ["stream_provider", "cloudflare"]
    ]
  };
  
  // Sign and publish
  return publishToNostr(updatedEvent);
};
```

## Compatibility Matrix

| Client Type | HLS Support | Implementation |
|------------|-------------|----------------|
| **Web** | ✅ Yes | HLS.js or native |
| **iOS** | ✅ Native | Direct m3u8 |
| **Android** | ✅ Yes | ExoPlayer |
| **Desktop** | ✅ Yes | Video.js |

## Best Practices

### 1. Always Provide Both URLs
```json
{
  "tags": [
    ["url", "https://cdn.divine.video/{uid}/manifest/video.m3u8"],
    ["fallback", "https://cdn.divine.video/{uid}/downloads/default.mp4"]
  ]
}
```

### 2. Include Media Type Hints
```json
{
  "tags": [
    ["m", "application/x-mpegURL"],
    ["fallback_m", "video/mp4"]
  ]
}
```

### 3. Preserve Original Metadata
```json
{
  "tags": [
    ["original_url", "https://vine.co/v/{original_id}"],
    ["original_sha256", "{original_hash}"],
    ["migrated_at", "2025-08-22T00:00:00Z"]
  ]
}
```

## Example Complete Event

```json
{
  "id": "...",
  "pubkey": "...",
  "created_at": 1734567890,
  "kind": 1,
  "content": "Remember this classic Vine? 😂",
  "tags": [
    [
      "imeta",
      "url https://cdn.divine.video/abc123/manifest/video.m3u8",
      "m https://cdn.divine.video/abc123/manifest/video.m3u8",
      "fallback https://cdn.divine.video/abc123/downloads/default.mp4",
      "x 8f434346648f6b96df8a9d7a5c5f9a7b9c8d8e8f8g8h8i8j8k8l8m8n8o8p8q8r",
      "size 1048576",
      "dim 480x480",
      "duration 6",
      "thumb https://cdn.divine.video/abc123/thumbnails/thumbnail.jpg",
      "image https://cdn.divine.video/abc123/thumbnails/thumbnail.jpg",
      "summary Classic Vine loop",
      "alt Person doing funny dance"
    ],
    ["t", "vine"],
    ["t", "nostrvine"],
    ["client", "divine.video"],
    ["r", "https://cdn.divine.video/abc123/manifest/video.m3u8", "stream"],
    ["r", "https://cdn.divine.video/abc123/downloads/default.mp4", "download"]
  ],
  "sig": "..."
}
```

## Summary

**Yes, you should include the HLS (.m3u8) URL in your Nostr events!**

- Use the `imeta` tag with both HLS and MP4 URLs
- Include proper media type hints
- Provide fallback MP4 for older clients
- Modern Nostr clients will prefer HLS for better performance
- Older clients can fall back to MP4

This gives users the best experience while maintaining backward compatibility!