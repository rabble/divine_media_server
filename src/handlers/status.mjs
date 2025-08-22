import { json } from "../router.mjs";

export async function getVideoStatus(req, env, _deps) {
  const url = new URL(req.url);
  const uid = url.pathname.split('/').pop();
  if (!uid) return json(400, { error: 'bad_request', reason: 'missing_uid' });

  const v = await env.MEDIA_KV.get(`video:${uid}`);
  if (!v) return json(404, { error: 'not_found' });
  const data = JSON.parse(v);
  return json(200, {
    uid,
    status: data.status,
    owner: data.owner,
    hlsUrl: data.hlsUrl ?? undefined,
    dashUrl: data.dashUrl ?? undefined,
    thumbnailUrl: data.thumbnailUrl ?? undefined,
    // Include original path information
    r2Key: data.r2Key ?? undefined,
    migratedFrom: data.migratedFrom ?? undefined,
    originalUrl: data.originalUrl ?? undefined,
    vineId: data.vineId ?? undefined,
    sha256: data.sha256 ?? undefined,
  });
}
