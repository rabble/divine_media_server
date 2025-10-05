# Vine Avatar Import Guide

## Overview
This guide explains how to import user avatars/profile pictures from Vine archives and store them in the R2-based system.

## Current System Architecture

### Storage Structure
- **Primary Storage**: R2 bucket (`nostrvine-media`)
- **Image Storage**: Same R2 bucket, stored as `{sha256}.{ext}` (jpg, png, webp, etc.)
- **CDN Domain**: `cdn.divine.video` (for serving)
- **Direct R2**: `r2.divine.video` (fallback access)

## Vine Archive Structure

Vine user data typically includes:
- Profile pictures/avatars
- User metadata (username, bio, etc.)
- Video references

### Common Vine Avatar URLs
```
https://v.cdn.vine.co/r/avatars/{user_id}_{timestamp}.jpg
https://v.cdn.vine.co/r/avatars/{hash}.jpg
https://api.vineapp.com/users/avatars/{id}
```

## Import Script Template

### 1. Basic Avatar Import Script

```javascript
#!/usr/bin/env node
// ABOUTME: Script to import Vine user avatars to R2 storage
// ABOUTME: Processes Vine archive data and stores avatars with SHA-256 addressing

import { createHash } from 'crypto';
import fetch from 'node-fetch';

const WORKER_URL = 'https://cf-stream-service-prod.protestnet.workers.dev';
const R2_DOMAIN = 'https://r2.divine.video';

/**
 * Calculate SHA-256 hash of image data
 */
async function calculateSHA256(buffer) {
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * Import a single avatar
 */
async function importAvatar(avatarUrl, userId, metadata = {}) {
  console.log(`📸 Importing avatar for user ${userId} from ${avatarUrl}`);

  try {
    // 1. Fetch the avatar from Vine CDN
    const response = await fetch(avatarUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch avatar: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(buffer);

    // 2. Calculate SHA-256
    const sha256 = await calculateSHA256(imageBuffer);
    console.log(`   SHA-256: ${sha256}`);

    // 3. Determine file extension
    const contentType = response.headers.get('content-type');
    let extension = 'jpg'; // default
    if (contentType) {
      if (contentType.includes('png')) extension = 'png';
      else if (contentType.includes('webp')) extension = 'webp';
      else if (contentType.includes('gif')) extension = 'gif';
    }

    // 4. Upload via Blossom endpoint
    const uploadResponse = await fetch(`${WORKER_URL}/upload`, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType || 'image/jpeg',
        'Authorization': 'Nostr pubkey=test_importer' // For dev mode
      },
      body: imageBuffer
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      throw new Error(`Upload failed: ${error}`);
    }

    const result = await uploadResponse.json();

    // 5. Store metadata in your database
    const imageMetadata = {
      sha256,
      userId,
      originalUrl: avatarUrl,
      contentType,
      size: imageBuffer.length,
      extension,
      cdnUrl: `https://cdn.divine.video/${sha256}.${extension}`,
      r2Url: `https://r2.divine.video/${sha256}.${extension}`,
      uploadedAt: Date.now(),
      ...metadata
    };

    console.log(`   ✅ Avatar imported successfully`);
    console.log(`   CDN URL: ${imageMetadata.cdnUrl}`);
    console.log(`   R2 URL: ${imageMetadata.r2Url}`);

    return imageMetadata;

  } catch (error) {
    console.error(`   ❌ Failed to import avatar:`, error.message);
    return null;
  }
}

/**
 * Batch import avatars from Vine archive
 */
async function importVineAvatars(vineUsers) {
  console.log(`🚀 Starting Vine avatar import for ${vineUsers.length} users`);

  const results = {
    successful: [],
    failed: [],
    skipped: []
  };

  for (const user of vineUsers) {
    // Skip if no avatar URL
    if (!user.avatarUrl) {
      results.skipped.push(user.userId);
      continue;
    }

    const metadata = await importAvatar(
      user.avatarUrl,
      user.userId,
      {
        username: user.username,
        vanity: user.vanityUrls?.[0],
        verified: user.verified || false
      }
    );

    if (metadata) {
      results.successful.push(metadata);
    } else {
      results.failed.push(user.userId);
    }

    // Rate limiting - don't overwhelm the service
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n📊 Import Summary:`);
  console.log(`   ✅ Successful: ${results.successful.length}`);
  console.log(`   ❌ Failed: ${results.failed.length}`);
  console.log(`   ⏭️ Skipped: ${results.skipped.length}`);

  return results;
}

// Example usage
async function main() {
  // Example Vine user data - replace with your actual data source
  const vineUsers = [
    {
      userId: '912345678901234567',
      username: 'exampleuser',
      avatarUrl: 'https://v.cdn.vine.co/r/avatars/1234_5678.jpg',
      vanityUrls: ['exampleuser']
    },
    // ... more users
  ];

  const results = await importVineAvatars(vineUsers);

  // Save results to file for tracking
  await fs.writeFile(
    'avatar_import_results.json',
    JSON.stringify(results, null, 2)
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
```

### 2. Direct R2 Upload (Faster Method)

```javascript
#!/usr/bin/env node
// ABOUTME: Direct R2 upload for Vine avatars using Wrangler
// ABOUTME: Bypasses the API for faster bulk imports

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import fetch from 'node-fetch';

// R2 configuration - get these from Wrangler
const R2_CONFIG = {
  accountId: 'c84e7a9bf7ed99cb41b8e73566568c75',
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: 'nostrvine-media'
};

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_CONFIG.accessKeyId,
    secretAccessKey: R2_CONFIG.secretAccessKey
  }
});

async function uploadAvatarToR2(imageBuffer, sha256, contentType) {
  const extension = contentType.split('/')[1] || 'jpg';
  const key = `${sha256}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: R2_CONFIG.bucket,
    Key: key,
    Body: imageBuffer,
    ContentType: contentType,
    Metadata: {
      'source': 'vine-import',
      'type': 'avatar'
    }
  });

  await s3Client.send(command);

  return {
    key,
    url: `https://r2.divine.video/${key}`
  };
}
```

## Handling Different Avatar Formats

### Standard Vine Avatars
- Usually JPEG format
- Typical sizes: 73x73, 200x200, 480x480
- Stored at various CDN locations

### Processing Steps
1. Download original avatar
2. Calculate SHA-256 hash
3. Check if already exists (avoid duplicates)
4. Upload to R2 with proper content type
5. Store metadata for user association

## Database Schema for Avatar Tracking

```sql
-- Track imported avatars
CREATE TABLE vine_avatars (
  id SERIAL PRIMARY KEY,
  vine_user_id VARCHAR(32) NOT NULL,
  username VARCHAR(255),
  sha256 VARCHAR(64) NOT NULL,
  original_url TEXT,
  cdn_url TEXT,
  r2_key VARCHAR(255),
  content_type VARCHAR(50),
  file_size INTEGER,
  imported_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB,
  UNIQUE(vine_user_id),
  INDEX(sha256)
);
```

## Bulk Import from Archive

```javascript
#!/usr/bin/env node
// ABOUTME: Process Vine archive JSON and import all avatars
// ABOUTME: Handles rate limiting and resume capability

