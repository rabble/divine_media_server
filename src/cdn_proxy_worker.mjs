// ABOUTME: Hybrid CDN worker serving MP4s from R2 and HLS/thumbnails from Stream with performance optimizations
// ABOUTME: Deploy this as a separate Worker on cdn.divine.video with R2 binding

import { handleThumbnailRequest } from './utils/thumbnail_generator.mjs';

// Request coalescing Map to prevent duplicate R2 requests
const pendingRequests = new Map();

// In-memory cache with TTL for fast access
const memoryCache = new Map();
const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MEMORY_CACHE_MAX_SIZE = 100; // Max items in memory cache

// Rate limiting for R2 operations
let activeR2Requests = 0;
const MAX_CONCURRENT_R2_REQUESTS = 10;
const requestQueue = [];

// Monitoring counters
let totalRequests = 0;
let cacheHits = 0;
let memoryHits = 0;
let r2Hits = 0;
let rateLimitHits = 0;
let errors = 0;

// Clean up memory cache periodically
function cleanupMemoryCache() {
  const now = Date.now();
  for (const [key, value] of memoryCache.entries()) {
    if (now > value.expires) {
      memoryCache.delete(key);
    }
  }

  // If still too large, remove oldest entries
  if (memoryCache.size > MEMORY_CACHE_MAX_SIZE) {
    const entries = Array.from(memoryCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, memoryCache.size - MEMORY_CACHE_MAX_SIZE);
    toRemove.forEach(([key]) => memoryCache.delete(key));
  }
}

