# Flutter App Migration Guide: Blossom SDK Worker

## Overview

This document outlines the changes required to migrate the Flutter app from the old cf-streaming-service to the new blossom-sdk-worker running at `blossom.divine.video`. The new service implements the official Blossom protocol using blossom-server-sdk v0.8.0 and adds ProofMode support for verified media uploads.

**Key Changes:**
- New endpoint: `https://blossom.divine.video`
- Standardized Blossom protocol endpoints (no more custom routes)
- Enhanced moderation with tiered access control (NIP-78)
- ProofMode integration for cryptographic proof of authenticity
- Backward compatibility maintained for existing content

---

## 1. Endpoint Changes

### Base URLs
```dart
// OLD - Cloudflare Stream service
const streamServiceUrl = 'https://your-cf-stream-worker.workers.dev';  // Upload API
const cdnUrl = 'https://cdn.divine.video';  // Delivery CDN (HLS)

// NEW - Blossom protocol service
const blossomUploadUrl = 'https://blossom.divine.video';  // Upload API
const cdnUrl = 'https://cdn.divine.video';  // Delivery CDN (same!)
```

**Important:** Files are still served from `cdn.divine.video` in both systems. Only the upload endpoint and URL format changed.

### Endpoint Mapping

| Operation | Old Endpoint | New Endpoint | Method |
|-----------|--------------|--------------|--------|
| Request upload | POST `/v1/videos` | PUT `/upload` | Changed |
| Get video/blob | GET `/v1/videos/{uid}` | GET `/{sha256}` | Changed |
| Check existence | HEAD `/v1/videos/{uid}` | HEAD `/{sha256}` | Changed |
| List user content | GET `/v1/users/{pubkey}/videos` | GET `/list/{pubkey}` | Changed |
| Delete | Not implemented | DELETE `/{sha256}` | NEW |

### URL Format Changes

**Old Cloudflare Stream URLs (served from cdn.divine.video):**
```
HLS Playback: https://cdn.divine.video/{uid}/manifest/video.m3u8
Thumbnail:    https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg
MP4 Download: https://cdn.divine.video/{uid}/downloads/default.mp4
```

**New Blossom Blob URLs (also served from cdn.divine.video):**
```
Direct Blob:  https://cdn.divine.video/{sha256}
With Extension: https://cdn.divine.video/{sha256}.mp4
```

**Important Changes:**
- Both systems serve from `cdn.divine.video` CDN
- Old: Upload to cf-stream-worker → get Stream UID → HLS at `cdn.divine.video/{uid}/manifest/video.m3u8`
- New: Upload to `blossom.divine.video/upload` → get SHA-256 → raw file at `cdn.divine.video/{sha256}.mp4`
- Old system transcoded to HLS automatically
- New system serves raw uploaded files (no transcoding)

---

## 2. Authentication: Nostr kind 24242 Events

### What Changed
The new service requires Nostr authentication using **kind 24242** events (Blossom protocol standard).

### Creating Auth Events

```dart
import 'package:nostr/nostr.dart';
import 'package:crypto/crypto.dart';

/// Create a Blossom authentication event for upload
Future<Event> createBlossomAuthEvent({
  required String privateKey,
  required String sha256Hash,
  int expirationSeconds = 300, // 5 minutes
}) async {
  final publicKey = getPublicKey(privateKey);
  final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
  final expiration = now + expirationSeconds;

  final event = Event(
    kind: 24242,
    pubkey: publicKey,
    createdAt: now,
    tags: [
      ['t', 'upload'],
      ['x', sha256Hash],
      ['expiration', expiration.toString()],
    ],
    content: 'Upload to Blossom',
  );

  return event.sign(privateKey);
}

/// Create Authorization header from signed event
String createAuthHeader(Event signedEvent) {
  final eventJson = jsonEncode(signedEvent.toJson());
  final base64Event = base64Encode(utf8.encode(eventJson));
  return 'Nostr $base64Event';
}
```

### Using Auth Headers

```dart
// Example upload with authentication
final sha256 = await calculateSHA256(videoBytes);
final authEvent = await createBlossomAuthEvent(
  privateKey: userPrivateKey,
  sha256Hash: sha256,
);

final response = await http.put(
  Uri.parse('https://blossom.divine.video/upload'),
  headers: {
    'Authorization': createAuthHeader(authEvent),
    'Content-Type': 'video/mp4',
  },
  body: videoBytes,
);
```

---

