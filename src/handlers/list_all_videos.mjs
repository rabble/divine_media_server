// ABOUTME: Handler to list all video UIDs for batch operations
// ABOUTME: Returns paginated list of all video UIDs in the system

import { json } from "../router.mjs";

export async function listAllVideoUIDs(req, env, deps) {
  try {
    const url = new URL(req.url);
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '1000'), 1000);

    console.log(`📋 Listing video UIDs, cursor: ${cursor}, limit: ${limit}`);

    // List all keys with video: prefix
    const listOptions = {
      prefix: 'video:',
      limit: limit
    };

    if (cursor) {
      listOptions.cursor = cursor;
    }

    const result = await env.MEDIA_KV.list(listOptions);

    // Extract UIDs from the keys (remove 'video:' prefix)
    const uids = result.keys.map(key => key.name.substring(6)); // Remove 'video:' prefix

    console.log(`📋 Found ${uids.length} videos${result.list_complete ? ' (complete)' : ' (more available)'}`);

    return json(200, {
      uids: uids,
      cursor: result.cursor,
      list_complete: result.list_complete,
      total_returned: uids.length
    });

  } catch (error) {
    console.error('❌ Error listing video UIDs:', error);
    return json(500, {
      error: 'server_error',
      message: error.message
    });
  }
}