import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { parse } from 'JSONStream';

async function processVineArchive(archivePath) {
  const progressFile = 'avatar_import_progress.json';

  // Load progress if resuming
  let progress = { processed: [], failed: [] };
  try {
    const data = await fs.readFile(progressFile, 'utf-8');
    progress = JSON.parse(data);
  } catch {}

  const stream = createReadStream(archivePath)
    .pipe(parse('users.*')); // Adjust based on your JSON structure

  for await (const user of stream) {
    // Skip if already processed
    if (progress.processed.includes(user.userId)) {
      console.log(`⏭️ Skipping ${user.userId} (already processed)`);
      continue;
    }

    if (user.avatarUrl) {
      try {
        await importAvatar(user.avatarUrl, user.userId, {
          username: user.username,
          vanity: user.vanityUrls?.[0]
        });

        progress.processed.push(user.userId);
      } catch (error) {
        console.error(`Failed to import ${user.userId}:`, error);
        progress.failed.push(user.userId);
      }

      // Save progress periodically
      if (progress.processed.length % 100 === 0) {
        await fs.writeFile(progressFile, JSON.stringify(progress));
        console.log(`💾 Progress saved: ${progress.processed.length} processed`);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  // Final save
  await fs.writeFile(progressFile, JSON.stringify(progress));
  console.log(`✅ Import complete: ${progress.processed.length} avatars`);
}
```

## URL Patterns for Access

Once imported, avatars are accessible at:

### Via CDN (might have issues currently):
```
https://cdn.divine.video/{sha256}.jpg
https://cdn.divine.video/{sha256}.png
```

### Via Direct R2 (recommended):
```
https://r2.divine.video/{sha256}.jpg
https://r2.divine.video/{sha256}.png
```

## Deduplication

Since multiple users might have the same avatar:
1. Always calculate SHA-256 before uploading
2. Check if that hash already exists in R2
3. If exists, just link the user to existing image
4. This saves storage and bandwidth

## Error Handling

Common issues and solutions:

| Issue | Solution |
|-------|----------|
| 404 from Vine CDN | Avatar might be deleted, skip user |
| Rate limiting | Add delays between requests |
| Duplicate uploads | Check SHA-256 before uploading |
| Wrong content type | Detect from response headers |
| Network timeout | Implement retry logic |

## Integration with Nostr

To publish avatars for Nostr profiles:

```javascript
// Create Nostr metadata event (kind 0)
const profileMetadata = {
  name: vineUser.username,
  about: vineUser.description,
  picture: `https://r2.divine.video/${sha256}.jpg`,
  // Legacy Vine info
  vine: {
    userId: vineUser.userId,
    vanity: vineUser.vanityUrls?.[0],
    verified: vineUser.verified
  }
};

const event = {
  kind: 0,
  content: JSON.stringify(profileMetadata),
  tags: [],
  created_at: Math.floor(Date.now() / 1000)
};
```

## Testing Avatar Import

```bash
# Test single avatar import
node import_avatar.mjs --url "https://v.cdn.vine.co/r/avatars/test.jpg" --user "123456"

# Test bulk import
node import_avatars_bulk.mjs --archive vine_archive.json --limit 10

# Check if avatar exists in R2
curl -I https://r2.divine.video/{sha256}.jpg
```

## Performance Tips

1. **Parallel Processing**: Process multiple avatars simultaneously
```javascript
const chunks = chunk(users, 10); // Process 10 at a time
for (const chunk of chunks) {
  await Promise.all(chunk.map(user => importAvatar(user)));
}
```

2. **Skip Existing**: Check if SHA-256 exists before downloading
3. **Use Direct R2**: Bypass API for bulk imports
4. **Cache Results**: Keep track of processed users

## Summary

1. Avatars are stored in R2 as `{sha256}.{ext}`
2. Use direct R2 uploads for bulk imports
3. Calculate SHA-256 for deduplication
4. Store metadata linking users to avatars
5. Access via `r2.divine.video` (more reliable than CDN currently)
6. Handle rate limiting and errors gracefully