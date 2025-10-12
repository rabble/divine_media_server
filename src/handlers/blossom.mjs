// ABOUTME: Blossom protocol handlers for blob storage and retrieval
// ABOUTME: Implements core Blossom endpoints using existing video infrastructure

import { json } from "../router.mjs";
import { getStreamUrls } from "../utils/stream_urls.mjs";

/**
 * GET /<sha256> - Retrieve blob by SHA-256 hash (BUD-01 compliant)
 */
export async function getBlobByHash(req, env, deps) {
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/^\/([a-f0-9]{64})(\.[a-z0-9]+)?$/);
  if (!pathMatch) {
    return json(400, { error: "invalid_hash" });
  }

  const sha256 = pathMatch[1];
  const fileExt = pathMatch[2] || '';

  // Look up video by SHA-256 hash
  const indexData = await env.MEDIA_KV.get(`idx:sha256:${sha256}`);
  if (!indexData) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const { uid } = JSON.parse(indexData);
    const videoData = await env.MEDIA_KV.get(`video:${uid}`);
    if (!videoData) {
      return new Response("Not Found", { status: 404 });
    }

    const video = JSON.parse(videoData);
    if (video.status !== 'ready') {
      return new Response("Not Ready", { status: 202 });
    }

    // Get R2 blob and return it directly
    const r2Key = video.r2Key || `videos/${sha256}.mp4`;
    const r2Object = await env.R2_VIDEOS.get(r2Key);

    if (!r2Object) {
      console.error(`❌ GET: R2 object not found at ${r2Key}`);
      return new Response("Not Found", { status: 404 });
    }

    // Return blob with proper headers
    const headers = new Headers();
    headers.set('Content-Type', video.contentType || 'application/octet-stream');
    headers.set('Content-Length', r2Object.size.toString());
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=31536000');
    headers.set('ETag', r2Object.etag);

    // Support range requests for video streaming
    const range = req.headers.get('range');
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : r2Object.size - 1;
      const chunksize = (end - start) + 1;

      headers.set('Content-Range', `bytes ${start}-${end}/${r2Object.size}`);
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Content-Length', chunksize.toString());

      return new Response(r2Object.body, {
        status: 206,
        headers
      });
    }

    return new Response(r2Object.body, {
      status: 200,
      headers
    });

  } catch (error) {
    console.error(`❌ GET: Error retrieving blob ${sha256}:`, error);
    return new Response("Server Error", { status: 500 });
  }
}

/**
 * HEAD /<sha256> - Check if blob exists (BUD-01 compliant)
 */
export async function headBlobByHash(req, env, deps) {
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/^\/([a-f0-9]{64})(\.[a-z0-9]+)?$/);
  if (!pathMatch) {
    return new Response(null, { status: 400 });
  }

  const sha256 = pathMatch[1];

  // Look up video by SHA-256 hash
  const indexData = await env.MEDIA_KV.get(`idx:sha256:${sha256}`);
  if (!indexData) {
    return new Response(null, { status: 404 });
  }

  try {
    const { uid } = JSON.parse(indexData);
    const videoData = await env.MEDIA_KV.get(`video:${uid}`);
    if (!videoData) {
      return new Response(null, { status: 404 });
    }

    const video = JSON.parse(videoData);
    if (video.status !== 'ready') {
      return new Response(null, { status: 202 });
    }

    // Return headers without body per BUD-01
    const headers = new Headers();
    headers.set('Content-Type', video.contentType || 'application/octet-stream');
    headers.set('Content-Length', (video.size || 0).toString());
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Accept-Ranges', 'bytes');

    return new Response(null, {
      status: 200,
      headers
    });

  } catch (error) {
    return new Response(null, { status: 500 });
  }
}

/**
 * PUT /upload - Blossom blob upload (BUD-02 compliant)
 * Accepts binary data in the request body and stores it to R2
 */
