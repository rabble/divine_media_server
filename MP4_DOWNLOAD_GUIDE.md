# MP4 Direct Download Guide

## How MP4 Downloads Work

The CDN proxy now supports both inline playback and forced downloads for MP4 files.

### Default Behavior (Inline Playback)
When accessing an MP4 URL directly, the video will play in the browser:
```
https://cdn.divine.video/{uid}/downloads/default.mp4
```
- Browser will play the video inline
- Users can still right-click → "Save video as..." to download
- Content-Disposition: `inline; filename="video.mp4"`

### Force Download
To force the browser to download instead of playing:
```
https://cdn.divine.video/{uid}/downloads/default.mp4?download=true
```
- Browser will prompt to save the file
- Content-Disposition: `attachment; filename="video.mp4"`

## Implementation in HTML

### Download Button
```html
<!-- Force download with button -->
<a href="https://cdn.divine.video/{uid}/downloads/default.mp4?download=true" 
   download="vine_video.mp4">
  Download Video
</a>
```

### Video Player with Download Option
```html
<video controls>
  <source src="https://cdn.divine.video/{uid}/downloads/default.mp4" type="video/mp4">
</video>

<!-- Separate download link -->
<a href="https://cdn.divine.video/{uid}/downloads/default.mp4?download=true">
  Download MP4
</a>
```

## JavaScript Implementation

### Direct Download
```javascript
function downloadVideo(uid) {
  const downloadUrl = `https://cdn.divine.video/${uid}/downloads/default.mp4?download=true`;
  window.location.href = downloadUrl;
}
```

### Programmatic Download with Progress
```javascript
async function downloadWithProgress(uid, filename = 'video.mp4') {
  const url = `https://cdn.divine.video/${uid}/downloads/default.mp4`;
  
  const response = await fetch(url);
  const blob = await response.blob();
  
  // Create download link
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  
  // Clean up
  URL.revokeObjectURL(a.href);
}
```

## Nostr Event URLs

When publishing Nostr events, include both streaming and download URLs:

```json
{
  "kind": 32222,
  "tags": [
    ["d", "{vine_id}"],
    
    // Streaming URL (HLS)
    ["url", "https://cdn.divine.video/{uid}/manifest/video.m3u8"],
    ["streaming", "https://cdn.divine.video/{uid}/manifest/video.m3u8", "hls"],
    
    // Direct MP4 URLs
    ["fallback", "https://cdn.divine.video/{uid}/downloads/default.mp4"],
    ["download", "https://cdn.divine.video/{uid}/downloads/default.mp4?download=true"],
    
    // In imeta tag
    [
      "imeta",
      "url https://cdn.divine.video/{uid}/manifest/video.m3u8",
      "fallback https://cdn.divine.video/{uid}/downloads/default.mp4",
      "download https://cdn.divine.video/{uid}/downloads/default.mp4?download=true"
    ]
  ]
}
```

## CORS Headers

The CDN proxy automatically adds CORS headers to allow cross-origin access:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

This means:
- ✅ Videos can be embedded on any domain
- ✅ JavaScript can fetch videos cross-origin
- ✅ Download works from any website

## Testing Downloads

### Test Inline Playback
```bash
# Should play in browser
curl -I "https://cdn.divine.video/{uid}/downloads/default.mp4"
# Look for: Content-Disposition: inline; filename="video.mp4"
```

### Test Forced Download
```bash
# Should trigger download
curl -I "https://cdn.divine.video/{uid}/downloads/default.mp4?download=true"
# Look for: Content-Disposition: attachment; filename="video.mp4"
```

### Test CORS
```bash
# Check CORS headers
curl -I "https://cdn.divine.video/{uid}/downloads/default.mp4" \
  -H "Origin: https://example.com"
# Look for: Access-Control-Allow-Origin: *
```

## Benefits

1. **User Choice**: Users can choose to stream or download
2. **Bandwidth Efficient**: Download only when needed
3. **Cross-Origin**: Works from any domain
4. **SEO Friendly**: Direct MP4 URLs for search engines
5. **Fallback Support**: Works even without HLS support

## Usage in Different Contexts

### Social Media Sharing
```html
<meta property="og:video" content="https://cdn.divine.video/{uid}/downloads/default.mp4">
<meta property="og:video:type" content="video/mp4">
<meta property="og:video:width" content="480">
<meta property="og:video:height" content="480">
```

### Email Newsletters
```html
<!-- Link to download -->
<a href="https://cdn.divine.video/{uid}/downloads/default.mp4?download=true">
  Download Vine Video (MP4)
</a>
```

### Mobile Apps
```swift
// iOS Swift
let videoURL = URL(string: "https://cdn.divine.video/\(uid)/downloads/default.mp4")
// Can play directly or download
```

```kotlin
// Android Kotlin
val videoUrl = "https://cdn.divine.video/$uid/downloads/default.mp4"
// Can stream or download with DownloadManager
```

## Summary

The CDN proxy now fully supports:
- ✅ Inline MP4 playback (default)
- ✅ Forced downloads with `?download=true`
- ✅ CORS headers for cross-origin access
- ✅ Proper Content-Type headers
- ✅ Custom filenames in Content-Disposition

Users can:
1. Watch videos directly in browser
2. Right-click to save
3. Use download button for forced download
4. Access from any domain
5. Embed in any website