export default {
  async fetch(request, env) {
    totalRequests++;
    const startTime = Date.now();

    try {
      const url = new URL(request.url);
      const path = url.pathname + url.search;

      // Cleanup memory cache periodically (every 100 requests)
      if (totalRequests % 100 === 0) {
        cleanupMemoryCache();
      }

      // Handle Media Transformations requests (2025 feature)
      // Pattern: /cdn-cgi/media/mode=frame,time=1s,width=640,height=360/...
      if (path.startsWith('/cdn-cgi/media/')) {
        return await handleMediaTransformation(request, env, url);
      }

      // Handle Blossom-style SHA-256 hash requests: /<sha256> or /<sha256>.<ext>
      const blossomMatch = path.match(/^\/([a-f0-9]{64})(\.[\w]+)?$/);
      if (blossomMatch) {
        const sha256 = blossomMatch[1];
        const extension = blossomMatch[2] || '';

        console.log(`🔄 HYBRID CDN: Blossom request for ${sha256}${extension}`);

        // Serve from R2 (handles both videos and images)
        return await serveFromR2(sha256, env, url, request);
      }

      // Handle direct UID requests: /<uid> or /<uid>.mp4 (32-character hex)
      const uidMatch = path.match(/^\/([a-f0-9]{32})(\.mp4)?$/);
      if (uidMatch) {
        const uid = uidMatch[1];
        console.log(`🔄 HYBRID CDN: Direct UID request for ${uid}`);
        return await serveMP4ByUID(uid, env, url, request);
      }

      // Handle Vine-style URLs: /v/<vineID>
      const vineMatch = path.match(/^\/v\/([a-zA-Z0-9_-]+)$/);
      if (vineMatch) {
        const vineId = vineMatch[1];
        console.log(`🔄 HYBRID CDN: Vine URL request for vineID ${vineId}`);

        return await serveByVineId(vineId, env, url, request);
      }

      // Handle direct MP4 requests: /<uid>/downloads/default.mp4
      if (path.includes('/downloads/') && path.endsWith('.mp4')) {
        const uidMatch = path.match(/\/([a-f0-9]{32})\/downloads\//);
        if (uidMatch) {
          const uid = uidMatch[1];
          console.log(`🔄 HYBRID CDN: Direct MP4 request for UID ${uid}`);

          // Try to find SHA-256 for this UID and serve from R2
          return await serveMP4ByUID(uid, env, url, request);
        }
      }

      // Check if this is a thumbnail request
      if (path.includes('/thumbnails/')) {
        return await handleThumbnailRequest(url, env);
      }

      // Return 410 Gone for HLS/DASH manifest requests (Stream removed)
      if (path.includes('/manifest/video.m3u8') || path.includes('/manifest/video.mpd')) {
        return new Response(JSON.stringify({
          error: 'gone',
          reason: 'stream_removed',
          message: 'HLS/DASH streaming is no longer available. Cloudflare Stream has been removed. Please use direct MP4 URLs instead.',
          alternatives: {
            mp4: `https://${env.CDN_DOMAIN || 'cdn.divine.video'}/<sha256>.mp4`,
            note: 'Videos are now served directly from R2 storage as MP4 files'
          }
        }), {
          status: 410,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Default: proxy to Stream for remaining legacy requests
      return await proxyToStream(request, env, path);

    } catch (error) {
      errors++;
      console.error('🔄 HYBRID CDN ERROR:', error);
      const processingTime = Date.now() - startTime;

      const response = new Response(JSON.stringify({
        error: 'CDN proxy error',
        message: error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-CDN-Processing-Time': processingTime.toString(),
          'X-CDN-Error-Count': errors.toString(),
          'X-CDN-Active-R2': activeR2Requests.toString()
        }
      });
      addMonitoringHeaders(response);
      return response;
    }
  }
};

// Store response in memory cache
async function storeInMemoryCache(cacheKey, response) {
  try {
    const clonedResponse = response.clone();
    const body = await clonedResponse.arrayBuffer();
    const headers = {};
    for (const [key, value] of clonedResponse.headers) {
      headers[key] = value;
    }

    memoryCache.set(cacheKey, {
      body: body,
      status: clonedResponse.status,
      headers: headers,
      expires: Date.now() + MEMORY_CACHE_TTL,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Failed to store in memory cache:', error);
  }
}

// Add monitoring headers to response
function addMonitoringHeaders(response) {
  response.headers.set('X-CDN-Total-Requests', totalRequests.toString());
  response.headers.set('X-CDN-Cache-Hits', cacheHits.toString());
  response.headers.set('X-CDN-Memory-Hits', memoryHits.toString());
  response.headers.set('X-CDN-R2-Hits', r2Hits.toString());
  response.headers.set('X-CDN-Rate-Limit-Hits', rateLimitHits.toString());
  response.headers.set('X-CDN-Error-Count', errors.toString());
  response.headers.set('X-CDN-Active-R2', activeR2Requests.toString());
  response.headers.set('X-CDN-Queue-Size', requestQueue.length.toString());
  response.headers.set('X-CDN-Memory-Cache-Size', memoryCache.size.toString());
}

// Process the request queue
function processQueue() {
  if (requestQueue.length > 0 && activeR2Requests < MAX_CONCURRENT_R2_REQUESTS) {
    const nextRequest = requestQueue.shift();
    if (nextRequest) {
      // Clean up old queued requests (older than 15 seconds)
      const now = Date.now();
      if (now - nextRequest.timestamp > 15000) {
        nextRequest.reject();
        processQueue(); // Try the next one
      } else {
        nextRequest.resolve();
      }
    }
  }
}

// Serve file directly from R2 using SHA-256 hash (videos and images)
async function serveFromR2(sha256, env, url, request) {
  const cacheKey = `r2:${sha256}:${url.pathname}`;
  const startTime = Date.now();

  try {
    // 1. Check in-memory cache first (fastest)
    const memoryCached = memoryCache.get(cacheKey);
    if (memoryCached && Date.now() < memoryCached.expires) {
      memoryHits++;
      console.log(`⚡ HYBRID CDN: Memory cache HIT for ${sha256}`);
      const response = new Response(memoryCached.body, {
        status: memoryCached.status,
        headers: new Headers(memoryCached.headers)
      });
      response.headers.set('X-CDN-Cache-Status', 'memory-hit');
      response.headers.set('X-CDN-Processing-Time', (Date.now() - startTime).toString());
      addMonitoringHeaders(response);
      return response;
    }

    // 2. Check edge cache second
    const cache = caches.default;
    const edgeCacheKey = new Request(url.toString(), request);
    const cachedResponse = await cache.match(edgeCacheKey);

    if (cachedResponse) {
      cacheHits++;
      console.log(`⚡ HYBRID CDN: Edge cache HIT for ${sha256}`);

      // Store in memory cache for next time
      await storeInMemoryCache(cacheKey, cachedResponse);

      const response = cachedResponse.clone();
      response.headers.set('X-CDN-Cache-Status', 'edge-hit');
      response.headers.set('X-CDN-Processing-Time', (Date.now() - startTime).toString());
      addMonitoringHeaders(response);
      return response;
    }

    console.log(`🔄 HYBRID CDN: Cache MISS for ${sha256}, checking request coalescing...`);

    // 3. Check request coalescing to prevent duplicate R2 requests
    if (pendingRequests.has(cacheKey)) {
      console.log(`🔗 HYBRID CDN: Coalescing request for ${sha256}`);
      try {
        const pendingResponse = await pendingRequests.get(cacheKey);
        const response = pendingResponse.clone();
        response.headers.set('X-CDN-Cache-Status', 'coalesced');
        response.headers.set('X-CDN-Processing-Time', (Date.now() - startTime).toString());
        addMonitoringHeaders(response);
        return response;
      } catch (error) {
        console.error(`❌ HYBRID CDN: Coalesced request failed for ${sha256}:`, error);
        // Continue to normal flow
      }
    }

    // 4. Create a new request promise for coalescing
    const requestPromise = fetchFromR2WithRateLimit(sha256, env, url, request, startTime);
    pendingRequests.set(cacheKey, requestPromise);

    try {
      const response = await requestPromise;
      return response;
    } finally {
      pendingRequests.delete(cacheKey);
    }

  } catch (error) {
    errors++;
    console.error(`❌ HYBRID CDN: serveFromR2 error for ${sha256}:`, error);
    return await fallbackToStream(sha256, env, request);
  }
}

// Fetch from R2 with rate limiting and queue management
async function fetchFromR2WithRateLimit(sha256, env, url, request, startTime) {
  // Check if we have an R2 binding and the file exists
  if (!env.R2_VIDEOS) {
    console.log(`🔄 HYBRID CDN: No R2 binding, falling back to Stream for ${sha256}`);
    return await fallbackToStream(sha256, env, request);
  }

  // Rate limiting - check if we're at capacity
  if (activeR2Requests >= MAX_CONCURRENT_R2_REQUESTS) {
    rateLimitHits++;
    console.log(`⚠️ HYBRID CDN: Rate limit hit for ${sha256}, queueing request...`);

    // Add to queue and wait
    const queuePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Queue timeout'));
      }, 10000); // 10 second timeout

      requestQueue.push({
        resolve: () => {
          clearTimeout(timeoutId);
          resolve();
        },
        reject: () => {
          clearTimeout(timeoutId);
          reject(new Error('Queue rejected'));
        },
        timestamp: Date.now()
      });
    });

    try {
      await queuePromise;
    } catch (queueError) {
      console.error(`❌ HYBRID CDN: Queue error for ${sha256}:`, queueError);

      // Return 429 Too Many Requests with retry info
      const response = new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        message: 'Too many concurrent requests, please retry',
        retryAfter: 2
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '2',
          'Access-Control-Allow-Origin': '*',
          'X-CDN-Processing-Time': (Date.now() - startTime).toString(),
          'X-CDN-Queue-Size': requestQueue.length.toString()
        }
      });
      addMonitoringHeaders(response);
      return response;
    }
  }

  // Increment active request counter
  activeR2Requests++;
  console.log(`🔄 HYBRID CDN: Starting R2 request for ${sha256} (${activeR2Requests}/${MAX_CONCURRENT_R2_REQUESTS})`);

  try {
    return await actuallyFetchFromR2(sha256, env, url, request, startTime);
  } finally {
    // Decrement counter and process queue
    activeR2Requests--;
    processQueue();
  }
}

