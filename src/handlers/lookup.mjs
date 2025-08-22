import { json } from "../router.mjs";
import { getStreamUrls } from "../utils/stream_urls.mjs";

export async function lookupUid(req, env, _deps) {
  const flag = env.LOOKUPS_ENABLED;
  const enabled = flag === true || flag === 'true' || flag === '1';
  if (!enabled) return json(404, { error: 'not_found' });

  const url = new URL(req.url);
  const sha256 = url.searchParams.get('sha256');
  const vineId = url.searchParams.get('vineId');
  const rawUrl = url.searchParams.get('url');

  let key = null;
  if (sha256) key = `idx:sha256:${sha256.toLowerCase()}`;
  else if (vineId) key = `idx:vine:${vineId}`;
  else if (rawUrl) key = `idx:url:${await digestUrl(rawUrl)}`;
  else return json(400, { error: 'bad_request', reason: 'missing_query' });

  const v = await env.MEDIA_KV.get(key);
  if (!v) return json(404, { error: 'not_found' });
  try {
    const obj = JSON.parse(v);
    if (obj && obj.uid) {
      // Get full video data to include original path info
      const videoData = await env.MEDIA_KV.get(`video:${obj.uid}`);
      if (videoData) {
        const data = JSON.parse(videoData);
        const urls = getStreamUrls(obj.uid, env);
        return json(200, { 
          uid: obj.uid,
          status: data.status,
          // Stream URLs
          hlsUrl: data.hlsUrl || urls.hlsUrl,
          dashUrl: data.dashUrl || urls.dashUrl,
          mp4Url: data.mp4Url || urls.mp4Url,
          thumbnailUrl: data.thumbnailUrl || urls.thumbnailUrl,
          // Original path information
          r2Key: data.r2Key,
          migratedFrom: data.migratedFrom,
          originalUrl: data.originalUrl,
          vineId: data.vineId,
          sha256: data.sha256,
          readyToStream: data.status === 'ready'
        });
      }
      return json(200, { uid: obj.uid });
    }
  } catch {}
  return json(404, { error: 'not_found' });
}

async function digestUrl(input) {
  try {
    const u = new URL(input);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
      u.port = '';
    }
    const params = Array.from(u.searchParams.entries()).sort(([a],[b]) => a.localeCompare(b));
    const usp = new URLSearchParams(params);
    u.search = usp.toString() ? `?${usp.toString()}` : '';
    const enc = new TextEncoder();
    const buf = enc.encode(u.toString());
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const arr = Array.from(new Uint8Array(hash));
    return arr.map(b => b.toString(16).padStart(2,'0')).join('');
  } catch {
    return input; // fallback: treat as pre-hashed key (unlikely)
  }
}
