// ABOUTME: Helper utilities for checking content moderation status
// ABOUTME: Provides functions to check if content is safe, quarantined, or pending review

/**
 * Get moderation status for a video
 * @param {string} sha256 - Video SHA-256 hash
 * @param {Object} env - Worker environment with MODERATION_KV binding
 * @returns {Object} Moderation status and details
 */
export async function getModerationStatus(sha256, env) {
  if (!env.MODERATION_KV) {
    return {
      status: 'unmoderated',
      message: 'Moderation not configured'
    };
  }

  try {
    // Check for quarantine first (highest priority)
    const quarantine = await env.MODERATION_KV.get(`quarantine:${sha256}`);
    if (quarantine) {
      const data = JSON.parse(quarantine);
      return {
        status: 'quarantined',
        reason: data.reason || 'Content policy violation',
        details: data,
        timestamp: data.timestamp
      };
    }

    // Check for moderation result
    const result = await env.MODERATION_KV.get(`moderation:${sha256}`);
    if (result) {
      const data = JSON.parse(result);
      return {
        status: data.action?.toLowerCase() || 'unknown',  // 'safe', 'review', 'quarantine'
        scores: data.scores,
        flags: data.flags,
        details: data,
        timestamp: data.timestamp
      };
    }

    // Check if pending review
    const review = await env.MODERATION_KV.get(`review:${sha256}`);
    if (review) {
      const data = JSON.parse(review);
      return {
        status: 'pending_review',
        scores: data.scores,
        flags: data.flags,
        details: data,
        timestamp: data.timestamp
      };
    }

    // Not yet moderated
    return {
      status: 'pending',
      message: 'Content awaiting moderation'
    };

  } catch (error) {
    console.error('Error checking moderation status:', error);
    return {
      status: 'error',
      message: 'Failed to check moderation status',
      error: error.message
    };
  }
}

/**
 * Check if content should be blocked
 * @param {string} sha256 - Video SHA-256 hash
 * @param {Object} env - Worker environment
 * @returns {boolean} True if content should be blocked
 */
export async function isContentBlocked(sha256, env) {
  const status = await getModerationStatus(sha256, env);
  return status.status === 'quarantined';
}

/**
 * Get moderation statistics for monitoring
 * @param {Object} env - Worker environment
 * @returns {Object} Statistics about moderation
 */
export async function getModerationStats(env) {
  if (!env.MODERATION_KV) {
    return { error: 'Moderation not configured' };
  }

  try {
    // This would need to be tracked separately in KV with counters
    // For now, return basic info
    return {
      enabled: env.MODERATION_ENABLED === 'true',
      moderationService: 'divine-moderation-service',
      queueName: 'video-moderation-queue',
      thresholds: {
        nsfw_high: 0.8,
        nsfw_medium: 0.6,
        violence_high: 0.8,
        violence_medium: 0.6
      }
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Format moderation response for API
 * @param {Object} status - Moderation status object
 * @returns {Object} Formatted response
 */
export function formatModerationResponse(status) {
  switch (status.status) {
    case 'quarantined':
      return {
        available: false,
        reason: 'Content unavailable due to policy violation',
        status: 451  // Unavailable for Legal Reasons
      };

    case 'pending_review':
      return {
        available: true,
        warning: 'Content is under review',
        status: 200
      };

    case 'safe':
      return {
        available: true,
        status: 200
      };

    case 'pending':
      return {
        available: true,
        notice: 'Content moderation in progress',
        status: 200
      };

    default:
      return {
        available: true,
        status: 200
      };
  }
}