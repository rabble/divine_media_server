// ABOUTME: Utility functions for generating Stream URLs with custom domain support
// ABOUTME: Centralizes URL generation to avoid hardcoding throughout the codebase

export function getStreamUrls(uid, env) {
  // Use custom domain if configured, otherwise fall back to Cloudflare domain
  const domain = env.STREAM_DOMAIN || `customer-${env.STREAM_ACCOUNT_ID}.cloudflarestream.com`;
  
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