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

  // Auto-enable MP4 downloads when video becomes ready
  if (status === "published" && current.status !== "published") {
    console.log("🔔 Auto-enabling downloads for newly published UID:", uid);
    try {
      const accountId = env.STREAM_ACCOUNT_ID;
      const apiToken = env.STREAM_API_TOKEN;

      if (accountId && apiToken) {
        const downloadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`;
        const downloadRes = await deps.fetch(downloadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (downloadRes.ok) {
          console.log("🔔 Downloads enabled successfully for UID:", uid);
        } else {
          console.log("🔔 Download enable failed for UID:", uid, "status:", downloadRes.status);
        }
      }
    } catch (error) {
      console.log("🔔 Download enable error for UID:", uid, "error:", error.message);
    }
  }

  return json(200, { ok: true });
}
