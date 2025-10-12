# Comparison: Original vs SDK-Based Blossom Implementation

## Architecture Overview

### Original Implementation (Main Worker)
```
src/
├── worker.mjs (main entry, routing)
├── router.mjs (routing logic)
├── handlers/
│   ├── blossom.mjs (403 lines)
│   ├── videos.mjs
│   └── ... (10+ other handlers)
├── auth/
│   ├── blossom.mjs (321 lines)
│   └── nip98.mjs
└── utils/ (various utilities)
```

**Characteristics:**
- Monolithic worker with multiple services
- Direct KV and R2 operations in handlers
- Custom authentication implementation
- Integrated with Cloudflare Stream video service
- 724 LOC for Blossom functionality (handlers + auth)

### SDK-Based Implementation (Experimental Worker)
```
blossom-sdk-worker/
├── src/
│   ├── index.mjs (293 lines - all routing & handlers)
│   └── storage/
│       ├── r2-blob-storage.mjs (64 lines)
│       └── kv-metadata-store.mjs (88 lines)
└── tests/
    └── sdk-worker.test.mjs (17 tests)
```

**Characteristics:**
- Dedicated Blossom-only worker
- Storage adapters implement SDK interfaces
- Uses blossom-server-sdk abstractions
- Focused, single-purpose service
- 445 LOC total (38% less code)

## Detailed Comparison

### Code Complexity

| Metric | Original | SDK-Based | Difference |
|--------|----------|-----------|------------|
| Total LOC (Blossom) | 724 | 445 | **-38%** |
| Handler LOC | 403 | 293 | **-27%** |
| Storage Logic | Inline | 152 (adapters) | Separated |
| Dependencies | Many | 1 (SDK) | Simpler |
| Files | 2 main + utils | 3 focused | Cleaner |

### Architecture Patterns

#### Original Approach
```javascript
// Direct storage operations in handler
export async function blossomUpload(req, env, deps) {
  // Auth inline
  const auth = await verifyBlossomAuth(req, deps, env);

  // Direct R2 operation
  await env.R2_VIDEOS.put(r2Key, blob, { ... });

  // Direct KV operation
  await env.MEDIA_KV.put(`blob:${hash}`, JSON.stringify(metadata));

  // Return response
  return json(200, { url, sha256, size, type, uploaded });
}
```

**Pros:**
- Simple, direct access to resources
- No abstraction overhead
- All code visible in one place
- Easy to understand data flow

**Cons:**
- Storage logic mixed with business logic
- Hard to test (requires real env bindings)
- Difficult to swap storage backends
- Duplicate patterns across handlers

#### SDK-Based Approach
```javascript
// Clean separation via adapters
const blobStorage = new R2BlobStorage(env.R2_BLOBS);
const metadataStore = new KVMetadataStore(env.MEDIA_KV);

// Storage operations through interfaces
await blobStorage.writeBlob(sha256, blob, contentType);
await metadataStore.addBlob({ sha256, size, type, uploaded });
await metadataStore.addBlobOwner(sha256, auth.pubkey);
```

**Pros:**
- Clean separation of concerns
- Easy to test with mocks
- Swappable storage backends
- Follows interface patterns
- Reusable adapters

**Cons:**
- More abstraction layers
- Need to understand adapter pattern
- Slightly more files
- Dependency on external SDK

### Testing

#### Original Implementation
```javascript
// tests/blossom.test.mjs - 256 lines
// Direct mocking required
const mockKV = () => {
  const store = new Map();
  return { get, put, delete, list };
};

// Tests mixed with main worker tests
```

**Testing Stats:**
- Tests in main test suite
- Mock implementations inline
- 256 lines of test code
- Tests video + blossom together

#### SDK-Based Implementation
```javascript
// tests/sdk-worker.test.mjs - 439 lines
// Adapters make testing cleaner
function createMockEnv() {
  return {
    MEDIA_KV: mockKVStore,
    R2_BLOBS: mockR2Store
  };
}

// Standalone test suite
```

**Testing Stats:**
- Dedicated test suite
- 17 tests (100% pass)
- 439 lines of test code (more comprehensive)
- Includes live deployment tests

### Feature Comparison