## 3. Upload Flow Changes

### Key Differences

1. **Calculate SHA-256 BEFORE upload**
2. **Include SHA-256 in auth event's 'x' tag**
3. **Send ProofMode headers for videos** (optional but recommended)
4. **Handle new response format**

### Complete Upload Implementation

```dart
import 'dart:typed_data';
import 'package:crypto/crypto.dart';

/// Calculate SHA-256 hash of file bytes
String calculateSHA256(Uint8List bytes) {
  final digest = sha256.convert(bytes);
  return digest.toString();
}

/// Upload blob with Blossom protocol
Future<BlossomBlobDescriptor> uploadBlob({
  required Uint8List fileBytes,
  required String contentType,
  required String privateKey,
  ProofModeData? proofMode,
}) async {
  // Step 1: Calculate SHA-256
  final sha256Hash = calculateSHA256(fileBytes);

  // Step 2: Create auth event with SHA-256
  final authEvent = await createBlossomAuthEvent(
    privateKey: privateKey,
    sha256Hash: sha256Hash,
  );

  // Step 3: Prepare headers
  final headers = {
    'Authorization': createAuthHeader(authEvent),
    'Content-Type': contentType,
  };

  // Step 4: Add ProofMode headers if provided
  if (proofMode != null) {
    headers['X-ProofMode-Manifest'] = proofMode.manifestBase64;
    headers['X-ProofMode-Signature'] = proofMode.signatureBase64;
    if (proofMode.attestationBase64 != null) {
      headers['X-ProofMode-Attestation'] = proofMode.attestationBase64;
    }
  }

  // Step 5: Upload
  final response = await http.put(
    Uri.parse('https://blossom.divine.video/upload'),
    headers: headers,
    body: fileBytes,
  );

  if (response.statusCode == 200) {
    return BlossomBlobDescriptor.fromJson(jsonDecode(response.body));
  } else {
    throw BlossomUploadException(response);
  }
}

/// Blossom blob descriptor response
class BlossomBlobDescriptor {
  final String url;
  final String sha256;
  final int size;
  final String type;
  final int uploaded;
  final ProofModeResult? proofmode;

  BlossomBlobDescriptor({
    required this.url,
    required this.sha256,
    required this.size,
    required this.type,
    required this.uploaded,
    this.proofmode,
  });

  factory BlossomBlobDescriptor.fromJson(Map<String, dynamic> json) {
    return BlossomBlobDescriptor(
      url: json['url'],
      sha256: json['sha256'],
      size: json['size'],
      type: json['type'],
      uploaded: json['uploaded'],
      proofmode: json['proofmode'] != null
        ? ProofModeResult.fromJson(json['proofmode'])
        : null,
    );
  }
}

class ProofModeResult {
  final bool verified;
  final String level;
  final String? deviceFingerprint;
  final int? timestamp;
  final String? message;

  ProofModeResult({
    required this.verified,
    required this.level,
    this.deviceFingerprint,
    this.timestamp,
    this.message,
  });

  factory ProofModeResult.fromJson(Map<String, dynamic> json) {
    return ProofModeResult(
      verified: json['verified'],
      level: json['level'],
      deviceFingerprint: json['deviceFingerprint'],
      timestamp: json['timestamp'],
      message: json['message'],
    );
  }
}
```

---

## 4. ProofMode Integration

### What is ProofMode?

ProofMode is a cryptographic proof system developed by the Guardian Project that provides verifiable proof of:
- When media was captured
- Where it was captured (GPS coordinates)
- What device captured it
- That the media hasn't been tampered with

### Verification Levels

1. **verified_mobile** - Highest trust level
   - Device attestation (Android SafetyNet/Play Integrity or iOS DeviceCheck)
   - PGP signature of manifest
   - Complete metadata manifest

2. **verified_web** - High trust level
   - PGP signature of manifest
   - Complete metadata manifest
   - No device attestation (web uploads)

3. **basic_proof** - Low trust level
   - Partial ProofMode data
   - Missing signature or attestation

4. **unverified** - No ProofMode data provided

### Installing ProofMode SDK

Add to `pubspec.yaml`:
```yaml
dependencies:
  proofmode: ^2.0.0  # Guardian Project ProofMode SDK
  openpgp: ^2.0.0    # For PGP signature generation
```

### Generating ProofMode Data