// Actually fetch from R2 (the original logic)
async function actuallyFetchFromR2(sha256, env, url, request, startTime) {
  try {
    r2Hits++;

    // Check if content is quarantined
    if (env.MODERATION_KV) {
      const quarantine = await env.MODERATION_KV.get(`quarantine:${sha256}`);
      if (quarantine) {
        console.log(`🚫 HYBRID CDN: Content ${sha256} is quarantined`);
        const response = new Response('Content unavailable due to content policy violation', {
          status: 451,  // HTTP 451 Unavailable For Legal Reasons
          headers: {
            'Content-Type': 'text/plain',
            'X-CDN-Processing-Time': (Date.now() - startTime).toString(),
            'X-CDN-Status': 'quarantined'
          }
        });
        addMonitoringHeaders(response);
        return response;
      }
    }

    // First check if this is an image
    const imageResult = await checkAndServeImage(sha256, env, url, request, startTime);
    if (imageResult) {
      return imageResult;
    }

    // Fall back to video serving
    // Try both paths: new format (sha256.mp4) and old format (videos/sha256.mp4)
    let r2Key = `${sha256}.mp4`;
    console.log(`🔄 HYBRID CDN: Checking R2 for video ${r2Key}`);

    // Check if Range header is present
    const range = request.headers.get('range');

    // Try new path first, then legacy path
    let r2Object = await env.R2_VIDEOS.get(r2Key);
    if (!r2Object) {
      r2Key = `videos/${sha256}.mp4`;
      console.log(`🔄 HYBRID CDN: Trying legacy path ${r2Key}`);
      r2Object = await env.R2_VIDEOS.get(r2Key);
    }

    if (r2Object) {
      if (range) {
        // Handle byte-range request
        console.log(`🔄 HYBRID CDN: Range request for ${sha256}.mp4: ${range}`);
        return await serveRangeFromR2(r2Key, range, env, url, sha256);
      } else {
        // Serve full file
        console.log(`✅ HYBRID CDN: Serving ${sha256}.mp4 from R2 instantly!`);

        const headers = new Headers({
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',  // Advertise byte-range support
          'Content-Length': r2Object.size,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
          'CF-Cache-Status': 'HIT', // Tell Cloudflare to cache
          'X-Content-Type-Options': 'nosniff',
          'ETag': `"${sha256}"`, // Use SHA as ETag for caching
          'X-CDN-Processing-Time': (Date.now() - startTime).toString(),
          'X-CDN-Cache-Status': 'r2-miss'
        });

        // Handle download vs inline
        if (url.searchParams.get('download') === 'true') {
          headers.set('Content-Disposition', `attachment; filename="${sha256}.mp4"`);
        } else {
          headers.set('Content-Disposition', `inline; filename="${sha256}.mp4"`);
        }

        // Create response
        const response = new Response(r2Object.body, {
          headers,
          cf: {
            cacheTtl: 31536000, // Cache for 1 year at edge
            cacheEverything: true // Override default caching rules
          }
        });

        addMonitoringHeaders(response);

        // Store in both edge cache and memory cache for next request
        const cache = caches.default;
        const edgeCacheKey = new Request(url.toString(), request);
        await cache.put(edgeCacheKey, response.clone());

        const memoryCacheKey = `r2:${sha256}:${url.pathname}`;
        await storeInMemoryCache(memoryCacheKey, response);

        return response;
      }
    }

    console.log(`❌ HYBRID CDN: ${sha256}.mp4 not found in R2, falling back to Stream`);
    return await fallbackToStream(sha256, env, request);

  } catch (error) {
    errors++;
    console.error(`❌ HYBRID CDN: R2 error for ${sha256}:`, error);
    return await fallbackToStream(sha256, env, request);
  }
}