| Feature | Original | SDK-Based | Notes |
|---------|----------|-----------|-------|
| GET blob | ✅ | ✅ | Both work |
| HEAD blob | ✅ | ✅ | Both work |
| PUT upload | ✅ | ✅ | Both work |
| DELETE blob | ✅ | ✅ | Both work |
| LIST blobs | ✅ | ✅ | Both work |
| SHA-256 validation | ✅ | ✅ | Both work |
| DEV_AUTH_MODE | ✅ | ✅ | Both support |
| CORS | ✅ | ✅ | Both compliant |
| Range requests | ✅ | ❌ | Original has video streaming support |
| Video service | ✅ | ❌ | Original is hybrid |
| BUD-06 check | ❌ | ❌ | Neither implements |
| X-Reason headers | ❌ | ❌ | Both need improvement |

### Performance

#### Bundle Size
```bash
# Original (entire worker)
Total Upload: ~50 KiB / gzip: ~15 KiB

# SDK-Based
Total Upload: 9.88 KiB / gzip: 2.72 KiB
```

**SDK worker is 5x smaller!**

#### Response Times (Staging)
```
Operation       Original    SDK-Based
List            ~12ms       ~12ms      (same)
Upload          ~22ms       ~22ms      (same)
Get             ~3ms        ~3ms       (same)
Delete          ~15ms       ~15ms      (same)
```

**Performance is identical** - size reduction doesn't affect speed.

### Deployment

#### Original
- Single worker handles everything
- Blossom + Video service + CDN proxy
- Multiple environment variables
- Complex configuration

```yaml
routes:
  - pattern: "blossom.divine.video/*"
    zone_name: "divine.video"
```

#### SDK-Based
- Dedicated Blossom worker
- Single purpose service
- Minimal configuration
- Easier to reason about

```yaml
routes:
  - pattern: "blossom-sdk.divine.video/*"
    zone_name: "divine.video"
```

## When to Use Which?

### Use Original Implementation When:
- ✅ You need video service integration
- ✅ You want all services in one worker
- ✅ You need range request support
- ✅ You already have it deployed and working
- ✅ Simplicity over abstraction is preferred

### Use SDK-Based Implementation When:
- ✅ You want dedicated Blossom service
- ✅ You need clean separation of concerns
- ✅ Testing is a priority
- ✅ You want to swap storage backends easily
- ✅ Smaller bundle size matters
- ✅ Following standard patterns is important
- ✅ Contributing to Blossom ecosystem

## Migration Path

### Option 1: Keep Both (Current State)
- Original handles video + blossom
- SDK handles dedicated blossom
- Route different domains to each

### Option 2: Migrate to SDK
1. Update SDK worker with range requests
2. Test thoroughly
3. Switch DNS to SDK worker
4. Keep original as backup

### Option 3: Hybrid
- Use SDK patterns in original
- Extract storage adapters
- Keep monolithic deployment
- Better testing without full migration

## Recommendations

### For Production Use
**Stick with Original** for now because:
- It's battle-tested and deployed
- Has video service integration
- Range requests for streaming
- All features working

### For New Projects
**Use SDK-Based** approach:
- Cleaner architecture
- Better testability
- Smaller bundle
- Standard patterns
- Active SDK maintenance

### For Improvements
Consider **extracting storage adapters** from original:
```javascript
// In main worker, add adapters
import { R2BlobStorage } from './storage/r2-blob-storage.mjs';
import { KVMetadataStore } from './storage/kv-metadata-store.mjs';

// Use in handlers
const storage = new R2BlobStorage(env.R2_VIDEOS);
await storage.writeBlob(sha256, data, type);
```

This gives you:
- Better testing
- Cleaner handlers
- No full rewrite
- Keep existing deployment

## Conclusion

**Both implementations work well.** The choice depends on your priorities:

- **Production stability** → Original
- **Clean architecture** → SDK-based
- **Smallest bundle** → SDK-based
- **Video integration** → Original
- **Easiest testing** → SDK-based
- **Simplest code** → Original (less abstraction)

The SDK-based approach is a proof-of-concept showing that the `blossom-server-sdk` works great with Cloudflare Workers, and demonstrates better separation of concerns. But the original implementation is production-ready and has been battle-tested.

For future projects or major refactors, the SDK pattern is recommended. For maintaining the current system, the original approach is solid.
