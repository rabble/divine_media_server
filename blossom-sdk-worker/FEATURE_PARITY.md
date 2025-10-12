# Feature Parity Report: SDK Worker vs Original

## Current Status

### ✅ Implemented & Working

| Feature | Original | SDK Worker | Notes |
|---------|----------|------------|-------|
| GET /<sha256> | ✅ | ✅ | Both serve files from R2 |
| HEAD /<sha256> | ✅ | ✅ | Both return metadata headers |
| PUT /upload | ✅ | ✅ | Both accept binary uploads |
| DELETE /<sha256> | ✅ | ✅ | Both verify ownership |
| GET /list/<pubkey> | ✅ | ✅ | Both list user's blobs |
| SHA-256 validation | ✅ | ✅ | Both verify hash in auth |
| CORS headers | ✅ | ✅ | Both support CORS |
| DEV_AUTH_MODE | ✅ | ✅ | Both support simple pubkey auth |
| R2 storage | ✅ | ✅ | Both use R2 for blobs |
| KV metadata | ✅ | ✅ | Both use KV for metadata |
| Deduplication | ✅ | ✅ | Both detect existing blobs |

### ❌ Missing in SDK Worker

#### 1. HTTP Range Requests (Critical for Video)
**Impact:** HIGH - Required for video streaming

**Original Implementation:**
```javascript
// src/handlers/blossom.mjs:56-71
const range = req.headers.get('range');
if (range) {
  const parts = range.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : r2Object.size - 1;
  const chunksize = (end - start) + 1;

  headers.set('Content-Range', `bytes ${start}-${end}/${r2Object.size}`);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', chunksize.toString());

  return new Response(r2Object.body, {
    status: 206,
    headers
  });
}
```

**SDK Worker:** Not implemented

**Why it matters:**
- Video players use range requests to:
  - Seek to specific timestamps
  - Load chunks progressively
  - Save bandwidth
- Without it, videos must download completely before playback

**To implement:**
- Add range parsing to `handleGetBlob()`
- Return 206 Partial Content for range requests
- Support byte range syntax: `bytes=0-1023`, `bytes=1024-`, `bytes=-500`

---

#### 2. ETag Headers
**Impact:** MEDIUM - Improves caching

**Original:** Sets `ETag` header from R2 object
```javascript
headers.set('ETag', r2Object.etag);
```

**SDK Worker:** Not implemented

**Why it matters:**
- Browser can validate cached content
- Reduces unnecessary downloads
- Standard HTTP caching practice

**To implement:**
- Get ETag from R2 object in storage adapter
- Return it in response headers

---

#### 3. Accept-Ranges Header in HEAD Response
**Impact:** LOW - Metadata for range support

**Original:** Includes in HEAD response
```javascript
headers.set('Accept-Ranges', 'bytes');
```

**SDK Worker:** Not included

**Why it matters:**
- Tells clients range requests are supported
- Part of proper HTTP range request protocol

**To implement:**
- Add to HEAD response headers

---

#### 4. R2 Object Metadata
**Impact:** LOW - Storage optimization

**Original:** Stores comprehensive metadata in R2
```javascript
customMetadata: {
  sha256: sha256,
  uploadedAt: new Date().toISOString(),
  owner: auth.pubkey,
  uid: uid
}
```

**SDK Worker:** Not storing R2 metadata

**Why it matters:**
- Helpful for debugging
- Can reconstruct data without KV
- R2 object is self-describing

**To implement:**
- Update R2BlobStorage adapter to include customMetadata

---

#### 5. File Extension Support in Response URLs
**Impact:** LOW - Better client compatibility