```dart
import 'package:proofmode/proofmode.dart';
import 'package:openpgp/openpgp.dart';

class ProofModeData {
  final String manifestBase64;
  final String signatureBase64;
  final String? attestationBase64;

  ProofModeData({
    required this.manifestBase64,
    required this.signatureBase64,
    this.attestationBase64,
  });
}

/// Generate ProofMode data for a video upload
Future<ProofModeData> generateProofMode({
  required Uint8List videoBytes,
  required String sha256Hash,
}) async {
  // Step 1: Initialize ProofMode
  final proofMode = ProofMode();
  await proofMode.initialize();

  // Step 2: Create manifest
  final sessionId = Uuid().v4();
  final timestamp = DateTime.now().toIso8601String();

  // Extract frame hashes (sample frames from video)
  final frameHashes = await _extractFrameHashes(videoBytes);

  // Get device info
  final deviceInfo = await DeviceInfoPlugin().deviceInfo;

  // Get location (with user permission)
  final location = await _getCurrentLocation();

  final manifest = {
    'version': '2.0',
    'sessionId': sessionId,
    'timestamp': timestamp,
    'videoHash': sha256Hash,
    'frameHashes': frameHashes,
    'device': {
      'manufacturer': deviceInfo.manufacturer,
      'model': deviceInfo.model,
      'osVersion': deviceInfo.version,
    },
    if (location != null) 'location': {
      'latitude': location.latitude,
      'longitude': location.longitude,
      'accuracy': location.accuracy,
    },
  };

  // Step 3: Convert manifest to JSON and base64
  final manifestJson = jsonEncode(manifest);
  final manifestBase64 = base64Encode(utf8.encode(manifestJson));

  // Step 4: Generate PGP signature of manifest
  final keyPair = await proofMode.getKeyPair();
  final signature = await OpenPGP.sign(
    manifestJson,
    keyPair.privateKey,
    keyPair.passphrase,
  );
  final signatureBase64 = base64Encode(utf8.encode(signature));

  // Step 5: Generate device attestation (platform-specific)
  String? attestationBase64;
  if (Platform.isAndroid || Platform.isIOS) {
    final attestation = await _generateDeviceAttestation(sessionId);
    if (attestation != null) {
      attestationBase64 = base64Encode(utf8.encode(jsonEncode(attestation)));
    }
  }

  return ProofModeData(
    manifestBase64: manifestBase64,
    signatureBase64: signatureBase64,
    attestationBase64: attestationBase64,
  );
}

/// Extract frame hashes from video (sample implementation)
Future<List<String>> _extractFrameHashes(Uint8List videoBytes) async {
  // Use video processing library to extract keyframes
  // For each frame, calculate SHA-256
  // Return list of hashes

  // Simplified example:
  final frameCount = 3;
  final hashes = <String>[];

  for (int i = 0; i < frameCount; i++) {
    // Extract frame at position (i / frameCount)
    // This is pseudo-code - use actual video library
    final frame = await extractFrameAtPosition(videoBytes, i / frameCount);
    final frameHash = calculateSHA256(frame);
    hashes.add(frameHash);
  }

  return hashes;
}

/// Generate device attestation (platform-specific)
Future<Map<String, dynamic>?> _generateDeviceAttestation(String nonce) async {
  if (Platform.isAndroid) {
    // Use Android SafetyNet/Play Integrity API
    final token = await SafetyNetClient.attest(nonce);
    return {
      'platform': 'android',
      'nonce': nonce,
      'timestamp': DateTime.now().millisecondsSinceEpoch,
      'token': token,
    };
  } else if (Platform.isIOS) {
    // Use iOS DeviceCheck API
    final token = await DCDevice.current.generateToken();
    return {
      'platform': 'ios',
      'nonce': nonce,
      'timestamp': DateTime.now().millisecondsSinceEpoch,
      'token': base64Encode(token),
    };
  }

  return null;
}

Future<LocationData?> _getCurrentLocation() async {
  try {
    final permission = await Permission.location.request();
    if (!permission.isGranted) return null;

    final location = await Location().getLocation();
    return location;
  } catch (e) {
    return null;
  }
}
```

### ProofMode Requirement Configuration

Currently, ProofMode is **optional** for all uploads. After launch, the server configuration may change to **require** ProofMode for video uploads:

```dart
// Handle ProofMode requirement error
try {
  final result = await uploadBlob(
    fileBytes: videoBytes,
    contentType: 'video/mp4',
    privateKey: userPrivateKey,
  );
} on BlossomUploadException catch (e) {
  if (e.errorCode == 'proofmode_required') {
    // Show user dialog explaining ProofMode requirement
    showProofModeRequiredDialog(
      message: e.message,
      requiredLevel: e.details['required_level'],
    );
  }
}
```

