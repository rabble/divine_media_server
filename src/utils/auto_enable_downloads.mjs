// ABOUTME: Reliable auto-enable downloads utility for all migration handlers
// ABOUTME: Handles timing, retries, proper error handling, and content blocking checks

import { checkBlockStatus } from './content_blocking.mjs';

export async function enableDownloadsWithRetry(uid, env, deps = {}, options = {}) {
  // Ensure deps.fetch is available and properly bound
  const fetchFn = deps.fetch || globalThis.fetch;
  const {
    maxRetries = 3,
    initialDelay = 5000,
    retryDelay = 10000,
    logPrefix = "🔥",
    sha256 = null,  // Optional SHA256 for block checking
    skipBlockCheck = false  // Option to skip block checking
  } = options;

  const accountId = env.STREAM_ACCOUNT_ID;
  const apiToken = env.STREAM_API_TOKEN;

  if (!accountId || !apiToken) {
    console.log(`${logPrefix} ❌ DOWNLOADS ENABLE SKIPPED - Missing Stream credentials for UID:`, uid);
    return { success: false, error: "missing_credentials" };
  }

  // Check if content is blocked (if SHA256 is provided)
  if (!skipBlockCheck && sha256 && env.MODERATION_KV) {
    try {
      const blockStatus = await checkBlockStatus(sha256, env);
      if (blockStatus.blocked) {
        console.log(`${logPrefix} 🚫 DOWNLOADS ENABLE BLOCKED - Content is blocked for UID:`, uid,
                    `SHA256:`, sha256.substring(0, 16), `Reason:`, blockStatus.reason);
        return {
          success: false,
          error: "content_blocked",
          reason: blockStatus.reason,
          category: blockStatus.category,
          severity: blockStatus.severity
        };
      }
    } catch (error) {
      console.log(`${logPrefix} ⚠️ DOWNLOADS ENABLE: Block check failed, proceeding anyway:`, error.message);
      // Continue with enable downloads even if block check fails
    }
  }

  const downloadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`;

  // Wait for initial processing
  console.log(`${logPrefix} ⏳ DOWNLOADS ENABLE: Waiting ${initialDelay}ms for video processing:`, uid);
  await new Promise(resolve => setTimeout(resolve, initialDelay));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`${logPrefix} 🔄 DOWNLOADS ENABLE ATTEMPT ${attempt}/${maxRetries} for UID:`, uid);

      const downloadRes = await fetchFn(downloadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (downloadRes.ok) {
        console.log(`${logPrefix} ✅ DOWNLOADS ENABLED SUCCESSFULLY (attempt ${attempt}) for UID:`, uid);
        return { success: true, attempt };
      }

      const errorText = await downloadRes.text();
      console.log(`${logPrefix} ❌ DOWNLOADS ENABLE FAILED (attempt ${attempt}/${maxRetries}) for UID:`, uid,
                  `status: ${downloadRes.status}, response:`, errorText);

      // If this was the last attempt, return failure
      if (attempt === maxRetries) {
        return {
          success: false,
          error: `Final attempt failed: ${downloadRes.status}`,
          attempts: maxRetries,
          lastResponse: errorText
        };
      }

      // Wait before retry
      console.log(`${logPrefix} ⏳ DOWNLOADS ENABLE: Waiting ${retryDelay}ms before retry for UID:`, uid);
      await new Promise(resolve => setTimeout(resolve, retryDelay));

    } catch (error) {
      console.log(`${logPrefix} ❌ DOWNLOADS ENABLE EXCEPTION (attempt ${attempt}/${maxRetries}) for UID:`, uid,
                  `error:`, error.message);

      // If this was the last attempt, return failure
      if (attempt === maxRetries) {
        return {
          success: false,
          error: `Final attempt exception: ${error.message}`,
          attempts: maxRetries
        };
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  // This should never be reached, but just in case
  return { success: false, error: "unexpected_failure" };
}

// For background/async enabling (don't await the result)
export function enableDownloadsAsync(uid, env, deps, options = {}) {
  // Start the enable process but don't await it
  enableDownloadsWithRetry(uid, env, deps, options)
    .then(result => {
      if (!result.success) {
        console.log(`${options.logPrefix || "🔥"} ❌ ASYNC DOWNLOADS ENABLE FINAL FAILURE for UID:`, uid,
                    `error:`, result.error);
      }
    })
    .catch(error => {
      console.log(`${options.logPrefix || "🔥"} ❌ ASYNC DOWNLOADS ENABLE UNCAUGHT ERROR for UID:`, uid,
                  `error:`, error.message);
    });
}