export async function blossomUpload(req, env, deps) {
  const fetchFn = deps?.fetch || globalThis.fetch;
  const now = deps?.now || (() => Date.now());

  // Verify Blossom auth (kind 24242 event)
  const auth = await verifyBlossomAuth(req, deps, env);
  if (!auth) {
    return json(401, { error: "unauthorized" });
  }

  // Get binary data from request body
  const blob = await req.arrayBuffer();
  const size = blob.byteLength;

  // Get MIME type from Content-Type header or default
  const contentType = req.headers.get('content-type') || 'application/octet-stream';

  // Calculate SHA-256 hash of the uploaded data
  const hashBuffer = await crypto.subtle.digest('SHA-256', blob);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  console.log(`🌸 Upload: SHA-256=${sha256}, size=${size}, type=${contentType}, owner=${auth.pubkey}`);

  // Check if auth event has matching 'x' tag with SHA-256 (BUD-02 requirement)
  const authHash = auth.event?.tags?.find(t => t[0] === 'x')?.[1];
  if (authHash && authHash !== sha256) {
    console.log(`🌸 Upload: SHA-256 mismatch - auth=${authHash}, actual=${sha256}`);
    return json(400, {
      error: "hash_mismatch",
      message: "SHA-256 hash in authorization event does not match uploaded data"
    });
  }

  // Check if blob already exists
  const existingIndex = await env.MEDIA_KV.get(`idx:sha256:${sha256}`);
  if (existingIndex) {
    console.log(`🌸 Upload: Blob already exists with SHA-256=${sha256}`);
    const { uid } = JSON.parse(existingIndex);
    const videoData = await env.MEDIA_KV.get(`video:${uid}`);
    if (videoData) {
      const video = JSON.parse(videoData);
      const cdnDomain = env.STREAM_DOMAIN || env.CDN_DOMAIN || 'cdn.divine.video';
      const fileExt = getFileExtension(contentType);

      return json(200, {
        url: `https://${cdnDomain}/${sha256}${fileExt}`,
        sha256: sha256,
        size: video.size || size,
        type: contentType,
        uploaded: Math.floor(video.createdAt / 1000)
      });
    }
  }

  // Generate a UID for this blob
  const uid = generateUID();

  // Store blob in R2
  const r2Key = `videos/${sha256}.mp4`;

  try {
    await env.R2_VIDEOS.put(r2Key, blob, {
      httpMetadata: {
        contentType: contentType,
        cacheControl: 'public, max-age=31536000'
      },
      customMetadata: {
        sha256: sha256,
        uploadedAt: new Date().toISOString(),
        owner: auth.pubkey,
        uid: uid
      }
    });

    console.log(`✅ Upload: Stored to R2 at ${r2Key}`);
  } catch (error) {
    console.error(`❌ Upload: R2 storage failed:`, error);
    return json(500, {
      error: "storage_failed",
      message: "Failed to store blob"
    });
  }

  // Store metadata in KV
  const timestamp = now();
  const videoRecord = {
    status: 'ready',
    owner: auth.pubkey,
    createdAt: timestamp,
    uploadedVia: 'blossom_upload',
    sha256,
    size,
    contentType,
    r2Key
  };

  try {
    await Promise.all([
      env.MEDIA_KV.put(`video:${uid}`, JSON.stringify(videoRecord)),
      env.MEDIA_KV.put(`idx:sha256:${sha256}`, JSON.stringify({ uid })),
      env.MEDIA_KV.put(`idx:pubkey:${auth.pubkey}:${uid}`, '1')
    ]);

    console.log(`✅ Upload: Stored metadata in KV for UID=${uid}`);
  } catch (error) {
    console.error(`❌ Upload: KV storage failed:`, error);
    // Continue anyway - blob is in R2
  }

  // Return Blossom-compliant blob descriptor
  const cdnDomain = env.STREAM_DOMAIN || env.CDN_DOMAIN || 'cdn.divine.video';
  const fileExt = getFileExtension(contentType);

  return json(200, {
    url: `https://${cdnDomain}/${sha256}${fileExt}`,
    sha256: sha256,
    size: size,
    type: contentType,
    uploaded: Math.floor(timestamp / 1000)
  });
}