**Important:** Image uploads (thumbnails, profile photos) do NOT require ProofMode.

---

## 5. Content Moderation Changes

### Tiered Access Control

The new system implements tiered moderation with four levels:

1. **SAFE** - Serves without restrictions
2. **REVIEW** - Flagged for human review, serves normally
3. **AGE_RESTRICTED** - Requires authentication + user preferences
4. **PERMANENT_BAN** - Never served (HTTP 451)

### Handling Age-Restricted Content

When accessing age-restricted content, the user must:
1. Be authenticated (provide Nostr auth header)
2. Have explicit content preferences set via NIP-78

```dart
/// Handle age-restricted content response
Future<Response> getBlobWithAuth({
  required String sha256,
  required String privateKey,
}) async {
  final authEvent = await createBlossomAuthEvent(
    privateKey: privateKey,
    sha256Hash: sha256,
  );

  final response = await http.get(
    Uri.parse('https://blossom.divine.video/$sha256'),
    headers: {
      'Authorization': createAuthHeader(authEvent),
    },
  );

  if (response.statusCode == 401 || response.statusCode == 403) {
    final error = jsonDecode(response.body);

    if (error['error'] == 'preferences_required') {
      // User needs to set content preferences
      await showContentPreferencesDialog(
        preferencesUrl: error['preferences_url'],
        sha256: sha256,
      );
    }
  } else if (response.statusCode == 451) {
    // Content is permanently banned
    showBannedContentError(error['message']);
  }

  return response;
}
```

### Setting Content Preferences (NIP-78)

Users can set content preferences using Nostr kind 30078 events:

```dart
/// Create NIP-78 content preferences event
Future<Event> createContentPreferencesEvent({
  required String privateKey,
  required bool allowNudity,
  required bool allowViolence,
  required bool allowHate,
}) async {
  final publicKey = getPublicKey(privateKey);
  final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;

  final event = Event(
    kind: 30078,
    pubkey: publicKey,
    createdAt: now,
    tags: [
      ['d', 'content-preferences'], // identifier
    ],
    content: jsonEncode({
      'nudity': allowNudity,
      'violence': allowViolence,
      'hate': allowHate,
    }),
  );

  return event.sign(privateKey);
}

/// Publish content preferences to relays
Future<void> publishContentPreferences(Event signedEvent) async {
  final relays = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band',
  ];

  for (final relay in relays) {
    await NostrClient.publish(relay, signedEvent);
  }
}
```

---

## 6. Other API Changes

### GET /{sha256} - Retrieve Blob

```dart
// OLD - HLS playback URL from Cloudflare Stream
final hlsUrl = 'https://cdn.divine.video/$uid/manifest/video.m3u8';
final response = await http.get(Uri.parse(hlsUrl));

// NEW - Direct blob access
final response = await http.get(
  Uri.parse('https://blossom.divine.video/$sha256'),
);

// NEW with auth (for age-restricted content)
final authEvent = await createBlossomAuthEvent(
  privateKey: userPrivateKey,
  sha256Hash: sha256,
);

final response = await http.get(
  Uri.parse('https://blossom.divine.video/$sha256'),
  headers: {
    'Authorization': createAuthHeader(authEvent),
  },
);
```

**Supports range requests** for video streaming - no changes needed if already using Range headers.

### HEAD /{sha256} - Check Blob Existence

```dart
// Check if blob exists before uploading
final response = await http.head(
  Uri.parse('https://blossom.divine.video/$sha256'),
);

if (response.statusCode == 200) {
  print('Blob already exists, size: ${response.headers['content-length']}');
  // Skip upload
} else if (response.statusCode == 404) {
  // Proceed with upload
}
```

### GET /list/{pubkey} - List User Blobs

```dart
// List all blobs uploaded by a user
final response = await http.get(
  Uri.parse('https://blossom.divine.video/list/$userPubkey'),
);

if (response.statusCode == 200) {
  final List<dynamic> blobs = jsonDecode(response.body);
  for (final blob in blobs) {
    print('SHA-256: ${blob['sha256']}');
    print('Size: ${blob['size']}');
    print('Type: ${blob['type']}');
    print('Uploaded: ${DateTime.fromMillisecondsSinceEpoch(blob['uploaded'] * 1000)}');
  }
}
```

