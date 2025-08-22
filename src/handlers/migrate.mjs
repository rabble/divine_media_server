// ABOUTME: Migration endpoint for importing videos from R2 to Cloudflare Stream
// ABOUTME: Handles URL-based imports and preserves metadata

import { json } from "../router.mjs";
import { getStreamUrls } from "../utils/stream_urls.mjs";

export async function migrateVideo(req, env, deps) {
  // Require NIP-98 Authorization or admin token
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) {
    return json(401, { error: "unauthorized", reason: "missing_auth" });
  }
  
  // Check for admin migration token first
  const adminToken = env.MIGRATION_ADMIN_TOKEN;
  let verified = null;
  
  if (adminToken && auth === `Bearer ${adminToken}`) {
    // Admin migration mode - set a system owner
    verified = { pubkey: "migration_admin" };
  } else if (auth.startsWith('Nostr ')) {
    // Regular NIP-98 auth
    verified = await deps.verifyNip98(req);
    if (!verified) {
      return json(403, { error: "forbidden", reason: "invalid_nip98" });
    }
  } else {
    return json(403, { error: "forbidden", reason: "invalid_auth" });
  }

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
      return json(200, { 
        uid: data.uid, 
        status: "already_migrated",
        message: "Video already exists in Stream" 
      });
    }
  }
  
  if (metadata.vineId) {
    const existing = await env.MEDIA_KV.get(`idx:vine:${metadata.vineId}`);
    if (existing) {
      const data = JSON.parse(existing);
      return json(200, { 
        uid: data.uid, 
        status: "already_migrated",
        message: "Video already exists in Stream" 
      });
    }
  }

  // Call Stream API to copy from URL
  const accountId = env.STREAM_ACCOUNT_ID;
  const apiToken = env.STREAM_API_TOKEN;
  
  if (!accountId || !apiToken) {
    return json(500, { error: "server_error", reason: "misconfigured_stream_env" });
  }

  // Use Stream's upload-from-URL feature via the Dashboard API
  // This is the same API the Cloudflare Dashboard uses
  const streamUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/media/assets`;
  
  const streamBody = {
    url: sourceUrl,
    meta: {
      name: metadata.vineId || metadata.sha256 || 'migration_video',
      ...metadata
    },
    requireSignedURLs: false,
    allowedOrigins: ["*"]
  };

  console.log(`Migrating from URL: ${sourceUrl}`);
  
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
    return json(502, { 
      error: "stream_error", 
      status: res.status, 
      detail: errorDetail,
      sourceUrl: sourceUrl 
    });
  }

  const data = await res.json();
  const result = data?.result ?? {};
  const uid = result.uid || result.id;
  
  if (!uid) {
    return json(502, { error: "stream_error", reason: "missing_uid" });
  }

  // Store video record with migration metadata
  const record = {
    status: "migrating",
    owner: verified.pubkey,
    createdAt: deps.now(),
    migratedFrom: sourceUrl,
    migrationMetadata: metadata,
    sha256: metadata.sha256,
    vineId: metadata.vineId,
    originalUrl: metadata.originalUrl,
  };

  await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify(record));
  
  // Create indexes
  if (metadata.sha256) {
    await env.MEDIA_KV.put(`idx:sha256:${metadata.sha256}`, JSON.stringify({ uid }));
  }
  if (metadata.vineId) {
    await env.MEDIA_KV.put(`idx:vine:${metadata.vineId}`, JSON.stringify({ uid }));
  }
  if (metadata.originalUrl) {
    const urlDigest = await digestUrl(metadata.originalUrl);
    await env.MEDIA_KV.put(`idx:url:${urlDigest}`, JSON.stringify({ uid, url: metadata.originalUrl }));
  }
  
  // Track migration
  await env.MEDIA_KV.put(`idx:pubkey:${verified.pubkey}:${uid}`, "1");
  await env.MEDIA_KV.put(`migration:${uid}`, JSON.stringify({
    sourceUrl,
    timestamp: deps.now(),
    batch: body.batch
  }));

  // Return migration result
  const urls = getStreamUrls(uid, env);
  return json(200, {
    uid,
    status: "migration_started",
    sourceUrl,
    streamUrl: result.preview || urls.hlsUrl,
    thumbnailUrl: result.thumbnail || urls.thumbnailUrl,
    metadata: {
      sha256: metadata.sha256,
      vineId: metadata.vineId,
    }
  });
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