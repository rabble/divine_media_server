# Flutter App Migration to CF Streaming Service

## Overview
This guide outlines the requirements and steps for migrating your Flutter app to use the new Cloudflare Stream-based video service.

## Core Requirements

### 1. NIP-98 Authentication Implementation
The Flutter app needs to implement NIP-98 (Nostr HTTP authentication) for all write operations.

**Required Packages:**
```yaml
dependencies:
  nostr: ^1.0.0  # or appropriate Nostr package
  crypto: ^3.0.0
  http: ^1.0.0
```

**Key Components:**
- Generate and sign Nostr events (kind 27235)
- Base64 encode events for Authorization headers
- Include request URL, method, and payload hash in event tags
- Handle signature verification

### 2. Video Upload Flow

#### Step 1: Request Upload URL
```dart
Future<UploadTicket> createUploadUrl({
  String? sha256,
  String? vineId,
  String? originalUrl,
}) async {
  final url = '${baseUrl}/v1/videos';
  final body = jsonEncode({
    if (sha256 != null) 'sha256': sha256,
    if (vineId != null) 'vineId': vineId,
    if (originalUrl != null) 'originalUrl': originalUrl,
  });
  
  final auth = await createNip98Auth(url, 'POST', body);
  
  final response = await http.post(
    Uri.parse(url),
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
    body: body,
  );
  
  return UploadTicket.fromJson(jsonDecode(response.body));
}
```

#### Step 2: Direct Upload to Cloudflare
```dart
Future<void> uploadVideoToCloudflare(
  String uploadUrl,
  File videoFile,
) async {
  final bytes = await videoFile.readAsBytes();
  
  await http.put(
    Uri.parse(uploadUrl),
    body: bytes,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': bytes.length.toString(),
    },
  );
}
```

#### Step 3: Poll for Processing Status
```dart
Future<VideoStatus> waitForVideoReady(String uid) async {
  while (true) {
    final status = await getVideoStatus(uid);
    
    if (status.status == 'ready') {
      return status;
    } else if (status.status == 'error') {
      throw Exception('Video processing failed');
    }
    
    await Future.delayed(Duration(seconds: 5));
  }
}
```

### 3. Video Playback Implementation

#### HLS Streaming (Recommended)
```dart
import 'package:video_player/video_player.dart';
import 'package:flutter_hls_parser/flutter_hls_parser.dart';

class VideoPlayerWidget extends StatefulWidget {
  final String hlsUrl;
  
  VideoPlayerController? _controller;
  
  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.network(hlsUrl)
      ..initialize().then((_) {
        setState(() {});
      });
  }
}
```

**Recommended Packages:**
- `video_player`: For video playback
- `better_player`: Alternative with HLS support
- `chewie`: Video player with controls

#### MP4 Fallback
```dart
// For direct MP4 playback (fallback)
final mp4Url = 'https://cdn.divine.video/$uid/downloads/default.mp4';

// Force download
final downloadUrl = '$mp4Url?download=true';
```

### 4. Thumbnail Display
```dart
Widget buildThumbnail(String uid) {
  final thumbnailUrl = 'https://cdn.divine.video/$uid/thumbnails/thumbnail.jpg';
  
  return CachedNetworkImage(
    imageUrl: thumbnailUrl,
    placeholder: (context, url) => CircularProgressIndicator(),
    errorWidget: (context, url, error) => Icon(Icons.error),
  );
}
```

### 5. Data Models

```dart
class UploadTicket {
  final String uid;
  final String uploadURL;
  final DateTime? expiresAt;
  final String owner;
  
  UploadTicket.fromJson(Map<String, dynamic> json) { /* ... */ }
}

class VideoStatus {
  final String uid;
  final String status; // pending_upload, uploading, processing, ready, error
  final String owner;
  final String? hlsUrl;
  final String? dashUrl;
  final String? thumbnailUrl;
  
  VideoStatus.fromJson(Map<String, dynamic> json) { /* ... */ }
}
```

## Migration Checklist

### Phase 1: Authentication & Core Services
- [ ] Implement NIP-98 authentication helper
- [ ] Create video service class with API endpoints
- [ ] Add error handling for all API responses
- [ ] Implement rate limiting awareness (30 uploads/hour)

### Phase 2: Upload Flow
- [ ] Build upload UI with progress indication
- [ ] Implement SHA-256 hashing for deduplication
- [ ] Add direct Cloudflare Stream upload
- [ ] Create status polling mechanism
- [ ] Handle upload errors and retries

### Phase 3: Playback & Display
- [ ] Integrate HLS video player
- [ ] Add MP4 fallback support
- [ ] Implement thumbnail loading
- [ ] Add download functionality
- [ ] Support offline caching if needed

