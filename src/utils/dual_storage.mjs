// ABOUTME: Utility for dual-storing videos in both Cloudflare Stream and R2
// ABOUTME: Enables instant MP4 serving from R2 while Stream processes HLS/thumbnails

/**
 * Store video data in both Stream and R2 for hybrid serving
 * @param {ArrayBuffer} videoBlob - The video data as ArrayBuffer
 * @param {string} sha256 - Pre-calculated SHA-256 hash of the video
 * @param {Object} env - Environment bindings (DIVINE_R2, STREAM_*, MEDIA_KV)
 * @param {Object} metadata - Video metadata (name, owner, etc.)
 * @param {Object} deps - Dependencies (fetch, now)
 * @returns {Promise<Object>} - { uid, streamSuccess, r2Success, urls }
 */
export async function dualStoreVideo(videoBlob, sha256, env, metadata = {}, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const now = deps.now || (() => Date.now());

  console.log(`🔄 DUAL STORE: Starting dual storage for SHA-256: ${sha256}`);

  const results = {
    uid: null,
    streamSuccess: false,
    r2Success: false,
    urls: {},
    errors: {}
  };

  // Step 1: Upload to Cloudflare Stream (for HLS/thumbnails)
  try {
    console.log(`🔄 DUAL STORE: Uploading to Stream for ${sha256}...`);
    const streamResult = await uploadToStream(videoBlob, sha256, env, metadata, fetchFn);
    results.uid = streamResult.uid;
    results.streamSuccess = streamResult.success;
    if (!streamResult.success) {
      results.errors.stream = streamResult.error;
      console.error(`❌ DUAL STORE: Stream upload failed for ${sha256}:`, streamResult.error);
    } else {
      console.log(`✅ DUAL STORE: Stream upload successful for ${sha256}, UID: ${streamResult.uid}`);
    }
  } catch (error) {
    console.error(`❌ DUAL STORE: Stream upload exception for ${sha256}:`, error);
    results.errors.stream = error.message;
  }

  // Step 2: Store in R2 (for instant MP4 serving)
  if (results.uid && env.R2_VIDEOS) {
    try {
      console.log(`🔄 DUAL STORE: Uploading to R2 for ${sha256}...`);
      const r2Result = await uploadToR2(videoBlob, sha256, env);
      results.r2Success = r2Result.success;
      if (!r2Result.success) {
        results.errors.r2 = r2Result.error;
        console.error(`❌ DUAL STORE: R2 upload failed for ${sha256}:`, r2Result.error);
      } else {
        console.log(`✅ DUAL STORE: R2 upload successful for ${sha256}`);
      }
    } catch (error) {
      console.error(`❌ DUAL STORE: R2 upload exception for ${sha256}:`, error);
      results.errors.r2 = error.message;
    }
  } else if (!env.R2_VIDEOS) {
    console.log(`⚠️ DUAL STORE: No R2 binding available, skipping R2 storage for ${sha256}`);
  } else if (!results.uid) {
    console.log(`⚠️ DUAL STORE: No Stream UID available, skipping R2 storage for ${sha256}`);
  }

  // Step 3: Generate URLs with hybrid routing
  if (results.uid) {
    results.urls = await generateHybridUrls(results.uid, sha256, env, results.r2Success);
  }

  // Step 4: Store metadata in KV
  if (results.uid && env.MEDIA_KV) {
    try {
      await storeVideoMetadata(results.uid, sha256, env, metadata, now(), results);
    } catch (error) {
      console.error(`❌ DUAL STORE: KV storage failed for ${sha256}:`, error);
      results.errors.kv = error.message;
    }
  }

  const successCount = [results.streamSuccess, results.r2Success].filter(Boolean).length;
  console.log(`🔄 DUAL STORE: Completed for ${sha256} - ${successCount}/2 stores successful`);

  return results;
}

/**
 * Upload video to Cloudflare Stream
 */
