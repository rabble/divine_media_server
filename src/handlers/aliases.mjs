import { json } from "../router.mjs";

export async function addAliases(req, env, deps) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth) return json(401, { error: 'unauthorized', reason: 'missing_nip98' });
  const verified = await deps.verifyNip98(req);
  if (!verified) return json(403, { error: 'forbidden', reason: 'invalid_nip98' });

  const url = new URL(req.url);
  const segments = url.pathname.split('/');
  const uid = segments.slice(-2, -1)[0];
  if (!uid) return json(400, { error: 'bad_request', reason: 'missing_uid' });

  const existing = await env.MEDIA_KV.get(`video:${uid}`);
  if (!existing) return json(404, { error: 'not_found' });
  const video = JSON.parse(existing);
  if (video.owner && video.owner !== verified.pubkey) {
    return json(403, { error: 'forbidden', reason: 'not_owner' });
  }

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'bad_request', reason: 'invalid_json' }); }
  const updates = {};
  const conflicts = [];

  if (body.sha256) {
    const hex = String(body.sha256).toLowerCase();
    const key = `idx:sha256:${hex}`;
    const existingIdx = await env.MEDIA_KV.get(key);
    if (existingIdx) {
      try { const obj = JSON.parse(existingIdx); if (obj.uid && obj.uid !== uid) conflicts.push('sha256'); }
      catch { conflicts.push('sha256'); }
    }
    updates.sha256 = hex;
  }
  if (body.vineId) {
    const key = `idx:vine:${body.vineId}`;
    const existingIdx = await env.MEDIA_KV.get(key);
    if (existingIdx) { try { const obj = JSON.parse(existingIdx); if (obj.uid && obj.uid !== uid) conflicts.push('vineId'); } catch { conflicts.push('vineId'); } }
    updates.vineId = body.vineId;
  }
  if (body.url) {
    const digest = await digestUrl(body.url);
    const key = `idx:url:${digest}`;
    const existingIdx = await env.MEDIA_KV.get(key);
    if (existingIdx) { try { const obj = JSON.parse(existingIdx); if (obj.uid && obj.uid !== uid) conflicts.push('url'); } catch { conflicts.push('url'); } }
    updates.originalUrl = String(body.url);
    updates._urlDigest = digest;
  }

  if (!Object.keys(updates).length) return json(400, { error: 'bad_request', reason: 'no_aliases' });
  if (conflicts.length) return json(409, { error: 'conflict', fields: conflicts });

  // Write indexes
  if (updates.sha256) await env.MEDIA_KV.put(`idx:sha256:${updates.sha256}`, JSON.stringify({ uid }));
  if (updates.vineId) await env.MEDIA_KV.put(`idx:vine:${updates.vineId}`, JSON.stringify({ uid }));
  if (updates._urlDigest) await env.MEDIA_KV.put(`idx:url:${updates._urlDigest}`, JSON.stringify({ uid, url: updates.originalUrl }));

  // Merge into video record
  const merged = { ...video, ...('sha256' in updates ? { sha256: updates.sha256 } : {}), ...('vineId' in updates ? { vineId: updates.vineId } : {}), ...('originalUrl' in updates ? { originalUrl: updates.originalUrl } : {}), updatedAt: deps.now?.() ?? Date.now() };
  await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify(merged));

  return json(200, { ok: true });
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
    return input;
  }
}
