# Content Blocking API Documentation

## Overview

The Content Blocking API provides administrative endpoints for managing video content moderation. This system allows administrators to block, unblock, and manage video content without deleting the underlying files.

## Authentication

All admin endpoints require authentication via the `X-Admin-Token` header.

```
X-Admin-Token: <your-admin-token>
```

The admin token is configured via the `MODERATION_ADMIN_TOKEN` environment secret.

## Base URL

Production: `https://cf-stream-service-prod.protestnet.workers.dev`

## HTTP Status Codes

When content is blocked, the CDN will return:
- **HTTP 451** - Unavailable for Legal Reasons (for blocked content)
- **HTTP 200** - OK (for accessible content)
- **HTTP 404** - Not Found (for non-existent content)

## Endpoints

### 1. Block Video

Block a video from being served.

**Endpoint:** `POST /admin/block/{sha256}`

**Headers:**
```
Content-Type: application/json
X-Admin-Token: <admin-token>
```

**Request Body:**
```json
{
  "reason": "Copyright violation",
  "category": "copyright",
  "severity": "high",
  "notes": "DMCA takedown request #12345",
  "appealable": true,
  "expires_in": 86400000  // Optional: auto-expire in milliseconds
}
```

**Parameters:**
- `reason` (string, optional): Reason for blocking - defaults to "Admin decision"
- `category` (string, optional): Block category - Options: `manual`, `nsfw`, `violence`, `csam`, `copyright`, `test`, `other` - defaults to "manual"
- `severity` (string, optional): Severity level - Options: `low`, `medium`, `high`, `critical` - defaults to "high"
- `notes` (string, optional): Additional notes about the block
- `appealable` (boolean, optional): Whether the block can be appealed - defaults to true
- `expires_in` (number, optional): Auto-expiration time in milliseconds

**Response:**
```json
{
  "success": true,
  "message": "Content {sha256} has been blocked",
  "data": {
    "sha256": "abc123...",
    "status": "blocked",
    "reason": "Copyright violation",
    "blockedBy": "admin",
    "blockedAt": 1704123456789,
    "category": "copyright",
    "severity": "high",
    "appealable": true
  }
}
```

### 2. Unblock Video

Remove a block from a video.

**Endpoint:** `POST /admin/unblock/{sha256}`

**Headers:**
```
Content-Type: application/json
X-Admin-Token: <admin-token>
```

**Request Body:**
```json
{
  "reason": "Appeal approved",
  "admin_id": "admin_john"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Content {sha256} has been unblocked",
  "wasBlocked": true
}
```

### 3. Check Block Status

Check if a video is currently blocked.

**Endpoint:** `GET /admin/check/{sha256}`

**Headers:**
```
X-Admin-Token: <admin-token>
```

**Response (Blocked):**
```json
{
  "blocked": true,
  "reason": "Copyright violation",
  "category": "copyright",
  "severity": "high",
  "appealable": true,
  "details": {
    "sha256": "abc123...",
    "blockedAt": 1704123456789,
    "blockedBy": "admin"
  }
}
```

**Response (Not Blocked):**
```json
{
  "blocked": false
}
```

### 4. List Blocked Videos

Get a list of all blocked videos.

**Endpoint:** `GET /admin/blocked`

**Headers:**
```
X-Admin-Token: <admin-token>
```

**Query Parameters:**
- `limit` (number, optional): Maximum number of results - defaults to 100

**Response:**
```json
{
  "count": 42,
  "blocked": [
    {
      "sha256": "abc123...",
      "status": "blocked",
      "reason": "Copyright violation",
      "blockedBy": "admin",
      "blockedAt": 1704123456789,
      "category": "copyright",
      "severity": "high",
      "appealable": true
    },
    // ... more blocked videos
  ]
}
```

### 5. Bulk Block Videos

Block multiple videos in a single request.

**Endpoint:** `POST /admin/block-bulk`

**Headers:**
```
Content-Type: application/json
X-Admin-Token: <admin-token>
```

**Request Body:**
```json
{
  "hashes": [
    "sha256_hash_1",
    "sha256_hash_2",
    "sha256_hash_3"
  ],
  "reason": "Batch copyright violation",
  "category": "copyright",
  "severity": "high",
  "admin_id": "admin_john"
}
```

