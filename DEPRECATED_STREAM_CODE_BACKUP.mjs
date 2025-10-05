// ABOUTME: Backup of all Cloudflare Stream-related code removed from production
// ABOUTME: Kept for reference in case Stream is needed in the future

// ============================================================================
// FROM: src/handlers/videos.mjs
// ============================================================================

export async function createVideoWithStream(req, env, deps) {
  const auth = await deps.verifyNip98(req.clone());
  if (!auth) {
    return json(401, { error: "unauthorized", reason: "invalid_nip98" });
  }

  const url = new URL(req.url);
  const sha256 = url.searchParams.get('sha256');
  const sizeStr = url.searchParams.get('size');

  if (!sha256 || !/^[a-f0-9]{64}$/.test(sha256)) {
    return json(400, { error: "invalid_request", reason: "invalid_sha256" });
  }

  const maxSize = 500 * 1024 * 1024; // 500MB
  const requestedSize = parseInt(sizeStr, 10) || 0;
  if (requestedSize > maxSize) {
    return json(413, { error: "invalid_request", reason: "file_too_large", maxSize });
  }

  const accountId = env.STREAM_ACCOUNT_ID;
  const apiToken = env.STREAM_API_TOKEN;
  if (!accountId || !apiToken) {
    return json(500, { error: "server_error", reason: "misconfigured_stream_env" });
  }

  // Mock mode for testing without real Stream API
  if (env.MOCK_STREAM_API === 'true') {
    const mockUid = 'mock_' + crypto.randomUUID();
    await env.MEDIA_KV.put(`video:${mockUid}`, JSON.stringify({
      uid: mockUid,
      sha256,
      uploadedBy: auth.pubkey,
      createdAt: deps.now(),
      status: 'mock',
      uploadUrl: `https://mock.upload.url/${mockUid}`,
      mockMode: true
    }));

    return json(200, {
      uid: mockUid,
      uploadUrl: `https://mock.upload.url/${mockUid}`,
      mockMode: true
    });
  }

  const existing = await env.MEDIA_KV.get(`sha256:${sha256}`);
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (parsed.uid && parsed.uploadedBy === auth.pubkey) {
        const data = await env.MEDIA_KV.get(`video:${parsed.uid}`);
        if (data) {
          const video = JSON.parse(data);
          return json(200, { uid: parsed.uid, uploadUrl: null, status: video.status });
        }
      }
    } catch (e) {}
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`;

  const body = {
    maxDurationSeconds: 600,
    expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
    requireSignedURLs: false,
    allowedOrigins: ["*"],
    thumbnailTimestampPct: 0.1,
    meta: { sha256, uploadedBy: auth.pubkey, uploadedAt: deps.now().toString() }
  };

  if (env.STREAM_WEBHOOK_SECRET) {
    const webhookBase = env.WEBHOOK_BASE_URL || url.origin;
    body.webhookUrl = `${webhookBase}/v1/stream/webhook`;
  }

  const res = await deps.fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let errorDetails = { message: "Unknown error" };
    try { errorDetails = JSON.parse(text); } catch {}
    return json(res.status >= 500 ? 502 : res.status, {
      error: "stream_error",
      reason: errorDetails.errors?.[0]?.code || "unknown",
      details: errorDetails.errors?.[0]?.message || errorDetails.message || "Unknown error"
    });
  }

  const data = await res.json();
  if (!data.success || !data.result) {
    return json(500, { error: "server_error", reason: "invalid_stream_response" });
  }

  const uid = data.result.uid;
  const uploadUrl = data.result.uploadURL;

  await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify({
    uid, sha256, uploadedBy: auth.pubkey,
    createdAt: deps.now(), status: "uploading",
    uploadUrl, streamData: data.result
  }));
  await env.MEDIA_KV.put(`sha256:${sha256}`, JSON.stringify({
    uid, uploadedBy: auth.pubkey, timestamp: deps.now()
  }));

  return json(200, { uid, uploadUrl });
}

// ============================================================================
// FROM: src/handlers/blossom.mjs - Stream Upload Logic
// ============================================================================

async function uploadVideoToStream(blob, sha256, auth, env, deps) {
  const accountId = env.STREAM_ACCOUNT_ID;
  const apiToken = env.STREAM_API_TOKEN;

  if (!accountId || !apiToken) {
    return { error: "Stream API not configured" };
  }

  // Create Stream direct upload URL
  const streamUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`;

  const createRes = await deps.fetch(streamUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      maxDurationSeconds: 7,
      expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
      requireSignedURLs: false,
      allowedOrigins: ["*"]
    }),
  });

  if (!createRes.ok) {
    const errorText = await createRes.text();
    console.log("🌸 Stream API error:", { status: createRes.status, error: errorText });
    return { error: `Stream API error: ${createRes.status}` };
  }

  const createData = await createRes.json();
  if (!createData.success || !createData.result) {
    return { error: "Invalid Stream API response" };
  }

  const uploadUrl = createData.result.uploadURL;
  const uid = createData.result.uid;

  // Upload the actual video
  const uploadRes = await deps.fetch(uploadUrl, {
    method: "POST",
    body: blob,
    headers: { "Content-Type": "video/mp4" }
  });

  if (!uploadRes.ok) {
    console.log("🌸 Video upload failed:", uploadRes.status);
    return { error: `Upload failed: ${uploadRes.status}` };
  }

  console.log("🌸 Video uploaded to Stream successfully, UID:", uid);

  // Store video metadata in KV
  await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify({
    uid,
    sha256,
    uploadedBy: auth?.pubkey || 'anonymous',
    createdAt: Date.now(),
    status: 'processing',
    fileSize: blob.size
  }));

  await env.MEDIA_KV.put(`sha256:${sha256}`, JSON.stringify({
    uid,
    uploadedBy: auth?.pubkey || 'anonymous',
    timestamp: Date.now()
  }));

  return { success: true, uid };
}