### DELETE /{sha256} - Delete Blob

```dart
// Delete blob (requires ownership)
final authEvent = await createBlossomAuthEvent(
  privateKey: userPrivateKey,
  sha256Hash: sha256,
);

final response = await http.delete(
  Uri.parse('https://blossom.divine.video/$sha256'),
  headers: {
    'Authorization': createAuthHeader(authEvent),
  },
);

if (response.statusCode == 204) {
  print('Blob deleted successfully');
} else if (response.statusCode == 403) {
  print('Forbidden: You do not own this blob');
} else if (response.statusCode == 404) {
  print('Blob not found');
}
```

---

## 7. Error Handling

### New Error Responses

```dart
class BlossomError {
  final int statusCode;
  final String error;
  final String? message;
  final Map<String, dynamic>? details;

  BlossomError({
    required this.statusCode,
    required this.error,
    this.message,
    this.details,
  });

  factory BlossomError.fromResponse(http.Response response) {
    final body = jsonDecode(response.body);
    return BlossomError(
      statusCode: response.statusCode,
      error: body['error'],
      message: body['message'],
      details: body,
    );
  }
}

/// Handle common Blossom errors
void handleBlossomError(BlossomError error) {
  switch (error.error) {
    case 'unauthorized':
      showError('Authentication failed. Please check your credentials.');
      break;

    case 'hash_mismatch':
      showError('File integrity check failed. The file may be corrupted.');
      break;

    case 'proofmode_required':
      showProofModeRequiredDialog(
        message: error.message ?? 'ProofMode verification required for video uploads',
        requiredLevel: error.details?['required_level'] ?? 'verified_web',
      );
      break;

    case 'preferences_required':
      showContentPreferencesDialog(
        sha256: error.details?['sha256'],
        preferencesUrl: error.details?['preferences_url'],
      );
      break;

    case 'storage_failed':
      showError('Upload failed. Please try again.');
      break;

    default:
      showError('An error occurred: ${error.message ?? error.error}');
  }
}
```

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response |
| 202 | Accepted (processing) | Poll for status |
| 204 | Success (no content) | Operation complete |
| 400 | Bad request | Check request format |
| 401 | Unauthorized | Provide authentication |
| 403 | Forbidden | Check permissions/preferences |
| 404 | Not found | Blob doesn't exist |
| 451 | Unavailable for legal reasons | Content is banned |
| 500 | Server error | Retry later |

---

## 8. Migration Checklist

### Phase 1: Update Base Infrastructure
- [ ] Add ProofMode SDK to `pubspec.yaml`
- [ ] Add OpenPGP library for signature generation
- [ ] Update base URL to `https://blossom.divine.video`
- [ ] Implement Nostr kind 24242 authentication
- [ ] Implement SHA-256 calculation helper

### Phase 2: Update Upload Flow
- [ ] Add SHA-256 calculation before upload
- [ ] Update auth event creation with 'x' tag
- [ ] Implement ProofMode data generation
- [ ] Add ProofMode headers to upload requests
- [ ] Update response parsing for new format
- [ ] Add ProofMode result display in UI

### Phase 3: Update Retrieval Flow
- [ ] Change from fileId to SHA-256 in URLs
- [ ] Add authentication for age-restricted content
- [ ] Implement NIP-78 content preferences
- [ ] Update error handling for 401/403/451
- [ ] Add content preferences dialog

### Phase 4: Update List/Delete Operations
- [ ] Update list endpoint to `/list/{pubkey}`
- [ ] Update delete endpoint to `/{sha256}`
- [ ] Test ownership verification

### Phase 5: Testing
- [ ] Test upload with ProofMode (video)
- [ ] Test upload without ProofMode (image)
- [ ] Test deduplication (upload same file twice)
- [ ] Test age-restricted content access
- [ ] Test content preferences flow
- [ ] Test banned content handling
- [ ] Test backward compatibility with old videos

### Phase 6: Deployment
- [ ] Deploy to staging environment
- [ ] Perform integration testing
- [ ] Monitor ProofMode adoption rates
- [ ] Deploy to production
- [ ] Monitor error rates and user feedback

---

## 9. Backward Compatibility

### Existing Content

All existing videos uploaded to the old system remain accessible through the new service with **no changes required**. The backend implements fallback logic to read from both old and new storage paths.

**URLs remain the same:**
```
https://blossom.divine.video/{sha256}
```

