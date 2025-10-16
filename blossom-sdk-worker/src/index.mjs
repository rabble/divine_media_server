// ABOUTME: Experimental Cloudflare Worker using blossom-server-sdk
// ABOUTME: Implements Blossom protocol endpoints using SDK abstractions

import { R2BlobStorage } from './storage/r2-blob-storage.mjs';
import { KVMetadataStore } from './storage/kv-metadata-store.mjs';
import { validateProofMode, storeVerificationResult } from './proofmode-validator.mjs';

/**
 * Cloudflare Worker entry point
 */
export default {
  async fetch(request, env, ctx) {
    try {
      // Initialize storage backends
      const blobStorage = new R2BlobStorage(env.R2_BLOBS);
      const metadataStore = new KVMetadataStore(env.MEDIA_KV);

      // Parse request
      const url = new URL(request.url);
      const method = request.method.toUpperCase();

      // Handle CORS preflight
      if (method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, PUT, DELETE',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-ProofMode-Manifest, X-ProofMode-Signature, X-ProofMode-Attestation',
            'Access-Control-Max-Age': '86400'
          }
        });
      }

      // Route requests
      // GET / - Home page
      if (method === 'GET' && url.pathname === '/') {
        return new Response(getHomePage(), {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'Cache-Control': 'public, max-age=300'
          }
        });
      }

      // TEMP: GET /_list_r2 - List R2 contents for debugging
      if (method === 'GET' && url.pathname === '/_list_r2') {
        const prefix = url.searchParams.get('prefix') || '';
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const listed = await env.R2_BLOBS.list({ prefix, limit });
        const objects = listed.objects.map(obj => ({ key: obj.key, size: obj.size }));
        return jsonResponse(200, { prefix, count: objects.length, truncated: listed.truncated, objects });
      }

      // OLD: GET /{uid}/... - Legacy video URLs (thumbnails, manifests, etc)
      // These are 32-character hex UIDs from the old Cloudflare Stream system
      if (method === 'GET' || method === 'HEAD') {
        const uidMatch = url.pathname.match(/^\/([a-f0-9]{32})\/(.*)/);
        if (uidMatch) {
          const uid = uidMatch[1];
          const subpath = uidMatch[2];
          return await handleLegacyUidUrl(uid, subpath, method === 'HEAD', request, env);
        }
      }

      // GET /<sha256> - Retrieve blob
      if (method === 'GET' || method === 'HEAD') {
        const match = url.pathname.match(/^\/([a-f0-9]{64})(\.[a-z0-9]+)?$/);
        if (match) {
          return await handleGetBlob(match[1], method === 'HEAD', blobStorage, metadataStore, request, env);
        }
      }

      // PUT /upload - Upload blob
      if (method === 'PUT' && url.pathname === '/upload') {
        return await handleUploadBlob(request, blobStorage, metadataStore, env, ctx);
      }

      // GET /list/<pubkey> - List user's blobs
      if (method === 'GET') {
        const match = url.pathname.match(/^\/list\/([a-f0-9]{64})$/);
        if (match) {
          return await handleListBlobs(match[1], metadataStore);
        }
      }

      // DELETE /<sha256> - Delete blob
      if (method === 'DELETE') {
        const match = url.pathname.match(/^\/([a-f0-9]{64})(\.[a-z0-9]+)?$/);
        if (match) {
          return await handleDeleteBlob(request, match[1], blobStorage, metadataStore, env);
        }
      }

      return jsonResponse(404, { error: 'not_found' });

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse(500, { error: 'internal_server_error' });
    }
  }
};

/**
 * Handle GET/HEAD blob request
 */
