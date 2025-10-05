// ABOUTME: Batch migration endpoint using hybrid dual storage (Stream + R2)
// ABOUTME: Handles bulk imports with instant MP4 availability via R2

import { json } from "../router.mjs";
import { fetchAndHash, dualStoreVideo } from "../utils/dual_storage.mjs";
import { enableDownloadsAsync } from "../utils/auto_enable_downloads.mjs";

export async function migrateBatch(req, env, deps) {
  // No auth required for batch migration - this is data recovery
  const verified = { pubkey: "batch_migration_recovery" };

  // Parse request body
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request", reason: "invalid_json" });
  }

  const videos = body.videos || [];
  if (!Array.isArray(videos) || videos.length === 0) {
    return json(400, { error: "bad_request", reason: "missing_videos_array" });
  }

  // Limit batch size
  const batchLimit = Math.min(videos.length, 50);
  const videosToProcess = videos.slice(0, batchLimit);

  console.log(`📦 BATCH MIGRATE: Processing ${videosToProcess.length} videos with hybrid storage`);

  const results = [];

  // Process videos sequentially to avoid overwhelming the system
  for (const video of videosToProcess) {
    const sourceUrl = video.sourceUrl || video.r2Url || video.url;
    if (!sourceUrl) {
      results.push({
        sourceUrl: video.sourceUrl || "unknown",
        status: "error",
        error: "Missing source URL"
      });
      continue;
    }

    try {
      // Check if already migrated by SHA-256
      let videoData;
      const metadata = {
        sha256: video.sha256,
        vineId: video.vineId,
        originalUrl: video.originalUrl || sourceUrl,
        originalR2Path: video.originalR2Path,
        migrationBatch: body.batchId || `batch_${Date.now()}`,
        migrationTimestamp: deps.now(),
        originalOwner: video.originalOwner || "batch_migration"
      };

      // Skip download if SHA-256 provided and exists
      if (video.sha256) {
        const existing = await env.MEDIA_KV.get(`idx:sha256:${video.sha256}`);
        if (existing) {
          const data = JSON.parse(existing);
          results.push({
            sourceUrl,
            uid: data.uid,
            sha256: video.sha256,
            status: "already_migrated",
            message: "Video already exists (detected via SHA-256)"
          });
          continue;
        }
      }

      // Fetch and hash video
      videoData = await fetchAndHash(sourceUrl, deps);
      metadata.sha256 = videoData.sha256;

      // Check again with calculated SHA-256
      const existingBySHA = await env.MEDIA_KV.get(`idx:sha256:${videoData.sha256}`);
      if (existingBySHA) {
        const data = JSON.parse(existingBySHA);
        results.push({
          sourceUrl,
          uid: data.uid,
          sha256: videoData.sha256,
          status: "already_migrated",
          message: "Video already exists (calculated SHA-256 match)"
        });
        continue;
      }

      // Dual store in Stream + R2
      const dualStoreMetadata = {
        name: metadata.vineId || metadata.sha256.substring(0, 8) || 'batch_video',
        owner: verified.pubkey,
        vineId: metadata.vineId,
        originalUrl: metadata.originalUrl,
        originalR2Path: metadata.originalR2Path,
        migrationBatch: metadata.migrationBatch,
        migrationTimestamp: metadata.migrationTimestamp,
        originalOwner: metadata.originalOwner,
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
        results.push({
          sourceUrl,
          status: "error",
          error: "Failed to store in hybrid storage",
          errors: storeResult.errors
        });
        continue;
      }

      // Create indexes
      if (metadata.vineId) {
        await env.MEDIA_KV.put(`idx:vine:${metadata.vineId}`, JSON.stringify({ uid: storeResult.uid }));
      }

      // Auto-enable Stream MP4 downloads (backup for R2)
      if (storeResult.streamSuccess) {
        enableDownloadsAsync(storeResult.uid, env, deps, {
          logPrefix: "📦 BATCH",
          initialDelay: 15000, // Longer delay for batch processing
          maxRetries: 3
        });
      }

      results.push({
        sourceUrl,
        uid: storeResult.uid,
        sha256: videoData.sha256,
        status: "hybrid_migration_completed",
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

      console.log(`✅ BATCH: Hybrid migration completed for ${videoData.sha256} -> UID: ${storeResult.uid}`);

    } catch (error) {
      console.error(`❌ BATCH: Migration failed for ${sourceUrl}:`, error);
      results.push({
        sourceUrl,
        status: "error",
        error: error.message
      });
    }

    // Small delay between videos to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const successful = results.filter(r =>
    r.status === "hybrid_migration_completed" || r.status === "already_migrated"
  ).length;

  console.log(`📦 BATCH MIGRATE: Completed ${successful}/${results.length} hybrid migrations`);

  return json(200, {
    processed: results.length,
    successful,
    failed: results.length - successful,
    batchId: body.batchId || `batch_${Date.now()}`,
    results
  });
}