The service automatically checks:
1. New path: `blobs/{sha256}`
2. Old path: `videos/{sha256}.mp4`

### Gradual Migration

You can migrate gradually:
1. **Update app** to use new upload flow
2. **Old videos** continue to work automatically
3. **New uploads** use Blossom protocol
4. **No data migration** needed

---

## 10. Resources

### Official Documentation
- [Blossom Protocol Specification](https://github.com/hzrd149/blossom)
- [Blossom Server SDK](https://github.com/hzrd149/blossom-server-sdk)
- [Guardian Project ProofMode](https://github.com/guardianproject/proofmode)
- [Nostr NIPs](https://github.com/nostr-protocol/nips)
- [NIP-78: Application-specific data](https://github.com/nostr-protocol/nips/blob/master/78.md)
- [NIP-98: HTTP Auth](https://github.com/nostr-protocol/nips/blob/master/98.md)

### Testing Endpoints
- **Production:** `https://blossom.divine.video`
- **Staging:** Contact backend team for staging URL

### Support
- Backend repository: Contact project maintainer
- ProofMode issues: [Guardian Project GitHub](https://github.com/guardianproject/proofmode/issues)

---

## Appendix A: Complete Example

### Full Upload Implementation with Error Handling

```dart
class BlossomClient {
  final String baseUrl = 'https://blossom.divine.video';
  final String privateKey;

  BlossomClient({required this.privateKey});

  Future<BlossomBlobDescriptor> uploadVideo({
    required Uint8List videoBytes,
    bool includeProofMode = true,
  }) async {
    try {
      // Step 1: Calculate SHA-256
      final sha256 = calculateSHA256(videoBytes);
      print('Calculated SHA-256: $sha256');

      // Step 2: Check if blob already exists
      final existingBlob = await checkBlobExists(sha256);
      if (existingBlob != null) {
        print('Blob already exists, skipping upload');
        return existingBlob;
      }

      // Step 3: Generate ProofMode data
      ProofModeData? proofMode;
      if (includeProofMode) {
        try {
          proofMode = await generateProofMode(
            videoBytes: videoBytes,
            sha256Hash: sha256,
          );
          print('Generated ProofMode data');
        } catch (e) {
          print('Failed to generate ProofMode: $e');
          // Continue without ProofMode
        }
      }

      // Step 4: Upload
      final result = await uploadBlob(
        fileBytes: videoBytes,
        contentType: 'video/mp4',
        privateKey: privateKey,
        proofMode: proofMode,
      );

      print('Upload successful!');
      print('URL: ${result.url}');
      print('Size: ${result.size}');
      print('ProofMode level: ${result.proofmode?.level ?? 'none'}');

      return result;

    } on BlossomUploadException catch (e) {
      print('Upload failed: ${e.message}');
      handleBlossomError(BlossomError.fromResponse(e.response));
      rethrow;
    } catch (e) {
      print('Unexpected error: $e');
      rethrow;
    }
  }

  Future<BlossomBlobDescriptor?> checkBlobExists(String sha256) async {
    final response = await http.head(
      Uri.parse('$baseUrl/$sha256'),
    );

    if (response.statusCode == 200) {
      // Blob exists, fetch full descriptor
      final getResponse = await http.get(
        Uri.parse('$baseUrl/$sha256'),
      );

      if (getResponse.statusCode == 200) {
        return BlossomBlobDescriptor(
          url: '$baseUrl/$sha256',
          sha256: sha256,
          size: int.parse(response.headers['content-length'] ?? '0'),
          type: response.headers['content-type'] ?? 'video/mp4',
          uploaded: DateTime.now().millisecondsSinceEpoch ~/ 1000,
        );
      }
    }

    return null;
  }

  Future<Response> getBlob(String sha256, {bool auth = false}) async {
    final headers = <String, String>{};

    if (auth) {
      final authEvent = await createBlossomAuthEvent(
        privateKey: privateKey,
        sha256Hash: sha256,
      );
      headers['Authorization'] = createAuthHeader(authEvent);
    }

    final response = await http.get(
      Uri.parse('$baseUrl/$sha256'),
      headers: headers,
    );

    if (response.statusCode == 401 || response.statusCode == 403) {
      // Handle age-restricted content
      final error = BlossomError.fromResponse(response);
      handleBlossomError(error);
    } else if (response.statusCode == 451) {
      // Handle banned content
      showError('This content has been removed');
    }

    return response;
  }
}
```

---

**End of Flutter Migration Guide**
