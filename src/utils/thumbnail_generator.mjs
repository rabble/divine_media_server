// ABOUTME: Thumbnail generation utility that creates and caches thumbnails in R2
// ABOUTME: Uses external service to extract frame from video and stores permanently

/**
 * Generate thumbnail for video on first request and cache in R2
 * @param {string} sha256 - Video SHA-256 hash
 * @param {string} uid - Video UID (for path compatibility)
 * @param {Object} env - Worker environment
 * @returns {Response} - Thumbnail image response
 */
export async function generateAndCacheThumbnail(sha256, uid, env) {
  const thumbnailKey = `thumbnails/${sha256}.jpg`;

  // Check if thumbnail already exists in R2
  const existingThumbnail = await env.R2_VIDEOS.get(thumbnailKey);
  if (existingThumbnail) {
    console.log(`📸 Thumbnail cache HIT for ${sha256}`);
    return new Response(existingThumbnail.body, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'ETag': `"thumb-${sha256}"`,
        'X-Thumbnail-Status': 'cached'
      }
    });
  }

  console.log(`📸 Thumbnail cache MISS for ${sha256}, generating...`);

  try {
    // Method 1: Use Cloudflare Image Resizing API (if video is small enough)
    // This works by extracting first frame from video URL
    const videoUrl = `https://cdn.divine.video/${sha256}.mp4`;

    // Method 2: Use external thumbnail service (like Bannerbear, Shotstack, or custom API)
    const thumbnail = await generateWithExternalService(videoUrl, env);

    if (thumbnail) {
      // Store in R2 for permanent caching
      await env.R2_VIDEOS.put(thumbnailKey, thumbnail, {
        httpMetadata: {
          contentType: 'image/jpeg'
        },
        customMetadata: {
          sha256,
          uid,
          generatedAt: new Date().toISOString()
        }
      });

      console.log(`✅ Thumbnail generated and cached for ${sha256}`);

      return new Response(thumbnail, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'ETag': `"thumb-${sha256}"`,
          'X-Thumbnail-Status': 'generated'
        }
      });
    }
  } catch (error) {
    console.error(`❌ Thumbnail generation failed for ${sha256}:`, error);
  }

  // Fallback: Return placeholder thumbnail
  return servePlaceholderThumbnail(sha256);
}

/**
 * Generate thumbnail using Cloudflare Media Transformations API (2025 feature)
 * Uses native Cloudflare video frame extraction without external services
 */
async function generateWithExternalService(videoUrl, env) {
  try {
    // Use Cloudflare Media Transformations to extract a frame from the video
    // This feature was released in 2025 and allows direct video frame extraction
    // The URL pattern: /cdn-cgi/media/mode=frame,time=1s,width=640,height=360,fit=cover/[video_url]

    console.log(`📸 Using Cloudflare Media Transformations to extract frame from ${videoUrl}`);

    // Construct the Media Transformations URL
    // Extract frame at 1 second, resize to 640x360 for thumbnail
    const mediaTransformUrl = new URL(videoUrl);
    const transformPath = `/cdn-cgi/media/mode=frame,time=1s,width=640,height=360,fit=cover${mediaTransformUrl.pathname}`;
    mediaTransformUrl.pathname = transformPath;

    console.log(`🔄 Media Transform URL: ${mediaTransformUrl.toString()}`);

    // Fetch the transformed frame directly
    const response = await fetch(mediaTransformUrl.toString(), {
      headers: {
        'Accept': 'image/jpeg,image/png,image/*'
      }
    });

    if (response.ok) {
      console.log(`✅ Successfully extracted frame using Media Transformations`);
      const imageData = await response.arrayBuffer();

      // Verify we got an image
      if (imageData.byteLength > 0) {
        return imageData;
      }
    } else {
      console.error(`❌ Media Transformations returned ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Media Transformations failed:', error);
  }

  // Fallback: Try using Image Resizing API with Worker subrequest
  // This works if the video is accessible as an image (first frame)
  try {
    console.log(`📸 Fallback: Trying Cloudflare Image Resizing API`);

    // Use fetch with cf.image options for resizing
    // This might work for some video formats where first frame is accessible
    const imageResponse = await fetch(videoUrl, {
      cf: {
        image: {
          width: 640,
          height: 360,
          fit: 'cover',
          quality: 80,
          format: 'jpeg'
        }
      }
    });

    if (imageResponse.ok) {
      console.log(`✅ Image Resizing API succeeded`);
      return await imageResponse.arrayBuffer();
    }
  } catch (error) {
    console.error('Image Resizing API failed:', error);
  }

  // Final fallback: If we have an external thumbnail service configured
  if (env.THUMBNAIL_SERVICE_URL) {
    try {
      console.log(`📸 Final fallback: External thumbnail service`);
      const response = await fetch(env.THUMBNAIL_SERVICE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.THUMBNAIL_SERVICE_KEY}`
        },
        body: JSON.stringify({
          video_url: videoUrl,
          time: '00:00:01',
          width: 640,
          height: 360
        })
      });

      if (response.ok) {
        return await response.arrayBuffer();
      }
    } catch (error) {
      console.error('External thumbnail service failed:', error);
    }
  }

  return null;
}

/**
 * Serve a placeholder thumbnail
 */
export function servePlaceholderThumbnail(sha256) {
  // Create a simple SVG placeholder
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
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600', // Cache placeholder for 1 hour
      'X-Thumbnail-Status': 'placeholder'
    }
  });
}

/**
 * Handle thumbnail request from CDN
 */
export async function handleThumbnailRequest(url, env) {
  const pathMatch = url.pathname.match(/\/([a-f0-9-_]+)\/thumbnails\/thumbnail\.(jpg|gif)$/);
  if (!pathMatch) {
    return servePlaceholderThumbnail('unknown');
  }

  const uid = pathMatch[1];

  // For R2 videos, the UID format is r2_{sha256_prefix}
  if (uid.startsWith('r2_')) {
    // Look up full SHA256 from KV
    const videoData = await env.MEDIA_KV.get(`video:${uid}`);
    if (videoData) {
      const video = JSON.parse(videoData);
      if (video.sha256) {
        return await generateAndCacheThumbnail(video.sha256, uid, env);
      }
    }
  }

  // For Stream videos (shouldn't happen with R2 fallback enabled)
  // Try to proxy to Stream
  if (!uid.startsWith('r2_')) {
    const streamDomain = env.STREAM_CUSTOMER_DOMAIN || 'customer-4c3uhd5qzuhwz9hu.cloudflarestream.com';
    const streamUrl = `https://${streamDomain}${url.pathname}`;

    try {
      const response = await fetch(streamUrl);
      if (response.ok) {
        return response;
      }
    } catch (error) {
      console.error('Stream thumbnail fetch failed:', error);
    }
  }

  // Fallback to placeholder
  return servePlaceholderThumbnail(uid);
}