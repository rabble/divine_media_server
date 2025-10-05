var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-8SelOJ/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// src/utils/thumbnail_generator.mjs
async function generateAndCacheThumbnail(sha256, uid, env) {
  const thumbnailKey = `thumbnails/${sha256}.jpg`;
  const existingThumbnail = await env.R2_VIDEOS.get(thumbnailKey);
  if (existingThumbnail) {
    console.log(`\u{1F4F8} Thumbnail cache HIT for ${sha256}`);
    return new Response(existingThumbnail.body, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": `"thumb-${sha256}"`,
        "X-Thumbnail-Status": "cached"
      }
    });
  }
  console.log(`\u{1F4F8} Thumbnail cache MISS for ${sha256}, generating...`);
  try {
    const videoUrl = `https://cdn.divine.video/${sha256}.mp4`;
    const thumbnail = await generateWithExternalService(videoUrl, env);
    if (thumbnail) {
      await env.R2_VIDEOS.put(thumbnailKey, thumbnail, {
        httpMetadata: {
          contentType: "image/jpeg"
        },
        customMetadata: {
          sha256,
          uid,
          generatedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
      console.log(`\u2705 Thumbnail generated and cached for ${sha256}`);
      return new Response(thumbnail, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
          "ETag": `"thumb-${sha256}"`,
          "X-Thumbnail-Status": "generated"
        }
      });
    }
  } catch (error) {
    console.error(`\u274C Thumbnail generation failed for ${sha256}:`, error);
  }
  return servePlaceholderThumbnail(sha256);
}
__name(generateAndCacheThumbnail, "generateAndCacheThumbnail");
async function generateWithExternalService(videoUrl, env) {
  try {
    console.log(`\u{1F4F8} Using Cloudflare Media Transformations to extract frame from ${videoUrl}`);
    const mediaTransformUrl = new URL(videoUrl);
    const transformPath = `/cdn-cgi/media/mode=frame,time=1s,width=640,height=360,fit=cover${mediaTransformUrl.pathname}`;
    mediaTransformUrl.pathname = transformPath;
    console.log(`\u{1F504} Media Transform URL: ${mediaTransformUrl.toString()}`);
    const response = await fetch(mediaTransformUrl.toString(), {
      headers: {
        "Accept": "image/jpeg,image/png,image/*"
      }
    });
    if (response.ok) {
      console.log(`\u2705 Successfully extracted frame using Media Transformations`);
      const imageData = await response.arrayBuffer();
      if (imageData.byteLength > 0) {
        return imageData;
      }
    } else {
      console.error(`\u274C Media Transformations returned ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Media Transformations failed:", error);
  }
  try {
    console.log(`\u{1F4F8} Fallback: Trying Cloudflare Image Resizing API`);
    const imageResponse = await fetch(videoUrl, {
      cf: {
        image: {
          width: 640,
          height: 360,
          fit: "cover",
          quality: 80,
          format: "jpeg"
        }
      }
    });
    if (imageResponse.ok) {
      console.log(`\u2705 Image Resizing API succeeded`);
      return await imageResponse.arrayBuffer();
    }
  } catch (error) {
    console.error("Image Resizing API failed:", error);
  }
  if (env.THUMBNAIL_SERVICE_URL) {
    try {
      console.log(`\u{1F4F8} Final fallback: External thumbnail service`);
      const response = await fetch(env.THUMBNAIL_SERVICE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.THUMBNAIL_SERVICE_KEY}`
        },
        body: JSON.stringify({
          video_url: videoUrl,
          time: "00:00:01",
          width: 640,
          height: 360
        })
      });
      if (response.ok) {
        return await response.arrayBuffer();
      }
    } catch (error) {
      console.error("External thumbnail service failed:", error);
    }
  }
  return null;
}
__name(generateWithExternalService, "generateWithExternalService");
function servePlaceholderThumbnail(sha256) {
  const svg = `
    <svg width="640" height="360" xmlns="http://www.w3.org/2000/svg">
      <rect width="640" height="360" fill="#1a1a1a"/>
      <circle cx="320" cy="180" r="50" fill="none" stroke="#333" stroke-width="3"/>
      <polygon points="305,160 305,200 345,180" fill="#333"/>
      <text x="320" y="250" text-anchor="middle" fill="#555" font-family="system-ui" font-size="14">
        Video Thumbnail
      </text>
      <text x="320" y="270" text-anchor="middle" fill="#444" font-family="monospace" font-size="10">
        ${sha256.substring(0, 16)}...
      </text>
    </svg>
  `.trim();
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
      // Cache placeholder for 1 hour
      "X-Thumbnail-Status": "placeholder"
    }
  });
}
__name(servePlaceholderThumbnail, "servePlaceholderThumbnail");
async function handleThumbnailRequest(url, env) {
  const pathMatch = url.pathname.match(/\/([a-f0-9-_]+)\/thumbnails\/thumbnail\.(jpg|gif)$/);
  if (!pathMatch) {
    return servePlaceholderThumbnail("unknown");
  }
  const uid = pathMatch[1];
  if (uid.startsWith("r2_")) {
    const videoData = await env.MEDIA_KV.get(`video:${uid}`);
    if (videoData) {
      const video = JSON.parse(videoData);
      if (video.sha256) {
        return await generateAndCacheThumbnail(video.sha256, uid, env);
      }
    }
  }
  if (!uid.startsWith("r2_")) {
    const streamDomain = env.STREAM_CUSTOMER_DOMAIN || "customer-4c3uhd5qzuhwz9hu.cloudflarestream.com";
    const streamUrl = `https://${streamDomain}${url.pathname}`;
    try {
      const response = await fetch(streamUrl);
      if (response.ok) {
        return response;
      }
    } catch (error) {
      console.error("Stream thumbnail fetch failed:", error);
    }
  }
  return servePlaceholderThumbnail(uid);
}
__name(handleThumbnailRequest, "handleThumbnailRequest");

