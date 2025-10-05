// ABOUTME: Admin API endpoints for content moderation and blocking
// ABOUTME: Provides REST API for blocking/unblocking videos without deletion

import { json } from "../router.mjs";
import {
  blockContent,
  unblockContent,
  listBlockedContent,
  checkBlockStatus,
  bulkBlockContent,
  temporaryBlock
} from "../utils/content_blocking.mjs";

/**
 * POST /admin/block/<sha256> - Block a video from being served
 */
export async function blockVideo(req, env, deps) {
  const url = new URL(req.url);
  const sha256Match = url.pathname.match(/^\/admin\/block\/([a-f0-9]{64})$/);

  if (!sha256Match) {
    return json(400, { error: "Invalid SHA-256 hash" });
  }

  const sha256 = sha256Match[1];

  // Check admin authorization
  const adminToken = req.headers.get('X-Admin-Token');
  if (adminToken !== env.MODERATION_ADMIN_TOKEN) {
    return json(401, { error: "Unauthorized" });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const result = await blockContent(sha256, env, {
      reason: body.reason || 'Admin decision',
      category: body.category || 'manual',
      severity: body.severity || 'high',
      notes: body.notes,
      blockedBy: body.admin_id || 'admin',
      appealable: body.appealable !== false,
      expiresAt: body.expires_in ? Date.now() + body.expires_in : null
    });

    if (result.success) {
      console.log(`🚫 Admin blocked content: ${sha256}`);
      return json(200, result);
    } else {
      return json(500, result);
    }
  } catch (error) {
    console.error('Error in blockVideo:', error);
    return json(500, { error: error.message });
  }
}

/**
 * POST /admin/unblock/<sha256> - Unblock a video
 */
export async function unblockVideo(req, env, deps) {
  const url = new URL(req.url);
  const sha256Match = url.pathname.match(/^\/admin\/unblock\/([a-f0-9]{64})$/);

  if (!sha256Match) {
    return json(400, { error: "Invalid SHA-256 hash" });
  }

  const sha256 = sha256Match[1];

  // Check admin authorization
  const adminToken = req.headers.get('X-Admin-Token');
  if (adminToken !== env.MODERATION_ADMIN_TOKEN) {
    return json(401, { error: "Unauthorized" });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const result = await unblockContent(sha256, env, {
      reason: body.reason || 'Admin decision',
      unblockedBy: body.admin_id || 'admin'
    });

    if (result.success) {
      console.log(`✅ Admin unblocked content: ${sha256}`);
      return json(200, result);
    } else {
      return json(500, result);
    }
  } catch (error) {
    console.error('Error in unblockVideo:', error);
    return json(500, { error: error.message });
  }
}

/**
 * GET /admin/blocked - List all blocked content
 */
export async function listBlocked(req, env, deps) {
  // Check admin authorization
  const adminToken = req.headers.get('X-Admin-Token');
  if (adminToken !== env.MODERATION_ADMIN_TOKEN) {
    return json(401, { error: "Unauthorized" });
  }

  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '100');

    const blocked = await listBlockedContent(env, { limit });

    return json(200, {
      count: blocked.length,
      blocked: blocked
    });
  } catch (error) {
    console.error('Error in listBlocked:', error);
    return json(500, { error: error.message });
  }
}

/**
 * GET /admin/check/<sha256> - Check if content is blocked
 */
export async function checkBlock(req, env, deps) {
  const url = new URL(req.url);
  const sha256Match = url.pathname.match(/^\/admin\/check\/([a-f0-9]{64})$/);

  if (!sha256Match) {
    return json(400, { error: "Invalid SHA-256 hash" });
  }

  const sha256 = sha256Match[1];

  // Check admin authorization
  const adminToken = req.headers.get('X-Admin-Token');
  if (adminToken !== env.MODERATION_ADMIN_TOKEN) {
    return json(401, { error: "Unauthorized" });
  }

  try {
    const status = await checkBlockStatus(sha256, env);
    return json(200, status);
  } catch (error) {
    console.error('Error in checkBlock:', error);
    return json(500, { error: error.message });
  }
}

/**
 * POST /admin/block-bulk - Block multiple videos at once
 */
export async function blockBulk(req, env, deps) {
  // Check admin authorization
  const adminToken = req.headers.get('X-Admin-Token');
  if (adminToken !== env.MODERATION_ADMIN_TOKEN) {
    return json(401, { error: "Unauthorized" });
  }

  try {
    const body = await req.json();

    if (!Array.isArray(body.hashes)) {
      return json(400, { error: "hashes must be an array of SHA-256 hashes" });
    }

    const result = await bulkBlockContent(body.hashes, env, {
      reason: body.reason || 'Bulk admin action',
      category: body.category || 'manual',
      severity: body.severity || 'high',
      blockedBy: body.admin_id || 'admin'
    });

    console.log(`🚫 Admin bulk blocked ${result.successful.length} videos`);
    return json(200, result);
  } catch (error) {
    console.error('Error in blockBulk:', error);
    return json(500, { error: error.message });
  }
}

/**
 * POST /admin/temp-block/<sha256> - Temporarily block a video
 */
export async function tempBlock(req, env, deps) {
  const url = new URL(req.url);
  const sha256Match = url.pathname.match(/^\/admin\/temp-block\/([a-f0-9]{64})$/);

  if (!sha256Match) {
    return json(400, { error: "Invalid SHA-256 hash" });
  }

  const sha256 = sha256Match[1];

  // Check admin authorization
  const adminToken = req.headers.get('X-Admin-Token');
  if (adminToken !== env.MODERATION_ADMIN_TOKEN) {
    return json(401, { error: "Unauthorized" });
  }

  try {
    const body = await req.json();

    if (!body.duration) {
      return json(400, { error: "duration (in seconds) is required" });
    }

    const durationMs = body.duration * 1000;

    const result = await temporaryBlock(sha256, durationMs, env, {
      reason: body.reason || `Temporary ${body.duration}s block`,
      blockedBy: body.admin_id || 'admin'
    });

    if (result.success) {
      console.log(`⏱️ Admin temporarily blocked content: ${sha256} for ${body.duration}s`);
      return json(200, result);
    } else {
      return json(500, result);
    }
  } catch (error) {
    console.error('Error in tempBlock:', error);
    return json(500, { error: error.message });
  }
}