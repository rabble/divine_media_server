// ABOUTME: Utility functions for generating Stream URLs with custom domain support
// ABOUTME: Centralizes URL generation to avoid hardcoding throughout the codebase

export function getStreamUrls(uid, env, options = {}) {
  // Use CDN domain for R2 serving
  const cdnDomain = env.CDN_DOMAIN || 'cdn.divine.video';

  return {
    // Stream removed - no HLS/DASH support
    // hlsUrl: REMOVED - Stream no longer available
    // dashUrl: REMOVED - Stream no longer available
    mp4Url: `https://${cdnDomain}/${uid}/downloads/default.mp4`,
    // Thumbnails still generated via Media Transformations API
    thumbnailUrl: `https://${cdnDomain}/${uid}/thumbnails/thumbnail.jpg`,
    // iframeUrl: REMOVED - Stream embeds no longer available
    // webmUrl: REMOVED - Stream transcoding no longer available
    posterUrl: `https://${cdnDomain}/${uid}/thumbnails/thumbnail.jpg?time=0s`,
    animatedThumbnailUrl: `https://${cdnDomain}/${uid}/thumbnails/thumbnail.gif`
  };
}

/**
 * Generate hybrid URLs with Blossom-style MP4 routing
 * @param {string} uid - Stream UID
 * @param {string} sha256 - SHA-256 hash for Blossom URL
 * @param {Object} env - Environment variables
 * @param {boolean} r2Available - Whether video is available in R2
 * @returns {Object} URLs optimized for hybrid serving
 */
export function getHybridUrls(uid, sha256, env, r2Available = false) {
  const cdnDomain = env.CDN_DOMAIN || 'cdn.divine.video';

  return {
    // Stream removed - no HLS/DASH support
    // hlsUrl: REMOVED - Stream no longer available
    // dashUrl: REMOVED - Stream no longer available

    // MP4: Blossom-style URL if available in R2, otherwise fallback
    mp4Url: r2Available && sha256 ?
      `https://${cdnDomain}/${sha256}.mp4` :
      `https://${cdnDomain}/${uid}/downloads/default.mp4`,

    // Thumbnails via Media Transformations API
    thumbnailUrl: `https://${cdnDomain}/${uid}/thumbnails/thumbnail.jpg`,

    // Stream features removed
    // iframeUrl: REMOVED - Stream embeds no longer available
    // webmUrl: REMOVED - Stream transcoding no longer available
    posterUrl: `https://${cdnDomain}/${uid}/thumbnails/thumbnail.jpg?time=0s`,
    animatedThumbnailUrl: `https://${cdnDomain}/${uid}/thumbnails/thumbnail.gif`,

    // Blossom protocol URLs (for Nostr events)
    blossomUrl: sha256 ? `https://${cdnDomain}/${sha256}` : null,
    blossomMp4Url: sha256 ? `https://${cdnDomain}/${sha256}.mp4` : null
  };
}

export function getR2Url(r2Key, env) {
  // Use custom R2 domain if configured
  if (env.R2_PUBLIC_DOMAIN) {
    return `https://${env.R2_PUBLIC_DOMAIN}/${r2Key}`;
  }
  
  // Fall back to R2 dev domain or public bucket URL
  if (env.R2_BUCKET_URL) {
    return `${env.R2_BUCKET_URL}/${r2Key}`;
  }
  
  // Default R2 public URL pattern
  return `https://pub-${env.R2_BUCKET_ID}.r2.dev/${r2Key}`;
}

export function isStreamUrl(url) {
  // Check if a URL is a Cloudflare Stream URL
  return url.includes('.cloudflarestream.com/') || 
         url.includes('/manifest/video.m3u8') ||
         url.includes('/manifest/video.mpd');
}

export function extractUidFromStreamUrl(url) {
  // Extract UID from various Stream URL formats
  // https://domain.com/{uid}/manifest/video.m3u8
  // https://domain.com/{uid}/thumbnails/thumbnail.jpg
  const match = url.match(/\/([a-f0-9]{32})\//);
  return match ? match[1] : null;
}

export function normalizeVideoUrl(url, env) {
  // Convert any video URL to our custom domain MP4 URL
  const uid = extractUidFromStreamUrl(url);
  if (uid) {
    return getStreamUrls(uid, env).mp4Url;
  }
  return url;
}