async function uploadToStream(videoBlob, sha256, env, metadata, fetchFn) {
  const accountId = env.STREAM_ACCOUNT_ID;
  const apiToken = env.STREAM_API_TOKEN;

  console.log(`🔄 DUAL STORE: Stream credentials check - Account ID: ${accountId ? 'present' : 'MISSING'}, API Token: ${apiToken ? 'present' : 'MISSING'}`);

  if (!accountId || !apiToken) {
    return { success: false, error: 'Missing Stream credentials' };
  }

  // Create direct upload URL
  const streamUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`;

  const requestBody = {
    maxDurationSeconds: 21600, // 6 hours max
    requireSignedURLs: false,
    allowedOrigins: ['*'],
    meta: {
      name: metadata.vineId || metadata.sha256 || 'migrated_video'
    }
  };

  console.log(`🔄 DUAL STORE: Stream API request to ${streamUrl}`);
  console.log(`🔄 DUAL STORE: Request body: ${JSON.stringify(requestBody, null, 2)}`);

  const createRes = await fetchFn(streamUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!createRes.ok) {
    const errorText = await createRes.text();
    return { success: false, error: `Stream API error: ${createRes.status} - ${errorText}` };
  }

  const createData = await createRes.json();
  const uploadURL = createData?.result?.uploadURL;
  const uid = createData?.result?.uid;

  if (!uploadURL || !uid) {
    return { success: false, error: 'Missing upload URL or UID from Stream' };
  }

  // Upload the blob using FormData (same as working batch migration)
  const formData = new FormData();
  const videoFile = new File([videoBlob], 'video.mp4', { type: 'video/mp4' });
  formData.append('file', videoFile);

  const uploadRes = await fetchFn(uploadURL, {
    method: 'POST',  // Changed from PUT to POST like working system
    body: formData   // Changed from raw blob to FormData
  });

  if (!uploadRes.ok) {
    return {
      success: false,
      error: `Stream upload failed: ${uploadRes.status}`,
      uid
    };
  }

  console.log(`✅ DUAL STORE: Stream upload successful for UID: ${uid}`);
  return { success: true, uid };
}

/**
 * Upload video to R2 bucket
 */
async function uploadToR2(videoBlob, sha256, env) {
  const r2Key = `videos/${sha256}.mp4`;

  try {
    await env.R2_VIDEOS.put(r2Key, videoBlob, {
      httpMetadata: {
        contentType: 'video/mp4',
        cacheControl: 'public, max-age=31536000' // 1 year cache
      },
      customMetadata: {
        sha256: sha256,
        uploadedAt: new Date().toISOString()
      }
    });

    console.log(`✅ DUAL STORE: R2 upload successful for key: ${r2Key}`);
    return { success: true };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Generate URLs with hybrid routing preference
 */
async function generateHybridUrls(uid, sha256, env, r2Available) {
  const { getHybridUrls } = await import('./stream_urls.mjs');
  return getHybridUrls(uid, sha256, env, r2Available);
}

/**
 * Store video metadata in KV with indexes
 */
async function storeVideoMetadata(uid, sha256, env, metadata, timestamp, results) {
  const record = {
    status: 'uploading', // Will be updated to 'ready' by webhook
    owner: metadata.owner || 'system',
    createdAt: timestamp,
    uploadedVia: 'dual_storage',
    sha256,
    size: metadata.size || null,
    streamSuccess: results.streamSuccess,
    r2Success: results.r2Success,
    ...metadata
  };

  // Store main video record
  await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify(record));

  // Store SHA-256 index
  await env.MEDIA_KV.put(`idx:sha256:${sha256}`, JSON.stringify({ uid }));

  // Store owner index if available
  if (record.owner && record.owner !== 'system') {
    await env.MEDIA_KV.put(`idx:pubkey:${record.owner}:${uid}`, '1');
  }

  console.log(`✅ DUAL STORE: KV metadata stored for UID: ${uid}, SHA-256: ${sha256}`);
}

/**
 * Fetch video from URL and calculate SHA-256
 * @param {string} sourceUrl - URL to fetch video from
 * @param {Object} deps - Dependencies (fetch)
 * @returns {Promise<Object>} - { blob, sha256, size }
 */
export async function fetchAndHash(sourceUrl, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;

  console.log(`🔄 DUAL STORE: Fetching video from: ${sourceUrl}`);

  const response = await fetchFn(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
  }

  const blob = await response.arrayBuffer();

  // Calculate SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', blob);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  console.log(`✅ DUAL STORE: Video fetched and hashed - Size: ${blob.byteLength}, SHA-256: ${sha256}`);

  return {
    blob,
    sha256,
    size: blob.byteLength
  };
}