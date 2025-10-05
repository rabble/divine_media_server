// ABOUTME: Content blocking utilities for manually flagging videos
// ABOUTME: Provides functions to block/unblock content without deleting files

/**
 * Block a video from being served
 * @param {string} sha256 - Video SHA-256 hash
 * @param {Object} env - Worker environment with MODERATION_KV binding
 * @param {Object} details - Blocking details
 * @returns {Object} Result of blocking operation
 */
export async function blockContent(sha256, env, details = {}) {
  if (!env.MODERATION_KV) {
    return {
      success: false,
      error: 'Moderation KV not configured'
    };
  }

  try {
    const blockData = {
      sha256,
      status: 'blocked',
      reason: details.reason || 'Manual block',
      blockedBy: details.blockedBy || 'admin',
      blockedAt: Date.now(),
      category: details.category || 'manual', // manual, nsfw, violence, csam, copyright, other
      severity: details.severity || 'high', // low, medium, high, critical
      notes: details.notes || null,
      appealable: details.appealable !== false, // Default to appealable
      expiresAt: details.expiresAt || null // Optional expiration timestamp
    };

    // Store in quarantine namespace
    await env.MODERATION_KV.put(
      `quarantine:${sha256}`,
      JSON.stringify(blockData),
      {
        // If expiration is set, use KV TTL
        expirationTtl: details.expiresAt ?
          Math.floor((details.expiresAt - Date.now()) / 1000) :
          undefined
      }
    );

    // Also store in blocked list for tracking
    await env.MODERATION_KV.put(
      `blocked:${sha256}`,
      JSON.stringify({
        ...blockData,
        timestamp: Date.now()
      })
    );

    // Log the action
    await env.MODERATION_KV.put(
      `log:block:${Date.now()}_${sha256}`,
      JSON.stringify({
        action: 'block',
        sha256,
        ...blockData
      })
    );

    return {
      success: true,
      message: `Content ${sha256} has been blocked`,
      data: blockData
    };

  } catch (error) {
    console.error('Error blocking content:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Unblock a previously blocked video
 * @param {string} sha256 - Video SHA-256 hash
 * @param {Object} env - Worker environment
 * @param {Object} details - Unblocking details
 * @returns {Object} Result of unblocking operation
 */
export async function unblockContent(sha256, env, details = {}) {
  if (!env.MODERATION_KV) {
    return {
      success: false,
      error: 'Moderation KV not configured'
    };
  }

  try {
    // Get current block data if exists
    const currentBlock = await env.MODERATION_KV.get(`quarantine:${sha256}`);

    // Remove from quarantine
    await env.MODERATION_KV.delete(`quarantine:${sha256}`);

    // Remove from blocked list
    await env.MODERATION_KV.delete(`blocked:${sha256}`);

    // Log the unblock action
    await env.MODERATION_KV.put(
      `log:unblock:${Date.now()}_${sha256}`,
      JSON.stringify({
        action: 'unblock',
        sha256,
        unblockedBy: details.unblockedBy || 'admin',
        unblockedAt: Date.now(),
        reason: details.reason || 'Manual unblock',
        previousBlock: currentBlock ? JSON.parse(currentBlock) : null
      })
    );

    return {
      success: true,
      message: `Content ${sha256} has been unblocked`,
      wasBlocked: !!currentBlock
    };

  } catch (error) {
    console.error('Error unblocking content:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get list of all blocked content
 * @param {Object} env - Worker environment
 * @param {Object} options - List options
 * @returns {Array} List of blocked content
 */
export async function listBlockedContent(env, options = {}) {
  if (!env.MODERATION_KV) {
    return [];
  }

  try {
    const limit = options.limit || 100;
    const prefix = options.prefix || 'blocked:';

    const list = await env.MODERATION_KV.list({
      prefix,
      limit
    });

    const blocked = [];
    for (const key of list.keys) {
      const data = await env.MODERATION_KV.get(key.name);
      if (data) {
        blocked.push(JSON.parse(data));
      }
    }

    // Sort by most recent first
    blocked.sort((a, b) => (b.blockedAt || 0) - (a.blockedAt || 0));

    return blocked;

  } catch (error) {
    console.error('Error listing blocked content:', error);
    return [];
  }
}

/**
 * Check if content should be blocked based on various criteria
 * @param {string} sha256 - Video SHA-256 hash
 * @param {Object} env - Worker environment
 * @returns {Object} Block status and details
 */
export async function checkBlockStatus(sha256, env) {
  if (!env.MODERATION_KV) {
    return {
      blocked: false,
      reason: 'Moderation not configured'
    };
  }

  try {
    // Check quarantine (highest priority)
    const quarantine = await env.MODERATION_KV.get(`quarantine:${sha256}`);
    if (quarantine) {
      const data = JSON.parse(quarantine);
      return {
        blocked: true,
        reason: data.reason || 'Quarantined',
        category: data.category,
        severity: data.severity,
        appealable: data.appealable,
        details: data
      };
    }

    // Check moderation results
    const moderation = await env.MODERATION_KV.get(`moderation:${sha256}`);
    if (moderation) {
      const data = JSON.parse(moderation);
      if (data.action === 'QUARANTINE' || data.action === 'quarantine') {
        return {
          blocked: true,
          reason: 'Failed moderation',
          category: 'automated',
          details: data
        };
      }
    }

    // Check temporary blocks
    const tempBlock = await env.MODERATION_KV.get(`temp_block:${sha256}`);
    if (tempBlock) {
      const data = JSON.parse(tempBlock);
      if (data.expiresAt && Date.now() < data.expiresAt) {
        return {
          blocked: true,
          reason: data.reason || 'Temporarily blocked',
          expiresAt: data.expiresAt,
          details: data
        };
      }
    }

    return {
      blocked: false
    };

  } catch (error) {
    console.error('Error checking block status:', error);
    return {
      blocked: false,
      error: error.message
    };
  }
}

/**
 * Bulk block multiple videos
 * @param {Array} sha256List - List of SHA-256 hashes
 * @param {Object} env - Worker environment
 * @param {Object} details - Blocking details
 * @returns {Object} Results of bulk blocking
 */
export async function bulkBlockContent(sha256List, env, details = {}) {
  const results = {
    successful: [],
    failed: [],
    total: sha256List.length
  };

  for (const sha256 of sha256List) {
    const result = await blockContent(sha256, env, details);
    if (result.success) {
      results.successful.push(sha256);
    } else {
      results.failed.push({ sha256, error: result.error });
    }
  }

  return results;
}

/**
 * Set temporary block that auto-expires
 * @param {string} sha256 - Video SHA-256 hash
 * @param {number} durationMs - Block duration in milliseconds
 * @param {Object} env - Worker environment
 * @param {Object} details - Block details
 * @returns {Object} Result
 */
export async function temporaryBlock(sha256, durationMs, env, details = {}) {
  const expiresAt = Date.now() + durationMs;

  return await blockContent(sha256, env, {
    ...details,
    reason: details.reason || `Temporary block (expires in ${Math.floor(durationMs / 1000)}s)`,
    category: 'temporary',
    expiresAt
  });
}