import { json } from "../router.mjs";

export async function listUserVideos(req, env, _deps) {
  const url = new URL(req.url);
  const parts = url.pathname.split('/');
  // Expect /v1/users/{pubkey}/videos
  const pubkey = parts[3];
  if (!pubkey) return json(400, { error: 'bad_request', reason: 'missing_pubkey' });

  const kv = env.MEDIA_KV;
  if (!kv || typeof kv.list !== 'function') {
    return json(501, { error: 'not_implemented', reason: 'kv_list_unsupported' });
  }
  const prefix = `idx:pubkey:${pubkey}:`;
  const out = [];
  let cursor = undefined;
  // Simple pagination loop in case of many entries
  while (true) {
    const res = await kv.list({ prefix, cursor });
    for (const k of res.keys || []) {
      const name = k.name || '';
      const uid = name.slice(prefix.length);
      if (uid) out.push(uid);
    }
    if (!res.list_complete && res.cursor) {
      cursor = res.cursor;
    } else {
      break;
    }
  }
  return json(200, { pubkey, uids: out });
}