**Original:** Returns URLs with file extensions
```javascript
url: `https://${cdnDomain}/${sha256}${fileExt}`
```

**SDK Worker:** Returns bare SHA-256
```javascript
url: `https://${domain}/${sha256}`
```

**Why it matters:**
- Some clients/browsers use extension for MIME type hints
- Prettier URLs for users
- Better download filename defaults

**To implement:**
- Add `getFileExtension()` helper to SDK worker
- Include in response URLs

---

### 🔄 Differences (Not Issues)

#### 1. Storage Key Patterns
**Original:** Uses `videos/${sha256}.mp4`
**SDK Worker:** Uses `blobs/${sha256}`

Both work fine, just different conventions.

#### 2. Metadata Keys
**Original:**
- `idx:sha256:${hash}` → `{ uid }`
- `video:${uid}` → full metadata
- `idx:pubkey:${pubkey}:${uid}` → ownership

**SDK Worker:**
- `blob:${hash}` → metadata
- `owner:${hash}:${pubkey}` → ownership
- `pubkey:${pubkey}:${hash}` → ownership reverse index

SDK approach is simpler (no UID layer).

#### 3. Error Messages
**Original:** More detailed console logging with emojis 🌸
**SDK Worker:** Basic error logging

Both work, original is more debuggable.

---

## Implementation Priority

### P0: Critical for Video Support
1. **HTTP Range Requests** (50 LOC)
   - Required for video streaming
   - Add to `handleGetBlob()` and storage adapter

### P1: Important for Production
2. **ETag Headers** (5 LOC)
   - Better caching
   - Add to storage adapter return value

3. **Accept-Ranges Header** (1 LOC)
   - Add to HEAD response

### P2: Nice to Have
4. **File Extensions in URLs** (20 LOC)
   - Copy `getFileExtension()` from original
   - Update response URLs

5. **R2 Custom Metadata** (10 LOC)
   - Add to storage adapter

6. **Enhanced Logging** (10 LOC)
   - Copy emoji logging style from original

---

## Effort Estimates

| Feature | Lines of Code | Complexity | Time Estimate |
|---------|--------------|------------|---------------|
| Range Requests | ~50 | Medium | 1-2 hours |
| ETag Headers | ~5 | Low | 15 min |
| Accept-Ranges | ~1 | Low | 5 min |
| File Extensions | ~20 | Low | 30 min |
| R2 Metadata | ~10 | Low | 15 min |
| Enhanced Logging | ~10 | Low | 15 min |
| **Total** | **~96** | - | **~3 hours** |

---

## Recommended Approach

### Option 1: Full Parity (3 hours)
Implement all missing features for complete feature parity.

**Pros:**
- Drop-in replacement for original
- All features working
- Production ready

**Cons:**
- More code to maintain
- Some features rarely used

### Option 2: Critical Features Only (2 hours)
Implement P0 and P1 items only.

**Pros:**
- Covers 95% of use cases
- Less code
- Still production ready for most scenarios

**Cons:**
- Missing nice-to-have features
- Not perfect parity

### Option 3: Keep Both
Use original for video-heavy workloads, SDK for simple blob storage.

**Pros:**
- No additional work needed
- Each optimized for its use case
- Already deployed and tested

**Cons:**
- Two codebases to maintain
- More complex deployment

---

## Specific Implementation Tasks

### Task 1: Add Range Request Support
```javascript
// In blossom-sdk-worker/src/index.mjs, handleGetBlob()

async function handleGetBlob(sha256, isHead, blobStorage, metadataStore, req) {
  // ... existing metadata check ...

  if (!isHead) {
    const blob = await blobStorage.readBlob(sha256);

    // NEW: Handle range requests
    const range = req.headers.get('range');
    if (range && blob) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : blob.size - 1;
      const chunksize = (end - start) + 1;

      return new Response(blob.body, {
        status: 206,
        headers: {
          'Content-Type': blob.type,
          'Content-Range': `bytes ${start}-${end}/${blob.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'ETag': blob.etag || `"${sha256}"`
        }
      });
    }

    // ... rest of existing GET code ...
  }
}
```

### Task 2: Update R2 Storage Adapter
```javascript
// In blossom-sdk-worker/src/storage/r2-blob-storage.mjs

async readBlob(sha256) {
  const key = `blobs/${sha256}`;
  const obj = await this.r2.get(key);

  if (!obj) return null;

  return {
    body: obj.body,
    size: obj.size,
    type: obj.httpMetadata?.contentType || 'application/octet-stream',
    etag: obj.etag  // ADD THIS
  };
}

async writeBlob(sha256, stream, mimeType, owner, uid) {  // ADD owner, uid params
  const key = `blobs/${sha256}`;

  await this.r2.put(key, stream, {
    httpMetadata: {
      contentType: mimeType || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000, immutable'
    },
    customMetadata: {  // ADD THIS
      sha256: sha256,
      uploadedAt: new Date().toISOString(),
      owner: owner || '',
      uid: uid || ''
    }
  });

  return true;
}
```

---

## Testing Checklist

After implementing missing features:

- [ ] Range requests work: `curl -H "Range: bytes=0-100" URL`
- [ ] Video seeking works in browser
- [ ] ETag caching works: `curl -I URL` shows ETag
- [ ] Accept-Ranges in HEAD: `curl -I URL` shows Accept-Ranges
- [ ] File extensions in URLs work
- [ ] All existing tests still pass
- [ ] `./test-live.sh` passes
- [ ] `blossom-audit` results same or better

---

## Conclusion

**Current State:**
- Core Blossom functionality: ✅ Complete
- Video streaming support: ❌ Missing (range requests)
- Production readiness: 🟡 85% there

**To achieve full parity:**
- Implement range requests (critical)
- Add ETag and Accept-Ranges headers (important)
- Consider file extensions and R2 metadata (nice to have)

**Estimated effort:** 2-3 hours for full parity

**Recommendation:**
1. If this will replace the original → Implement all features (~3 hours)
2. If this is for blob-only use → Implement P0/P1 (~2 hours)
3. If keeping both → No changes needed, deploy as-is