/**
 * Generate a unique ID for a blob
 */
function generateUID() {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Get file extension from MIME type
 */
function getFileExtension(mimeType) {
  const typeMap = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/octet-stream': '.bin'
  };
  return typeMap[mimeType] || '.bin';
}

/**
 * GET /list/<pubkey> - List blobs for a public key
 */
export async function listUserBlobs(req, env, deps) {
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/^\/list\/([a-f0-9]{64})$/);
  if (!pathMatch) {
    return json(400, { error: "invalid_pubkey" });
  }

  const pubkey = pathMatch[1];

  // Optional auth check
  const auth = await verifyBlossomAuth(req, deps, env);
  const isOwner = auth?.pubkey === pubkey;

  try {
    // List all videos for this pubkey
    const listResult = await env.MEDIA_KV.list({ prefix: `idx:pubkey:${pubkey}:` });
    const blobs = [];

    for (const key of listResult.keys) {
      const uid = key.name.split(':').pop();
      const videoData = await env.MEDIA_KV.get(`video:${uid}`);
      if (!videoData) continue;

      const video = JSON.parse(videoData);

      // Only include ready videos
      if (video.status !== 'ready') continue;

      const blob = {
        sha256: video.sha256,
        size: video.size || null,
        type: "video",
        uploaded: Math.floor(video.createdAt / 1000)
      };

      // Only include SHA-256 if available
      if (blob.sha256) {
        blobs.push(blob);
      }
    }

    return json(200, blobs);

  } catch (error) {
    return json(500, { error: "server_error" });
  }
}

/**
 * DELETE /<sha256> - Delete blob by hash
 */
export async function deleteBlobByHash(req, env, deps) {
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/^\/([a-f0-9]{64})(\.[a-z0-9]+)?$/);
  if (!pathMatch) {
    return json(400, { error: "invalid_hash" });
  }

  const sha256 = pathMatch[1];

  // Verify auth
  const auth = await verifyBlossomAuth(req, deps, env);
  if (!auth) {
    return json(401, { error: "unauthorized" });
  }

  // Look up video by SHA-256
  const indexData = await env.MEDIA_KV.get(`idx:sha256:${sha256}`);
  if (!indexData) {
    return json(404, { error: "not_found" });
  }

  try {
    const { uid } = JSON.parse(indexData);
    const videoData = await env.MEDIA_KV.get(`video:${uid}`);
    if (!videoData) {
      return json(404, { error: "not_found" });
    }

    const video = JSON.parse(videoData);

    // Check ownership
    if (video.owner !== auth.pubkey) {
      return json(403, { error: "forbidden" });
    }

    // Delete from Cloudflare Stream
    const accountId = env.STREAM_ACCOUNT_ID;
    const apiToken = env.STREAM_API_TOKEN;

    if (accountId && apiToken && !env.MOCK_STREAM_API) {
      const deleteUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`;
      await deps.fetch(deleteUrl, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${apiToken}` }
      });
    }

    // Delete from KV
    await Promise.all([
      env.MEDIA_KV.delete(`video:${uid}`),
      env.MEDIA_KV.delete(`idx:sha256:${sha256}`),
      env.MEDIA_KV.delete(`idx:pubkey:${video.owner}:${uid}`)
    ]);

    return new Response(null, { status: 204 });

  } catch (error) {
    return json(500, { error: "server_error" });
  }
}

/**
 * Verify Blossom authentication (kind 24242 event)
 */
async function verifyBlossomAuth(req, deps, env) {
  const { verifyBlossomAuth } = await import('../auth/blossom.mjs');
  return await verifyBlossomAuth(req, deps, env);
}