**Response:**
```json
{
  "successful": ["hash1", "hash2"],
  "failed": [
    {
      "sha256": "hash3",
      "error": "Already blocked"
    }
  ],
  "total": 3
}
```

### 6. Temporary Block

Block a video for a specific duration.

**Endpoint:** `POST /admin/temp-block/{sha256}`

**Headers:**
```
Content-Type: application/json
X-Admin-Token: <admin-token>
```

**Request Body:**
```json
{
  "duration": 3600,  // Duration in seconds
  "reason": "Under review for 1 hour",
  "admin_id": "admin_john"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Content {sha256} has been blocked",
  "data": {
    "sha256": "abc123...",
    "expiresAt": 1704127056789,
    "duration": 3600,
    "reason": "Under review for 1 hour"
  }
}
```

## CLI Tool Usage

A command-line tool is provided for easy management:

```bash
# Block a video
node admin_block_video.mjs block <sha256> --reason "Copyright" --category copyright

# Unblock a video
node admin_block_video.mjs unblock <sha256> --reason "Appeal approved"

# Check status
node admin_block_video.mjs check <sha256>

# Temporary block (1 hour)
node admin_block_video.mjs temp <sha256> 3600 --reason "Under review"

# List all blocked
node admin_block_video.mjs list

# Test full workflow
node admin_block_video.mjs test <sha256>
```

## Environment Configuration

### Required Secrets

Set these using `wrangler secret put`:

```bash
# Admin authentication token
wrangler secret put MODERATION_ADMIN_TOKEN --env production
```

### KV Namespaces

The system uses the `MODERATION_KV` namespace for storing block data:
- `quarantine:{sha256}` - Active blocks
- `blocked:{sha256}` - Block tracking
- `log:block:{timestamp}_{sha256}` - Block audit logs
- `log:unblock:{timestamp}_{sha256}` - Unblock audit logs

## Integration with CDN

When a video is blocked:

1. Admin endpoint adds entry to `MODERATION_KV`
2. CDN worker checks `MODERATION_KV` on each request
3. If blocked, CDN returns HTTP 451 with message
4. Blocks are checked in real-time (no caching of block status)

## Block Categories

- `manual` - Manual admin action
- `nsfw` - Adult/NSFW content
- `violence` - Violent content
- `csam` - CSAM detection
- `copyright` - Copyright violation
- `test` - Testing purposes
- `temporary` - Temporary blocks
- `other` - Other reasons

## Severity Levels

- `low` - Minor violation, may auto-expire
- `medium` - Moderate violation
- `high` - Serious violation (default)
- `critical` - Critical violation, non-appealable

## Testing

Run the comprehensive test suite:

```bash
# Run all tests
node test_blocking_system.mjs

# With custom API URL
API_URL=http://localhost:8787 node test_blocking_system.mjs

# With production token
MODERATION_ADMIN_TOKEN=your-token node test_blocking_system.mjs
```

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

### 400 Bad Request
```json
{
  "error": "Invalid SHA-256 hash"
}
```

### 500 Internal Server Error
```json
{
  "error": "Error message details"
}
```

## Best Practices

1. **Always provide a reason** when blocking/unblocking content
2. **Use appropriate categories** to help with reporting and appeals
3. **Set appealable=false** only for critical violations
4. **Use temporary blocks** for content under review
5. **Document blocks** with notes field for complex cases
6. **Monitor the blocked list** regularly for expired blocks
7. **Test blocks** on CDN after applying them

## Monitoring

Check block effectiveness:

```bash
# Check if video is blocked in system
curl -H "X-Admin-Token: $TOKEN" \
  https://cf-stream-service-prod.protestnet.workers.dev/admin/check/{sha256}

# Test CDN response
curl -I https://cdn.divine.video/{sha256}.mp4
# Should return HTTP 451 if blocked
```

## Appeal Process

For appealable blocks:

1. User contacts support with SHA-256 hash
2. Admin reviews block details via `/admin/check/{sha256}`
3. If appeal approved, admin unblocks via `/admin/unblock/{sha256}`
4. System logs unblock action with reason

## Audit Trail

All blocking actions are logged:
- Block logs: `log:block:{timestamp}_{sha256}`
- Unblock logs: `log:unblock:{timestamp}_{sha256}`

Retrieve logs via KV namespace for compliance and auditing.