### Phase 4: Advanced Features
- [ ] Implement video lookup by sha256/vineId/URL
- [ ] Add user video listing
- [ ] Support alias management
- [ ] Implement webhook listener (if using real-time updates)

## Key Differences from Previous System

| Feature | Old System | New CF Stream System |
|---------|-----------|---------------------|
| Upload | Server proxy | Direct to Cloudflare |
| Authentication | (varies) | NIP-98 required |
| Video IDs | Custom | CF Stream UIDs |
| Formats | MP4 only | HLS + MP4 + DASH |
| Processing | Custom | CF Stream automatic |
| Thumbnails | Custom generation | CF Stream automatic |
| CDN | Custom | Cloudflare global |

## Performance Considerations

1. **Upload Optimization**
   - Use background upload service for large files
   - Implement chunked uploads for reliability
   - Cache upload URLs (they expire)

2. **Playback Optimization**
   - Prefer HLS for adaptive streaming
   - Cache video metadata locally
   - Preload thumbnails for smooth scrolling

3. **Network Efficiency**
   - Implement exponential backoff for retries
   - Use connection state awareness
   - Cache playback URLs (stable once ready)

## Error Handling

```dart
class VideoServiceException implements Exception {
  final String error;
  final String? reason;
  final int statusCode;
  
  VideoServiceException.fromResponse(Response response) {
    final body = jsonDecode(response.body);
    error = body['error'];
    reason = body['reason'];
    statusCode = response.statusCode;
  }
}

// Usage
try {
  final ticket = await createUploadUrl();
} on VideoServiceException catch (e) {
  switch (e.statusCode) {
    case 401:
      // Handle missing auth
    case 403:
      // Handle invalid auth
    case 409:
      // Handle duplicate
    case 429:
      // Handle rate limit
  }
}
```

## Testing Strategy

### Development (Staging)
```dart
// Use simplified auth for testing
const STAGING_URL = 'https://cf-stream-service-staging.protestnet.workers.dev';

// Simplified auth header for staging
final testAuth = 'Nostr pubkey=test_user_${DateTime.now().millisecondsSinceEpoch}';
```

### Production
```dart
const PROD_URL = 'https://cf-stream-service-prod.protestnet.workers.dev';
// Full NIP-98 authentication required
```

## Security Considerations

1. **Private Key Management**
   - Store Nostr private keys securely
   - Use Flutter secure storage
   - Never log or expose private keys

2. **Content Validation**
   - Verify video SHA-256 before upload
   - Validate server responses
   - Implement certificate pinning for API calls

3. **Rate Limiting**
   - Track upload count client-side
   - Implement backoff on 429 errors
   - Queue uploads when rate limited

## Platform-Specific Considerations

### iOS
- Configure Info.plist for video playback
- Handle background uploads with URLSession
- Support Picture-in-Picture if needed

### Android
- Add INTERNET permission
- Configure for background uploads
- Handle different video codec support

### Web
- Use HLS.js for broader browser support
- Implement CORS handling
- Consider WebRTC for live streaming

## Sample Integration

```dart
class CFStreamService {
  final String baseUrl;
  final NostrKeyPair keyPair;
  
  Future<String> uploadVideo(File videoFile) async {
    // 1. Hash the video
    final sha256 = await computeSha256(videoFile);
    
    // 2. Get upload URL
    final ticket = await createUploadUrl(sha256: sha256);
    
    // 3. Upload to Cloudflare
    await uploadVideoToCloudflare(ticket.uploadURL, videoFile);
    
    // 4. Wait for processing
    final status = await waitForVideoReady(ticket.uid);
    
    // 5. Return playback URL
    return status.hlsUrl!;
  }
  
  Future<VideoInfo> getVideoInfo(String uid) async {
    final response = await http.get(
      Uri.parse('$baseUrl/v1/videos/$uid'),
    );
    
    return VideoInfo.fromJson(jsonDecode(response.body));
  }
}
```

## Monitoring & Analytics

- Track upload success rates
- Monitor processing times
- Log playback errors
- Measure time to first frame
- Track bandwidth usage

## Support & Resources

- API Documentation: `/API_DOCUMENTATION.md`
- Cloudflare Stream Docs: https://developers.cloudflare.com/stream/
- NIP-98 Specification: https://github.com/nostr-protocol/nips/blob/master/98.md
- Flutter Video Player: https://pub.dev/packages/video_player

## Next Steps

1. Review current Flutter app video handling code
2. Implement NIP-98 authentication module
3. Create video service wrapper class
4. Update UI for new upload/playback flow
5. Test with staging environment
6. Gradual rollout with feature flags
7. Monitor and optimize based on metrics