# Blossom SDK Worker

Experimental Cloudflare Worker implementation using `blossom-server-sdk`.

## Overview

This worker implements the Blossom protocol for blob storage using:
- **blossom-server-sdk** - Core Blossom protocol abstractions
- **Cloudflare R2** - Blob storage backend
- **Cloudflare KV** - Metadata storage backend

## Directory Structure

```
blossom-sdk-worker/
├── src/
│   ├── index.mjs              # Main worker entry point
│   └── storage/
│       ├── r2-blob-storage.mjs    # R2 storage adapter
│       └── kv-metadata-store.mjs  # KV metadata adapter
├── package.json
├── wrangler.toml
└── README.md
```

## Key Differences from Main Worker

1. **Uses SDK abstractions** - Implements `IBlobStorage` and `IBlobMetadataStore` interfaces
2. **Cleaner separation** - Storage logic is separated from request handling
3. **Experimental** - Testing how well the SDK works with Cloudflare Workers

## Setup

```bash
cd blossom-sdk-worker
npm install
```

## Development

```bash
npm run dev
```

## Deployment

```bash
# Staging
npm run deploy:staging

# Production
npm run deploy:prod
```

### Live Deployments

**Staging:** https://blossom-sdk-worker-staging.protestnet.workers.dev

Test it:
```bash
# List blobs
curl https://blossom-sdk-worker-staging.protestnet.workers.dev/list/0000000000000000000000000000000000000000000000000000000000000000

# Upload (requires auth)
echo "test" | curl -X PUT https://blossom-sdk-worker-staging.protestnet.workers.dev/upload \
  -H "Authorization: Nostr pubkey=YOUR_PUBKEY_HEX" \
  -H "Content-Type: text/plain" \
  --data-binary @-

# Run audit
npx blossom-audit audit https://blossom-sdk-worker-staging.protestnet.workers.dev bitcoin
```

## Endpoints

Same as main worker:
- `GET /<sha256>` - Retrieve blob
- `HEAD /<sha256>` - Check blob existence
- `PUT /upload` - Upload blob
- `GET /list/<pubkey>` - List user's blobs
- `DELETE /<sha256>` - Delete blob

## Storage Adapters

### R2BlobStorage
Implements `IBlobStorage` interface for Cloudflare R2:
- `hasBlob(sha256)` - Check if blob exists
- `readBlob(sha256)` - Read blob data
- `writeBlob(sha256, stream, mimeType)` - Write blob
- `removeBlob(sha256)` - Delete blob

### KVMetadataStore
Implements `IBlobMetadataStore` interface for Cloudflare KV:
- `hasBlob(sha256)` - Check if metadata exists
- `getBlob(sha256)` - Get blob metadata
- `addBlob(blob)` - Add blob metadata
- `removeBlob(sha256)` - Delete blob metadata
- `addBlobOwner(sha256, pubkey)` - Associate owner
- `getBlobsForPubkey(pubkey)` - List user's blobs

## TODO

- [ ] Add full signature verification
- [ ] Add tests
- [ ] Performance comparison vs main worker
- [ ] Evaluate SDK benefits vs custom implementation