// Serve MP4 by Vine ID (lookup UID, then get SHA-256)
async function serveByVineId(vineId, env, url, request) {
  try {
    if (!env.MEDIA_KV) {
      console.log(`❌ HYBRID CDN: No KV binding for vineID ${vineId}`);
      return new Response('Server misconfigured', { status: 500 });
    }

    // Look up UID by vine ID
    const vineData = await env.MEDIA_KV.get(`idx:vine:${vineId}`);
    if (!vineData) {
      console.log(`❌ HYBRID CDN: No video found for vineID ${vineId}`);
      return new Response('Not Found', { status: 404 });
    }

    const { uid } = JSON.parse(vineData);
    console.log(`🔄 HYBRID CDN: Found UID ${uid} for vineID ${vineId}`);

    // Now serve as MP4 by UID
    return await serveMP4ByUID(uid, env, url, request);

  } catch (error) {
    console.error(`❌ HYBRID CDN: Vine lookup error for ${vineId}:`, error);
    return new Response('Server Error', { status: 500 });
  }
}

// Serve MP4 by UID (convert to SHA-256 first)
async function serveMP4ByUID(uid, env, url, request) {
  try {
    // Look up video record to get SHA-256
    if (!env.MEDIA_KV) {
      console.log(`🔄 HYBRID CDN: No KV binding, proxying to Stream for UID ${uid}`);
      return await proxyToStreamUID(uid, env, request);
    }

    const videoData = await env.MEDIA_KV.get(`video:${uid}`);
    if (!videoData) {
      console.log(`❌ HYBRID CDN: No video record for UID ${uid}`);
      return new Response('Not Found', { status: 404 });
    }

    const video = JSON.parse(videoData);
    if (video.sha256) {
      console.log(`🔄 HYBRID CDN: Found SHA-256 ${video.sha256} for UID ${uid}, serving from R2`);
      return await serveFromR2(video.sha256, env, url, request);
    }

    console.log(`🔄 HYBRID CDN: No SHA-256 for UID ${uid}, proxying to Stream`);
    return await proxyToStreamUID(uid, env, request);

  } catch (error) {
    console.error(`❌ HYBRID CDN: KV error for UID ${uid}:`, error);
    return await proxyToStreamUID(uid, env, request);
  }
}

