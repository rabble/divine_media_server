// ABOUTME: Utility functions for generating Stream URLs with custom domain support
// ABOUTME: Centralizes URL generation to avoid hardcoding throughout the codebase

export function getStreamUrls(uid, env, options = {}) {
  // Use CDN domain for hybrid routing, otherwise fall back to Stream domain
  const cdnDomain = env.CDN_DOMAIN || 'cdn.divine.video';
  const streamDomain = env.STREAM_DOMAIN || `customer-${env.STREAM_ACCOUNT_ID}.cloudflarestream.com`;

  // For hybrid routing, prefer CDN domain that can route to R2 for MP4s
  const domain = options.useStreamDomain ? streamDomain : cdnDomain;

  return {
    hlsUrl: `https://${domain}/${uid}/manifest/video.m3u8`,
    dashUrl: `https://${domain}/${uid}/manifest/video.mpd`,
    mp4Url: `https://${domain}/${uid}/downloads/default.mp4`,
    thumbnailUrl: `https://${domain}/${uid}/thumbnails/thumbnail.jpg`,
    iframeUrl: `https://${domain}/${uid}/iframe`,
    // Additional formats
    webmUrl: `https://${domain}/${uid}/downloads/webm.webm`,
    posterUrl: `https://${domain}/${uid}/thumbnails/thumbnail.jpg?time=0s`,
    animatedThumbnailUrl: `https://${domain}/${uid}/thumbnails/thumbnail.gif`
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
    // HLS/DASH always from Stream via CDN
    hlsUrl: `https://${cdnDomain}/${uid}/manifest/video.m3u8`,
    dashUrl: `https://${cdnDomain}/${uid}/manifest/video.mpd`,

    // MP4: Blossom-style URL if available in R2, otherwise fallback
    mp4Url: r2Available && sha256 ?
      `https://${cdnDomain}/${sha256}.mp4` :
      `https://${cdnDomain}/${uid}/downloads/default.mp4`,

    // Thumbnails from Stream via CDN
    thumbnailUrl: `https://${cdnDomain}/${uid}/thumbnails/thumbnail.jpg`,

    // Additional formats
    iframeUrl: `https://${cdnDomain}/${uid}/iframe`,
    webmUrl: `https://${cdnDomain}/${uid}/downloads/webm.webm`,
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
  // Convert any video URL to our custom domain
  const uid = extractUidFromStreamUrl(url);
  if (uid) {
    return getStreamUrls(uid, env).hlsUrl;
  }
  return url;
}