// ============================================================================
// FROM: src/utils/dual_storage.mjs - Stream Upload Function
// ============================================================================

async function uploadToStream(videoBlob, sha256, env, metadata, fetchFn) {
  const accountId = env.STREAM_ACCOUNT_ID;
  const apiToken = env.STREAM_API_TOKEN;

  console.log(`🔄 DUAL STORE: Stream credentials check - Account ID: ${accountId ? 'present' : 'MISSING'}, API Token: ${apiToken ? 'present' : 'MISSING'}`);

  if (!accountId || !apiToken) {
    console.log(`⚠️ DUAL STORE: Stream credentials missing, skipping Stream upload`);
    return {
      error: 'Stream credentials not configured',
      uid: null
    };
  }

  try {
    // Create Stream direct upload URL
    const streamUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`;

    const createRes = await fetchFn(streamUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        maxDurationSeconds: 600, // 10 minutes max
        expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
        requireSignedURLs: false,
        allowedOrigins: ['*'],
        thumbnailTimestampPct: 0.1,
        meta: {
          sha256,
          uploadedBy: metadata.uploadedBy || 'migration',
          sourceUrl: metadata.sourceUrl || '',
          uploadedAt: Date.now().toString()
        }
      }),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      console.error(`❌ DUAL STORE: Stream API error:`, errorText);
      return {
        error: `Stream API error: ${createRes.status}`,
        uid: null
      };
    }

    const createData = await createRes.json();
    if (!createData.success || !createData.result) {
      console.error(`❌ DUAL STORE: Invalid Stream response`);
      return {
        error: 'Invalid Stream API response',
        uid: null
      };
    }

    const uploadUrl = createData.result.uploadURL;
    const uid = createData.result.uid;

    console.log(`📤 DUAL STORE: Uploading to Stream with UID: ${uid}`);

    // Upload the actual video to Stream
    const uploadRes = await fetchFn(uploadUrl, {
      method: 'POST',
      body: videoBlob,
      headers: {
        'Content-Type': 'video/mp4'
      }
    });

    if (!uploadRes.ok) {
      console.error(`❌ DUAL STORE: Stream upload failed:`, uploadRes.status);
      return {
        error: `Stream upload failed: ${uploadRes.status}`,
        uid: null
      };
    }

    console.log(`✅ DUAL STORE: Stream upload successful for UID: ${uid}`);
    return {
      success: true,
      uid
    };

  } catch (error) {
    console.error(`❌ DUAL STORE: Stream upload exception:`, error);
    return {
      error: error.message,
      uid: null
    };
  }
}

// ============================================================================
// FROM: src/handlers/webhook.mjs - Stream Webhook Handler
// ============================================================================

export async function handleStreamWebhook(req, env, deps) {
  if (!await deps.verifyStreamWebhook(req.clone(), env)) {
    return json(401, { error: "invalid_webhook_signature" });
  }

  const payload = await req.json();
  const uid = payload.uid || payload.videoUID;
  if (!uid) return json(400, { error: "missing_uid" });

  const existing = await env.MEDIA_KV.get(`video:${uid}`);
  if (!existing) return json(404, { error: "video_not_found" });

  const current = JSON.parse(existing);
  const mp4Url = payload.mp4Url || payload.downloadUrl || current.mp4Url || null;
  const hlsUrl = payload.hlsUrl || payload.playback?.hls || current.hlsUrl || null;
  const dashUrl = payload.dashUrl || payload.playback?.dash || current.dashUrl || null;
  const thumbnailUrl = payload.thumbnailUrl || payload.thumbnails?.["default"] || current.thumbnailUrl || null;
  const status = payload.ready === true || payload.status === "ready" || payload.status === "published" ? "published" : current.status || "processing";

  const updated = {
    ...current, status, mp4Url, hlsUrl, dashUrl, thumbnailUrl,
    updatedAt: deps.now(),
  };

  await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify(updated));

  // Auto-enable downloads when Stream video is ready
  if (status === "published" && mp4Url === null && !current.downloadsEnabled) {
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
          console.log("✅ Downloads enabled successfully for UID:", uid);
          updated.downloadsEnabled = true;
          updated.mp4Url = `https://${env.STREAM_DOMAIN || 'customer-4c3uhd5qzuhwz9hu.cloudflarestream.com'}/${uid}/downloads/default.mp4`;
          await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify(updated));
        } else {
          console.error("❌ Failed to enable downloads:", await downloadRes.text());
        }
      }
    } catch (error) {
      console.error("❌ Error enabling downloads:", error);
    }
  }

  return json(200, { success: true, uid, status });
}

// ============================================================================
// FROM: src/handlers/blossom.mjs - Delete from Stream
// ============================================================================

async function deleteFromStream(uid, env, deps) {
  const accountId = env.STREAM_ACCOUNT_ID;
  const apiToken = env.STREAM_API_TOKEN;

  if (accountId && apiToken && !env.MOCK_STREAM_API) {
    const deleteUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`;
    await deps.fetch(deleteUrl, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
      },
    });
  }
}

// ============================================================================
// Configuration that would be removed from wrangler.toml:
// ============================================================================
/*
STREAM_ACCOUNT_ID = "c84e7a9bf7ed99cb41b8e73566568c75"
STREAM_API_TOKEN secret
STREAM_WEBHOOK_SECRET secret
STREAM_DOMAIN = "cdn.divine.video"  # This might still be needed for CDN

Remove these from:
- wrangler.toml (all environments)
- cdn-proxy-wrangler.toml
*/

// ============================================================================
// Test files that would be removed:
// ============================================================================
/*
- test_stream_direct.mjs
- test_stream_debug.mjs
- check_recent_activity.mjs (if it's only for Stream)
*/