// ABOUTME: R2 direct migration handler - streams videos from R2 to Stream without external downloads
// ABOUTME: Uses R2 bindings for fast network-internal transfers

import { json } from "../router.mjs";
import { getStreamUrls } from "../utils/stream_urls.mjs";

export async function migrateFromR2(req, env, deps) {
  // Admin only endpoint
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  const adminToken = env.MIGRATION_ADMIN_TOKEN;
  
  if (!adminToken || auth !== `Bearer ${adminToken}`) {
    return json(403, { error: "forbidden", reason: "admin_only" });
  }

  // Parse request
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request", reason: "invalid_json" });
  }

  const { r2Key, sha256, vineId, metadata = {} } = body;
  
  if (!r2Key) {
    return json(400, { error: "bad_request", reason: "missing_r2_key" });
  }

  // Check if R2 binding exists
  if (!env.R2_VIDEOS) {
    return json(500, { 
      error: "server_error", 
      reason: "r2_not_configured",
      message: "R2 bucket binding not configured. Add R2_VIDEOS binding to wrangler.toml" 
    });
  }

  // Check if already migrated
  if (sha256) {
    const existing = await env.MEDIA_KV.get(`idx:sha256:${sha256}`);
    if (existing) {
      const data = JSON.parse(existing);
      return json(200, { 
        uid: data.uid, 
        status: "already_migrated",
        r2Key 
      });
    }
  }
  
  if (vineId) {
    const existing = await env.MEDIA_KV.get(`idx:vine:${vineId}`);
    if (existing) {
      const data = JSON.parse(existing);
      return json(200, { 
        uid: data.uid, 
        status: "already_migrated",
        r2Key 
      });
    }
  }

  try {
    // Get video directly from R2 (no external download!)
    const object = await env.R2_VIDEOS.get(r2Key);
    
    if (!object) {
      return json(404, { 
        error: "not_found", 
        r2Key,
        message: "Video not found in R2 bucket" 
      });
    }

    // Get Stream API credentials
    const accountId = env.STREAM_ACCOUNT_ID;
    const apiToken = env.STREAM_API_TOKEN;
    
    if (!accountId || !apiToken) {
      return json(500, { error: "server_error", reason: "misconfigured_stream_env" });
    }

    // Create Stream direct upload URL
    const streamUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`;
    
    const createRes = await deps.fetch(streamUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        maxDurationSeconds: 21600, // 6 hours max
        requireSignedURLs: false,
        allowedOrigins: ["*"],
        meta: {
          name: vineId || sha256 || r2Key,
          r2Key,
          sha256,
          vineId,
          migratedAt: deps.now(),
          ...metadata
        }
      }),
    });

    if (!createRes.ok) {
      let errorDetail = null;
      try {
        const errorBody = await createRes.json();
        errorDetail = errorBody.errors?.[0]?.message || errorBody.error || null;
      } catch {}
      return json(502, { 
        error: "stream_error", 
        status: createRes.status, 
        detail: errorDetail 
      });
    }

    const createData = await createRes.json();
    const uploadURL = createData?.result?.uploadURL;
    const uid = createData?.result?.uid;

    if (!uploadURL || !uid) {
      return json(502, { 
        error: "stream_error", 
        reason: "missing_upload_url",
        response: createData 
      });
    }

    // Stream the R2 object directly to Stream
    // This happens within Cloudflare's network - FAST!
    console.log(`Streaming ${r2Key} (${object.size} bytes) directly to Stream...`);
    
    const uploadRes = await deps.fetch(uploadURL, {
      method: 'PUT',
      body: object.body,
      headers: {
        'Content-Length': object.size.toString(),
        'Content-Type': object.httpMetadata?.contentType || 'video/mp4'
      }
    });

    if (!uploadRes.ok) {
      return json(502, { 
        error: "upload_error", 
        status: uploadRes.status,
        r2Key 
      });
    }

    // Store in KV
    const record = {
      status: "migrated",
      owner: "r2_migration",
      createdAt: deps.now(),
      migratedFrom: `r2://${r2Key}`,
      r2Key,
      sha256,
      vineId,
      size: object.size,
      ...metadata
    };

    await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify(record));
    
    // Create indexes
    if (sha256) {
      await env.MEDIA_KV.put(`idx:sha256:${sha256}`, JSON.stringify({ uid }));
    }
    if (vineId) {
      await env.MEDIA_KV.put(`idx:vine:${vineId}`, JSON.stringify({ uid }));
    }
    
    // Track migration
    await env.MEDIA_KV.put(`migration:r2:${uid}`, JSON.stringify({
      r2Key,
      timestamp: deps.now(),
      size: object.size
    }));

    const urls = getStreamUrls(uid, env);
    return json(200, { 
      uid,
      status: "migrated",
      r2Key,
      size: object.size,
      streamUrl: urls.hlsUrl,
      thumbnailUrl: urls.thumbnailUrl,
      message: "Video migrated successfully from R2 to Stream"
    });

  } catch (error) {
    console.error(`R2 migration error for ${r2Key}:`, error);
    return json(500, {
      error: "migration_error",
      r2Key,
      message: error.message
    });
  }
}

