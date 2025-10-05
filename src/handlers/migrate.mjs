// ABOUTME: Migration endpoint for importing videos from R2 to Cloudflare Stream
// ABOUTME: Handles URL-based imports and preserves metadata

import { json } from "../router.mjs";
import { getStreamUrls } from "../utils/stream_urls.mjs";
import { enableDownloadsAsync } from "../utils/auto_enable_downloads.mjs";
import { fetchAndHash, dualStoreVideo } from "../utils/dual_storage.mjs";

export async function migrateVideo(req, env, deps) {
  // No auth required for migration - this is data recovery
  const verified = { pubkey: "migration_recovery" };

  // Parse request body
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request", reason: "invalid_json" });
  }

  const sourceUrl = body.sourceUrl || body.r2Url || body.url;
  if (!sourceUrl) {
    return json(400, { error: "bad_request", reason: "missing_source_url" });
  }

  // Extract metadata
  const metadata = {
    sha256: body.sha256,
    vineId: body.vineId,
    originalUrl: body.originalUrl || sourceUrl,
    originalR2Path: body.r2Path,
    migrationBatch: body.batch,
    migrationTimestamp: deps.now(),
    originalOwner: body.originalOwner || verified.pubkey,
  };

  // Check for existing video by sha256 or vineId to avoid duplicates
  if (metadata.sha256) {
    const existing = await env.MEDIA_KV.get(`idx:sha256:${metadata.sha256}`);
    if (existing) {
      const data = JSON.parse(existing);
      const urls = getStreamUrls(data.uid, env);
      return json(200, {
        uid: data.uid,
        status: "already_migrated",
        message: "Video already exists in hybrid storage",
        ...urls
      });
    }
  }

  if (metadata.vineId) {
    const existing = await env.MEDIA_KV.get(`idx:vine:${metadata.vineId}`);
    if (existing) {
      const data = JSON.parse(existing);
      const urls = getStreamUrls(data.uid, env);
      return json(200, {
        uid: data.uid,
        status: "already_migrated",
        message: "Video already exists in hybrid storage",
        ...urls
      });
    }
  }

  console.log(`🔄 MIGRATE: Starting hybrid migration from: ${sourceUrl}`);

  try {
    // Step 1: Fetch video and calculate SHA-256 if not provided
    let videoData;
    if (metadata.sha256) {
      // If we have SHA-256, just fetch the video
      console.log(`🔄 MIGRATE: Fetching video (SHA-256 provided: ${metadata.sha256})`);
      const response = await deps.fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
      }
      videoData = {
        blob: await response.arrayBuffer(),
        sha256: metadata.sha256,
        size: parseInt(response.headers.get('content-length') || '0')
      };
    } else {
      // Fetch and hash
      videoData = await fetchAndHash(sourceUrl, deps);
      metadata.sha256 = videoData.sha256;
    }

    // Step 2: Check again for duplicates with calculated SHA-256
    if (!body.forceUpload) {
      const existing = await env.MEDIA_KV.get(`idx:sha256:${videoData.sha256}`);
      if (existing) {
        const data = JSON.parse(existing);
        const urls = getStreamUrls(data.uid, env);
        return json(200, {
          uid: data.uid,
          status: "already_migrated",
          message: "Video already exists (detected via SHA-256)",
          sha256: videoData.sha256,
          ...urls
        });
      }
    }

    // Step 3: Dual store in Stream + R2
    const dualStoreMetadata = {
      name: metadata.vineId || metadata.sha256 || 'migration_video',
      owner: verified.pubkey,
      vineId: metadata.vineId,
      originalUrl: metadata.originalUrl,
      originalR2Path: metadata.originalR2Path,
      migrationBatch: metadata.migrationBatch,
      migrationTimestamp: deps.now(),
      migratedFrom: sourceUrl,
      size: videoData.size
    };

    const storeResult = await dualStoreVideo(
      videoData.blob,
      videoData.sha256,
      env,
      dualStoreMetadata,
      deps
    );

    if (!storeResult.uid) {
      return json(502, {
        error: "migration_failed",
        message: "Failed to store video in hybrid storage",
        errors: storeResult.errors
      });
    }

    // Step 4: Create additional migration indexes
    if (metadata.vineId) {
      await env.MEDIA_KV.put(`idx:vine:${metadata.vineId}`, JSON.stringify({ uid: storeResult.uid }));
    }
    if (metadata.originalUrl) {
      const urlDigest = await digestUrl(metadata.originalUrl);
      await env.MEDIA_KV.put(`idx:url:${urlDigest}`, JSON.stringify({
        uid: storeResult.uid,
        url: metadata.originalUrl
      }));
    }

    // Track migration
    await env.MEDIA_KV.put(`migration:${storeResult.uid}`, JSON.stringify({
      sourceUrl,
      timestamp: deps.now(),
      batch: body.batch,
      hybridStorage: true
    }));

    // Step 5: Auto-enable Stream MP4 downloads (backup for R2)
    if (storeResult.streamSuccess) {
      enableDownloadsAsync(storeResult.uid, env, deps, {
        logPrefix: "🔔 MIGRATE",
        initialDelay: 10000, // Give Stream time to process
        maxRetries: 3
      });
    }

    console.log(`✅ MIGRATE: Hybrid migration completed for ${videoData.sha256} -> UID: ${storeResult.uid}`);
    console.log(`📊 MIGRATE: Storage results - Stream: ${storeResult.streamSuccess}, R2: ${storeResult.r2Success}`);

    return json(200, {
      uid: storeResult.uid,
      sha256: videoData.sha256,
      status: "hybrid_migration_completed",
      sourceUrl,
      storageResults: {
        stream: storeResult.streamSuccess,
        r2: storeResult.r2Success
      },
      ...storeResult.urls,
      metadata: {
        sha256: videoData.sha256,
        vineId: metadata.vineId,
        size: videoData.size
      }
    });

  } catch (error) {
    console.error(`❌ MIGRATE: Hybrid migration failed for ${sourceUrl}:`, error);
    return json(500, {
      error: "migration_failed",
      message: error.message,
      sourceUrl
    });
  }
}

async function digestUrl(url) {
  const canonical = new URL(url).toString();
  const bytes = new TextEncoder().encode(canonical);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function encodeMetadata(metadata) {
  const encoded = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null) {
      const encodedValue = btoa(String(value));
      encoded.push(`${key} ${encodedValue}`);
    }
  }
  return encoded.join(',');
}

function extractUidFromUrl(url) {
  const match = url.match(/([a-f0-9]{32})/);
  return match ? match[1] : null;
}