// src/cdn_proxy_worker.mjs
var pendingRequests = /* @__PURE__ */ new Map();
var memoryCache = /* @__PURE__ */ new Map();
var MEMORY_CACHE_TTL = 5 * 60 * 1e3;
var MEMORY_CACHE_MAX_SIZE = 100;
var activeR2Requests = 0;
var MAX_CONCURRENT_R2_REQUESTS = 10;
var requestQueue = [];
var totalRequests = 0;
var cacheHits = 0;
var memoryHits = 0;
var r2Hits = 0;
var rateLimitHits = 0;
var errors = 0;
function cleanupMemoryCache() {
  const now = Date.now();
  for (const [key, value] of memoryCache.entries()) {
    if (now > value.expires) {
      memoryCache.delete(key);
    }
  }
  if (memoryCache.size > MEMORY_CACHE_MAX_SIZE) {
    const entries = Array.from(memoryCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, memoryCache.size - MEMORY_CACHE_MAX_SIZE);
    toRemove.forEach(([key]) => memoryCache.delete(key));
  }
}
__name(cleanupMemoryCache, "cleanupMemoryCache");
var cdn_proxy_worker_default = {
  async fetch(request, env) {
    totalRequests++;
    const startTime = Date.now();
    try {
      const url = new URL(request.url);
      const path = url.pathname + url.search;
      if (totalRequests % 100 === 0) {
        cleanupMemoryCache();
      }
      if (path.startsWith("/cdn-cgi/media/")) {
        return await handleMediaTransformation(request, env, url);
      }
      const blossomMatch = path.match(/^\/([a-f0-9]{64})(\.[\w]+)?$/);
      if (blossomMatch) {
        const sha256 = blossomMatch[1];
        const extension = blossomMatch[2] || "";
        console.log(`\u{1F504} HYBRID CDN: Blossom request for ${sha256}${extension}`);
        return await serveFromR2(sha256, env, url, request);
      }
      const vineMatch = path.match(/^\/v\/([a-zA-Z0-9_-]+)$/);
      if (vineMatch) {
        const vineId = vineMatch[1];
        console.log(`\u{1F504} HYBRID CDN: Vine URL request for vineID ${vineId}`);
        return await serveByVineId(vineId, env, url, request);
      }
      if (path.includes("/downloads/") && path.endsWith(".mp4")) {
        const uidMatch = path.match(/\/([a-f0-9]{32})\/downloads\//);
        if (uidMatch) {
          const uid = uidMatch[1];
          console.log(`\u{1F504} HYBRID CDN: Direct MP4 request for UID ${uid}`);
          return await serveMP4ByUID(uid, env, url, request);
        }
      }
      if (path.includes("/thumbnails/")) {
        return await handleThumbnailRequest(url, env);
      }
      return await proxyToStream(request, env, path);
    } catch (error) {
      errors++;
      console.error("\u{1F504} HYBRID CDN ERROR:", error);
      const processingTime = Date.now() - startTime;
      const response = new Response(JSON.stringify({
        error: "CDN proxy error",
        message: error.message
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "X-CDN-Processing-Time": processingTime.toString(),
          "X-CDN-Error-Count": errors.toString(),
          "X-CDN-Active-R2": activeR2Requests.toString()
        }
      });
      addMonitoringHeaders(response);
      return response;
    }
  }
};
async function storeInMemoryCache(cacheKey, response) {
  try {
    const clonedResponse = response.clone();
    const body = await clonedResponse.arrayBuffer();
    const headers = {};
    for (const [key, value] of clonedResponse.headers) {
      headers[key] = value;
    }
    memoryCache.set(cacheKey, {
      body,
      status: clonedResponse.status,
      headers,
      expires: Date.now() + MEMORY_CACHE_TTL,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error("Failed to store in memory cache:", error);
  }
}
__name(storeInMemoryCache, "storeInMemoryCache");
function addMonitoringHeaders(response) {
  response.headers.set("X-CDN-Total-Requests", totalRequests.toString());
  response.headers.set("X-CDN-Cache-Hits", cacheHits.toString());
  response.headers.set("X-CDN-Memory-Hits", memoryHits.toString());
  response.headers.set("X-CDN-R2-Hits", r2Hits.toString());
  response.headers.set("X-CDN-Rate-Limit-Hits", rateLimitHits.toString());
  response.headers.set("X-CDN-Error-Count", errors.toString());
  response.headers.set("X-CDN-Active-R2", activeR2Requests.toString());
  response.headers.set("X-CDN-Queue-Size", requestQueue.length.toString());
  response.headers.set("X-CDN-Memory-Cache-Size", memoryCache.size.toString());
}
__name(addMonitoringHeaders, "addMonitoringHeaders");
function processQueue() {
  if (requestQueue.length > 0 && activeR2Requests < MAX_CONCURRENT_R2_REQUESTS) {
    const nextRequest = requestQueue.shift();
    if (nextRequest) {
      const now = Date.now();
      if (now - nextRequest.timestamp > 15e3) {
        nextRequest.reject();
        processQueue();
      } else {
        nextRequest.resolve();
      }
    }
  }
}
__name(processQueue, "processQueue");
async function serveFromR2(sha256, env, url, request) {
  const cacheKey = `r2:${sha256}:${url.pathname}`;
  const startTime = Date.now();
  try {
    const memoryCached = memoryCache.get(cacheKey);
    if (memoryCached && Date.now() < memoryCached.expires) {
      memoryHits++;
      console.log(`\u26A1 HYBRID CDN: Memory cache HIT for ${sha256}`);
      const response = new Response(memoryCached.body, {
        status: memoryCached.status,
        headers: new Headers(memoryCached.headers)
      });
      response.headers.set("X-CDN-Cache-Status", "memory-hit");
      response.headers.set("X-CDN-Processing-Time", (Date.now() - startTime).toString());
      addMonitoringHeaders(response);
      return response;
    }
    const cache = caches.default;
    const edgeCacheKey = new Request(url.toString(), request);
    const cachedResponse = await cache.match(edgeCacheKey);
    if (cachedResponse) {
      cacheHits++;
      console.log(`\u26A1 HYBRID CDN: Edge cache HIT for ${sha256}`);
      await storeInMemoryCache(cacheKey, cachedResponse);
      const response = cachedResponse.clone();
      response.headers.set("X-CDN-Cache-Status", "edge-hit");
      response.headers.set("X-CDN-Processing-Time", (Date.now() - startTime).toString());
      addMonitoringHeaders(response);
      return response;
    }
    console.log(`\u{1F504} HYBRID CDN: Cache MISS for ${sha256}, checking request coalescing...`);
    if (pendingRequests.has(cacheKey)) {
      console.log(`\u{1F517} HYBRID CDN: Coalescing request for ${sha256}`);
      try {
        const pendingResponse = await pendingRequests.get(cacheKey);
        const response = pendingResponse.clone();
        response.headers.set("X-CDN-Cache-Status", "coalesced");
        response.headers.set("X-CDN-Processing-Time", (Date.now() - startTime).toString());
        addMonitoringHeaders(response);
        return response;
      } catch (error) {
        console.error(`\u274C HYBRID CDN: Coalesced request failed for ${sha256}:`, error);
      }
    }
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
    console.error(`\u274C HYBRID CDN: serveFromR2 error for ${sha256}:`, error);
    return await fallbackToStream(sha256, env, request);
  }
}
__name(serveFromR2, "serveFromR2");
async function fetchFromR2WithRateLimit(sha256, env, url, request, startTime) {
  if (!env.R2_VIDEOS) {
    console.log(`\u{1F504} HYBRID CDN: No R2 binding, falling back to Stream for ${sha256}`);
    return await fallbackToStream(sha256, env, request);
  }
  if (activeR2Requests >= MAX_CONCURRENT_R2_REQUESTS) {
    rateLimitHits++;
    console.log(`\u26A0\uFE0F HYBRID CDN: Rate limit hit for ${sha256}, queueing request...`);
    const queuePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Queue timeout"));
      }, 1e4);
      requestQueue.push({
        resolve: /* @__PURE__ */ __name(() => {
          clearTimeout(timeoutId);
          resolve();
        }, "resolve"),
        reject: /* @__PURE__ */ __name(() => {
          clearTimeout(timeoutId);
          reject(new Error("Queue rejected"));
        }, "reject"),
        timestamp: Date.now()
      });
    });
    try {
      await queuePromise;
    } catch (queueError) {
      console.error(`\u274C HYBRID CDN: Queue error for ${sha256}:`, queueError);
      const response = new Response(JSON.stringify({
        error: "Rate limit exceeded",
        message: "Too many concurrent requests, please retry",
        retryAfter: 2
      }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "2",
          "Access-Control-Allow-Origin": "*",
          "X-CDN-Processing-Time": (Date.now() - startTime).toString(),
          "X-CDN-Queue-Size": requestQueue.length.toString()
        }
      });
      addMonitoringHeaders(response);
      return response;
    }
  }
  activeR2Requests++;
  console.log(`\u{1F504} HYBRID CDN: Starting R2 request for ${sha256} (${activeR2Requests}/${MAX_CONCURRENT_R2_REQUESTS})`);
  try {
    return await actuallyFetchFromR2(sha256, env, url, request, startTime);
  } finally {
    activeR2Requests--;
    processQueue();
  }
}
__name(fetchFromR2WithRateLimit, "fetchFromR2WithRateLimit");
async function actuallyFetchFromR2(sha256, env, url, request, startTime) {
  try {
    r2Hits++;
    if (env.MODERATION_KV) {
      const quarantine = await env.MODERATION_KV.get(`quarantine:${sha256}`);
      if (quarantine) {
        console.log(`\u{1F6AB} HYBRID CDN: Content ${sha256} is quarantined`);
        const response = new Response("Content unavailable due to content policy violation", {
          status: 451,
          // HTTP 451 Unavailable For Legal Reasons
          headers: {
            "Content-Type": "text/plain",
            "X-CDN-Processing-Time": (Date.now() - startTime).toString(),
            "X-CDN-Status": "quarantined"
          }
        });
        addMonitoringHeaders(response);
        return response;
      }
    }
    const imageResult = await checkAndServeImage(sha256, env, url, request, startTime);
    if (imageResult) {
      return imageResult;
    }
    let r2Key = `${sha256}.mp4`;
    console.log(`\u{1F504} HYBRID CDN: Checking R2 for video ${r2Key}`);
    const range = request.headers.get("range");
    let r2Object = await env.R2_VIDEOS.get(r2Key);
    if (!r2Object) {
      r2Key = `videos/${sha256}.mp4`;
      console.log(`\u{1F504} HYBRID CDN: Trying legacy path ${r2Key}`);
      r2Object = await env.R2_VIDEOS.get(r2Key);
    }
    if (r2Object) {
      if (range) {
        console.log(`\u{1F504} HYBRID CDN: Range request for ${sha256}.mp4: ${range}`);
        return await serveRangeFromR2(r2Key, range, env, url, sha256);
      } else {
        console.log(`\u2705 HYBRID CDN: Serving ${sha256}.mp4 from R2 instantly!`);
        const headers = new Headers({
          "Content-Type": "video/mp4",
          "Accept-Ranges": "bytes",
          // Advertise byte-range support
          "Content-Length": r2Object.size,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=31536000, immutable",
          // Cache for 1 year
          "CF-Cache-Status": "HIT",
          // Tell Cloudflare to cache
          "X-Content-Type-Options": "nosniff",
          "ETag": `"${sha256}"`,
          // Use SHA as ETag for caching
          "X-CDN-Processing-Time": (Date.now() - startTime).toString(),
          "X-CDN-Cache-Status": "r2-miss"
        });
        if (url.searchParams.get("download") === "true") {
          headers.set("Content-Disposition", `attachment; filename="${sha256}.mp4"`);
        } else {
          headers.set("Content-Disposition", `inline; filename="${sha256}.mp4"`);
        }
        const response = new Response(r2Object.body, {
          headers,
          cf: {
            cacheTtl: 31536e3,
            // Cache for 1 year at edge
            cacheEverything: true
            // Override default caching rules
          }
        });
        addMonitoringHeaders(response);
        const cache = caches.default;
        const edgeCacheKey = new Request(url.toString(), request);
        await cache.put(edgeCacheKey, response.clone());
        const memoryCacheKey = `r2:${sha256}:${url.pathname}`;
        await storeInMemoryCache(memoryCacheKey, response);
        return response;
      }
    }
    console.log(`\u274C HYBRID CDN: ${sha256}.mp4 not found in R2, falling back to Stream`);
    return await fallbackToStream(sha256, env, request);
  } catch (error) {
    errors++;
    console.error(`\u274C HYBRID CDN: R2 error for ${sha256}:`, error);
    return await fallbackToStream(sha256, env, request);
  }
}
__name(actuallyFetchFromR2, "actuallyFetchFromR2");
async function serveByVineId(vineId, env, url, request) {
  try {
    if (!env.MEDIA_KV) {
      console.log(`\u274C HYBRID CDN: No KV binding for vineID ${vineId}`);
      return new Response("Server misconfigured", { status: 500 });
    }
    const vineData = await env.MEDIA_KV.get(`idx:vine:${vineId}`);
    if (!vineData) {
      console.log(`\u274C HYBRID CDN: No video found for vineID ${vineId}`);
      return new Response("Not Found", { status: 404 });
    }
    const { uid } = JSON.parse(vineData);
    console.log(`\u{1F504} HYBRID CDN: Found UID ${uid} for vineID ${vineId}`);
    return await serveMP4ByUID(uid, env, url, request);
  } catch (error) {
    console.error(`\u274C HYBRID CDN: Vine lookup error for ${vineId}:`, error);
    return new Response("Server Error", { status: 500 });
  }
}
__name(serveByVineId, "serveByVineId");
async function serveMP4ByUID(uid, env, url, request) {
  try {
    if (!env.MEDIA_KV) {
      console.log(`\u{1F504} HYBRID CDN: No KV binding, proxying to Stream for UID ${uid}`);
      return await proxyToStreamUID(uid, env, request);
    }
    const videoData = await env.MEDIA_KV.get(`video:${uid}`);
    if (!videoData) {
      console.log(`\u274C HYBRID CDN: No video record for UID ${uid}`);
      return new Response("Not Found", { status: 404 });
    }
    const video = JSON.parse(videoData);
    if (video.sha256) {
      console.log(`\u{1F504} HYBRID CDN: Found SHA-256 ${video.sha256} for UID ${uid}, serving from R2`);
      return await serveFromR2(video.sha256, env, url, request);
    }
    console.log(`\u{1F504} HYBRID CDN: No SHA-256 for UID ${uid}, proxying to Stream`);
    return await proxyToStreamUID(uid, env, request);
  } catch (error) {
    console.error(`\u274C HYBRID CDN: KV error for UID ${uid}:`, error);
    return await proxyToStreamUID(uid, env, request);
  }
}
__name(serveMP4ByUID, "serveMP4ByUID");
async function fallbackToStream(sha256, env, request) {
  try {
    if (!env.MEDIA_KV) {
      return new Response("Server misconfigured", { status: 500 });
    }
    const indexData = await env.MEDIA_KV.get(`idx:sha256:${sha256}`);
    if (!indexData) {
      return new Response("Not Found", { status: 404 });
    }
    const { uid } = JSON.parse(indexData);
    return await proxyToStreamUID(uid, env, request);
  } catch (error) {
    console.error(`\u274C HYBRID CDN: Fallback error for ${sha256}:`, error);
    return new Response("Server Error", { status: 500 });
  }
}
__name(fallbackToStream, "fallbackToStream");
async function proxyToStreamUID(uid, env, request) {
  const startTime = Date.now();
  const streamDomain = env.STREAM_CUSTOMER_DOMAIN || "customer-4c3uhd5qzuhwz9hu.cloudflarestream.com";
  const streamUrl = `https://${streamDomain}/${uid}/downloads/default.mp4`;
  console.log(`\u{1F504} HYBRID CDN: Proxying UID ${uid} to Stream: ${streamUrl}`);
  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) {
    headers.set("Range", range);
    console.log(`\u{1F504} HYBRID CDN: Forwarding Range header: ${range}`);
  }
  const response = await fetch(streamUrl, { headers });
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Content-Type", "video/mp4");
  if (!responseHeaders.has("Accept-Ranges")) {
    responseHeaders.set("Accept-Ranges", "bytes");
  }
  const finalResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
  finalResponse.headers.set("X-CDN-Processing-Time", (Date.now() - startTime).toString());
  finalResponse.headers.set("X-CDN-Cache-Status", "stream-proxy");
  addMonitoringHeaders(finalResponse);
  return finalResponse;
}
__name(proxyToStreamUID, "proxyToStreamUID");
async function checkAndServeImage(sha256, env, url, request, startTime = Date.now()) {
  try {
    if (!env.MEDIA_KV) {
      return null;
    }
    const indexData = await env.MEDIA_KV.get(`idx:sha256:${sha256}`);
    if (!indexData) {
      return null;
    }
    const index = JSON.parse(indexData);
    if (index.type !== "image") {
      return null;
    }
    const imageData = await env.MEDIA_KV.get(`image:${sha256}`);
    if (!imageData) {
      return null;
    }
    const image = JSON.parse(imageData);
    const r2Key = image.r2Key || `images/${sha256}${getExtensionFromMimeType(image.contentType)}`;
    console.log(`\u{1F4F8} HYBRID CDN: Checking R2 for image ${r2Key}`);
    const r2Object = await env.R2_VIDEOS.get(r2Key);
    if (r2Object) {
      console.log(`\u2705 HYBRID CDN: Serving image ${sha256} from R2 instantly!`);
      const headers = new Headers({
        "Content-Type": image.contentType || "image/jpeg",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=31536000",
        // Cache for 1 year
        "X-CDN-Processing-Time": (Date.now() - startTime).toString(),
        "X-CDN-Cache-Status": "r2-image-hit"
      });
      const extension = getExtensionFromMimeType(image.contentType);
      if (url.searchParams.get("download") === "true") {
        headers.set("Content-Disposition", `attachment; filename="${sha256}${extension}"`);
      } else {
        headers.set("Content-Disposition", `inline; filename="${sha256}${extension}"`);
      }
      const response = new Response(r2Object.body, { headers });
      addMonitoringHeaders(response);
      const memoryCacheKey = `r2:${sha256}:${url.pathname}`;
      await storeInMemoryCache(memoryCacheKey, response);
      return response;
    }
    console.log(`\u274C HYBRID CDN: Image ${sha256} not found in R2`);
    return null;
  } catch (error) {
    console.error(`\u274C HYBRID CDN: Error checking image for ${sha256}:`, error);
    return null;
  }
}
__name(checkAndServeImage, "checkAndServeImage");
async function serveRangeFromR2(r2Key, rangeHeader, env, url, sha256) {
  const startTime = Date.now();
  try {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      return new Response("Invalid Range header", { status: 400 });
    }
    const start = parseInt(match[1], 10);
    const r2Object = await env.R2_VIDEOS.head(r2Key);
    if (!r2Object) {
      return new Response("Not Found", { status: 404 });
    }
    const totalSize = r2Object.size;
    const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
    if (start >= totalSize || end >= totalSize || start > end) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: {
          "Content-Range": `bytes */${totalSize}`
        }
      });
    }
    const rangeObject = await env.R2_VIDEOS.get(r2Key, {
      range: { offset: start, length: end - start + 1 }
    });
    if (!rangeObject) {
      return new Response("Not Found", { status: 404 });
    }
    const contentLength = end - start + 1;
    console.log(`\u2705 HYBRID CDN: Serving range ${start}-${end}/${totalSize} for ${sha256}.mp4`);
    const headers = new Headers({
      "Content-Type": "video/mp4",
      "Content-Length": contentLength,
      "Content-Range": `bytes ${start}-${end}/${totalSize}`,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=31536000",
      "X-CDN-Processing-Time": (Date.now() - startTime).toString(),
      "X-CDN-Cache-Status": "r2-range-hit"
    });
    if (url.searchParams.get("download") === "true") {
      headers.set("Content-Disposition", `attachment; filename="${sha256}.mp4"`);
    } else {
      headers.set("Content-Disposition", `inline; filename="${sha256}.mp4"`);
    }
    const response = new Response(rangeObject.body, {
      status: 206,
      // Partial Content
      headers
    });
    addMonitoringHeaders(response);
    return response;
  } catch (error) {
    errors++;
    console.error(`\u274C HYBRID CDN: Range request error for ${r2Key}:`, error);
    const response = new Response("Range request failed", {
      status: 500,
      headers: {
        "X-CDN-Processing-Time": (Date.now() - startTime).toString(),
        "X-CDN-Error-Count": errors.toString()
      }
    });
    addMonitoringHeaders(response);
    return response;
  }
}
__name(serveRangeFromR2, "serveRangeFromR2");
function getExtensionFromMimeType(contentType) {
  if (!contentType) return ".jpg";
  const mimeToExt = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff"
  };
  return mimeToExt[contentType.toLowerCase()] || ".jpg";
}
__name(getExtensionFromMimeType, "getExtensionFromMimeType");
async function handleMediaTransformation(request, env, url) {
  try {
    const path = url.pathname;
    console.log(`\u{1F3AC} Media Transformations request: ${path}`);
    const transformMatch = path.match(/^\/cdn-cgi\/media\/([^\/]+)\/(.+)$/);
    if (!transformMatch) {
      return new Response("Invalid Media Transformations URL", { status: 400 });
    }
    const [, params, targetPath] = transformMatch;
    const paramMap = {};
    params.split(",").forEach((param) => {
      const [key, value] = param.split("=");
      paramMap[key] = value;
    });
    console.log(`\u{1F4CA} Transform params:`, paramMap);
    console.log(`\u{1F3AF} Target path: ${targetPath}`);
    if (paramMap.mode === "frame" && targetPath.match(/^([a-f0-9]{64})\.mp4$/)) {
      const sha256 = targetPath.slice(0, -4);
      const thumbnailKey = `thumbnails/${sha256}.jpg`;
      const cachedThumbnail = await env.R2_VIDEOS.get(thumbnailKey);
      if (cachedThumbnail) {
        console.log(`\u2705 Serving cached thumbnail for ${sha256}`);
        return new Response(cachedThumbnail.body, {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Thumbnail-Status": "cached-media-transform"
          }
        });
      }
      const videoUrl = `https://cdn.divine.video/${targetPath}`;
      const transformUrl = new URL(url.origin + path);
      const frameResponse = await fetch(transformUrl, {
        cf: {
          // Enable Media Transformations
          mediaTransform: true,
          image: {
            width: parseInt(paramMap.width) || 640,
            height: parseInt(paramMap.height) || 360,
            fit: paramMap.fit || "cover",
            quality: 80,
            format: "jpeg"
          }
        }
      });
      if (frameResponse.ok) {
        const frameData = await frameResponse.arrayBuffer();
        await env.R2_VIDEOS.put(thumbnailKey, frameData, {
          httpMetadata: {
            contentType: "image/jpeg"
          },
          customMetadata: {
            sha256,
            generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            method: "media-transformations"
          }
        });
        console.log(`\u2705 Generated and cached thumbnail using Media Transformations`);
        return new Response(frameData, {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Thumbnail-Status": "generated-media-transform"
          }
        });
      }
    }
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
    console.error("\u274C Media Transformations error:", error);
    const response = new Response("Media Transformations failed", {
      status: 500,
      headers: {
        "X-Error": error.message,
        "X-CDN-Error-Count": errors.toString()
      }
    });
    addMonitoringHeaders(response);
    return response;
  }
}
__name(handleMediaTransformation, "handleMediaTransformation");
async function proxyToStream(request, env, path) {
  const streamDomain = env.STREAM_CUSTOMER_DOMAIN || "customer-4c3uhd5qzuhwz9hu.cloudflarestream.com";
  const streamUrl = `https://${streamDomain}${path}`;
  const headers = new Headers(request.headers);
  headers.delete("Host");
  const hasBody = ["POST", "PUT", "PATCH"].includes(request.method);
  const response = await fetch(streamUrl, {
    method: request.method,
    headers,
    body: hasBody ? request.body : void 0
  });
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", "*");
  newHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  newHeaders.set("Access-Control-Allow-Headers", "Content-Type");
  const finalResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
  finalResponse.headers.set("X-CDN-Cache-Status", "stream-default-proxy");
  addMonitoringHeaders(finalResponse);
  return finalResponse;
}
__name(proxyToStream, "proxyToStream");

// ../../../.nvm/versions/node/v23.7.0/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../.nvm/versions/node/v23.7.0/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-8SelOJ/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = cdn_proxy_worker_default;

// ../../../.nvm/versions/node/v23.7.0/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-8SelOJ/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=cdn_proxy_worker.js.map
