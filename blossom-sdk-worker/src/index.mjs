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

  // For GET requests, stream the blob
  const blob = await blobStorage.readBlob(sha256);
  if (!blob) {
    return new Response('Not Found', { status: 404 });
  }

  // Support HTTP range requests for video streaming
  const range = req.headers.get('range');
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : blob.size - 1;
    const chunksize = (end - start) + 1;

    const headers = new Headers();
    headers.set('Content-Type', blob.type || 'application/octet-stream');
    headers.set('Content-Range', `bytes ${start}-${end}/${blob.size}`);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', chunksize.toString());
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

  // Regular GET request
  const headers = new Headers();
  headers.set('Content-Type', blob.type || 'application/octet-stream');
  headers.set('Content-Length', blob.size.toString());
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

  // Validate ProofMode (doesn't block upload)
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
