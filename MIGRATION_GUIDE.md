# R2 to Cloudflare Stream Migration Guide

## Overview
This service now supports migrating videos from R2 (or any URL) to Cloudflare Stream. The migration preserves metadata (sha256, vineId, etc.) and creates proper indexes for lookups.

## Migration Endpoints

### 1. Single Video Migration
**POST** `/v1/migrate`

Migrates a single video from R2/URL to Stream.

```bash
curl -X POST https://cf-stream-service-prod.protestnet.workers.dev/v1/migrate \
  -H "Authorization: Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUrl": "https://r2.example.com/videos/video1.mp4",
    "sha256": "abc123def456",
    "vineId": "vine_original_id",
    "originalOwner": "original_user_pubkey"
  }'
```

**Response:**
```json
{
  "uid": "03c0ddc7d34f4a9ab8c3ba19b60fe263",
  "status": "migration_started",
  "sourceUrl": "https://r2.example.com/videos/video1.mp4",
  "streamUrl": "https://customer-xxx.cloudflarestream.com/03c0ddc7d34f4a9ab8c3ba19b60fe263/manifest/video.m3u8",
  "thumbnailUrl": "https://customer-xxx.cloudflarestream.com/03c0ddc7d34f4a9ab8c3ba19b60fe263/thumbnails/thumbnail.jpg",
  "metadata": {
    "sha256": "abc123def456",
    "vineId": "vine_original_id"
  }
}
```

### 2. Batch Migration
**POST** `/v1/migrate/batch`

Migrates up to 100 videos in a single request.

```bash
curl -X POST https://cf-stream-service-prod.protestnet.workers.dev/v1/migrate/batch \
  -H "Authorization: Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c" \
  -H "Content-Type: application/json" \
  -d '{
    "batchId": "migration_batch_001",
    "videos": [
      {
        "sourceUrl": "https://r2.example.com/video1.mp4",
        "sha256": "hash1",
        "vineId": "vine1"
      },
      {
        "sourceUrl": "https://r2.example.com/video2.mp4",
        "sha256": "hash2",
        "vineId": "vine2"
      }
    ]
  }'
```

**Response:**
```json
{
  "batchId": "migration_batch_001",
  "processed": 2,
  "successful": 2,
  "failed": 0,
  "results": [
    {
      "sourceUrl": "https://r2.example.com/video1.mp4",
      "uid": "abc123",
      "status": "migrating"
    },
    {
      "sourceUrl": "https://r2.example.com/video2.mp4",
      "uid": "def456",
      "status": "migrating"
    }
  ]
}
```

## Migration Script

Use the provided migration script for bulk migrations:

### Setup
```bash
cd tools
chmod +x migrate_r2_videos.mjs
```

### Prepare Input File

**Option 1: CSV Format** (`videos.csv`):
```csv
sourceUrl,sha256,vineId,originalOwner
https://pub-xxx.r2.dev/video1.mp4,abc123,vine_1,user_pubkey_1
https://pub-xxx.r2.dev/video2.mp4,def456,vine_2,user_pubkey_2
```

**Option 2: JSON Format** (`videos.json`):
```json
[
  {
    "sourceUrl": "https://pub-xxx.r2.dev/video1.mp4",
    "sha256": "abc123",
    "vineId": "vine_1",
    "originalOwner": "user_pubkey_1"
  },
  {
    "sourceUrl": "https://pub-xxx.r2.dev/video2.mp4",
    "sha256": "def456",
    "vineId": "vine_2",
    "originalOwner": "user_pubkey_2"
  }
]
```

### Run Migration
```bash
# Using default production API
node migrate_r2_videos.mjs videos.csv

# Using custom API URL
API_URL=https://cf-stream-service-staging.protestnet.workers.dev node migrate_r2_videos.mjs videos.json

# With custom token
MIGRATION_TOKEN=your_token node migrate_r2_videos.mjs videos.csv
```

## Features

### Deduplication
- Videos are checked by sha256 and vineId before migration
- Already migrated videos are skipped (returns `already_migrated` status)
- Prevents duplicate imports

### Metadata Preservation
All metadata is preserved during migration:
- `sha256`: File hash for deduplication
- `vineId`: Original Vine ID
- `originalUrl`: Source URL
- `originalOwner`: Original owner pubkey
- `r2Path`: Original R2 path
- `migrationBatch`: Batch ID for tracking
- `migrationTimestamp`: When migrated

### Indexing
Automatic index creation for:
- SHA-256 lookups: `/v1/lookup?sha256=xxx`
- Vine ID lookups: `/v1/lookup?vineId=xxx`
- URL lookups: `/v1/lookup?url=xxx`
- User video lists: `/v1/users/{pubkey}/videos`

### Progress Tracking
- Batch processing with configurable size (default: 50)
- Progress saved after each batch
- Resume capability on failure
- Detailed logs in `migration_log_*.json`

## Migration Workflow

1. **Prepare video list** from R2 inventory
2. **Create CSV/JSON** with video metadata
3. **Run migration script** in batches
4. **Monitor progress** via logs
5. **Verify migration** using lookup endpoints
6. **Update applications** to use new Stream URLs

## Status Tracking

Check migration status:
```bash
# Check individual video
curl https://cf-stream-service-prod.protestnet.workers.dev/v1/videos/{uid}

# Lookup by original ID
curl https://cf-stream-service-prod.protestnet.workers.dev/v1/lookup?vineId=original_vine_id
```

## Rate Limits & Performance

- **Batch size**: Up to 100 videos per batch request
- **Recommended**: 50 videos per batch (script default)
- **Delay**: 5 seconds between batches (configurable)
- **Concurrent imports**: Stream handles multiple imports simultaneously
- **Processing time**: Varies by video size (typically 10-60 seconds)

## Authentication

### Admin Token (for migration)
```
Authorization: Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c
```

### Regular Users (NIP-98)
Regular users can also migrate their own videos using NIP-98 authentication on the `/v1/migrate` endpoint.

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| `already_migrated` | Video exists | Skip or verify |
| `stream_error` | Stream API issue | Retry later |
| `rate_limited` | Too many requests | Increase delay |
| `forbidden` | Invalid token | Check auth |
| `bad_request` | Invalid URL | Verify source |

## Example: Migrate 150k Videos

For large migrations:

1. **Split into chunks**:
```bash
split -l 10000 all_videos.csv chunk_
```

2. **Process each chunk**:
```bash
for file in chunk_*; do
  node migrate_r2_videos.mjs $file
  sleep 60  # Wait between chunks
done
```

3. **Monitor Stream Dashboard** for processing status

4. **Verify migration**:
```bash
# Check random samples
curl https://cf-stream-service-prod.protestnet.workers.dev/v1/lookup?vineId=sample_id
```

## Migration Token

Current migration token (production):
```
823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c
```

Keep this token secure! It has admin access to create migrations.

## Support

- Check logs in `migration_log_*.json`
- Monitor Cloudflare Stream Dashboard
- Use `/v1/videos/{uid}` to check status
- Webhook updates when videos are ready