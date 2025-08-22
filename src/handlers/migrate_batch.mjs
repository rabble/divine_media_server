// ABOUTME: Batch migration endpoint for importing multiple videos from R2
// ABOUTME: Handles bulk imports with progress tracking

import { json } from "../router.mjs";
import { getStreamUrls } from "../utils/stream_urls.mjs";

export async function migrateBatch(req, env, deps) {
  // Admin only endpoint
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  const adminToken = env.MIGRATION_ADMIN_TOKEN;
  
  if (!adminToken || auth !== `Bearer ${adminToken}`) {
    return json(403, { error: "forbidden", reason: "admin_only" });
  }

  // Parse batch request
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

  if (videos.length > 100) {
    return json(400, { error: "bad_request", reason: "batch_too_large", max: 100 });
  }

  const batchId = body.batchId || `batch_${Date.now()}`;
  const results = [];
  const accountId = env.STREAM_ACCOUNT_ID;
  const apiToken = env.STREAM_API_TOKEN;

  if (!accountId || !apiToken) {
    return json(500, { error: "server_error", reason: "misconfigured_stream_env" });
  }

  // Process each video
  for (const video of videos) {
    const sourceUrl = video.sourceUrl || video.r2Url || video.url;
    
    if (!sourceUrl) {
      results.push({
        sourceUrl: "unknown",
        status: "error",
        error: "missing_source_url"
      });
      continue;
    }

    try {
      // Check if already migrated
      let skipMigration = false;
      let existingUid = null;
      
      if (video.sha256) {
        const existing = await env.MEDIA_KV.get(`idx:sha256:${video.sha256}`);
        if (existing) {
          const data = JSON.parse(existing);
          existingUid = data.uid;
          skipMigration = true;
        }
      }
      
      if (!skipMigration && video.vineId) {
        const existing = await env.MEDIA_KV.get(`idx:vine:${video.vineId}`);
        if (existing) {
          const data = JSON.parse(existing);
          existingUid = data.uid;
          skipMigration = true;
        }
      }

      if (skipMigration) {
        results.push({
          sourceUrl,
          uid: existingUid,
          status: "already_migrated"
        });
        continue;
      }

      // Import to Stream using media/assets endpoint
      const streamUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/media/assets`;
      
      const metadata = {
        sha256: video.sha256,
        vineId: video.vineId,
        originalUrl: video.originalUrl || sourceUrl,
        originalR2Path: video.r2Path,
        migrationBatch: batchId,
        migrationTimestamp: deps.now(),
        originalOwner: video.originalOwner || "batch_migration",
      };

      const streamBody = {
        url: sourceUrl,
        meta: {
          name: video.vineId || video.sha256 || 'batch_video',
          ...metadata
        },
        requireSignedURLs: false,
        allowedOrigins: ["*"]
      };

      const res = await deps.fetch(streamUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(streamBody),
      });

      if (!res.ok) {
        let errorDetail = null;
        try {
          const errorBody = await res.json();
          errorDetail = errorBody.errors?.[0]?.message || errorBody.error || null;
        } catch {}
        
        results.push({
          sourceUrl,
          status: "error",
          error: errorDetail || `Stream API error ${res.status}`
        });
        continue;
      }

      const data = await res.json();
      const result = data?.result ?? {};
      const uid = result.uid || result.id;

      if (!uid) {
        results.push({
          sourceUrl,
          status: "error",
          error: "No UID returned from Stream"
        });
        continue;
      }

      // Store in KV
      const record = {
        status: "migrating",
        owner: "batch_migration",
        createdAt: deps.now(),
        migratedFrom: sourceUrl,
        migrationBatch: batchId,
        sha256: video.sha256,
        vineId: video.vineId,
        originalUrl: video.originalUrl,
      };

      await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify(record));
      
      // Create indexes
      if (video.sha256) {
        await env.MEDIA_KV.put(`idx:sha256:${video.sha256}`, JSON.stringify({ uid }));
      }
      if (video.vineId) {
        await env.MEDIA_KV.put(`idx:vine:${video.vineId}`, JSON.stringify({ uid }));
      }
      
      // Track migration
      await env.MEDIA_KV.put(`migration:${uid}`, JSON.stringify({
        sourceUrl,
        batchId,
        timestamp: deps.now()
      }));

      const urls = getStreamUrls(uid, env);
      results.push({
        sourceUrl,
        uid,
        status: "migrating",
        streamUrl: urls.hlsUrl
      });

    } catch (error) {
      results.push({
        sourceUrl,
        status: "error",
        error: error.message || "Unknown error"
      });
    }
  }

  // Store batch summary
  await env.MEDIA_KV.put(`batch:${batchId}`, JSON.stringify({
    timestamp: deps.now(),
    totalVideos: videos.length,
    results: results.map(r => ({ uid: r.uid, status: r.status }))
  }));

  return json(200, {
    batchId,
    processed: videos.length,
    successful: results.filter(r => r.status === "migrating" || r.status === "already_migrated").length,
    failed: results.filter(r => r.status === "error").length,
    results
  });
}