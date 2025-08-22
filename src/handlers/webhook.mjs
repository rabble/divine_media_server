import { json } from "../router.mjs";

export async function handleStreamWebhook(req, env, deps) {
  const ok = await deps.verifyStreamWebhook(req, env);
  if (!ok) return json(403, { error: "forbidden", reason: "invalid_webhook_signature" });

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "bad_request", reason: "invalid_json" });
  }

  const uid = payload.uid || payload.id;
  if (!uid) return json(400, { error: "bad_request", reason: "missing_uid" });

  const key = `video:${uid}`;
  let current = {};
  try {
    const existing = await env.MEDIA_KV.get(key);
    current = existing ? JSON.parse(existing) : {};
  } catch {}

  // Derive URLs from payload in a tolerant way
  const hlsUrl = payload.hlsUrl || payload.playback?.hls || current.hlsUrl || null;
  const dashUrl = payload.dashUrl || payload.playback?.dash || current.dashUrl || null;
  const thumbnailUrl = payload.thumbnailUrl || payload.thumbnails?.["default"] || current.thumbnailUrl || null;
  const status = payload.ready === true || payload.status === "ready" || payload.status === "published" ? "published" : current.status || "processing";

  const updated = {
    ...current,
    status,
    hlsUrl,
    dashUrl,
    thumbnailUrl,
    updatedAt: deps.now(),
  };

  await env.MEDIA_KV.put(key, JSON.stringify(updated));
  return json(200, { ok: true });
}
