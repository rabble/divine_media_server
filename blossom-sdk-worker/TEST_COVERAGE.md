# Test Coverage for blossom-sdk-worker

## Test Suite Summary

**Total Tests: 17**
**Passing: 17 (100%)**
**Failing: 0**

## Coverage by Feature

### CORS Support (1 test)
- ✅ OPTIONS preflight requests return proper CORS headers

### GET /<sha256> Endpoint (3 tests)
- ✅ Returns 404 for non-existent blobs
- ✅ Retrieves blob content with proper headers
- ✅ Sets Cache-Control to immutable

### HEAD /<sha256> Endpoint (2 tests)
- ✅ Returns 404 for non-existent blobs
- ✅ Returns headers without body for existing blobs

### PUT /upload Endpoint (4 tests)
- ✅ Returns 401 without authentication
- ✅ Successfully uploads blob with valid auth
- ✅ Returns existing blob if already uploaded (deduplication)
- ✅ Validates SHA-256 hash in auth event 'x' tag (BUD-02 compliance)

### GET /list/<pubkey> Endpoint (2 tests)
- ✅ Returns empty array for unknown users
- ✅ Returns list of user's blobs

### DELETE /<sha256> Endpoint (4 tests)
- ✅ Returns 401 without authentication
- ✅ Returns 404 for non-existent blobs
- ✅ Returns 403 when deleting non-owned blobs
- ✅ Successfully deletes owned blobs

### Error Handling (1 test)
- ✅ Returns 500 for internal server errors (R2 failures)

### Routing (1 test)
- ✅ Invalid routes return 404

## BUD Compliance Tested

### BUD-01: Server Endpoints
- ✅ GET /<sha256> - Blob retrieval
- ✅ HEAD /<sha256> - Blob existence check
- ✅ GET /list/<pubkey> - List user blobs
- ✅ CORS support for all endpoints

### BUD-02: Upload Endpoint
- ✅ PUT /upload requires authentication
- ✅ Validates SHA-256 hash in 'x' tag
- ✅ Returns blob descriptor on success
- ✅ Handles duplicate uploads correctly

### BUD-04: Deletion
- ✅ DELETE /<sha256> requires authentication
- ✅ Verifies blob ownership before deletion
- ✅ Returns 204 on successful deletion

## Authentication Testing
- ✅ DEV_AUTH_MODE simple pubkey format: `Nostr pubkey=<hex>`
- ✅ Kind 24242 event validation
- ✅ SHA-256 hash validation in upload auth events
- ✅ Ownership verification for delete operations

## Storage Adapter Testing

### R2BlobStorage
- ✅ Stores blobs to R2
- ✅ Retrieves blobs from R2
- ✅ Deletes blobs from R2
- ✅ Error handling for R2 failures

### KVMetadataStore
- ✅ Stores blob metadata
- ✅ Retrieves blob metadata
- ✅ Tracks blob ownership
- ✅ Lists blobs by pubkey
- ✅ Cleans up metadata on deletion

## Not Yet Tested

### Advanced Features
- ⏸️ Range requests for video streaming
- ⏸️ Full Nostr event signature verification (skipped in DEV_AUTH_MODE)
- ⏸️ Expiration tag validation
- ⏸️ BUD-05: Optimization endpoints
- ⏸️ BUD-06: Extended HEAD endpoint features
- ⏸️ BUD-08: Mirror support
- ⏸️ BUD-09: Blob reporting

### Performance
- ⏸️ Load testing
- ⏸️ Concurrent upload handling
- ⏸️ Large file handling

## Testing Methodology

Tests use Node.js built-in test runner with:
- Mock KV and R2 storage implementations
- Request/Response Web API
- SHA-256 hashing for blob verification
- Async/await patterns

Run tests with:
```bash
npm test
```

## External Validation

For comprehensive BUD compliance testing, use `blossom-audit`:
```bash
npx blossom-audit audit http://localhost:8787 bitcoin
```

## Test Maintenance

When adding new features:
1. Write failing tests first (TDD)
2. Implement minimal code to pass
3. Update this coverage document
4. Ensure all tests pass before committing