// Serve Blossom-style request (redirect to HLS)
async function serveBlossom(sha256, env) {
  try {
    if (!env.MEDIA_KV) {
      return new Response('Server misconfigured', { status: 500 });
    }

    // Look up UID by SHA-256
    const indexData = await env.MEDIA_KV.get(`idx:sha256:${sha256}`);
    if (!indexData) {
      return new Response('Not Found', { status: 404 });
    }

    const { uid } = JSON.parse(indexData);

    // Redirect to MP4 URL (will be served from R2)
    const cdnDomain = env.CDN_DOMAIN || 'cdn.divine.video';
    const mp4Url = `https://${cdnDomain}/${sha256}.mp4`;

    console.log(`🔄 HYBRID CDN: Redirecting Blossom ${sha256} to MP4 ${mp4Url}`);
    return Response.redirect(mp4Url, 302);

  } catch (error) {
    console.error(`❌ HYBRID CDN: Blossom error for ${sha256}:`, error);
    return new Response('Server Error', { status: 500 });
  }
}

// Fallback to Stream for SHA-256 requests
async function fallbackToStream(sha256, env, request) {
  try {
    if (!env.MEDIA_KV) {
      return new Response('Server misconfigured', { status: 500 });
    }

    // Look up UID by SHA-256
    const indexData = await env.MEDIA_KV.get(`idx:sha256:${sha256}`);
    if (!indexData) {
      return new Response('Not Found', { status: 404 });
    }

    const { uid } = JSON.parse(indexData);
    return await proxyToStreamUID(uid, env, request);

  } catch (error) {
    console.error(`❌ HYBRID CDN: Fallback error for ${sha256}:`, error);
    return new Response('Server Error', { status: 500 });
  }
}

// Proxy specific UID to Stream MP4
async function proxyToStreamUID(uid, env, request) {
  const startTime = Date.now();
  const streamDomain = env.STREAM_CUSTOMER_DOMAIN || 'customer-4c3uhd5qzuhwz9hu.cloudflarestream.com';
  const streamUrl = `https://${streamDomain}/${uid}/downloads/default.mp4`;

  console.log(`🔄 HYBRID CDN: Proxying UID ${uid} to Stream: ${streamUrl}`);

  // Forward the Range header if present
  const headers = new Headers();
  const range = request.headers.get('range');
  if (range) {
    headers.set('Range', range);
    console.log(`🔄 HYBRID CDN: Forwarding Range header: ${range}`);
  }

  const response = await fetch(streamUrl, { headers });
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Content-Type', 'video/mp4');

  // Ensure Accept-Ranges is set
  if (!responseHeaders.has('Accept-Ranges')) {
    responseHeaders.set('Accept-Ranges', 'bytes');
  }

  const finalResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });

  finalResponse.headers.set('X-CDN-Processing-Time', (Date.now() - startTime).toString());
  finalResponse.headers.set('X-CDN-Cache-Status', 'stream-proxy');
  addMonitoringHeaders(finalResponse);

  return finalResponse;
}

