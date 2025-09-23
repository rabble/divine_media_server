// ABOUTME: Blossom protocol handlers for blob storage and retrieval
// ABOUTME: Implements core Blossom endpoints using existing video infrastructure

import { json } from "../router.mjs";
import { getStreamUrls } from "../utils/stream_urls.mjs";

/**
 * GET /<sha256> - Retrieve blob by SHA-256 hash
 */
export async function getBlobByHash(req, env, deps) {
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/^\/([a-f0-9]{64})(\.[a-z0-9]+)?$/);
  if (!pathMatch) {
    return json(400, { error: "invalid_hash" });
  }

  const sha256 = pathMatch[1];

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

    // Get the playback URL and redirect
    const { hlsUrl } = getStreamUrls(uid, env);
    return Response.redirect(hlsUrl, 302);

  } catch (error) {
    return new Response("Server Error", { status: 500 });
  }
}

/**
 * HEAD /<sha256> - Check if blob exists
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

    return new Response(null, { status: 200 });

  } catch (error) {
    return new Response(null, { status: 500 });
  }
}

/**
 * PUT /upload - Blossom blob upload
 */
export async function blossomUpload(req, env, deps) {
  // Verify Blossom auth (kind 24242 event)
  const auth = await verifyBlossomAuth(req, deps);
  if (!auth) {
    return json(401, { error: "unauthorized" });
  }

  // For now, redirect to existing video upload flow
  // This could be enhanced to handle non-video blobs
  const body = await req.text();
  let metadata = {};

  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      metadata = JSON.parse(body);
    }
  } catch {}

  // Create a new request for the video handler
  const videoReq = new Request(req.url.replace('/upload', '/v1/videos'), {
    method: 'POST',
    headers: {
      ...Object.fromEntries(req.headers.entries()),
      'content-type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  // Import and call the video handler
  const { createVideo } = await import('./videos.mjs');
  const result = await createVideo(videoReq, env, deps);

  // Convert to Blossom format
  if (result.status === 200) {
    const data = await result.json();
    return json(200, {
      sha256: metadata.sha256 || null,
      size: null, // Unknown until uploaded
      type: "video", // Assuming video for now
      uploaded: Math.floor(Date.now() / 1000),
      url: data.uploadURL || data.url
    });
  }

  // Return the original error for debugging
  return result;
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
  const auth = await verifyBlossomAuth(req, deps);
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
  const auth = await verifyBlossomAuth(req, deps);
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
async function verifyBlossomAuth(req, deps) {
  const { verifyBlossomAuth } = await import('../auth/blossom.mjs');
  return await verifyBlossomAuth(req, deps);
}