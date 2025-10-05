// ABOUTME: Handler to enable MP4 downloads for migrated Stream videos
// ABOUTME: Must be called after migration to make videos downloadable

import { enableDownloadsWithRetry } from '../utils/auto_enable_downloads.mjs';

export async function enableDownloads(request, env) {
  try {
    const url = new URL(request.url);
    const uid = url.pathname.split('/').pop();

    if (!uid || uid.length !== 32) {
      return new Response(JSON.stringify({
        error: 'invalid_uid',
        message: 'Please provide a valid 32-character Stream UID'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Use reliable auto-enable utility
    const result = await enableDownloadsWithRetry(uid, env, { fetch: fetch.bind(globalThis) }, {
      logPrefix: "🔧 MANUAL",
      initialDelay: 2000,  // Shorter delay for manual requests
      maxRetries: 2        // Fewer retries for individual requests
    });

    if (result.success) {
      return new Response(JSON.stringify({
        success: true,
        uid: uid,
        attempts: result.attempt,
        mp4Url: `https://${env.STREAM_DOMAIN || 'customer-4c3uhd5qzuhwz9hu.cloudflarestream.com'}/${uid}/downloads/default.mp4`,
        message: `Downloads enabled successfully (attempt ${result.attempt})`
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        error: 'enable_failed',
        uid: uid,
        attempts: result.attempts,
        message: result.error,
        lastResponse: result.lastResponse
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Enable downloads error:', error);
    return new Response(JSON.stringify({
      error: 'server_error',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Batch enable downloads for multiple videos using reliable utility
export async function enableDownloadsBatch(request, env) {
  try {
    const { uids } = await request.json();

    if (!Array.isArray(uids) || uids.length === 0) {
      return new Response(JSON.stringify({
        error: 'invalid_request',
        message: 'Please provide an array of UIDs'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`🔧 BATCH: Starting batch enable for ${uids.length} UIDs`);

    const results = [];
    const errors = [];
    const deps = { fetch: fetch.bind(globalThis) };

    // Process each UID with proper retry logic
    for (const [index, uid] of uids.entries()) {
      console.log(`🔧 BATCH: Processing ${index + 1}/${uids.length} - UID: ${uid}`);

      try {
        const result = await enableDownloadsWithRetry(uid, env, deps, {
          logPrefix: `🔧 BATCH[${index + 1}/${uids.length}]`,
          initialDelay: 3000,  // Reasonable delay for batch processing
          maxRetries: 3,       // Standard retries for batch
          retryDelay: 5000     // 5s between retries
        });

        if (result.success) {
          results.push({
            uid: uid,
            success: true,
            attempts: result.attempt,
            mp4Url: `https://${env.STREAM_DOMAIN || 'customer-4c3uhd5qzuhwz9hu.cloudflarestream.com'}/${uid}/downloads/default.mp4`
          });
        } else {
          errors.push({
            uid: uid,
            error: result.error,
            attempts: result.attempts,
            lastResponse: result.lastResponse
          });
        }
      } catch (error) {
        errors.push({
          uid: uid,
          error: error.message
        });
      }

      // Small delay between UIDs to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`🔧 BATCH: Completed - ${results.length} enabled, ${errors.length} failed`);

    return new Response(JSON.stringify({
      success: true,
      enabled: results.length,
      failed: errors.length,
      results: results,
      errors: errors
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Batch enable downloads error:', error);
    return new Response(JSON.stringify({
      error: 'server_error',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}