// Check and serve image from R2 if available
async function checkAndServeImage(sha256, env, url, request, startTime = Date.now()) {
  try {
    if (!env.MEDIA_KV) {
      return null;
    }

    // Check if this SHA-256 is an image
    const indexData = await env.MEDIA_KV.get(`idx:sha256:${sha256}`);
    if (!indexData) {
      return null;
    }

    const index = JSON.parse(indexData);
    if (index.type !== 'image') {
      return null;
    }

    // Get image metadata
    const imageData = await env.MEDIA_KV.get(`image:${sha256}`);
    if (!imageData) {
      return null;
    }

    const image = JSON.parse(imageData);
    const r2Key = image.r2Key || `images/${sha256}${getExtensionFromMimeType(image.contentType)}`;

    console.log(`📸 HYBRID CDN: Checking R2 for image ${r2Key}`);

    const r2Object = await env.R2_VIDEOS.get(r2Key);
    if (r2Object) {
      console.log(`✅ HYBRID CDN: Serving image ${sha256} from R2 instantly!`);

      const headers = new Headers({
        'Content-Type': image.contentType || 'image/jpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        'X-CDN-Processing-Time': (Date.now() - startTime).toString(),
        'X-CDN-Cache-Status': 'r2-image-hit'
      });

      // Handle download vs inline
      const extension = getExtensionFromMimeType(image.contentType);
      if (url.searchParams.get('download') === 'true') {
        headers.set('Content-Disposition', `attachment; filename="${sha256}${extension}"`);
      } else {
        headers.set('Content-Disposition', `inline; filename="${sha256}${extension}"`);
      }

      const response = new Response(r2Object.body, { headers });
      addMonitoringHeaders(response);

      // Store in memory cache
      const memoryCacheKey = `r2:${sha256}:${url.pathname}`;
      await storeInMemoryCache(memoryCacheKey, response);

      return response;
    }

    console.log(`❌ HYBRID CDN: Image ${sha256} not found in R2`);
    return null;

  } catch (error) {
    console.error(`❌ HYBRID CDN: Error checking image for ${sha256}:`, error);
    return null;
  }
}

// Handle byte-range requests for R2 objects
async function serveRangeFromR2(r2Key, rangeHeader, env, url, sha256) {
  const startTime = Date.now();
  try {
    // Parse the Range header (e.g., "bytes=0-1023")
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      return new Response('Invalid Range header', { status: 400 });
    }

    const start = parseInt(match[1], 10);

    // First get object info to know the total size
    const r2Object = await env.R2_VIDEOS.head(r2Key);
    if (!r2Object) {
      return new Response('Not Found', { status: 404 });
    }

    const totalSize = r2Object.size;
    const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

    // Validate range
    if (start >= totalSize || end >= totalSize || start > end) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: {
          'Content-Range': `bytes */${totalSize}`
        }
      });
    }

    // Get the specific byte range from R2
    const rangeObject = await env.R2_VIDEOS.get(r2Key, {
      range: { offset: start, length: (end - start) + 1 }
    });

    if (!rangeObject) {
      return new Response('Not Found', { status: 404 });
    }

    const contentLength = (end - start) + 1;

    console.log(`✅ HYBRID CDN: Serving range ${start}-${end}/${totalSize} for ${sha256}.mp4`);

    const headers = new Headers({
      'Content-Type': 'video/mp4',
      'Content-Length': contentLength,
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=31536000',
      'X-CDN-Processing-Time': (Date.now() - startTime).toString(),
      'X-CDN-Cache-Status': 'r2-range-hit'
    });

    // Handle download vs inline
    if (url.searchParams.get('download') === 'true') {
      headers.set('Content-Disposition', `attachment; filename="${sha256}.mp4"`);
    } else {
      headers.set('Content-Disposition', `inline; filename="${sha256}.mp4"`);
    }

    const response = new Response(rangeObject.body, {
      status: 206,  // Partial Content
      headers
    });

    addMonitoringHeaders(response);
    return response;

  } catch (error) {
    errors++;
    console.error(`❌ HYBRID CDN: Range request error for ${r2Key}:`, error);
    const response = new Response('Range request failed', {
      status: 500,
      headers: {
        'X-CDN-Processing-Time': (Date.now() - startTime).toString(),
        'X-CDN-Error-Count': errors.toString()
      }
    });
    addMonitoringHeaders(response);
    return response;
  }
}