export async function migrateR2Batch(req, env, deps) {
  // Admin only endpoint
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  const adminToken = env.MIGRATION_ADMIN_TOKEN;
  
  if (!adminToken || auth !== `Bearer ${adminToken}`) {
    return json(403, { error: "forbidden", reason: "admin_only" });
  }

  // Parse request
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request", reason: "invalid_json" });
  }

  const { prefix, keys, limit = 10 } = body;
  
  if (!prefix && !keys) {
    return json(400, { 
      error: "bad_request", 
      reason: "missing_prefix_or_keys",
      message: "Provide either 'prefix' to list R2 objects or 'keys' array" 
    });
  }

  // Check if R2 binding exists
  if (!env.R2_VIDEOS) {
    return json(500, { 
      error: "server_error", 
      reason: "r2_not_configured" 
    });
  }

  const results = [];
  let objectsToMigrate = [];

  try {
    if (keys && Array.isArray(keys)) {
      // Use provided keys
      objectsToMigrate = keys.map(k => ({ key: k }));
    } else if (prefix) {
      // List objects with prefix
      const list = await env.R2_VIDEOS.list({ 
        prefix, 
        limit: Math.min(limit, 100) 
      });
      objectsToMigrate = list.objects;
    }

    const batchId = `batch_r2_${Date.now()}`;
    
    // Process each video
    for (const obj of objectsToMigrate) {
      try {
        // Try to extract metadata from key name
        // Expected format: videos/{vineId}_{sha256}.mp4 or similar
        const keyParts = obj.key.split('/').pop().split('_');
        const vineId = keyParts[0];
        const sha256 = keyParts[1]?.replace('.mp4', '');

        const migrateRes = await migrateFromR2(
          new Request(req.url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              r2Key: obj.key,
              vineId,
              sha256,
              metadata: { batchId }
            })
          }),
          env,
          deps
        );

        const result = await migrateRes.json();
        results.push({
          r2Key: obj.key,
          ...result
        });

      } catch (error) {
        results.push({
          r2Key: obj.key,
          status: "error",
          error: error.message
        });
      }
    }

    // Store batch summary
    await env.MEDIA_KV.put(`batch:r2:${batchId}`, JSON.stringify({
      timestamp: deps.now(),
      prefix,
      totalVideos: objectsToMigrate.length,
      successful: results.filter(r => r.status === "migrated" || r.status === "already_migrated").length,
      failed: results.filter(r => r.status === "error").length,
      results: results.map(r => ({ 
        r2Key: r.r2Key, 
        uid: r.uid, 
        status: r.status 
      }))
    }));

    return json(200, {
      batchId,
      processed: objectsToMigrate.length,
      successful: results.filter(r => r.status === "migrated" || r.status === "already_migrated").length,
      failed: results.filter(r => r.status === "error").length,
      results
    });

  } catch (error) {
    console.error('R2 batch migration error:', error);
    return json(500, {
      error: "batch_error",
      message: error.message
    });
  }
}

export async function listR2Videos(req, env, deps) {
  // Admin only endpoint
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  const adminToken = env.MIGRATION_ADMIN_TOKEN;
  
  if (!adminToken || auth !== `Bearer ${adminToken}`) {
    return json(403, { error: "forbidden", reason: "admin_only" });
  }

  // Check if R2 binding exists
  if (!env.R2_VIDEOS) {
    return json(500, { 
      error: "server_error", 
      reason: "r2_not_configured",
      message: "R2 bucket binding not configured" 
    });
  }

  const url = new URL(req.url);
  const prefix = url.searchParams.get('prefix') || '';
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const cursor = url.searchParams.get('cursor');

  try {
    const options = {
      prefix,
      limit: Math.min(limit, 1000)
    };
    
    if (cursor) {
      options.cursor = cursor;
    }

    const list = await env.R2_VIDEOS.list(options);
    
    return json(200, {
      objects: list.objects.map(o => ({
        key: o.key,
        size: o.size,
        uploaded: o.uploaded,
        etag: o.etag
      })),
      truncated: list.truncated,
      cursor: list.cursor,
      count: list.objects.length,
      prefix
    });

  } catch (error) {
    console.error('R2 list error:', error);
    return json(500, {
      error: "list_error",
      message: error.message
    });
  }
}