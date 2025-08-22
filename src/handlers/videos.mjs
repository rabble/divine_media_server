import { json } from "../router.mjs";

export async function createVideo(req, env, deps) {
  // Require NIP-98 Authorization header
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) {
    return json(401, { error: "unauthorized", reason: "missing_nip98" });
  }
  if (!auth.startsWith('Nostr ')) {
    return json(400, { error: 'bad_request', reason: 'malformed_nip98' });
  }
  const verified = await deps.verifyNip98(req);
  if (!verified) {
    return json(403, { error: "forbidden", reason: "invalid_nip98" });
  }

  // Simple per-pubkey rate limit: 30/hour bucket
  const limit = 30;
  const bucket = Math.floor(deps.now() / 3600000);
  const rlKey = `rl:pub:${verified.pubkey}:${bucket}`;
  const currentStr = await env.MEDIA_KV.get(rlKey);
  const current = currentStr ? parseInt(currentStr, 10) : 0;
  if (!Number.isNaN(current) && current >= limit) {
    return json(429, { error: "rate_limited" });
  }

  // Optional body with aliases
  let bodyJson = null;
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { bodyJson = await req.json(); } catch {}
  }
  const providedSha = bodyJson?.sha256 ? String(bodyJson.sha256).toLowerCase() : null;
  const providedVine = bodyJson?.vineId ? String(bodyJson.vineId) : null;
  const providedUrl = bodyJson?.originalUrl ? String(bodyJson.originalUrl) : null;

  // Pre-check conflicts for provided aliases
  if (providedSha) {
    const ex = await env.MEDIA_KV.get(`idx:sha256:${providedSha}`);
    if (ex) return json(409, { error: 'conflict', fields: ['sha256'] });
  }
  if (providedVine) {
    const ex = await env.MEDIA_KV.get(`idx:vine:${providedVine}`);
    if (ex) return json(409, { error: 'conflict', fields: ['vineId'] });
  }
  let urlDigest = null;
  if (providedUrl) {
    urlDigest = await digestUrl(providedUrl);
    const ex = await env.MEDIA_KV.get(`idx:url:${urlDigest}`);
    if (ex) return json(409, { error: 'conflict', fields: ['url'] });
  }

  const accountId = env.STREAM_ACCOUNT_ID;
  const apiToken = env.STREAM_API_TOKEN;
  if (!accountId || !apiToken) {
    return json(500, { error: "server_error", reason: "misconfigured_stream_env" });
  }

  // Mock mode for testing without real Stream API
  if (env.MOCK_STREAM_API === 'true') {
    const mockUid = 'mock_' + crypto.randomUUID();
    const mockUploadUrl = `https://upload.mockstream.example.com/${mockUid}`;
    const expiresAt = new Date(deps.now() + 3600000).toISOString();
    
    const video = {
      status: 'pending_upload',
      owner: verified.pubkey,
      createdAt: deps.now(),
      sha256: providedSha,
      vineId: providedVine,
      originalUrl: providedUrl,
    };
    
    await env.MEDIA_KV.put(`video:${mockUid}`, JSON.stringify(video));
    if (providedSha) await env.MEDIA_KV.put(`idx:sha256:${providedSha}`, JSON.stringify({ uid: mockUid }));
    if (providedVine) await env.MEDIA_KV.put(`idx:vine:${providedVine}`, JSON.stringify({ uid: mockUid }));
    if (urlDigest) await env.MEDIA_KV.put(`idx:url:${urlDigest}`, JSON.stringify({ uid: mockUid, url: providedUrl }));
    await env.MEDIA_KV.put(`idx:pubkey:${verified.pubkey}:${mockUid}`, '1');
    await env.MEDIA_KV.put(rlKey, String(current + 1), { expirationTtl: 3600 });
    
    return json(200, {
      uid: mockUid,
      uploadURL: mockUploadUrl,
      expiresAt,
      owner: verified.pubkey,
    });
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`;

  const body = {
    maxDurationSeconds: 21600, // 6 hours max
    requireSignedURLs: false,
    allowedOrigins: ["*"]
  };
  
  // Add metadata if provided
  const meta = {};
  if (verified.pubkey) meta.pubkey = verified.pubkey;
  if (providedSha) meta.sha256 = providedSha;
  if (providedVine) meta.vineId = providedVine;
  if (providedUrl) meta.originalUrl = providedUrl;
  
  if (Object.keys(meta).length > 0) {
    body.meta = meta;
  }

  const res = await deps.fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errorDetail = null;
    try {
      const errorBody = await res.json();
      errorDetail = errorBody.errors?.[0]?.message || errorBody.error || null;
    } catch {}
    return json(502, { error: "stream_error", status: res.status, detail: errorDetail });
  }
  const data = await res.json();
  const result = data?.result ?? {};
  const uid = result.id || result.uid;
  const uploadURL = result.uploadURL || result.uploadUrl;
  const expiresAt = result.expiresAt || null;
  if (!uid || !uploadURL) {
    return json(502, { error: "stream_error", reason: "missing_result" });
  }

  const record = {
    status: "pending_upload",
    owner: verified.pubkey,
    createdAt: deps.now(),
    ...(providedSha ? { sha256: providedSha } : {}),
    ...(providedVine ? { vineId: providedVine } : {}),
    ...(providedUrl ? { originalUrl: providedUrl } : {}),
  };
  await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify(record));
  // Sparse index by publisher for listing
  try { await env.MEDIA_KV.put(`idx:pubkey:${verified.pubkey}:${uid}`, "1"); } catch {}
  // Write provided indexes
  try {
    if (providedSha) await env.MEDIA_KV.put(`idx:sha256:${providedSha}`, JSON.stringify({ uid }));
    if (providedVine) await env.MEDIA_KV.put(`idx:vine:${providedVine}`, JSON.stringify({ uid }));
    if (urlDigest) await env.MEDIA_KV.put(`idx:url:${urlDigest}`, JSON.stringify({ uid, url: providedUrl }));
  } catch {}
  // Increment rate counter (best-effort)
  try { await env.MEDIA_KV.put(rlKey, String(current + 1)); } catch {}

  return json(200, { uid, uploadURL, expiresAt, owner: verified.pubkey });
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