// Get file extension from MIME type
function getExtensionFromMimeType(contentType) {
  if (!contentType) return '.jpg';

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

  return mimeToExt[contentType.toLowerCase()] || '.jpg';
}

// Handle Media Transformations requests (Cloudflare 2025 feature)
async function handleMediaTransformation(request, env, url) {
  try {
    const path = url.pathname;
    console.log(`🎬 Media Transformations request: ${path}`);

    // Parse the transformation parameters and target path
    // Pattern: /cdn-cgi/media/mode=frame,time=1s,width=640,height=360/<target_path>
    const transformMatch = path.match(/^\/cdn-cgi\/media\/([^\/]+)\/(.+)$/);
    if (!transformMatch) {
      return new Response('Invalid Media Transformations URL', { status: 400 });
    }

    const [, params, targetPath] = transformMatch;
    const paramMap = {};

    // Parse comma-separated parameters
    params.split(',').forEach(param => {
      const [key, value] = param.split('=');
      paramMap[key] = value;
    });

    console.log(`📊 Transform params:`, paramMap);
    console.log(`🎯 Target path: ${targetPath}`);

    // For frame extraction from videos in R2
    if (paramMap.mode === 'frame' && targetPath.match(/^([a-f0-9]{64})\.mp4$/)) {
      const sha256 = targetPath.slice(0, -4);

      // Check if we already have a cached thumbnail
      const thumbnailKey = `thumbnails/${sha256}.jpg`;
      const cachedThumbnail = await env.R2_VIDEOS.get(thumbnailKey);

      if (cachedThumbnail) {
        console.log(`✅ Serving cached thumbnail for ${sha256}`);
        return new Response(cachedThumbnail.body, {
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Thumbnail-Status': 'cached-media-transform'
          }
        });
      }

      // Generate thumbnail using Media Transformations
      const videoUrl = `https://cdn.divine.video/${targetPath}`;
      const transformUrl = new URL(url.origin + path);

      // Fetch the transformed frame
      const frameResponse = await fetch(transformUrl, {
        cf: {
          // Enable Media Transformations
          mediaTransform: true,
          image: {
            width: parseInt(paramMap.width) || 640,
            height: parseInt(paramMap.height) || 360,
            fit: paramMap.fit || 'cover',
            quality: 80,
            format: 'jpeg'
          }
        }
      });

      if (frameResponse.ok) {
        const frameData = await frameResponse.arrayBuffer();

        // Cache the generated thumbnail
        await env.R2_VIDEOS.put(thumbnailKey, frameData, {
          httpMetadata: {
            contentType: 'image/jpeg'
          },
          customMetadata: {
            sha256,
            generatedAt: new Date().toISOString(),
            method: 'media-transformations'
          }
        });

        console.log(`✅ Generated and cached thumbnail using Media Transformations`);

        return new Response(frameData, {
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Thumbnail-Status': 'generated-media-transform'
          }
        });
      }
    }

    // For other Media Transformations, proxy the request
    return await fetch(url.origin + path, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      cf: {
        mediaTransform: true
      }
    });

  } catch (error) {
    errors++;
    console.error('❌ Media Transformations error:', error);
    const response = new Response('Media Transformations failed', {
      status: 500,
      headers: {
        'X-Error': error.message,
        'X-CDN-Error-Count': errors.toString()
      }
    });
    addMonitoringHeaders(response);
    return response;
  }
}

// Default proxy to Stream for HLS, thumbnails, etc.
async function proxyToStream(request, env, path) {
  const streamDomain = env.STREAM_CUSTOMER_DOMAIN || 'customer-4c3uhd5qzuhwz9hu.cloudflarestream.com';
  const streamUrl = `https://${streamDomain}${path}`;

  const headers = new Headers(request.headers);
  headers.delete('Host');

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method);

  const response = await fetch(streamUrl, {
    method: request.method,
    headers: headers,
    body: hasBody ? request.body : undefined
  });

  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type');

  const finalResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });

  finalResponse.headers.set('X-CDN-Cache-Status', 'stream-default-proxy');
  addMonitoringHeaders(finalResponse);

  return finalResponse;
}