// ABOUTME: R2-only storage utility for images and non-video blobs
// ABOUTME: Bypasses Cloudflare Stream entirely for instant image serving

/**
 * Store image directly in R2 with proper metadata
 * @param {ArrayBuffer} imageBlob - The image data as ArrayBuffer
 * @param {string} sha256 - Pre-calculated SHA-256 hash
 * @param {string} contentType - MIME type (image/jpeg, image/png, etc.)
 * @param {Object} env - Environment bindings (R2_VIDEOS, MEDIA_KV)
 * @param {Object} metadata - Image metadata (owner, filename, etc.)
 * @param {Object} deps - Dependencies (now)
 * @returns {Promise<Object>} - { success, sha256, urls, errors }
 */
export async function storeImageInR2(imageBlob, sha256, contentType, env, metadata = {}, deps = {}) {
  const now = deps.now || (() => Date.now());

  console.log(`📸 IMAGE STORE: Starting R2-only storage for SHA-256: ${sha256}, type: ${contentType}`);

  const results = {
    success: false,
    sha256,
    urls: {},
    errors: {}
  };

  // Validate environment
  if (!env.R2_VIDEOS) {
    results.errors.r2 = 'No R2 binding available';
    console.error('📸 IMAGE STORE: No R2_VIDEOS binding');
    return results;
  }

  if (!env.MEDIA_KV) {
    results.errors.kv = 'No KV binding available';
    console.error('📸 IMAGE STORE: No MEDIA_KV binding');
    return results;
  }

  // Determine file extension from content type
  const extension = getExtensionFromMimeType(contentType);
  const r2Key = `images/${sha256}${extension}`;

  try {
    // Store in R2 with proper metadata
    console.log(`📸 IMAGE STORE: Storing in R2 with key: ${r2Key}`);
    await env.R2_VIDEOS.put(r2Key, imageBlob, {
      httpMetadata: {
        contentType: contentType,
        cacheControl: 'public, max-age=31536000' // 1 year cache
      },
      customMetadata: {
        sha256: sha256,
        uploadedAt: new Date().toISOString(),
        type: 'image',
        originalContentType: contentType,
        size: imageBlob.byteLength.toString()
      }
    });

    console.log(`✅ IMAGE STORE: R2 upload successful for ${r2Key}`);

    // Store metadata in KV
    const record = {
      status: 'ready', // Images are ready immediately (no processing needed)
      type: 'image',
      contentType,
      owner: metadata.owner || 'system',
      createdAt: now(),
      uploadedVia: 'image_storage',
      sha256,
      size: imageBlob.byteLength,
      filename: metadata.filename || `image${extension}`,
      r2Key
    };

    await env.MEDIA_KV.put(`image:${sha256}`, JSON.stringify(record));
    console.log(`✅ IMAGE STORE: KV metadata stored for SHA-256: ${sha256}`);

    // Create SHA-256 index pointing to image record
    await env.MEDIA_KV.put(`idx:sha256:${sha256}`, JSON.stringify({
      sha256,
      type: 'image'
    }));

    // Create owner index if available
    if (record.owner && record.owner !== 'system') {
      await env.MEDIA_KV.put(`idx:pubkey:${record.owner}:image:${sha256}`, '1');
    }

    // Generate CDN URLs
    const cdnDomain = env.STREAM_DOMAIN || 'cdn.divine.video';
    results.urls = {
      url: `https://${cdnDomain}/${sha256}${extension}`,
      bareUrl: `https://${cdnDomain}/${sha256}`,
      r2DirectUrl: env.R2_PUBLIC_DOMAIN ? `https://${env.R2_PUBLIC_DOMAIN}/${r2Key}` : null
    };

    results.success = true;
    console.log(`✅ IMAGE STORE: Complete for ${sha256} - URLs generated`);

  } catch (error) {
    console.error(`❌ IMAGE STORE: Failed for ${sha256}:`, error);
    results.errors.storage = error.message;
  }

  return results;
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(contentType) {
  const mimeToExt = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff'
  };

  return mimeToExt[contentType.toLowerCase()] || '.jpg'; // Default to .jpg
}

/**
 * Check if a content type is an image
 */
export function isImageContentType(contentType) {
  if (!contentType) return false;
  return contentType.toLowerCase().startsWith('image/');
}

/**
 * Fetch image from URL and calculate SHA-256
 * @param {string} sourceUrl - URL to fetch image from
 * @param {Object} deps - Dependencies (fetch)
 * @returns {Promise<Object>} - { blob, sha256, size, contentType }
 */
export async function fetchAndHashImage(sourceUrl, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;

  console.log(`📸 IMAGE FETCH: Fetching image from: ${sourceUrl}`);

  const response = await fetchFn(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!isImageContentType(contentType)) {
    throw new Error(`Invalid content type for image: ${contentType}`);
  }

  const blob = await response.arrayBuffer();

  // Calculate SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', blob);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  console.log(`✅ IMAGE FETCH: Image fetched and hashed - Size: ${blob.byteLength}, SHA-256: ${sha256}, Type: ${contentType}`);

  return {
    blob,
    sha256,
    size: blob.byteLength,
    contentType
  };
}