async function handleGetBlob(sha256, isHead, blobStorage, metadataStore, req, env) {
  // Check moderation status (tiered access control)
  if (env.MODERATION_KV) {
    // Check for PERMANENT_BAN first (never serve except to admins)
    const permanentBan = await env.MODERATION_KV.get(`permanent-ban:${sha256}`);
    if (permanentBan) {
      return new Response(JSON.stringify({
        error: 'content_banned',
        message: 'This content has been permanently removed and cannot be accessed',
        status: 451
      }), {
        status: 451,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Check for AGE_RESTRICTED (requires user preferences)
    const ageRestricted = await env.MODERATION_KV.get(`age-restricted:${sha256}`);
    if (ageRestricted) {
      const restriction = JSON.parse(ageRestricted);

      // Check if user is authenticated and has appropriate preferences
      const authHeader = req.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Nostr ')) {
        return new Response(JSON.stringify({
          error: 'authentication_required',
          message: `This content is age-restricted (${restriction.category}). Please authenticate with Nostr to access.`,
          category: restriction.category,
          status: 401
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'WWW-Authenticate': 'Nostr'
          }
        });
      }

      // Verify auth and check preferences
      const auth = await verifyBlossomAuth(req, env);
      if (!auth) {
        return new Response(JSON.stringify({
          error: 'invalid_auth',
          message: 'Invalid Nostr authentication',
          status: 401
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Fetch user preferences (NIP-78)
      const { fetchUserContentPreferences, checkContentAccess } = await import('./nip78-preferences.mjs');
      const preferences = await fetchUserContentPreferences(auth.pubkey);

      // Check if user has permission for this content category
      if (!checkContentAccess(preferences, restriction.category)) {
        return new Response(JSON.stringify({
          error: 'content_restricted',
          message: `You have not opted in to view ${restriction.category} content. Please update your content preferences.`,
          category: restriction.category,
          preferences_url: `https://divine.video/settings/content-preferences`,
          status: 403
        }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // User has permission, continue to serve content
      console.log(`[ACCESS] User ${auth.pubkey.substring(0,8)} granted access to ${restriction.category} content ${sha256.substring(0,8)}`);
    }
  }

  // Note: REVIEW and SAFE content serve normally without restrictions
  // REVIEW content is logged by moderation service and published to Nostr for manual review

  // Check if blob exists in metadata
  const metadata = await metadataStore.getBlob(sha256);
  if (!metadata) {
    return new Response('Not Found', { status: 404 });
  }

  // For HEAD requests, return just headers
  if (isHead) {
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': metadata.type || 'application/octet-stream',
        'Content-Length': metadata.size?.toString() || '0',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  }

  // Check for range request BEFORE fetching blob
  const rangeHeader = req.headers.get('range');
  let blob;

  if (rangeHeader) {
    // Parse range request
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : metadata.size - 1;

    // Fetch only the requested range from R2
    blob = await blobStorage.readBlob(sha256, {
      range: { offset: start, length: end - start + 1 }
    });

    if (!blob) {
      return new Response('Not Found', { status: 404 });
    }

    // Return 206 Partial Content
    const headers = new Headers();
    headers.set('Content-Type', blob.type || 'application/octet-stream');
    headers.set('Content-Range', `bytes ${start}-${end}/${metadata.size}`);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', (end - start + 1).toString());
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    if (blob.etag) {
      headers.set('ETag', blob.etag);
    }

    return new Response(blob.body, {
      status: 206,
      headers
    });
  }

  // Regular GET request - fetch entire blob
  blob = await blobStorage.readBlob(sha256);
  if (!blob) {
    return new Response('Not Found', { status: 404 });
  }

  const headers = new Headers();
  headers.set('Content-Type', blob.type || 'application/octet-stream');
  headers.set('Content-Length', blob.size.toString());
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  if (blob.etag) {
    headers.set('ETag', blob.etag);
  }

  return new Response(blob.body, {
    status: 200,
    headers
  });
}

/**
 * Handle blob upload (PUT /upload)
 */
async function handleUploadBlob(request, blobStorage, metadataStore, env, ctx) {
  // Verify authentication
  const auth = await verifyBlossomAuth(request, env);
  if (!auth) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  // Get blob data
  const blob = await request.arrayBuffer();
  const size = blob.byteLength;
  const contentType = request.headers.get('content-type') || 'application/octet-stream';

  // Calculate SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', blob);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  console.log(`Upload: sha256=${sha256}, size=${size}, type=${contentType}, owner=${auth.pubkey}`);

  // Validate hash if provided in auth event
  const authHash = auth.event?.tags?.find(t => t[0] === 'x')?.[1];
  if (authHash && authHash !== sha256) {
    return jsonResponse(400, {
      error: 'hash_mismatch',
      message: 'SHA-256 in auth does not match uploaded data'
    });
  }

  // Check if blob already exists
  if (await metadataStore.hasBlob(sha256)) {
    const existing = await metadataStore.getBlob(sha256);
    const domain = env.STREAM_DOMAIN || 'cdn.divine.video';
    const fileExt = getFileExtension(existing.type || contentType);

    return jsonResponse(200, {
      url: `https://${domain}/${sha256}${fileExt}`,
      sha256,
      size: existing.size || size,
      type: existing.type || contentType,
      uploaded: existing.uploaded
    });
  }

  // Validate ProofMode
  let proofModeResult;
  try {
    proofModeResult = await validateProofMode(request, sha256, blob);
    console.log(`ProofMode validation result: ${JSON.stringify(proofModeResult)}`);
  } catch (error) {
    console.error('ProofMode validation error:', error);
    proofModeResult = {
      verified: false,
      level: 'unverified',
      message: 'ProofMode validation error'
    };
  }

  // Require ProofMode verification for video uploads
  const isVideo = contentType.startsWith('video/');
  if (isVideo && env.REQUIRE_PROOFMODE_FOR_VIDEOS === 'true') {
    // Check if ProofMode is verified (at least verified_web level)
    const isProofModeVerified = proofModeResult.verified &&
      (proofModeResult.level === 'verified_mobile' || proofModeResult.level === 'verified_web');

    if (!isProofModeVerified) {
      return jsonResponse(400, {
        error: 'proofmode_required',
        message: 'Video uploads require ProofMode verification. Please include X-ProofMode-Manifest and X-ProofMode-Signature headers.',
        proofmode_level: proofModeResult.level,
        proofmode_message: proofModeResult.message,
        required_level: 'verified_web or verified_mobile',
        documentation: 'https://github.com/guardianproject/proofmode'
      });
    }

    console.log(`✅ Video upload with verified ProofMode: level=${proofModeResult.level}, fingerprint=${proofModeResult.deviceFingerprint}`);
  }

  // Generate UID for this blob
  const uid = crypto.randomUUID().replace(/-/g, '');

  // Store blob with metadata (including ProofMode verification)
  await blobStorage.writeBlob(sha256, blob, contentType, auth.pubkey, uid, proofModeResult);

  // Store ProofMode verification result in KV
  if (env.MEDIA_KV) {
    try {
      await storeVerificationResult(sha256, proofModeResult, env.MEDIA_KV);
    } catch (error) {
      console.error('Failed to store ProofMode verification result:', error);
    }
  }

  // Store metadata
  const now = Math.floor(Date.now() / 1000);
  await metadataStore.addBlob({
    sha256,
    size,
    type: contentType,
    uploaded: now
  });

  // Store owner relationship
  await metadataStore.addBlobOwner(sha256, auth.pubkey);

  // Send to moderation queue (non-blocking)
  if (env.MODERATION_ENABLED === 'true' && env.MODERATION_QUEUE && ctx) {
    const uploadTimestamp = Date.now();
    ctx.waitUntil(
      env.MODERATION_QUEUE.send({
        sha256,
        uploadedBy: auth.pubkey,
        uploadedAt: uploadTimestamp,
        metadata: {
          fileSize: size,
          contentType,
          duration: 6, // Placeholder - would need actual duration detection
          proofMode: {
            verified: proofModeResult.verified,
            level: proofModeResult.level
          }
        }
      }).catch(err => {
        console.error('Failed to queue for moderation:', err);
      })
    );
  }

  const domain = env.STREAM_DOMAIN || 'cdn.divine.video';
  const fileExt = getFileExtension(contentType);

  return jsonResponse(200, {
    url: `https://${domain}/${sha256}${fileExt}`,
    sha256,
    size,
    type: contentType,
    uploaded: now,
    proofmode: {
      verified: proofModeResult.verified,
      level: proofModeResult.level,
      deviceFingerprint: proofModeResult.deviceFingerprint,
      timestamp: proofModeResult.timestamp
    }
  });
}

/**
 * Handle list blobs request
 */
async function handleListBlobs(pubkey, metadataStore) {
  const blobs = await metadataStore.getBlobsForPubkey(pubkey);
  return jsonResponse(200, blobs);
}

/**
 * Handle delete blob request
 */
async function handleDeleteBlob(request, sha256, blobStorage, metadataStore, env) {
  // Verify authentication
  const auth = await verifyBlossomAuth(request, env);
  if (!auth) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  // Check if blob exists
  const metadata = await metadataStore.getBlob(sha256);
  if (!metadata) {
    return jsonResponse(404, { error: 'not_found' });
  }

  // Check ownership
  const isOwner = await metadataStore.hasBlobOwner(sha256, auth.pubkey);
  if (!isOwner) {
    return jsonResponse(403, { error: 'forbidden' });
  }

  // Delete blob
  await blobStorage.removeBlob(sha256);
  await metadataStore.removeBlob(sha256);
  await metadataStore.removeBlobOwner(sha256, auth.pubkey);

  return new Response(null, { status: 204 });
}

/**
 * Verify Blossom authentication (kind 24242)
 * This is a simplified version - reusing auth logic from main worker
 */
async function verifyBlossomAuth(request, env) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Nostr ')) {
    return null;
  }

  try {
    const base64Event = authHeader.slice(6).trim();

    // Simple pubkey format for dev
    if (base64Event.startsWith('pubkey=')) {
      const pubkey = base64Event.slice(7);
      if (pubkey.match(/^[a-f0-9]{64}$/)) {
        return { pubkey };
      }
      return null;
    }

    // Parse event
    const eventJson = base64ToString(base64Event);
    const event = JSON.parse(eventJson);

    if (event.kind !== 24242) {
      return null;
    }

    // In DEV_AUTH_MODE, skip signature verification
    if (env.DEV_AUTH_MODE === 'true') {
      console.log('DEV_AUTH_MODE: Skipping signature verification');
      return { pubkey: event.pubkey, event };
    }

    // TODO: Add full signature verification using @noble/curves
    // For now, accept in production too (should be fixed before real deployment)

    return { pubkey: event.pubkey, event };

  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

/**
 * Base64 to string decoder
 */
function base64ToString(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
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
 * JSON response helper
 */
function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

/**
 * Handle legacy UID-based URLs (/{uid}/thumbnails/..., etc)
 * These are from the old Cloudflare Stream system
 * Uses lazy migration: proxy from Stream on first request, then cache in R2
 */
async function handleLegacyUidUrl(uid, subpath, isHead, request, env) {
  // Handle thumbnail requests: /{uid}/thumbnails/thumbnail.jpg
  if (subpath.startsWith('thumbnails/')) {
    // Check if we have this thumbnail cached in R2 using UID-based key
    const thumbnailKey = `thumbnails/${uid}.jpg`;
    let thumbnail = await env.R2_BLOBS.get(thumbnailKey);

    if (thumbnail) {
      // Serve from R2 cache
      const headers = new Headers();
      headers.set('Content-Type', 'image/jpeg');
      headers.set('Content-Length', thumbnail.size.toString());
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');

      if (thumbnail.etag) {
        headers.set('ETag', thumbnail.etag);
      }

      if (isHead) {
        return new Response(null, { status: 200, headers });
      }

      return new Response(thumbnail.body, { status: 200, headers });
    }

    // Not in R2 cache - fetch from Cloudflare Stream and cache it
    const streamDomain = env.STREAM_CUSTOMER_DOMAIN || 'customer-4c3uhd5qzuhwz9hu.cloudflarestream.com';
    const streamUrl = `https://${streamDomain}/${uid}/thumbnails/thumbnail.jpg`;

    try {
      const streamResponse = await fetch(streamUrl);

      if (!streamResponse.ok) {
        return new Response('Not Found', { status: 404 });
      }

      const thumbnailData = await streamResponse.arrayBuffer();

      // Cache in R2 for future requests (non-blocking)
      try {
        await env.R2_BLOBS.put(thumbnailKey, thumbnailData, {
          httpMetadata: {
            contentType: 'image/jpeg',
            cacheControl: 'public, max-age=31536000, immutable'
          }
        });
        console.log(`✅ Cached thumbnail from Stream: ${thumbnailKey}`);
      } catch (error) {
        console.error(`⚠️ Failed to cache thumbnail in R2:`, error);
        // Continue anyway - we can still serve it
      }

      // Serve to user
      const headers = new Headers();
      headers.set('Content-Type', 'image/jpeg');
      headers.set('Content-Length', thumbnailData.byteLength.toString());
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');

      if (isHead) {
        return new Response(null, { status: 200, headers });
      }

      return new Response(thumbnailData, { status: 200, headers });

    } catch (error) {
      console.error(`❌ Failed to fetch thumbnail from Stream:`, error);
      return new Response('Not Found', { status: 404 });
    }
  }

  // For other legacy paths (manifests, etc), proxy to Stream
  const streamDomain = env.STREAM_CUSTOMER_DOMAIN || 'customer-4c3uhd5qzuhwz9hu.cloudflarestream.com';
  const streamUrl = `https://${streamDomain}/${uid}/${subpath}`;

  try {
    return await fetch(streamUrl, {
      method: request.method,
      headers: request.headers
    });
  } catch (error) {
    return new Response('Not Found', { status: 404 });
  }
}

/**
 * Get home page HTML
 */
function getHomePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Divine Blossom Server</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      line-height: 1.6;
      color: #333;
    }
    h1 { color: #5a67d8; margin-bottom: 0.5rem; }
    h2 { color: #4a5568; margin-top: 2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
    code {
      background: #f7fafc;
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-size: 0.9em;
    }
    pre {
      background: #2d3748;
      color: #f7fafc;
      padding: 1rem;
      border-radius: 6px;
      overflow-x: auto;
    }
    .endpoint { margin: 1rem 0; }
    .method {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 3px;
      font-weight: bold;
      font-size: 0.85em;
      margin-right: 0.5rem;
    }
    .get { background: #48bb78; color: white; }
    .put { background: #ed8936; color: white; }
    .delete { background: #f56565; color: white; }
    .head { background: #4299e1; color: white; }
    a { color: #5a67d8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 12px;
      font-size: 0.75em;
      font-weight: 600;
      margin-left: 0.5rem;
    }
    .badge-new { background: #48bb78; color: white; }
    .badge-beta { background: #ed8936; color: white; }
  </style>
</head>
<body>
  <h1>Divine Blossom Server <span class="badge badge-beta">BETA</span></h1>
  <p>Content-addressable blob storage implementing the <a href="https://github.com/hzrd149/blossom" target="_blank">Blossom protocol</a> with AI-powered content moderation.</p>

  <h2>API Endpoints</h2>

  <div class="endpoint">
    <span class="method get">GET</span>
    <code>/{sha256}</code>
    <p>Retrieve a blob by its SHA-256 hash. Supports range requests for streaming.</p>
    <p><strong>Moderation:</strong> Age-restricted content requires Nostr authentication. Banned content returns HTTP 451.</p>
  </div>

  <div class="endpoint">
    <span class="method head">HEAD</span>
    <code>/{sha256}</code>
    <p>Check if a blob exists and get its metadata without downloading the content.</p>
  </div>

  <div class="endpoint">
    <span class="method put">PUT</span>
    <code>/upload</code>
    <p>Upload a new blob. Requires Nostr authentication (kind 24242).</p>
    <p><strong>Features:</strong> Automatic content moderation, ProofMode support for verified media.</p>
  </div>

  <div class="endpoint">
    <span class="method get">GET</span>
    <code>/list/{pubkey}</code>
    <p>List all blobs owned by a Nostr public key.</p>
  </div>

  <div class="endpoint">
    <span class="method delete">DELETE</span>
    <code>/{sha256}</code>
    <p>Delete a blob. Requires Nostr authentication and ownership.</p>
  </div>

  <h2>Content Moderation <span class="badge badge-new">NEW</span></h2>
  <p>All uploads are automatically analyzed by AI for harmful content:</p>
  <ul>
    <li><strong>SAFE:</strong> Serves without restrictions</li>
    <li><strong>REVIEW:</strong> Flagged for human review, serves normally</li>
    <li><strong>AGE_RESTRICTED:</strong> Requires Nostr auth + user content preferences (NIP-78)</li>
    <li><strong>PERMANENT_BAN:</strong> Never served (HTTP 451)</li>
  </ul>

  <h2>Authentication</h2>
  <p>Uses Nostr authentication via <strong>kind 24242</strong> events (Blossom protocol).</p>
  <p>Age-restricted content also checks NIP-78 user preferences for consent.</p>

  <h2>ProofMode Support</h2>
  <p>Upload media with cryptographic proof of authenticity using ProofMode headers:</p>
  <ul>
    <li><code>X-ProofMode-Manifest</code> - Photo/video metadata</li>
    <li><code>X-ProofMode-Signature</code> - Cryptographic signature</li>
    <li><code>X-ProofMode-Attestation</code> - Guardian Project attestation</li>
  </ul>

  <h2>Resources</h2>
  <ul>
    <li><a href="https://github.com/hzrd149/blossom" target="_blank">Blossom Protocol Specification</a></li>
    <li><a href="https://github.com/nostr-protocol/nips" target="_blank">Nostr NIPs</a></li>
    <li><a href="https://github.com/guardianproject/proofmode" target="_blank">ProofMode by Guardian Project</a></li>
  </ul>

  <footer style="margin-top: 3rem; padding-top: 2rem; border-top: 1px solid #e2e8f0; color: #718096; font-size: 0.9em;">
    <p>Powered by <a href="https://workers.cloudflare.com/" target="_blank">Cloudflare Workers</a> •
    Built with <a href="https://github.com/hzrd149/blossom-server-sdk" target="_blank">blossom-server-sdk</a></p>
  </footer>
</body>
</html>`;
}
