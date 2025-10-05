var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// .wrangler/tmp/bundle-GcmkCz/checked-fetch.js
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
var urls;
var init_checked_fetch = __esm({
  ".wrangler/tmp/bundle-GcmkCz/checked-fetch.js"() {
    urls = /* @__PURE__ */ new Set();
    __name(checkURL, "checkURL");
    globalThis.fetch = new Proxy(globalThis.fetch, {
      apply(target, thisArg, argArray) {
        const [request, init] = argArray;
        checkURL(request, init);
        return Reflect.apply(target, thisArg, argArray);
      }
    });
  }
});

// wrangler-modules-watch:wrangler:modules-watch
var init_wrangler_modules_watch = __esm({
  "wrangler-modules-watch:wrangler:modules-watch"() {
    init_checked_fetch();
    init_modules_watch_stub();
  }
});

// ../../../.nvm/versions/node/v23.7.0/lib/node_modules/wrangler/templates/modules-watch-stub.js
var init_modules_watch_stub = __esm({
  "../../../.nvm/versions/node/v23.7.0/lib/node_modules/wrangler/templates/modules-watch-stub.js"() {
    init_wrangler_modules_watch();
  }
});

// src/router.mjs
function notFound() {
  return new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: { "content-type": "application/json" }
  });
}
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
function createRouter(routes) {
  return async (req, env, deps) => {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    for (const r of routes) {
      if (r.method === method) {
        const m = url.pathname.match(r.path);
        if (m) {
          return r.handler(req, env, deps);
        }
      }
    }
    return notFound();
  };
}
var init_router = __esm({
  "src/router.mjs"() {
    init_checked_fetch();
    init_modules_watch_stub();
    __name(notFound, "notFound");
    __name(json, "json");
    __name(createRouter, "createRouter");
  }
});

// src/handlers/videos.mjs
var videos_exports = {};
__export(videos_exports, {
  createVideo: () => createVideo
});
async function createVideo(req, env, deps) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) {
    return json(401, { error: "unauthorized", reason: "missing_nip98" });
  }
  if (!auth.startsWith("Nostr ")) {
    return json(400, { error: "bad_request", reason: "malformed_nip98" });
  }
  const verified = await deps.verifyNip98(req);
  if (!verified) {
    return json(403, { error: "forbidden", reason: "invalid_nip98" });
  }
  let bodyJson = null;
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      bodyJson = await req.json();
    } catch {
    }
  }
  const providedSha = bodyJson?.sha256 ? String(bodyJson.sha256).toLowerCase() : null;
  const providedVine = bodyJson?.vineId ? String(bodyJson.vineId) : null;
  const providedUrl = bodyJson?.originalUrl ? String(bodyJson.originalUrl) : null;
  if (providedSha) {
    const ex = await env.MEDIA_KV.get(`idx:sha256:${providedSha}`);
    if (ex) return json(409, { error: "conflict", fields: ["sha256"] });
  }
  if (providedVine) {
    const ex = await env.MEDIA_KV.get(`idx:vine:${providedVine}`);
    if (ex) return json(409, { error: "conflict", fields: ["vineId"] });
  }
  let urlDigest = null;
  if (providedUrl) {
    urlDigest = await digestUrl(providedUrl);
    const ex = await env.MEDIA_KV.get(`idx:url:${urlDigest}`);
    if (ex) return json(409, { error: "conflict", fields: ["url"] });
  }
  const accountId = env.STREAM_ACCOUNT_ID;
  const apiToken = env.STREAM_API_TOKEN;
  if (!accountId || !apiToken) {
    return json(500, { error: "server_error", reason: "misconfigured_stream_env" });
  }
  if (env.MOCK_STREAM_API === "true") {
    const mockUid = "mock_" + crypto.randomUUID();
    const mockUploadUrl = `https://upload.mockstream.example.com/${mockUid}`;
    const expiresAt2 = new Date(deps.now() + 36e5).toISOString();
    const video = {
      status: "pending_upload",
      owner: verified.pubkey,
      createdAt: deps.now(),
      sha256: providedSha,
      vineId: providedVine,
      originalUrl: providedUrl
    };
    await env.MEDIA_KV.put(`video:${mockUid}`, JSON.stringify(video));
    if (providedSha) await env.MEDIA_KV.put(`idx:sha256:${providedSha}`, JSON.stringify({ uid: mockUid }));
    if (providedVine) await env.MEDIA_KV.put(`idx:vine:${providedVine}`, JSON.stringify({ uid: mockUid }));
    if (urlDigest) await env.MEDIA_KV.put(`idx:url:${urlDigest}`, JSON.stringify({ uid: mockUid, url: providedUrl }));
    await env.MEDIA_KV.put(`idx:pubkey:${verified.pubkey}:${mockUid}`, "1");
    return json(200, {
      uid: mockUid,
      uploadURL: mockUploadUrl,
      expiresAt: expiresAt2,
      owner: verified.pubkey
    });
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`;
  const body = {
    maxDurationSeconds: 21600,
    // 6 hours max
    requireSignedURLs: false,
    allowedOrigins: ["*"]
  };
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
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let errorDetail = null;
    try {
      const errorBody = await res.json();
      errorDetail = errorBody.errors?.[0]?.message || errorBody.error || null;
    } catch {
    }
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
    ...providedSha ? { sha256: providedSha } : {},
    ...providedVine ? { vineId: providedVine } : {},
    ...providedUrl ? { originalUrl: providedUrl } : {}
  };
  await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify(record));
  try {
    await env.MEDIA_KV.put(`idx:pubkey:${verified.pubkey}:${uid}`, "1");
  } catch {
  }
  try {
    if (providedSha) await env.MEDIA_KV.put(`idx:sha256:${providedSha}`, JSON.stringify({ uid }));
    if (providedVine) await env.MEDIA_KV.put(`idx:vine:${providedVine}`, JSON.stringify({ uid }));
    if (urlDigest) await env.MEDIA_KV.put(`idx:url:${urlDigest}`, JSON.stringify({ uid, url: providedUrl }));
  } catch {
  }
  return json(200, { uid, uploadURL, expiresAt, owner: verified.pubkey });
}
async function digestUrl(input) {
  try {
    const u = new URL(input);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.protocol === "http:" && u.port === "80" || u.protocol === "https:" && u.port === "443") {
      u.port = "";
    }
    const params = Array.from(u.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    const usp = new URLSearchParams(params);
    u.search = usp.toString() ? `?${usp.toString()}` : "";
    const enc = new TextEncoder();
    const buf = enc.encode(u.toString());
    const hash = await crypto.subtle.digest("SHA-256", buf);
    const arr = Array.from(new Uint8Array(hash));
    return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return input;
  }
}
var init_videos = __esm({
  "src/handlers/videos.mjs"() {
    init_checked_fetch();
    init_modules_watch_stub();
    init_router();
    __name(createVideo, "createVideo");
    __name(digestUrl, "digestUrl");
  }
});

// src/utils/stream_urls.mjs
var stream_urls_exports = {};
__export(stream_urls_exports, {
  extractUidFromStreamUrl: () => extractUidFromStreamUrl,
  getHybridUrls: () => getHybridUrls,
  getR2Url: () => getR2Url,
  getStreamUrls: () => getStreamUrls,
  isStreamUrl: () => isStreamUrl,
  normalizeVideoUrl: () => normalizeVideoUrl
});
function getStreamUrls(uid, env, options = {}) {
  const cdnDomain = env.CDN_DOMAIN || "cdn.divine.video";
  const streamDomain = env.STREAM_DOMAIN || `customer-${env.STREAM_ACCOUNT_ID}.cloudflarestream.com`;
  const domain = options.useStreamDomain ? streamDomain : cdnDomain;
  return {
    hlsUrl: `https://${domain}/${uid}/manifest/video.m3u8`,
    dashUrl: `https://${domain}/${uid}/manifest/video.mpd`,
    mp4Url: `https://${domain}/${uid}/downloads/default.mp4`,
    thumbnailUrl: `https://${domain}/${uid}/thumbnails/thumbnail.jpg`,
    iframeUrl: `https://${domain}/${uid}/iframe`,
    // Additional formats
    webmUrl: `https://${domain}/${uid}/downloads/webm.webm`,
    posterUrl: `https://${domain}/${uid}/thumbnails/thumbnail.jpg?time=0s`,
    animatedThumbnailUrl: `https://${domain}/${uid}/thumbnails/thumbnail.gif`
  };
}
function getHybridUrls(uid, sha2562, env, r2Available = false) {
  const cdnDomain = env.CDN_DOMAIN || "cdn.divine.video";
  return {
    // HLS/DASH always from Stream via CDN
    hlsUrl: `https://${cdnDomain}/${uid}/manifest/video.m3u8`,
    dashUrl: `https://${cdnDomain}/${uid}/manifest/video.mpd`,
    // MP4: Blossom-style URL if available in R2, otherwise fallback
    mp4Url: r2Available && sha2562 ? `https://${cdnDomain}/${sha2562}.mp4` : `https://${cdnDomain}/${uid}/downloads/default.mp4`,
    // Thumbnails from Stream via CDN
    thumbnailUrl: `https://${cdnDomain}/${uid}/thumbnails/thumbnail.jpg`,
    // Additional formats
    iframeUrl: `https://${cdnDomain}/${uid}/iframe`,
    webmUrl: `https://${cdnDomain}/${uid}/downloads/webm.webm`,
    posterUrl: `https://${cdnDomain}/${uid}/thumbnails/thumbnail.jpg?time=0s`,
    animatedThumbnailUrl: `https://${cdnDomain}/${uid}/thumbnails/thumbnail.gif`,
    // Blossom protocol URLs (for Nostr events)
    blossomUrl: sha2562 ? `https://${cdnDomain}/${sha2562}` : null,
    blossomMp4Url: sha2562 ? `https://${cdnDomain}/${sha2562}.mp4` : null
  };
}
function getR2Url(r2Key, env) {
  if (env.R2_PUBLIC_DOMAIN) {
    return `https://${env.R2_PUBLIC_DOMAIN}/${r2Key}`;
  }
  if (env.R2_BUCKET_URL) {
    return `${env.R2_BUCKET_URL}/${r2Key}`;
  }
  return `https://pub-${env.R2_BUCKET_ID}.r2.dev/${r2Key}`;
}
function isStreamUrl(url) {
  return url.includes(".cloudflarestream.com/") || url.includes("/manifest/video.m3u8") || url.includes("/manifest/video.mpd");
}
function extractUidFromStreamUrl(url) {
  const match = url.match(/\/([a-f0-9]{32})\//);
  return match ? match[1] : null;
}
function normalizeVideoUrl(url, env) {
  const uid = extractUidFromStreamUrl(url);
  if (uid) {
    return getStreamUrls(uid, env).hlsUrl;
  }
  return url;
}
var init_stream_urls = __esm({
  "src/utils/stream_urls.mjs"() {
    init_checked_fetch();
    init_modules_watch_stub();
    __name(getStreamUrls, "getStreamUrls");
    __name(getHybridUrls, "getHybridUrls");
    __name(getR2Url, "getR2Url");
    __name(isStreamUrl, "isStreamUrl");
    __name(extractUidFromStreamUrl, "extractUidFromStreamUrl");
    __name(normalizeVideoUrl, "normalizeVideoUrl");
  }
});

// node_modules/@noble/hashes/esm/crypto.js
var crypto2;
var init_crypto = __esm({
  "node_modules/@noble/hashes/esm/crypto.js"() {
    init_checked_fetch();
    init_modules_watch_stub();
    crypto2 = typeof globalThis === "object" && "crypto" in globalThis ? globalThis.crypto : void 0;
  }
});

// node_modules/@noble/hashes/esm/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function asciiToBase16(ch) {
  if (ch >= asciis._0 && ch <= asciis._9)
    return ch - asciis._0;
  if (ch >= asciis.A && ch <= asciis.F)
    return ch - (asciis.A - 10);
  if (ch >= asciis.a && ch <= asciis.f)
    return ch - (asciis.a - 10);
  return;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  if (hasHexBuiltin)
    return Uint8Array.fromHex(hex);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new Error("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
function concatBytes(...arrays) {
  let sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    abytes(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0; i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
function createHasher(hashCons) {
  const hashC = /* @__PURE__ */ __name((msg) => hashCons().update(toBytes(msg)).digest(), "hashC");
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
function randomBytes(bytesLength = 32) {
  if (crypto2 && typeof crypto2.getRandomValues === "function") {
    return crypto2.getRandomValues(new Uint8Array(bytesLength));
  }
  if (crypto2 && typeof crypto2.randomBytes === "function") {
    return Uint8Array.from(crypto2.randomBytes(bytesLength));
  }
  throw new Error("crypto.getRandomValues must be defined");
}
var hasHexBuiltin, hexes, asciis, Hash;
var init_utils = __esm({
  "node_modules/@noble/hashes/esm/utils.js"() {
    init_checked_fetch();
    init_modules_watch_stub();
    init_crypto();
    __name(isBytes, "isBytes");
    __name(anumber, "anumber");
    __name(abytes, "abytes");
    __name(ahash, "ahash");
    __name(aexists, "aexists");
    __name(aoutput, "aoutput");
    __name(clean, "clean");
    __name(createView, "createView");
    __name(rotr, "rotr");
    hasHexBuiltin = /* @__PURE__ */ (() => (
      // @ts-ignore
      typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
    ))();
    hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
    __name(bytesToHex, "bytesToHex");
    asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
    __name(asciiToBase16, "asciiToBase16");
    __name(hexToBytes, "hexToBytes");
    __name(utf8ToBytes, "utf8ToBytes");
    __name(toBytes, "toBytes");
    __name(concatBytes, "concatBytes");
    Hash = class {
      static {
        __name(this, "Hash");
      }
    };
    __name(createHasher, "createHasher");
    __name(randomBytes, "randomBytes");
  }
});

// node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD, SHA256_IV;
var init_md = __esm({
  "node_modules/@noble/hashes/esm/_md.js"() {
    init_checked_fetch();
    init_modules_watch_stub();
    init_utils();
    __name(setBigUint64, "setBigUint64");
    __name(Chi, "Chi");
    __name(Maj, "Maj");
    HashMD = class extends Hash {
      static {
        __name(this, "HashMD");
      }
      constructor(blockLen, outputLen, padOffset, isLE) {
        super();
        this.finished = false;
        this.length = 0;
        this.pos = 0;
        this.destroyed = false;
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE;
        this.buffer = new Uint8Array(blockLen);
        this.view = createView(this.buffer);
      }
      update(data) {
        aexists(this);
        data = toBytes(data);
        abytes(data);
        const { view, buffer, blockLen } = this;
        const len = data.length;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          if (take === blockLen) {
            const dataView = createView(data);
            for (; blockLen <= len - pos; pos += blockLen)
              this.process(dataView, pos);
            continue;
          }
          buffer.set(data.subarray(pos, pos + take), this.pos);
          this.pos += take;
          pos += take;
          if (this.pos === blockLen) {
            this.process(view, 0);
            this.pos = 0;
          }
        }
        this.length += data.length;
        this.roundClean();
        return this;
      }
      digestInto(out) {
        aexists(this);
        aoutput(out, this);
        this.finished = true;
        const { buffer, view, blockLen, isLE } = this;
        let { pos } = this;
        buffer[pos++] = 128;
        clean(this.buffer.subarray(pos));
        if (this.padOffset > blockLen - pos) {
          this.process(view, 0);
          pos = 0;
        }
        for (let i = pos; i < blockLen; i++)
          buffer[i] = 0;
        setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
        this.process(view, 0);
        const oview = createView(out);
        const len = this.outputLen;
        if (len % 4)
          throw new Error("_sha2: outputLen should be aligned to 32bit");
        const outLen = len / 4;
        const state = this.get();
        if (outLen > state.length)
          throw new Error("_sha2: outputLen bigger than state");
        for (let i = 0; i < outLen; i++)
          oview.setUint32(4 * i, state[i], isLE);
      }
      digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
      }
      _cloneInto(to) {
        to || (to = new this.constructor());
        to.set(...this.get());
        const { blockLen, buffer, length, finished, destroyed, pos } = this;
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        if (length % blockLen)
          to.buffer.set(buffer);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
    };
    SHA256_IV = /* @__PURE__ */ Uint32Array.from([
      1779033703,
      3144134277,
      1013904242,
      2773480762,
      1359893119,
      2600822924,
      528734635,
      1541459225
    ]);
  }
});

// node_modules/@noble/hashes/esm/sha2.js
var SHA256_K, SHA256_W, SHA256, sha256;
var init_sha2 = __esm({
  "node_modules/@noble/hashes/esm/sha2.js"() {
    init_checked_fetch();
    init_modules_watch_stub();
    init_md();
    init_utils();
    SHA256_K = /* @__PURE__ */ Uint32Array.from([
      1116352408,
      1899447441,
      3049323471,
      3921009573,
      961987163,
      1508970993,
      2453635748,
      2870763221,
      3624381080,
      310598401,
      607225278,
      1426881987,
      1925078388,
      2162078206,
      2614888103,
      3248222580,
      3835390401,
      4022224774,
      264347078,
      604807628,
      770255983,
      1249150122,
      1555081692,
      1996064986,
      2554220882,
      2821834349,
      2952996808,
      3210313671,
      3336571891,
      3584528711,
      113926993,
      338241895,
      666307205,
      773529912,
      1294757372,
      1396182291,
      1695183700,
      1986661051,
      2177026350,
      2456956037,
      2730485921,
      2820302411,
      3259730800,
      3345764771,
      3516065817,
      3600352804,
      4094571909,
      275423344,
      430227734,
      506948616,
      659060556,
      883997877,
      958139571,
      1322822218,
      1537002063,
      1747873779,
      1955562222,
      2024104815,
      2227730452,
      2361852424,
      2428436474,
      2756734187,
      3204031479,
      3329325298
    ]);
    SHA256_W = /* @__PURE__ */ new Uint32Array(64);
    SHA256 = class extends HashMD {
      static {
        __name(this, "SHA256");
      }
      constructor(outputLen = 32) {
        super(64, outputLen, 8, false);
        this.A = SHA256_IV[0] | 0;
        this.B = SHA256_IV[1] | 0;
        this.C = SHA256_IV[2] | 0;
        this.D = SHA256_IV[3] | 0;
        this.E = SHA256_IV[4] | 0;
        this.F = SHA256_IV[5] | 0;
        this.G = SHA256_IV[6] | 0;
        this.H = SHA256_IV[7] | 0;
      }
      get() {
        const { A, B, C, D, E, F, G, H } = this;
        return [A, B, C, D, E, F, G, H];
      }
      // prettier-ignore
      set(A, B, C, D, E, F, G, H) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
        this.E = E | 0;
        this.F = F | 0;
        this.G = G | 0;
        this.H = H | 0;
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4)
          SHA256_W[i] = view.getUint32(offset, false);
        for (let i = 16; i < 64; i++) {
          const W15 = SHA256_W[i - 15];
          const W2 = SHA256_W[i - 2];
          const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
          const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
          SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
        }
        let { A, B, C, D, E, F, G, H } = this;
        for (let i = 0; i < 64; i++) {
          const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
          const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
          const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
          const T2 = sigma0 + Maj(A, B, C) | 0;
          H = G;
          G = F;
          F = E;
          E = D + T1 | 0;
          D = C;
          C = B;
          B = A;
          A = T1 + T2 | 0;
        }
        A = A + this.A | 0;
        B = B + this.B | 0;
        C = C + this.C | 0;
        D = D + this.D | 0;
        E = E + this.E | 0;
        F = F + this.F | 0;
        G = G + this.G | 0;
        H = H + this.H | 0;
        this.set(A, B, C, D, E, F, G, H);
      }
      roundClean() {
        clean(SHA256_W);
      }
      destroy() {
        this.set(0, 0, 0, 0, 0, 0, 0, 0);
        clean(this.buffer);
      }
    };
    sha256 = /* @__PURE__ */ createHasher(() => new SHA256());
  }
});

// node_modules/@noble/hashes/esm/hmac.js
var HMAC, hmac;
var init_hmac = __esm({
  "node_modules/@noble/hashes/esm/hmac.js"() {
    init_checked_fetch();
    init_modules_watch_stub();
    init_utils();
    HMAC = class extends Hash {
      static {
        __name(this, "HMAC");
      }
      constructor(hash, _key) {
        super();
        this.finished = false;
        this.destroyed = false;
        ahash(hash);
        const key = toBytes(_key);
        this.iHash = hash.create();
        if (typeof this.iHash.update !== "function")
          throw new Error("Expected instance of class which extends utils.Hash");
        this.blockLen = this.iHash.blockLen;
        this.outputLen = this.iHash.outputLen;
        const blockLen = this.blockLen;
        const pad = new Uint8Array(blockLen);
        pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
        for (let i = 0; i < pad.length; i++)
          pad[i] ^= 54;
        this.iHash.update(pad);
        this.oHash = hash.create();
        for (let i = 0; i < pad.length; i++)
          pad[i] ^= 54 ^ 92;
        this.oHash.update(pad);
        clean(pad);
      }
      update(buf) {
        aexists(this);
        this.iHash.update(buf);
        return this;
      }
      digestInto(out) {
        aexists(this);
        abytes(out, this.outputLen);
        this.finished = true;
        this.iHash.digestInto(out);
        this.oHash.update(out);
        this.oHash.digestInto(out);
        this.destroy();
      }
      digest() {
        const out = new Uint8Array(this.oHash.outputLen);
        this.digestInto(out);
        return out;
      }
      _cloneInto(to) {
        to || (to = Object.create(Object.getPrototypeOf(this), {}));
        const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
        to = to;
        to.finished = finished;
        to.destroyed = destroyed;
        to.blockLen = blockLen;
        to.outputLen = outputLen;
        to.oHash = oHash._cloneInto(to.oHash);
        to.iHash = iHash._cloneInto(to.iHash);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
      destroy() {
        this.destroyed = true;
        this.oHash.destroy();
        this.iHash.destroy();
      }
    };
    hmac = /* @__PURE__ */ __name((hash, key, message) => new HMAC(hash, key).update(message).digest(), "hmac");
    hmac.create = (hash, key) => new HMAC(hash, key);
  }
});

// node_modules/@noble/curves/esm/utils.js
function _abool2(value, title = "") {
  if (typeof value !== "boolean") {
    const prefix = title && `"${title}"`;
    throw new Error(prefix + "expected boolean, got type=" + typeof value);
  }
  return value;
}
function _abytes2(value, length, title = "") {
  const bytes = isBytes(value);
  const len = value?.length;
  const needsLen = length !== void 0;
  if (!bytes || needsLen && len !== length) {
    const prefix = title && `"${title}" `;
    const ofLen = needsLen ? ` of length ${length}` : "";
    const got = bytes ? `length=${len}` : `type=${typeof value}`;
    throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
  }
  return value;
}
function numberToHexUnpadded(num2) {
  const hex = num2.toString(16);
  return hex.length & 1 ? "0" + hex : hex;
}
function hexToNumber(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  return hex === "" ? _0n : BigInt("0x" + hex);
}
function bytesToNumberBE(bytes) {
  return hexToNumber(bytesToHex(bytes));
}
function bytesToNumberLE(bytes) {
  abytes(bytes);
  return hexToNumber(bytesToHex(Uint8Array.from(bytes).reverse()));
}
function numberToBytesBE(n, len) {
  return hexToBytes(n.toString(16).padStart(len * 2, "0"));
}
function numberToBytesLE(n, len) {
  return numberToBytesBE(n, len).reverse();
}
function ensureBytes(title, hex, expectedLength) {
  let res;
  if (typeof hex === "string") {
    try {
      res = hexToBytes(hex);
    } catch (e) {
      throw new Error(title + " must be hex string or Uint8Array, cause: " + e);
    }
  } else if (isBytes(hex)) {
    res = Uint8Array.from(hex);
  } else {
    throw new Error(title + " must be hex string or Uint8Array");
  }
  const len = res.length;
  if (typeof expectedLength === "number" && len !== expectedLength)
    throw new Error(title + " of length " + expectedLength + " expected, got " + len);
  return res;
}
function inRange(n, min, max) {
  return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
}
function aInRange(title, n, min, max) {
  if (!inRange(n, min, max))
    throw new Error("expected valid " + title + ": " + min + " <= n < " + max + ", got " + n);
}
function bitLen(n) {
  let len;
  for (len = 0; n > _0n; n >>= _1n, len += 1)
    ;
  return len;
}
function createHmacDrbg(hashLen, qByteLen, hmacFn) {
  if (typeof hashLen !== "number" || hashLen < 2)
    throw new Error("hashLen must be a number");
  if (typeof qByteLen !== "number" || qByteLen < 2)
    throw new Error("qByteLen must be a number");
  if (typeof hmacFn !== "function")
    throw new Error("hmacFn must be a function");
  const u8n = /* @__PURE__ */ __name((len) => new Uint8Array(len), "u8n");
  const u8of = /* @__PURE__ */ __name((byte) => Uint8Array.of(byte), "u8of");
  let v = u8n(hashLen);
  let k = u8n(hashLen);
  let i = 0;
  const reset = /* @__PURE__ */ __name(() => {
    v.fill(1);
    k.fill(0);
    i = 0;
  }, "reset");
  const h = /* @__PURE__ */ __name((...b) => hmacFn(k, v, ...b), "h");
  const reseed = /* @__PURE__ */ __name((seed = u8n(0)) => {
    k = h(u8of(0), seed);
    v = h();
    if (seed.length === 0)
      return;
    k = h(u8of(1), seed);
    v = h();
  }, "reseed");
  const gen = /* @__PURE__ */ __name(() => {
    if (i++ >= 1e3)
      throw new Error("drbg: tried 1000 values");
    let len = 0;
    const out = [];
    while (len < qByteLen) {
      v = h();
      const sl = v.slice();
      out.push(sl);
      len += v.length;
    }
    return concatBytes(...out);
  }, "gen");
  const genUntil = /* @__PURE__ */ __name((seed, pred) => {
    reset();
    reseed(seed);
    let res = void 0;
    while (!(res = pred(gen())))
      reseed();
    reset();
    return res;
  }, "genUntil");
  return genUntil;
}
function isHash(val) {
  return typeof val === "function" && Number.isSafeInteger(val.outputLen);
}
function _validateObject(object, fields, optFields = {}) {
  if (!object || typeof object !== "object")
    throw new Error("expected valid options object");
  function checkField(fieldName, expectedType, isOpt) {
    const val = object[fieldName];
    if (isOpt && val === void 0)
      return;
    const current = typeof val;
    if (current !== expectedType || val === null)
      throw new Error(`param "${fieldName}" is invalid: expected ${expectedType}, got ${current}`);
  }
  __name(checkField, "checkField");
  Object.entries(fields).forEach(([k, v]) => checkField(k, v, false));
  Object.entries(optFields).forEach(([k, v]) => checkField(k, v, true));
}
function memoized(fn) {
  const map = /* @__PURE__ */ new WeakMap();
  return (arg, ...args) => {
    const val = map.get(arg);
    if (val !== void 0)
      return val;
    const computed = fn(arg, ...args);
    map.set(arg, computed);
    return computed;
  };
}
var _0n, _1n, isPosBig, bitMask;
var init_utils2 = __esm({
  "node_modules/@noble/curves/esm/utils.js"() {
    init_checked_fetch();
    init_modules_watch_stub();
    init_utils();
    init_utils();
    _0n = /* @__PURE__ */ BigInt(0);
    _1n = /* @__PURE__ */ BigInt(1);
    __name(_abool2, "_abool2");
    __name(_abytes2, "_abytes2");
    __name(numberToHexUnpadded, "numberToHexUnpadded");
    __name(hexToNumber, "hexToNumber");
    __name(bytesToNumberBE, "bytesToNumberBE");
    __name(bytesToNumberLE, "bytesToNumberLE");
    __name(numberToBytesBE, "numberToBytesBE");
    __name(numberToBytesLE, "numberToBytesLE");
    __name(ensureBytes, "ensureBytes");
    isPosBig = /* @__PURE__ */ __name((n) => typeof n === "bigint" && _0n <= n, "isPosBig");
    __name(inRange, "inRange");
    __name(aInRange, "aInRange");
    __name(bitLen, "bitLen");
    bitMask = /* @__PURE__ */ __name((n) => (_1n << BigInt(n)) - _1n, "bitMask");
    __name(createHmacDrbg, "createHmacDrbg");
    __name(isHash, "isHash");
    __name(_validateObject, "_validateObject");
    __name(memoized, "memoized");
  }
});

// node_modules/@noble/curves/esm/abstract/modular.js
function mod(a, b) {
  const result = a % b;
  return result >= _0n2 ? result : b + result;
}
function pow2(x, power, modulo) {
  let res = x;
  while (power-- > _0n2) {
    res *= res;
    res %= modulo;
  }
  return res;
}
function invert(number, modulo) {
  if (number === _0n2)
    throw new Error("invert: expected non-zero number");
  if (modulo <= _0n2)
    throw new Error("invert: expected positive modulus, got " + modulo);
  let a = mod(number, modulo);
  let b = modulo;
  let x = _0n2, y = _1n2, u = _1n2, v = _0n2;
  while (a !== _0n2) {
    const q = b / a;
    const r = b % a;
    const m = x - u * q;
    const n = y - v * q;
    b = a, a = r, x = u, y = v, u = m, v = n;
  }
  const gcd = b;
  if (gcd !== _1n2)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function assertIsSquare(Fp, root, n) {
  if (!Fp.eql(Fp.sqr(root), n))
    throw new Error("Cannot find square root");
}
function sqrt3mod4(Fp, n) {
  const p1div4 = (Fp.ORDER + _1n2) / _4n;
  const root = Fp.pow(n, p1div4);
  assertIsSquare(Fp, root, n);
  return root;
}
function sqrt5mod8(Fp, n) {
  const p5div8 = (Fp.ORDER - _5n) / _8n;
  const n2 = Fp.mul(n, _2n);
  const v = Fp.pow(n2, p5div8);
  const nv = Fp.mul(n, v);
  const i = Fp.mul(Fp.mul(nv, _2n), v);
  const root = Fp.mul(nv, Fp.sub(i, Fp.ONE));
  assertIsSquare(Fp, root, n);
  return root;
}
function sqrt9mod16(P) {
  const Fp_ = Field(P);
  const tn = tonelliShanks(P);
  const c1 = tn(Fp_, Fp_.neg(Fp_.ONE));
  const c2 = tn(Fp_, c1);
  const c3 = tn(Fp_, Fp_.neg(c1));
  const c4 = (P + _7n) / _16n;
  return (Fp, n) => {
    let tv1 = Fp.pow(n, c4);
    let tv2 = Fp.mul(tv1, c1);
    const tv3 = Fp.mul(tv1, c2);
    const tv4 = Fp.mul(tv1, c3);
    const e1 = Fp.eql(Fp.sqr(tv2), n);
    const e2 = Fp.eql(Fp.sqr(tv3), n);
    tv1 = Fp.cmov(tv1, tv2, e1);
    tv2 = Fp.cmov(tv4, tv3, e2);
    const e3 = Fp.eql(Fp.sqr(tv2), n);
    const root = Fp.cmov(tv1, tv2, e3);
    assertIsSquare(Fp, root, n);
    return root;
  };
}
function tonelliShanks(P) {
  if (P < _3n)
    throw new Error("sqrt is not defined for small field");
  let Q = P - _1n2;
  let S = 0;
  while (Q % _2n === _0n2) {
    Q /= _2n;
    S++;
  }
  let Z = _2n;
  const _Fp = Field(P);
  while (FpLegendre(_Fp, Z) === 1) {
    if (Z++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  }
  if (S === 1)
    return sqrt3mod4;
  let cc = _Fp.pow(Z, Q);
  const Q1div2 = (Q + _1n2) / _2n;
  return /* @__PURE__ */ __name(function tonelliSlow(Fp, n) {
    if (Fp.is0(n))
      return n;
    if (FpLegendre(Fp, n) !== 1)
      throw new Error("Cannot find square root");
    let M = S;
    let c = Fp.mul(Fp.ONE, cc);
    let t = Fp.pow(n, Q);
    let R = Fp.pow(n, Q1div2);
    while (!Fp.eql(t, Fp.ONE)) {
      if (Fp.is0(t))
        return Fp.ZERO;
      let i = 1;
      let t_tmp = Fp.sqr(t);
      while (!Fp.eql(t_tmp, Fp.ONE)) {
        i++;
        t_tmp = Fp.sqr(t_tmp);
        if (i === M)
          throw new Error("Cannot find square root");
      }
      const exponent = _1n2 << BigInt(M - i - 1);
      const b = Fp.pow(c, exponent);
      M = i;
      c = Fp.sqr(b);
      t = Fp.mul(t, c);
      R = Fp.mul(R, b);
    }
    return R;
  }, "tonelliSlow");
}
function FpSqrt(P) {
  if (P % _4n === _3n)
    return sqrt3mod4;
  if (P % _8n === _5n)
    return sqrt5mod8;
  if (P % _16n === _9n)
    return sqrt9mod16(P);
  return tonelliShanks(P);
}
function validateField(field) {
  const initial = {
    ORDER: "bigint",
    MASK: "bigint",
    BYTES: "number",
    BITS: "number"
  };
  const opts = FIELD_FIELDS.reduce((map, val) => {
    map[val] = "function";
    return map;
  }, initial);
  _validateObject(field, opts);
  return field;
}
function FpPow(Fp, num2, power) {
  if (power < _0n2)
    throw new Error("invalid exponent, negatives unsupported");
  if (power === _0n2)
    return Fp.ONE;
  if (power === _1n2)
    return num2;
  let p = Fp.ONE;
  let d = num2;
  while (power > _0n2) {
    if (power & _1n2)
      p = Fp.mul(p, d);
    d = Fp.sqr(d);
    power >>= _1n2;
  }
  return p;
}
function FpInvertBatch(Fp, nums, passZero = false) {
  const inverted = new Array(nums.length).fill(passZero ? Fp.ZERO : void 0);
  const multipliedAcc = nums.reduce((acc, num2, i) => {
    if (Fp.is0(num2))
      return acc;
    inverted[i] = acc;
    return Fp.mul(acc, num2);
  }, Fp.ONE);
  const invertedAcc = Fp.inv(multipliedAcc);
  nums.reduceRight((acc, num2, i) => {
    if (Fp.is0(num2))
      return acc;
    inverted[i] = Fp.mul(acc, inverted[i]);
    return Fp.mul(acc, num2);
  }, invertedAcc);
  return inverted;
}
function FpLegendre(Fp, n) {
  const p1mod2 = (Fp.ORDER - _1n2) / _2n;
  const powered = Fp.pow(n, p1mod2);
  const yes = Fp.eql(powered, Fp.ONE);
  const zero = Fp.eql(powered, Fp.ZERO);
  const no = Fp.eql(powered, Fp.neg(Fp.ONE));
  if (!yes && !zero && !no)
    throw new Error("invalid Legendre symbol result");
  return yes ? 1 : zero ? 0 : -1;
}
function nLength(n, nBitLength) {
  if (nBitLength !== void 0)
    anumber(nBitLength);
  const _nBitLength = nBitLength !== void 0 ? nBitLength : n.toString(2).length;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
function Field(ORDER, bitLenOrOpts, isLE = false, opts = {}) {
  if (ORDER <= _0n2)
    throw new Error("invalid field: expected ORDER > 0, got " + ORDER);
  let _nbitLength = void 0;
  let _sqrt = void 0;
  let modFromBytes = false;
  let allowedLengths = void 0;
  if (typeof bitLenOrOpts === "object" && bitLenOrOpts != null) {
    if (opts.sqrt || isLE)
      throw new Error("cannot specify opts in two arguments");
    const _opts = bitLenOrOpts;
    if (_opts.BITS)
      _nbitLength = _opts.BITS;
    if (_opts.sqrt)
      _sqrt = _opts.sqrt;
    if (typeof _opts.isLE === "boolean")
      isLE = _opts.isLE;
    if (typeof _opts.modFromBytes === "boolean")
      modFromBytes = _opts.modFromBytes;
    allowedLengths = _opts.allowedLengths;
  } else {
    if (typeof bitLenOrOpts === "number")
      _nbitLength = bitLenOrOpts;
    if (opts.sqrt)
      _sqrt = opts.sqrt;
  }
  const { nBitLength: BITS, nByteLength: BYTES } = nLength(ORDER, _nbitLength);
  if (BYTES > 2048)
    throw new Error("invalid field: expected ORDER of <= 2048 bytes");
  let sqrtP;
  const f = Object.freeze({
    ORDER,
    isLE,
    BITS,
    BYTES,
    MASK: bitMask(BITS),
    ZERO: _0n2,
    ONE: _1n2,
    allowedLengths,
    create: /* @__PURE__ */ __name((num2) => mod(num2, ORDER), "create"),
    isValid: /* @__PURE__ */ __name((num2) => {
      if (typeof num2 !== "bigint")
        throw new Error("invalid field element: expected bigint, got " + typeof num2);
      return _0n2 <= num2 && num2 < ORDER;
    }, "isValid"),
    is0: /* @__PURE__ */ __name((num2) => num2 === _0n2, "is0"),
    // is valid and invertible
    isValidNot0: /* @__PURE__ */ __name((num2) => !f.is0(num2) && f.isValid(num2), "isValidNot0"),
    isOdd: /* @__PURE__ */ __name((num2) => (num2 & _1n2) === _1n2, "isOdd"),
    neg: /* @__PURE__ */ __name((num2) => mod(-num2, ORDER), "neg"),
    eql: /* @__PURE__ */ __name((lhs, rhs) => lhs === rhs, "eql"),
    sqr: /* @__PURE__ */ __name((num2) => mod(num2 * num2, ORDER), "sqr"),
    add: /* @__PURE__ */ __name((lhs, rhs) => mod(lhs + rhs, ORDER), "add"),
    sub: /* @__PURE__ */ __name((lhs, rhs) => mod(lhs - rhs, ORDER), "sub"),
    mul: /* @__PURE__ */ __name((lhs, rhs) => mod(lhs * rhs, ORDER), "mul"),
    pow: /* @__PURE__ */ __name((num2, power) => FpPow(f, num2, power), "pow"),
    div: /* @__PURE__ */ __name((lhs, rhs) => mod(lhs * invert(rhs, ORDER), ORDER), "div"),
    // Same as above, but doesn't normalize
    sqrN: /* @__PURE__ */ __name((num2) => num2 * num2, "sqrN"),
    addN: /* @__PURE__ */ __name((lhs, rhs) => lhs + rhs, "addN"),
    subN: /* @__PURE__ */ __name((lhs, rhs) => lhs - rhs, "subN"),
    mulN: /* @__PURE__ */ __name((lhs, rhs) => lhs * rhs, "mulN"),
    inv: /* @__PURE__ */ __name((num2) => invert(num2, ORDER), "inv"),
    sqrt: _sqrt || ((n) => {
      if (!sqrtP)
        sqrtP = FpSqrt(ORDER);
      return sqrtP(f, n);
    }),
    toBytes: /* @__PURE__ */ __name((num2) => isLE ? numberToBytesLE(num2, BYTES) : numberToBytesBE(num2, BYTES), "toBytes"),
    fromBytes: /* @__PURE__ */ __name((bytes, skipValidation = true) => {
      if (allowedLengths) {
        if (!allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
          throw new Error("Field.fromBytes: expected " + allowedLengths + " bytes, got " + bytes.length);
        }
        const padded = new Uint8Array(BYTES);
        padded.set(bytes, isLE ? 0 : padded.length - bytes.length);
        bytes = padded;
      }
      if (bytes.length !== BYTES)
        throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes.length);
      let scalar = isLE ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
      if (modFromBytes)
        scalar = mod(scalar, ORDER);
      if (!skipValidation) {
        if (!f.isValid(scalar))
          throw new Error("invalid field element: outside of range 0..ORDER");
      }
      return scalar;
    }, "fromBytes"),
    // TODO: we don't need it here, move out to separate fn
    invertBatch: /* @__PURE__ */ __name((lst) => FpInvertBatch(f, lst), "invertBatch"),
    // We can't move this out because Fp6, Fp12 implement it
    // and it's unclear what to return in there.
    cmov: /* @__PURE__ */ __name((a, b, c) => c ? b : a, "cmov")
  });
  return Object.freeze(f);
}
function getFieldBytesLength(fieldOrder) {
  if (typeof fieldOrder !== "bigint")
    throw new Error("field order must be bigint");
  const bitLength = fieldOrder.toString(2).length;
  return Math.ceil(bitLength / 8);
}
function getMinHashLength(fieldOrder) {
  const length = getFieldBytesLength(fieldOrder);
  return length + Math.ceil(length / 2);
}
function mapHashToField(key, fieldOrder, isLE = false) {
  const len = key.length;
  const fieldLen = getFieldBytesLength(fieldOrder);
  const minLen = getMinHashLength(fieldOrder);
  if (len < 16 || len < minLen || len > 1024)
    throw new Error("expected " + minLen + "-1024 bytes of input, got " + len);
  const num2 = isLE ? bytesToNumberLE(key) : bytesToNumberBE(key);
  const reduced = mod(num2, fieldOrder - _1n2) + _1n2;
  return isLE ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
}
var _0n2, _1n2, _2n, _3n, _4n, _5n, _7n, _8n, _9n, _16n, FIELD_FIELDS;
var init_modular = __esm({
  "node_modules/@noble/curves/esm/abstract/modular.js"() {
    init_checked_fetch();
    init_modules_watch_stub();
    init_utils2();
    _0n2 = BigInt(0);
    _1n2 = BigInt(1);
    _2n = /* @__PURE__ */ BigInt(2);
    _3n = /* @__PURE__ */ BigInt(3);
    _4n = /* @__PURE__ */ BigInt(4);
    _5n = /* @__PURE__ */ BigInt(5);
    _7n = /* @__PURE__ */ BigInt(7);
    _8n = /* @__PURE__ */ BigInt(8);
    _9n = /* @__PURE__ */ BigInt(9);
    _16n = /* @__PURE__ */ BigInt(16);
    __name(mod, "mod");
    __name(pow2, "pow2");
    __name(invert, "invert");
    __name(assertIsSquare, "assertIsSquare");
    __name(sqrt3mod4, "sqrt3mod4");
    __name(sqrt5mod8, "sqrt5mod8");
    __name(sqrt9mod16, "sqrt9mod16");
    __name(tonelliShanks, "tonelliShanks");
    __name(FpSqrt, "FpSqrt");
    FIELD_FIELDS = [
      "create",
      "isValid",
      "is0",
      "neg",
      "inv",
      "sqrt",
      "sqr",
      "eql",
      "add",
      "sub",
      "mul",
      "pow",
      "div",
      "addN",
      "subN",
      "mulN",
      "sqrN"
    ];
    __name(validateField, "validateField");
    __name(FpPow, "FpPow");
    __name(FpInvertBatch, "FpInvertBatch");
    __name(FpLegendre, "FpLegendre");
    __name(nLength, "nLength");
    __name(Field, "Field");
    __name(getFieldBytesLength, "getFieldBytesLength");
    __name(getMinHashLength, "getMinHashLength");
    __name(mapHashToField, "mapHashToField");
  }
});

// node_modules/@noble/curves/esm/abstract/curve.js
function negateCt(condition, item) {
  const neg = item.negate();
  return condition ? neg : item;
}
function normalizeZ(c, points) {
  const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
  return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
}
function validateW(W, bits) {
  if (!Number.isSafeInteger(W) || W <= 0 || W > bits)
    throw new Error("invalid window size, expected [1.." + bits + "], got W=" + W);
}
function calcWOpts(W, scalarBits) {
  validateW(W, scalarBits);
  const windows = Math.ceil(scalarBits / W) + 1;
  const windowSize = 2 ** (W - 1);
  const maxNumber = 2 ** W;
  const mask = bitMask(W);
  const shiftBy = BigInt(W);
  return { windows, windowSize, mask, maxNumber, shiftBy };
}
function calcOffsets(n, window, wOpts) {
  const { windowSize, mask, maxNumber, shiftBy } = wOpts;
  let wbits = Number(n & mask);
  let nextN = n >> shiftBy;
  if (wbits > windowSize) {
    wbits -= maxNumber;
    nextN += _1n3;
  }
  const offsetStart = window * windowSize;
  const offset = offsetStart + Math.abs(wbits) - 1;
  const isZero = wbits === 0;
  const isNeg = wbits < 0;
  const isNegF = window % 2 !== 0;
  const offsetF = offsetStart;
  return { nextN, offset, isZero, isNeg, isNegF, offsetF };
}
function validateMSMPoints(points, c) {
  if (!Array.isArray(points))
    throw new Error("array expected");
  points.forEach((p, i) => {
    if (!(p instanceof c))
      throw new Error("invalid point at index " + i);
  });
}
function validateMSMScalars(scalars, field) {
  if (!Array.isArray(scalars))
    throw new Error("array of scalars expected");
  scalars.forEach((s, i) => {
    if (!field.isValid(s))
      throw new Error("invalid scalar at index " + i);
  });
}
function getW(P) {
  return pointWindowSizes.get(P) || 1;
}
function assert0(n) {
  if (n !== _0n3)
    throw new Error("invalid wNAF");
}
function mulEndoUnsafe(Point, point, k1, k2) {
  let acc = point;
  let p1 = Point.ZERO;
  let p2 = Point.ZERO;
  while (k1 > _0n3 || k2 > _0n3) {
    if (k1 & _1n3)
      p1 = p1.add(acc);
    if (k2 & _1n3)
      p2 = p2.add(acc);
    acc = acc.double();
    k1 >>= _1n3;
    k2 >>= _1n3;
  }
  return { p1, p2 };
}
function pippenger(c, fieldN, points, scalars) {
  validateMSMPoints(points, c);
  validateMSMScalars(scalars, fieldN);
  const plength = points.length;
  const slength = scalars.length;
  if (plength !== slength)
    throw new Error("arrays of points and scalars must have equal length");
  const zero = c.ZERO;
  const wbits = bitLen(BigInt(plength));
  let windowSize = 1;
  if (wbits > 12)
    windowSize = wbits - 3;
  else if (wbits > 4)
    windowSize = wbits - 2;
  else if (wbits > 0)
    windowSize = 2;
  const MASK = bitMask(windowSize);
  const buckets = new Array(Number(MASK) + 1).fill(zero);
  const lastBits = Math.floor((fieldN.BITS - 1) / windowSize) * windowSize;
  let sum = zero;
  for (let i = lastBits; i >= 0; i -= windowSize) {
    buckets.fill(zero);
    for (let j = 0; j < slength; j++) {
      const scalar = scalars[j];
      const wbits2 = Number(scalar >> BigInt(i) & MASK);
      buckets[wbits2] = buckets[wbits2].add(points[j]);
    }
    let resI = zero;
    for (let j = buckets.length - 1, sumI = zero; j > 0; j--) {
      sumI = sumI.add(buckets[j]);
      resI = resI.add(sumI);
    }
    sum = sum.add(resI);
    if (i !== 0)
      for (let j = 0; j < windowSize; j++)
        sum = sum.double();
  }
  return sum;
}
function createField(order, field, isLE) {
  if (field) {
    if (field.ORDER !== order)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    validateField(field);
    return field;
  } else {
    return Field(order, { isLE });
  }
}
function _createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
  if (FpFnLE === void 0)
    FpFnLE = type === "edwards";
  if (!CURVE || typeof CURVE !== "object")
    throw new Error(`expected valid ${type} CURVE object`);
  for (const p of ["p", "n", "h"]) {
    const val = CURVE[p];
    if (!(typeof val === "bigint" && val > _0n3))
      throw new Error(`CURVE.${p} must be positive bigint`);
  }
  const Fp = createField(CURVE.p, curveOpts.Fp, FpFnLE);
  const Fn = createField(CURVE.n, curveOpts.Fn, FpFnLE);
  const _b = type === "weierstrass" ? "b" : "d";
  const params = ["Gx", "Gy", "a", _b];
  for (const p of params) {
    if (!Fp.isValid(CURVE[p]))
      throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
  }
  CURVE = Object.freeze(Object.assign({}, CURVE));
  return { CURVE, Fp, Fn };
}
var _0n3, _1n3, pointPrecomputes, pointWindowSizes, wNAF;
var init_curve = __esm({
  "node_modules/@noble/curves/esm/abstract/curve.js"() {
    init_checked_fetch();
    init_modules_watch_stub();
    init_utils2();
    init_modular();
    _0n3 = BigInt(0);
    _1n3 = BigInt(1);
    __name(negateCt, "negateCt");
    __name(normalizeZ, "normalizeZ");
    __name(validateW, "validateW");
    __name(calcWOpts, "calcWOpts");
    __name(calcOffsets, "calcOffsets");
    __name(validateMSMPoints, "validateMSMPoints");
    __name(validateMSMScalars, "validateMSMScalars");
    pointPrecomputes = /* @__PURE__ */ new WeakMap();
    pointWindowSizes = /* @__PURE__ */ new WeakMap();
    __name(getW, "getW");
    __name(assert0, "assert0");
    wNAF = class {
      static {
        __name(this, "wNAF");
      }
      // Parametrized with a given Point class (not individual point)
      constructor(Point, bits) {
        this.BASE = Point.BASE;
        this.ZERO = Point.ZERO;
        this.Fn = Point.Fn;
        this.bits = bits;
      }
      // non-const time multiplication ladder
      _unsafeLadder(elm, n, p = this.ZERO) {
        let d = elm;
        while (n > _0n3) {
          if (n & _1n3)
            p = p.add(d);
          d = d.double();
          n >>= _1n3;
        }
        return p;
      }
      /**
       * Creates a wNAF precomputation window. Used for caching.
       * Default window size is set by `utils.precompute()` and is equal to 8.
       * Number of precomputed points depends on the curve size:
       * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
       * - 𝑊 is the window size
       * - 𝑛 is the bitlength of the curve order.
       * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
       * @param point Point instance
       * @param W window size
       * @returns precomputed point tables flattened to a single array
       */
      precomputeWindow(point, W) {
        const { windows, windowSize } = calcWOpts(W, this.bits);
        const points = [];
        let p = point;
        let base = p;
        for (let window = 0; window < windows; window++) {
          base = p;
          points.push(base);
          for (let i = 1; i < windowSize; i++) {
            base = base.add(p);
            points.push(base);
          }
          p = base.double();
        }
        return points;
      }
      /**
       * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
       * More compact implementation:
       * https://github.com/paulmillr/noble-secp256k1/blob/47cb1669b6e506ad66b35fe7d76132ae97465da2/index.ts#L502-L541
       * @returns real and fake (for const-time) points
       */
      wNAF(W, precomputes, n) {
        if (!this.Fn.isValid(n))
          throw new Error("invalid scalar");
        let p = this.ZERO;
        let f = this.BASE;
        const wo = calcWOpts(W, this.bits);
        for (let window = 0; window < wo.windows; window++) {
          const { nextN, offset, isZero, isNeg, isNegF, offsetF } = calcOffsets(n, window, wo);
          n = nextN;
          if (isZero) {
            f = f.add(negateCt(isNegF, precomputes[offsetF]));
          } else {
            p = p.add(negateCt(isNeg, precomputes[offset]));
          }
        }
        assert0(n);
        return { p, f };
      }
      /**
       * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
       * @param acc accumulator point to add result of multiplication
       * @returns point
       */
      wNAFUnsafe(W, precomputes, n, acc = this.ZERO) {
        const wo = calcWOpts(W, this.bits);
        for (let window = 0; window < wo.windows; window++) {
          if (n === _0n3)
            break;
          const { nextN, offset, isZero, isNeg } = calcOffsets(n, window, wo);
          n = nextN;
          if (isZero) {
            continue;
          } else {
            const item = precomputes[offset];
            acc = acc.add(isNeg ? item.negate() : item);
          }
        }
        assert0(n);
        return acc;
      }
      getPrecomputes(W, point, transform) {
        let comp = pointPrecomputes.get(point);
        if (!comp) {
          comp = this.precomputeWindow(point, W);
          if (W !== 1) {
            if (typeof transform === "function")
              comp = transform(comp);
            pointPrecomputes.set(point, comp);
          }
        }
        return comp;
      }
      cached(point, scalar, transform) {
        const W = getW(point);
        return this.wNAF(W, this.getPrecomputes(W, point, transform), scalar);
      }
      unsafe(point, scalar, transform, prev) {
        const W = getW(point);
        if (W === 1)
          return this._unsafeLadder(point, scalar, prev);
        return this.wNAFUnsafe(W, this.getPrecomputes(W, point, transform), scalar, prev);
      }
      // We calculate precomputes for elliptic curve point multiplication
      // using windowed method. This specifies window size and
      // stores precomputed values. Usually only base point would be precomputed.
      createCache(P, W) {
        validateW(W, this.bits);
        pointWindowSizes.set(P, W);
        pointPrecomputes.delete(P);
      }
      hasCache(elm) {
        return getW(elm) !== 1;
      }
    };
    __name(mulEndoUnsafe, "mulEndoUnsafe");
    __name(pippenger, "pippenger");
    __name(createField, "createField");
    __name(_createCurveFields, "_createCurveFields");
  }
});

// node_modules/@noble/curves/esm/abstract/weierstrass.js
function _splitEndoScalar(k, basis, n) {
  const [[a1, b1], [a2, b2]] = basis;
  const c1 = divNearest(b2 * k, n);
  const c2 = divNearest(-b1 * k, n);
  let k1 = k - c1 * a1 - c2 * a2;
  let k2 = -c1 * b1 - c2 * b2;
  const k1neg = k1 < _0n4;
  const k2neg = k2 < _0n4;
  if (k1neg)
    k1 = -k1;
  if (k2neg)
    k2 = -k2;
  const MAX_NUM = bitMask(Math.ceil(bitLen(n) / 2)) + _1n4;
  if (k1 < _0n4 || k1 >= MAX_NUM || k2 < _0n4 || k2 >= MAX_NUM) {
    throw new Error("splitScalar (endomorphism): failed, k=" + k);
  }
  return { k1neg, k1, k2neg, k2 };
}
function validateSigFormat(format) {
  if (!["compact", "recovered", "der"].includes(format))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return format;
}
function validateSigOpts(opts, def) {
  const optsn = {};
  for (let optName of Object.keys(def)) {
    optsn[optName] = opts[optName] === void 0 ? def[optName] : opts[optName];
  }
  _abool2(optsn.lowS, "lowS");
  _abool2(optsn.prehash, "prehash");
  if (optsn.format !== void 0)
    validateSigFormat(optsn.format);
  return optsn;
}
function _normFnElement(Fn, key) {
  const { BYTES: expected } = Fn;
  let num2;
  if (typeof key === "bigint") {
    num2 = key;
  } else {
    let bytes = ensureBytes("private key", key);
    try {
      num2 = Fn.fromBytes(bytes);
    } catch (error) {
      throw new Error(`invalid private key: expected ui8a of size ${expected}, got ${typeof key}`);
    }
  }
  if (!Fn.isValidNot0(num2))
    throw new Error("invalid private key: out of range [1..N-1]");
  return num2;
}
function weierstrassN(params, extraOpts = {}) {
  const validated = _createCurveFields("weierstrass", params, extraOpts);
  const { Fp, Fn } = validated;
  let CURVE = validated.CURVE;
  const { h: cofactor, n: CURVE_ORDER } = CURVE;
  _validateObject(extraOpts, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object",
    wrapPrivateKey: "boolean"
  });
  const { endo } = extraOpts;
  if (endo) {
    if (!Fp.is0(CURVE.a) || typeof endo.beta !== "bigint" || !Array.isArray(endo.basises)) {
      throw new Error('invalid endo: expected "beta": bigint and "basises": array');
    }
  }
  const lengths = getWLengths(Fp, Fn);
  function assertCompressionIsSupported() {
    if (!Fp.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  __name(assertCompressionIsSupported, "assertCompressionIsSupported");
  function pointToBytes2(_c, point, isCompressed) {
    const { x, y } = point.toAffine();
    const bx = Fp.toBytes(x);
    _abool2(isCompressed, "isCompressed");
    if (isCompressed) {
      assertCompressionIsSupported();
      const hasEvenY = !Fp.isOdd(y);
      return concatBytes(pprefix(hasEvenY), bx);
    } else {
      return concatBytes(Uint8Array.of(4), bx, Fp.toBytes(y));
    }
  }
  __name(pointToBytes2, "pointToBytes");
  function pointFromBytes(bytes) {
    _abytes2(bytes, void 0, "Point");
    const { publicKey: comp, publicKeyUncompressed: uncomp } = lengths;
    const length = bytes.length;
    const head = bytes[0];
    const tail = bytes.subarray(1);
    if (length === comp && (head === 2 || head === 3)) {
      const x = Fp.fromBytes(tail);
      if (!Fp.isValid(x))
        throw new Error("bad point: is not on curve, wrong x");
      const y2 = weierstrassEquation(x);
      let y;
      try {
        y = Fp.sqrt(y2);
      } catch (sqrtError) {
        const err = sqrtError instanceof Error ? ": " + sqrtError.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + err);
      }
      assertCompressionIsSupported();
      const isYOdd = Fp.isOdd(y);
      const isHeadOdd = (head & 1) === 1;
      if (isHeadOdd !== isYOdd)
        y = Fp.neg(y);
      return { x, y };
    } else if (length === uncomp && head === 4) {
      const L = Fp.BYTES;
      const x = Fp.fromBytes(tail.subarray(0, L));
      const y = Fp.fromBytes(tail.subarray(L, L * 2));
      if (!isValidXY(x, y))
        throw new Error("bad point: is not on curve");
      return { x, y };
    } else {
      throw new Error(`bad point: got length ${length}, expected compressed=${comp} or uncompressed=${uncomp}`);
    }
  }
  __name(pointFromBytes, "pointFromBytes");
  const encodePoint = extraOpts.toBytes || pointToBytes2;
  const decodePoint = extraOpts.fromBytes || pointFromBytes;
  function weierstrassEquation(x) {
    const x2 = Fp.sqr(x);
    const x3 = Fp.mul(x2, x);
    return Fp.add(Fp.add(x3, Fp.mul(x, CURVE.a)), CURVE.b);
  }
  __name(weierstrassEquation, "weierstrassEquation");
  function isValidXY(x, y) {
    const left = Fp.sqr(y);
    const right = weierstrassEquation(x);
    return Fp.eql(left, right);
  }
  __name(isValidXY, "isValidXY");
  if (!isValidXY(CURVE.Gx, CURVE.Gy))
    throw new Error("bad curve params: generator point");
  const _4a3 = Fp.mul(Fp.pow(CURVE.a, _3n2), _4n2);
  const _27b2 = Fp.mul(Fp.sqr(CURVE.b), BigInt(27));
  if (Fp.is0(Fp.add(_4a3, _27b2)))
    throw new Error("bad curve params: a or b");
  function acoord(title, n, banZero = false) {
    if (!Fp.isValid(n) || banZero && Fp.is0(n))
      throw new Error(`bad point coordinate ${title}`);
    return n;
  }
  __name(acoord, "acoord");
  function aprjpoint(other) {
    if (!(other instanceof Point))
      throw new Error("ProjectivePoint expected");
  }
  __name(aprjpoint, "aprjpoint");
  function splitEndoScalarN(k) {
    if (!endo || !endo.basises)
      throw new Error("no endo");
    return _splitEndoScalar(k, endo.basises, Fn.ORDER);
  }
  __name(splitEndoScalarN, "splitEndoScalarN");
  const toAffineMemo = memoized((p, iz) => {
    const { X, Y, Z } = p;
    if (Fp.eql(Z, Fp.ONE))
      return { x: X, y: Y };
    const is0 = p.is0();
    if (iz == null)
      iz = is0 ? Fp.ONE : Fp.inv(Z);
    const x = Fp.mul(X, iz);
    const y = Fp.mul(Y, iz);
    const zz = Fp.mul(Z, iz);
    if (is0)
      return { x: Fp.ZERO, y: Fp.ZERO };
    if (!Fp.eql(zz, Fp.ONE))
      throw new Error("invZ was invalid");
    return { x, y };
  });
  const assertValidMemo = memoized((p) => {
    if (p.is0()) {
      if (extraOpts.allowInfinityPoint && !Fp.is0(p.Y))
        return;
      throw new Error("bad point: ZERO");
    }
    const { x, y } = p.toAffine();
    if (!Fp.isValid(x) || !Fp.isValid(y))
      throw new Error("bad point: x or y not field elements");
    if (!isValidXY(x, y))
      throw new Error("bad point: equation left != right");
    if (!p.isTorsionFree())
      throw new Error("bad point: not in prime-order subgroup");
    return true;
  });
  function finishEndo(endoBeta, k1p, k2p, k1neg, k2neg) {
    k2p = new Point(Fp.mul(k2p.X, endoBeta), k2p.Y, k2p.Z);
    k1p = negateCt(k1neg, k1p);
    k2p = negateCt(k2neg, k2p);
    return k1p.add(k2p);
  }
  __name(finishEndo, "finishEndo");
  class Point {
    static {
      __name(this, "Point");
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(X, Y, Z) {
      this.X = acoord("x", X);
      this.Y = acoord("y", Y, true);
      this.Z = acoord("z", Z);
      Object.freeze(this);
    }
    static CURVE() {
      return CURVE;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(p) {
      const { x, y } = p || {};
      if (!p || !Fp.isValid(x) || !Fp.isValid(y))
        throw new Error("invalid affine point");
      if (p instanceof Point)
        throw new Error("projective point not allowed");
      if (Fp.is0(x) && Fp.is0(y))
        return Point.ZERO;
      return new Point(x, y, Fp.ONE);
    }
    static fromBytes(bytes) {
      const P = Point.fromAffine(decodePoint(_abytes2(bytes, void 0, "point")));
      P.assertValidity();
      return P;
    }
    static fromHex(hex) {
      return Point.fromBytes(ensureBytes("pointHex", hex));
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /**
     *
     * @param windowSize
     * @param isLazy true will defer table computation until the first multiplication
     * @returns
     */
    precompute(windowSize = 8, isLazy = true) {
      wnaf.createCache(this, windowSize);
      if (!isLazy)
        this.multiply(_3n2);
      return this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      assertValidMemo(this);
    }
    hasEvenY() {
      const { y } = this.toAffine();
      if (!Fp.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !Fp.isOdd(y);
    }
    /** Compare one point to another. */
    equals(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
      const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
      return U1 && U2;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new Point(this.X, Fp.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { a, b } = CURVE;
      const b3 = Fp.mul(b, _3n2);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      let t0 = Fp.mul(X1, X1);
      let t1 = Fp.mul(Y1, Y1);
      let t2 = Fp.mul(Z1, Z1);
      let t3 = Fp.mul(X1, Y1);
      t3 = Fp.add(t3, t3);
      Z3 = Fp.mul(X1, Z1);
      Z3 = Fp.add(Z3, Z3);
      X3 = Fp.mul(a, Z3);
      Y3 = Fp.mul(b3, t2);
      Y3 = Fp.add(X3, Y3);
      X3 = Fp.sub(t1, Y3);
      Y3 = Fp.add(t1, Y3);
      Y3 = Fp.mul(X3, Y3);
      X3 = Fp.mul(t3, X3);
      Z3 = Fp.mul(b3, Z3);
      t2 = Fp.mul(a, t2);
      t3 = Fp.sub(t0, t2);
      t3 = Fp.mul(a, t3);
      t3 = Fp.add(t3, Z3);
      Z3 = Fp.add(t0, t0);
      t0 = Fp.add(Z3, t0);
      t0 = Fp.add(t0, t2);
      t0 = Fp.mul(t0, t3);
      Y3 = Fp.add(Y3, t0);
      t2 = Fp.mul(Y1, Z1);
      t2 = Fp.add(t2, t2);
      t0 = Fp.mul(t2, t3);
      X3 = Fp.sub(X3, t0);
      Z3 = Fp.mul(t2, t1);
      Z3 = Fp.add(Z3, Z3);
      Z3 = Fp.add(Z3, Z3);
      return new Point(X3, Y3, Z3);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      const a = CURVE.a;
      const b3 = Fp.mul(CURVE.b, _3n2);
      let t0 = Fp.mul(X1, X2);
      let t1 = Fp.mul(Y1, Y2);
      let t2 = Fp.mul(Z1, Z2);
      let t3 = Fp.add(X1, Y1);
      let t4 = Fp.add(X2, Y2);
      t3 = Fp.mul(t3, t4);
      t4 = Fp.add(t0, t1);
      t3 = Fp.sub(t3, t4);
      t4 = Fp.add(X1, Z1);
      let t5 = Fp.add(X2, Z2);
      t4 = Fp.mul(t4, t5);
      t5 = Fp.add(t0, t2);
      t4 = Fp.sub(t4, t5);
      t5 = Fp.add(Y1, Z1);
      X3 = Fp.add(Y2, Z2);
      t5 = Fp.mul(t5, X3);
      X3 = Fp.add(t1, t2);
      t5 = Fp.sub(t5, X3);
      Z3 = Fp.mul(a, t4);
      X3 = Fp.mul(b3, t2);
      Z3 = Fp.add(X3, Z3);
      X3 = Fp.sub(t1, Z3);
      Z3 = Fp.add(t1, Z3);
      Y3 = Fp.mul(X3, Z3);
      t1 = Fp.add(t0, t0);
      t1 = Fp.add(t1, t0);
      t2 = Fp.mul(a, t2);
      t4 = Fp.mul(b3, t4);
      t1 = Fp.add(t1, t2);
      t2 = Fp.sub(t0, t2);
      t2 = Fp.mul(a, t2);
      t4 = Fp.add(t4, t2);
      t0 = Fp.mul(t1, t4);
      Y3 = Fp.add(Y3, t0);
      t0 = Fp.mul(t5, t4);
      X3 = Fp.mul(t3, X3);
      X3 = Fp.sub(X3, t0);
      t0 = Fp.mul(t3, t1);
      Z3 = Fp.mul(t5, Z3);
      Z3 = Fp.add(Z3, t0);
      return new Point(X3, Y3, Z3);
    }
    subtract(other) {
      return this.add(other.negate());
    }
    is0() {
      return this.equals(Point.ZERO);
    }
    /**
     * Constant time multiplication.
     * Uses wNAF method. Windowed method may be 10% faster,
     * but takes 2x longer to generate and consumes 2x memory.
     * Uses precomputes when available.
     * Uses endomorphism for Koblitz curves.
     * @param scalar by which the point would be multiplied
     * @returns New point
     */
    multiply(scalar) {
      const { endo: endo2 } = extraOpts;
      if (!Fn.isValidNot0(scalar))
        throw new Error("invalid scalar: out of range");
      let point, fake;
      const mul = /* @__PURE__ */ __name((n) => wnaf.cached(this, n, (p) => normalizeZ(Point, p)), "mul");
      if (endo2) {
        const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(scalar);
        const { p: k1p, f: k1f } = mul(k1);
        const { p: k2p, f: k2f } = mul(k2);
        fake = k1f.add(k2f);
        point = finishEndo(endo2.beta, k1p, k2p, k1neg, k2neg);
      } else {
        const { p, f } = mul(scalar);
        point = p;
        fake = f;
      }
      return normalizeZ(Point, [point, fake])[0];
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(sc) {
      const { endo: endo2 } = extraOpts;
      const p = this;
      if (!Fn.isValid(sc))
        throw new Error("invalid scalar: out of range");
      if (sc === _0n4 || p.is0())
        return Point.ZERO;
      if (sc === _1n4)
        return p;
      if (wnaf.hasCache(this))
        return this.multiply(sc);
      if (endo2) {
        const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(sc);
        const { p1, p2 } = mulEndoUnsafe(Point, p, k1, k2);
        return finishEndo(endo2.beta, p1, p2, k1neg, k2neg);
      } else {
        return wnaf.unsafe(p, sc);
      }
    }
    multiplyAndAddUnsafe(Q, a, b) {
      const sum = this.multiplyUnsafe(a).add(Q.multiplyUnsafe(b));
      return sum.is0() ? void 0 : sum;
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * @param invertedZ Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(invertedZ) {
      return toAffineMemo(this, invertedZ);
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      const { isTorsionFree } = extraOpts;
      if (cofactor === _1n4)
        return true;
      if (isTorsionFree)
        return isTorsionFree(Point, this);
      return wnaf.unsafe(this, CURVE_ORDER).is0();
    }
    clearCofactor() {
      const { clearCofactor } = extraOpts;
      if (cofactor === _1n4)
        return this;
      if (clearCofactor)
        return clearCofactor(Point, this);
      return this.multiplyUnsafe(cofactor);
    }
    isSmallOrder() {
      return this.multiplyUnsafe(cofactor).is0();
    }
    toBytes(isCompressed = true) {
      _abool2(isCompressed, "isCompressed");
      this.assertValidity();
      return encodePoint(Point, this, isCompressed);
    }
    toHex(isCompressed = true) {
      return bytesToHex(this.toBytes(isCompressed));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
    // TODO: remove
    get px() {
      return this.X;
    }
    get py() {
      return this.X;
    }
    get pz() {
      return this.Z;
    }
    toRawBytes(isCompressed = true) {
      return this.toBytes(isCompressed);
    }
    _setWindowSize(windowSize) {
      this.precompute(windowSize);
    }
    static normalizeZ(points) {
      return normalizeZ(Point, points);
    }
    static msm(points, scalars) {
      return pippenger(Point, Fn, points, scalars);
    }
    static fromPrivateKey(privateKey) {
      return Point.BASE.multiply(_normFnElement(Fn, privateKey));
    }
  }
  Point.BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE);
  Point.ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ZERO);
  Point.Fp = Fp;
  Point.Fn = Fn;
  const bits = Fn.BITS;
  const wnaf = new wNAF(Point, extraOpts.endo ? Math.ceil(bits / 2) : bits);
  Point.BASE.precompute(8);
  return Point;
}
function pprefix(hasEvenY) {
  return Uint8Array.of(hasEvenY ? 2 : 3);
}
function SWUFpSqrtRatio(Fp, Z) {
  const q = Fp.ORDER;
  let l = _0n4;
  for (let o = q - _1n4; o % _2n2 === _0n4; o /= _2n2)
    l += _1n4;
  const c1 = l;
  const _2n_pow_c1_1 = _2n2 << c1 - _1n4 - _1n4;
  const _2n_pow_c1 = _2n_pow_c1_1 * _2n2;
  const c2 = (q - _1n4) / _2n_pow_c1;
  const c3 = (c2 - _1n4) / _2n2;
  const c4 = _2n_pow_c1 - _1n4;
  const c5 = _2n_pow_c1_1;
  const c6 = Fp.pow(Z, c2);
  const c7 = Fp.pow(Z, (c2 + _1n4) / _2n2);
  let sqrtRatio = /* @__PURE__ */ __name((u, v) => {
    let tv1 = c6;
    let tv2 = Fp.pow(v, c4);
    let tv3 = Fp.sqr(tv2);
    tv3 = Fp.mul(tv3, v);
    let tv5 = Fp.mul(u, tv3);
    tv5 = Fp.pow(tv5, c3);
    tv5 = Fp.mul(tv5, tv2);
    tv2 = Fp.mul(tv5, v);
    tv3 = Fp.mul(tv5, u);
    let tv4 = Fp.mul(tv3, tv2);
    tv5 = Fp.pow(tv4, c5);
    let isQR = Fp.eql(tv5, Fp.ONE);
    tv2 = Fp.mul(tv3, c7);
    tv5 = Fp.mul(tv4, tv1);
    tv3 = Fp.cmov(tv2, tv3, isQR);
    tv4 = Fp.cmov(tv5, tv4, isQR);
    for (let i = c1; i > _1n4; i--) {
      let tv52 = i - _2n2;
      tv52 = _2n2 << tv52 - _1n4;
      let tvv5 = Fp.pow(tv4, tv52);
      const e1 = Fp.eql(tvv5, Fp.ONE);
      tv2 = Fp.mul(tv3, tv1);
      tv1 = Fp.mul(tv1, tv1);
      tvv5 = Fp.mul(tv4, tv1);
      tv3 = Fp.cmov(tv2, tv3, e1);
      tv4 = Fp.cmov(tvv5, tv4, e1);
    }
    return { isValid: isQR, value: tv3 };
  }, "sqrtRatio");
  if (Fp.ORDER % _4n2 === _3n2) {
    const c12 = (Fp.ORDER - _3n2) / _4n2;
    const c22 = Fp.sqrt(Fp.neg(Z));
    sqrtRatio = /* @__PURE__ */ __name((u, v) => {
      let tv1 = Fp.sqr(v);
      const tv2 = Fp.mul(u, v);
      tv1 = Fp.mul(tv1, tv2);
      let y1 = Fp.pow(tv1, c12);
      y1 = Fp.mul(y1, tv2);
      const y2 = Fp.mul(y1, c22);
      const tv3 = Fp.mul(Fp.sqr(y1), v);
      const isQR = Fp.eql(tv3, u);
      let y = Fp.cmov(y2, y1, isQR);
      return { isValid: isQR, value: y };
    }, "sqrtRatio");
  }
  return sqrtRatio;
}
function mapToCurveSimpleSWU(Fp, opts) {
  validateField(Fp);
  const { A, B, Z } = opts;
  if (!Fp.isValid(A) || !Fp.isValid(B) || !Fp.isValid(Z))
    throw new Error("mapToCurveSimpleSWU: invalid opts");
  const sqrtRatio = SWUFpSqrtRatio(Fp, Z);
  if (!Fp.isOdd)
    throw new Error("Field does not have .isOdd()");
  return (u) => {
    let tv1, tv2, tv3, tv4, tv5, tv6, x, y;
    tv1 = Fp.sqr(u);
    tv1 = Fp.mul(tv1, Z);
    tv2 = Fp.sqr(tv1);
    tv2 = Fp.add(tv2, tv1);
    tv3 = Fp.add(tv2, Fp.ONE);
    tv3 = Fp.mul(tv3, B);
    tv4 = Fp.cmov(Z, Fp.neg(tv2), !Fp.eql(tv2, Fp.ZERO));
    tv4 = Fp.mul(tv4, A);
    tv2 = Fp.sqr(tv3);
    tv6 = Fp.sqr(tv4);
    tv5 = Fp.mul(tv6, A);
    tv2 = Fp.add(tv2, tv5);
    tv2 = Fp.mul(tv2, tv3);
    tv6 = Fp.mul(tv6, tv4);
    tv5 = Fp.mul(tv6, B);
    tv2 = Fp.add(tv2, tv5);
    x = Fp.mul(tv1, tv3);
    const { isValid, value } = sqrtRatio(tv2, tv6);
    y = Fp.mul(tv1, u);
    y = Fp.mul(y, value);
    x = Fp.cmov(x, tv3, isValid);
    y = Fp.cmov(y, value, isValid);
    const e1 = Fp.isOdd(u) === Fp.isOdd(y);
    y = Fp.cmov(Fp.neg(y), y, e1);
    const tv4_inv = FpInvertBatch(Fp, [tv4], true)[0];
    x = Fp.mul(x, tv4_inv);
    return { x, y };
  };
}
function getWLengths(Fp, Fn) {
  return {
    secretKey: Fn.BYTES,
    publicKey: 1 + Fp.BYTES,
    publicKeyUncompressed: 1 + 2 * Fp.BYTES,
    publicKeyHasPrefix: true,
    signature: 2 * Fn.BYTES
  };
}
function ecdh(Point, ecdhOpts = {}) {
  const { Fn } = Point;
  const randomBytes_ = ecdhOpts.randomBytes || randomBytes;
  const lengths = Object.assign(getWLengths(Point.Fp, Fn), { seed: getMinHashLength(Fn.ORDER) });
  function isValidSecretKey(secretKey) {
    try {
      return !!_normFnElement(Fn, secretKey);
    } catch (error) {
      return false;
    }
  }
  __name(isValidSecretKey, "isValidSecretKey");
  function isValidPublicKey(publicKey, isCompressed) {
    const { publicKey: comp, publicKeyUncompressed } = lengths;
    try {
      const l = publicKey.length;
      if (isCompressed === true && l !== comp)
        return false;
      if (isCompressed === false && l !== publicKeyUncompressed)
        return false;
      return !!Point.fromBytes(publicKey);
    } catch (error) {
      return false;
    }
  }
  __name(isValidPublicKey, "isValidPublicKey");
  function randomSecretKey(seed = randomBytes_(lengths.seed)) {
    return mapHashToField(_abytes2(seed, lengths.seed, "seed"), Fn.ORDER);
  }
  __name(randomSecretKey, "randomSecretKey");
  function getPublicKey(secretKey, isCompressed = true) {
    return Point.BASE.multiply(_normFnElement(Fn, secretKey)).toBytes(isCompressed);
  }
  __name(getPublicKey, "getPublicKey");
  function keygen(seed) {
    const secretKey = randomSecretKey(seed);
    return { secretKey, publicKey: getPublicKey(secretKey) };
  }
  __name(keygen, "keygen");
  function isProbPub(item) {
    if (typeof item === "bigint")
      return false;
    if (item instanceof Point)
      return true;
    const { secretKey, publicKey, publicKeyUncompressed } = lengths;
    if (Fn.allowedLengths || secretKey === publicKey)
      return void 0;
    const l = ensureBytes("key", item).length;
    return l === publicKey || l === publicKeyUncompressed;
  }
  __name(isProbPub, "isProbPub");
  function getSharedSecret(secretKeyA, publicKeyB, isCompressed = true) {
    if (isProbPub(secretKeyA) === true)
      throw new Error("first arg must be private key");
    if (isProbPub(publicKeyB) === false)
      throw new Error("second arg must be public key");
    const s = _normFnElement(Fn, secretKeyA);
    const b = Point.fromHex(publicKeyB);
    return b.multiply(s).toBytes(isCompressed);
  }
  __name(getSharedSecret, "getSharedSecret");
  const utils = {
    isValidSecretKey,
    isValidPublicKey,
    randomSecretKey,
    // TODO: remove
    isValidPrivateKey: isValidSecretKey,
    randomPrivateKey: randomSecretKey,
    normPrivateKeyToScalar: /* @__PURE__ */ __name((key) => _normFnElement(Fn, key), "normPrivateKeyToScalar"),
    precompute(windowSize = 8, point = Point.BASE) {
      return point.precompute(windowSize, false);
    }
  };
  return Object.freeze({ getPublicKey, getSharedSecret, keygen, Point, utils, lengths });
}
function ecdsa(Point, hash, ecdsaOpts = {}) {
  ahash(hash);
  _validateObject(ecdsaOpts, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  const randomBytes2 = ecdsaOpts.randomBytes || randomBytes;
  const hmac2 = ecdsaOpts.hmac || ((key, ...msgs) => hmac(hash, key, concatBytes(...msgs)));
  const { Fp, Fn } = Point;
  const { ORDER: CURVE_ORDER, BITS: fnBits } = Fn;
  const { keygen, getPublicKey, getSharedSecret, utils, lengths } = ecdh(Point, ecdsaOpts);
  const defaultSigOpts = {
    prehash: false,
    lowS: typeof ecdsaOpts.lowS === "boolean" ? ecdsaOpts.lowS : false,
    format: void 0,
    //'compact' as ECDSASigFormat,
    extraEntropy: false
  };
  const defaultSigOpts_format = "compact";
  function isBiggerThanHalfOrder(number) {
    const HALF = CURVE_ORDER >> _1n4;
    return number > HALF;
  }
  __name(isBiggerThanHalfOrder, "isBiggerThanHalfOrder");
  function validateRS(title, num2) {
    if (!Fn.isValidNot0(num2))
      throw new Error(`invalid signature ${title}: out of range 1..Point.Fn.ORDER`);
    return num2;
  }
  __name(validateRS, "validateRS");
  function validateSigLength(bytes, format) {
    validateSigFormat(format);
    const size = lengths.signature;
    const sizer = format === "compact" ? size : format === "recovered" ? size + 1 : void 0;
    return _abytes2(bytes, sizer, `${format} signature`);
  }
  __name(validateSigLength, "validateSigLength");
  class Signature {
    static {
      __name(this, "Signature");
    }
    constructor(r, s, recovery) {
      this.r = validateRS("r", r);
      this.s = validateRS("s", s);
      if (recovery != null)
        this.recovery = recovery;
      Object.freeze(this);
    }
    static fromBytes(bytes, format = defaultSigOpts_format) {
      validateSigLength(bytes, format);
      let recid;
      if (format === "der") {
        const { r: r2, s: s2 } = DER.toSig(_abytes2(bytes));
        return new Signature(r2, s2);
      }
      if (format === "recovered") {
        recid = bytes[0];
        format = "compact";
        bytes = bytes.subarray(1);
      }
      const L = Fn.BYTES;
      const r = bytes.subarray(0, L);
      const s = bytes.subarray(L, L * 2);
      return new Signature(Fn.fromBytes(r), Fn.fromBytes(s), recid);
    }
    static fromHex(hex, format) {
      return this.fromBytes(hexToBytes(hex), format);
    }
    addRecoveryBit(recovery) {
      return new Signature(this.r, this.s, recovery);
    }
    recoverPublicKey(messageHash) {
      const FIELD_ORDER = Fp.ORDER;
      const { r, s, recovery: rec } = this;
      if (rec == null || ![0, 1, 2, 3].includes(rec))
        throw new Error("recovery id invalid");
      const hasCofactor = CURVE_ORDER * _2n2 < FIELD_ORDER;
      if (hasCofactor && rec > 1)
        throw new Error("recovery id is ambiguous for h>1 curve");
      const radj = rec === 2 || rec === 3 ? r + CURVE_ORDER : r;
      if (!Fp.isValid(radj))
        throw new Error("recovery id 2 or 3 invalid");
      const x = Fp.toBytes(radj);
      const R = Point.fromBytes(concatBytes(pprefix((rec & 1) === 0), x));
      const ir = Fn.inv(radj);
      const h = bits2int_modN(ensureBytes("msgHash", messageHash));
      const u1 = Fn.create(-h * ir);
      const u2 = Fn.create(s * ir);
      const Q = Point.BASE.multiplyUnsafe(u1).add(R.multiplyUnsafe(u2));
      if (Q.is0())
        throw new Error("point at infinify");
      Q.assertValidity();
      return Q;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return isBiggerThanHalfOrder(this.s);
    }
    toBytes(format = defaultSigOpts_format) {
      validateSigFormat(format);
      if (format === "der")
        return hexToBytes(DER.hexFromSig(this));
      const r = Fn.toBytes(this.r);
      const s = Fn.toBytes(this.s);
      if (format === "recovered") {
        if (this.recovery == null)
          throw new Error("recovery bit must be present");
        return concatBytes(Uint8Array.of(this.recovery), r, s);
      }
      return concatBytes(r, s);
    }
    toHex(format) {
      return bytesToHex(this.toBytes(format));
    }
    // TODO: remove
    assertValidity() {
    }
    static fromCompact(hex) {
      return Signature.fromBytes(ensureBytes("sig", hex), "compact");
    }
    static fromDER(hex) {
      return Signature.fromBytes(ensureBytes("sig", hex), "der");
    }
    normalizeS() {
      return this.hasHighS() ? new Signature(this.r, Fn.neg(this.s), this.recovery) : this;
    }
    toDERRawBytes() {
      return this.toBytes("der");
    }
    toDERHex() {
      return bytesToHex(this.toBytes("der"));
    }
    toCompactRawBytes() {
      return this.toBytes("compact");
    }
    toCompactHex() {
      return bytesToHex(this.toBytes("compact"));
    }
  }
  const bits2int = ecdsaOpts.bits2int || /* @__PURE__ */ __name(function bits2int_def(bytes) {
    if (bytes.length > 8192)
      throw new Error("input is too large");
    const num2 = bytesToNumberBE(bytes);
    const delta = bytes.length * 8 - fnBits;
    return delta > 0 ? num2 >> BigInt(delta) : num2;
  }, "bits2int_def");
  const bits2int_modN = ecdsaOpts.bits2int_modN || /* @__PURE__ */ __name(function bits2int_modN_def(bytes) {
    return Fn.create(bits2int(bytes));
  }, "bits2int_modN_def");
  const ORDER_MASK = bitMask(fnBits);
  function int2octets(num2) {
    aInRange("num < 2^" + fnBits, num2, _0n4, ORDER_MASK);
    return Fn.toBytes(num2);
  }
  __name(int2octets, "int2octets");
  function validateMsgAndHash(message, prehash) {
    _abytes2(message, void 0, "message");
    return prehash ? _abytes2(hash(message), void 0, "prehashed message") : message;
  }
  __name(validateMsgAndHash, "validateMsgAndHash");
  function prepSig(message, privateKey, opts) {
    if (["recovered", "canonical"].some((k) => k in opts))
      throw new Error("sign() legacy options not supported");
    const { lowS, prehash, extraEntropy } = validateSigOpts(opts, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    const h1int = bits2int_modN(message);
    const d = _normFnElement(Fn, privateKey);
    const seedArgs = [int2octets(d), int2octets(h1int)];
    if (extraEntropy != null && extraEntropy !== false) {
      const e = extraEntropy === true ? randomBytes2(lengths.secretKey) : extraEntropy;
      seedArgs.push(ensureBytes("extraEntropy", e));
    }
    const seed = concatBytes(...seedArgs);
    const m = h1int;
    function k2sig(kBytes) {
      const k = bits2int(kBytes);
      if (!Fn.isValidNot0(k))
        return;
      const ik = Fn.inv(k);
      const q = Point.BASE.multiply(k).toAffine();
      const r = Fn.create(q.x);
      if (r === _0n4)
        return;
      const s = Fn.create(ik * Fn.create(m + r * d));
      if (s === _0n4)
        return;
      let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n4);
      let normS = s;
      if (lowS && isBiggerThanHalfOrder(s)) {
        normS = Fn.neg(s);
        recovery ^= 1;
      }
      return new Signature(r, normS, recovery);
    }
    __name(k2sig, "k2sig");
    return { seed, k2sig };
  }
  __name(prepSig, "prepSig");
  function sign(message, secretKey, opts = {}) {
    message = ensureBytes("message", message);
    const { seed, k2sig } = prepSig(message, secretKey, opts);
    const drbg = createHmacDrbg(hash.outputLen, Fn.BYTES, hmac2);
    const sig = drbg(seed, k2sig);
    return sig;
  }
  __name(sign, "sign");
  function tryParsingSig(sg) {
    let sig = void 0;
    const isHex = typeof sg === "string" || isBytes(sg);
    const isObj = !isHex && sg !== null && typeof sg === "object" && typeof sg.r === "bigint" && typeof sg.s === "bigint";
    if (!isHex && !isObj)
      throw new Error("invalid signature, expected Uint8Array, hex string or Signature instance");
    if (isObj) {
      sig = new Signature(sg.r, sg.s);
    } else if (isHex) {
      try {
        sig = Signature.fromBytes(ensureBytes("sig", sg), "der");
      } catch (derError) {
        if (!(derError instanceof DER.Err))
          throw derError;
      }
      if (!sig) {
        try {
          sig = Signature.fromBytes(ensureBytes("sig", sg), "compact");
        } catch (error) {
          return false;
        }
      }
    }
    if (!sig)
      return false;
    return sig;
  }
  __name(tryParsingSig, "tryParsingSig");
  function verify(signature, message, publicKey, opts = {}) {
    const { lowS, prehash, format } = validateSigOpts(opts, defaultSigOpts);
    publicKey = ensureBytes("publicKey", publicKey);
    message = validateMsgAndHash(ensureBytes("message", message), prehash);
    if ("strict" in opts)
      throw new Error("options.strict was renamed to lowS");
    const sig = format === void 0 ? tryParsingSig(signature) : Signature.fromBytes(ensureBytes("sig", signature), format);
    if (sig === false)
      return false;
    try {
      const P = Point.fromBytes(publicKey);
      if (lowS && sig.hasHighS())
        return false;
      const { r, s } = sig;
      const h = bits2int_modN(message);
      const is = Fn.inv(s);
      const u1 = Fn.create(h * is);
      const u2 = Fn.create(r * is);
      const R = Point.BASE.multiplyUnsafe(u1).add(P.multiplyUnsafe(u2));
      if (R.is0())
        return false;
      const v = Fn.create(R.x);
      return v === r;
    } catch (e) {
      return false;
    }
  }
  __name(verify, "verify");
  function recoverPublicKey(signature, message, opts = {}) {
    const { prehash } = validateSigOpts(opts, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    return Signature.fromBytes(signature, "recovered").recoverPublicKey(message).toBytes();
  }
  __name(recoverPublicKey, "recoverPublicKey");
  return Object.freeze({
    keygen,
    getPublicKey,
    getSharedSecret,
    utils,
    lengths,
    Point,
    sign,
    verify,
    recoverPublicKey,
    Signature,
    hash
  });
}
function _weierstrass_legacy_opts_to_new(c) {
  const CURVE = {
    a: c.a,
    b: c.b,
    p: c.Fp.ORDER,
    n: c.n,
    h: c.h,
    Gx: c.Gx,
    Gy: c.Gy
  };
  const Fp = c.Fp;
  let allowedLengths = c.allowedPrivateKeyLengths ? Array.from(new Set(c.allowedPrivateKeyLengths.map((l) => Math.ceil(l / 2)))) : void 0;
  const Fn = Field(CURVE.n, {
    BITS: c.nBitLength,
    allowedLengths,
    modFromBytes: c.wrapPrivateKey
  });
  const curveOpts = {
    Fp,
    Fn,
    allowInfinityPoint: c.allowInfinityPoint,
    endo: c.endo,
    isTorsionFree: c.isTorsionFree,
    clearCofactor: c.clearCofactor,
    fromBytes: c.fromBytes,
    toBytes: c.toBytes
  };
  return { CURVE, curveOpts };
}
function _ecdsa_legacy_opts_to_new(c) {
  const { CURVE, curveOpts } = _weierstrass_legacy_opts_to_new(c);
  const ecdsaOpts = {
    hmac: c.hmac,
    randomBytes: c.randomBytes,
    lowS: c.lowS,
    bits2int: c.bits2int,
    bits2int_modN: c.bits2int_modN
  };
  return { CURVE, curveOpts, hash: c.hash, ecdsaOpts };
}
function _ecdsa_new_output_to_legacy(c, _ecdsa) {
  const Point = _ecdsa.Point;
  return Object.assign({}, _ecdsa, {
    ProjectivePoint: Point,
    CURVE: Object.assign({}, c, nLength(Point.Fn.ORDER, Point.Fn.BITS))
  });
}
function weierstrass(c) {
  const { CURVE, curveOpts, hash, ecdsaOpts } = _ecdsa_legacy_opts_to_new(c);
  const Point = weierstrassN(CURVE, curveOpts);
  const signs = ecdsa(Point, hash, ecdsaOpts);
  return _ecdsa_new_output_to_legacy(c, signs);
}
var divNearest, DERErr, DER, _0n4, _1n4, _2n2, _3n2, _4n2;
var init_weierstrass = __esm({
  "node_modules/@noble/curves/esm/abstract/weierstrass.js"() {
    init_checked_fetch();
    init_modules_watch_stub();
    init_hmac();
    init_utils();
    init_utils2();
    init_curve();
    init_modular();
    divNearest = /* @__PURE__ */ __name((num2, den) => (num2 + (num2 >= 0 ? den : -den) / _2n2) / den, "divNearest");
    __name(_splitEndoScalar, "_splitEndoScalar");
    __name(validateSigFormat, "validateSigFormat");
    __name(validateSigOpts, "validateSigOpts");
    DERErr = class extends Error {
      static {
        __name(this, "DERErr");
      }
      constructor(m = "") {
        super(m);
      }
    };
    DER = {
      // asn.1 DER encoding utils
      Err: DERErr,
      // Basic building block is TLV (Tag-Length-Value)
      _tlv: {
        encode: /* @__PURE__ */ __name((tag, data) => {
          const { Err: E } = DER;
          if (tag < 0 || tag > 256)
            throw new E("tlv.encode: wrong tag");
          if (data.length & 1)
            throw new E("tlv.encode: unpadded data");
          const dataLen = data.length / 2;
          const len = numberToHexUnpadded(dataLen);
          if (len.length / 2 & 128)
            throw new E("tlv.encode: long form length too big");
          const lenLen = dataLen > 127 ? numberToHexUnpadded(len.length / 2 | 128) : "";
          const t = numberToHexUnpadded(tag);
          return t + lenLen + len + data;
        }, "encode"),
        // v - value, l - left bytes (unparsed)
        decode(tag, data) {
          const { Err: E } = DER;
          let pos = 0;
          if (tag < 0 || tag > 256)
            throw new E("tlv.encode: wrong tag");
          if (data.length < 2 || data[pos++] !== tag)
            throw new E("tlv.decode: wrong tlv");
          const first = data[pos++];
          const isLong = !!(first & 128);
          let length = 0;
          if (!isLong)
            length = first;
          else {
            const lenLen = first & 127;
            if (!lenLen)
              throw new E("tlv.decode(long): indefinite length not supported");
            if (lenLen > 4)
              throw new E("tlv.decode(long): byte length is too big");
            const lengthBytes = data.subarray(pos, pos + lenLen);
            if (lengthBytes.length !== lenLen)
              throw new E("tlv.decode: length bytes not complete");
            if (lengthBytes[0] === 0)
              throw new E("tlv.decode(long): zero leftmost byte");
            for (const b of lengthBytes)
              length = length << 8 | b;
            pos += lenLen;
            if (length < 128)
              throw new E("tlv.decode(long): not minimal encoding");
          }
          const v = data.subarray(pos, pos + length);
          if (v.length !== length)
            throw new E("tlv.decode: wrong value length");
          return { v, l: data.subarray(pos + length) };
        }
      },
      // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
      // since we always use positive integers here. It must always be empty:
      // - add zero byte if exists
      // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
      _int: {
        encode(num2) {
          const { Err: E } = DER;
          if (num2 < _0n4)
            throw new E("integer: negative integers are not allowed");
          let hex = numberToHexUnpadded(num2);
          if (Number.parseInt(hex[0], 16) & 8)
            hex = "00" + hex;
          if (hex.length & 1)
            throw new E("unexpected DER parsing assertion: unpadded hex");
          return hex;
        },
        decode(data) {
          const { Err: E } = DER;
          if (data[0] & 128)
            throw new E("invalid signature integer: negative");
          if (data[0] === 0 && !(data[1] & 128))
            throw new E("invalid signature integer: unnecessary leading zero");
          return bytesToNumberBE(data);
        }
      },
      toSig(hex) {
        const { Err: E, _int: int, _tlv: tlv } = DER;
        const data = ensureBytes("signature", hex);
        const { v: seqBytes, l: seqLeftBytes } = tlv.decode(48, data);
        if (seqLeftBytes.length)
          throw new E("invalid signature: left bytes after parsing");
        const { v: rBytes, l: rLeftBytes } = tlv.decode(2, seqBytes);
        const { v: sBytes, l: sLeftBytes } = tlv.decode(2, rLeftBytes);
        if (sLeftBytes.length)
          throw new E("invalid signature: left bytes after parsing");
        return { r: int.decode(rBytes), s: int.decode(sBytes) };
      },
      hexFromSig(sig) {
        const { _tlv: tlv, _int: int } = DER;
        const rs = tlv.encode(2, int.encode(sig.r));
        const ss = tlv.encode(2, int.encode(sig.s));
        const seq = rs + ss;
        return tlv.encode(48, seq);
      }
    };
    _0n4 = BigInt(0);
    _1n4 = BigInt(1);
    _2n2 = BigInt(2);
    _3n2 = BigInt(3);
    _4n2 = BigInt(4);
    __name(_normFnElement, "_normFnElement");
    __name(weierstrassN, "weierstrassN");
    __name(pprefix, "pprefix");
    __name(SWUFpSqrtRatio, "SWUFpSqrtRatio");
    __name(mapToCurveSimpleSWU, "mapToCurveSimpleSWU");
    __name(getWLengths, "getWLengths");
    __name(ecdh, "ecdh");
    __name(ecdsa, "ecdsa");
    __name(_weierstrass_legacy_opts_to_new, "_weierstrass_legacy_opts_to_new");
    __name(_ecdsa_legacy_opts_to_new, "_ecdsa_legacy_opts_to_new");
    __name(_ecdsa_new_output_to_legacy, "_ecdsa_new_output_to_legacy");
    __name(weierstrass, "weierstrass");
  }
});

// node_modules/@noble/curves/esm/_shortw_utils.js
function createCurve(curveDef, defHash) {
  const create = /* @__PURE__ */ __name((hash) => weierstrass({ ...curveDef, hash }), "create");
  return { ...create(defHash), create };
}
var init_shortw_utils = __esm({
  "node_modules/@noble/curves/esm/_shortw_utils.js"() {
    init_checked_fetch();
    init_modules_watch_stub();
    init_weierstrass();
    __name(createCurve, "createCurve");
  }
});

// node_modules/@noble/curves/esm/abstract/hash-to-curve.js
function i2osp(value, length) {
  anum(value);
  anum(length);
  if (value < 0 || value >= 1 << 8 * length)
    throw new Error("invalid I2OSP input: " + value);
  const res = Array.from({ length }).fill(0);
  for (let i = length - 1; i >= 0; i--) {
    res[i] = value & 255;
    value >>>= 8;
  }
  return new Uint8Array(res);
}
function strxor(a, b) {
  const arr = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    arr[i] = a[i] ^ b[i];
  }
  return arr;
}
function anum(item) {
  if (!Number.isSafeInteger(item))
    throw new Error("number expected");
}
function normDST(DST) {
  if (!isBytes(DST) && typeof DST !== "string")
    throw new Error("DST must be Uint8Array or string");
  return typeof DST === "string" ? utf8ToBytes(DST) : DST;
}
function expand_message_xmd(msg, DST, lenInBytes, H) {
  abytes(msg);
  anum(lenInBytes);
  DST = normDST(DST);
  if (DST.length > 255)
    DST = H(concatBytes(utf8ToBytes("H2C-OVERSIZE-DST-"), DST));
  const { outputLen: b_in_bytes, blockLen: r_in_bytes } = H;
  const ell = Math.ceil(lenInBytes / b_in_bytes);
  if (lenInBytes > 65535 || ell > 255)
    throw new Error("expand_message_xmd: invalid lenInBytes");
  const DST_prime = concatBytes(DST, i2osp(DST.length, 1));
  const Z_pad = i2osp(0, r_in_bytes);
  const l_i_b_str = i2osp(lenInBytes, 2);
  const b = new Array(ell);
  const b_0 = H(concatBytes(Z_pad, msg, l_i_b_str, i2osp(0, 1), DST_prime));
  b[0] = H(concatBytes(b_0, i2osp(1, 1), DST_prime));
  for (let i = 1; i <= ell; i++) {
    const args = [strxor(b_0, b[i - 1]), i2osp(i + 1, 1), DST_prime];
    b[i] = H(concatBytes(...args));
  }
  const pseudo_random_bytes = concatBytes(...b);
  return pseudo_random_bytes.slice(0, lenInBytes);
}
function expand_message_xof(msg, DST, lenInBytes, k, H) {
  abytes(msg);
  anum(lenInBytes);
  DST = normDST(DST);
  if (DST.length > 255) {
    const dkLen = Math.ceil(2 * k / 8);
    DST = H.create({ dkLen }).update(utf8ToBytes("H2C-OVERSIZE-DST-")).update(DST).digest();
  }
  if (lenInBytes > 65535 || DST.length > 255)
    throw new Error("expand_message_xof: invalid lenInBytes");
  return H.create({ dkLen: lenInBytes }).update(msg).update(i2osp(lenInBytes, 2)).update(DST).update(i2osp(DST.length, 1)).digest();
}
function hash_to_field(msg, count, options) {
  _validateObject(options, {
    p: "bigint",
    m: "number",
    k: "number",
    hash: "function"
  });
  const { p, k, m, hash, expand, DST } = options;
  if (!isHash(options.hash))
    throw new Error("expected valid hash");
  abytes(msg);
  anum(count);
  const log2p = p.toString(2).length;
  const L = Math.ceil((log2p + k) / 8);
  const len_in_bytes = count * m * L;
  let prb;
  if (expand === "xmd") {
    prb = expand_message_xmd(msg, DST, len_in_bytes, hash);
  } else if (expand === "xof") {
    prb = expand_message_xof(msg, DST, len_in_bytes, k, hash);
  } else if (expand === "_internal_pass") {
    prb = msg;
  } else {
    throw new Error('expand must be "xmd" or "xof"');
  }
  const u = new Array(count);
  for (let i = 0; i < count; i++) {
    const e = new Array(m);
    for (let j = 0; j < m; j++) {
      const elm_offset = L * (j + i * m);
      const tv = prb.subarray(elm_offset, elm_offset + L);
      e[j] = mod(os2ip(tv), p);
    }
    u[i] = e;
  }
  return u;
}
function isogenyMap(field, map) {
  const coeff = map.map((i) => Array.from(i).reverse());
  return (x, y) => {
    const [xn, xd, yn, yd] = coeff.map((val) => val.reduce((acc, i) => field.add(field.mul(acc, x), i)));
    const [xd_inv, yd_inv] = FpInvertBatch(field, [xd, yd], true);
    x = field.mul(xn, xd_inv);
    y = field.mul(y, field.mul(yn, yd_inv));
    return { x, y };
  };
}
function createHasher2(Point, mapToCurve, defaults) {
  if (typeof mapToCurve !== "function")
    throw new Error("mapToCurve() must be defined");
  function map(num2) {
    return Point.fromAffine(mapToCurve(num2));
  }
  __name(map, "map");
  function clear(initial) {
    const P = initial.clearCofactor();
    if (P.equals(Point.ZERO))
      return Point.ZERO;
    P.assertValidity();
    return P;
  }
  __name(clear, "clear");
  return {
    defaults,
    hashToCurve(msg, options) {
      const opts = Object.assign({}, defaults, options);
      const u = hash_to_field(msg, 2, opts);
      const u0 = map(u[0]);
      const u1 = map(u[1]);
      return clear(u0.add(u1));
    },
    encodeToCurve(msg, options) {
      const optsDst = defaults.encodeDST ? { DST: defaults.encodeDST } : {};
      const opts = Object.assign({}, defaults, optsDst, options);
      const u = hash_to_field(msg, 1, opts);
      const u0 = map(u[0]);
      return clear(u0);
    },
    /** See {@link H2CHasher} */
    mapToCurve(scalars) {
      if (!Array.isArray(scalars))
        throw new Error("expected array of bigints");
      for (const i of scalars)
        if (typeof i !== "bigint")
          throw new Error("expected array of bigints");
      return clear(map(scalars));
    },
    // hash_to_scalar can produce 0: https://www.rfc-editor.org/errata/eid8393
    // RFC 9380, draft-irtf-cfrg-bbs-signatures-08
    hashToScalar(msg, options) {
      const N = Point.Fn.ORDER;
      const opts = Object.assign({}, defaults, { p: N, m: 1, DST: _DST_scalar }, options);
      return hash_to_field(msg, 1, opts)[0][0];
    }
  };
}
var os2ip, _DST_scalar;
var init_hash_to_curve = __esm({
  "node_modules/@noble/curves/esm/abstract/hash-to-curve.js"() {
    init_checked_fetch();
    init_modules_watch_stub();
    init_utils2();
    init_modular();
    os2ip = bytesToNumberBE;
    __name(i2osp, "i2osp");
    __name(strxor, "strxor");
    __name(anum, "anum");
    __name(normDST, "normDST");
    __name(expand_message_xmd, "expand_message_xmd");
    __name(expand_message_xof, "expand_message_xof");
    __name(hash_to_field, "hash_to_field");
    __name(isogenyMap, "isogenyMap");
    _DST_scalar = utf8ToBytes("HashToScalar-");
    __name(createHasher2, "createHasher");
  }
});

// node_modules/@noble/curves/esm/secp256k1.js
var secp256k1_exports = {};
__export(secp256k1_exports, {
  encodeToCurve: () => encodeToCurve,
  hashToCurve: () => hashToCurve,
  schnorr: () => schnorr,
  secp256k1: () => secp256k1,
  secp256k1_hasher: () => secp256k1_hasher
});
function sqrtMod(y) {
  const P = secp256k1_CURVE.p;
  const _3n3 = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
  const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
  const b2 = y * y * y % P;
  const b3 = b2 * b2 * y % P;
  const b6 = pow2(b3, _3n3, P) * b3 % P;
  const b9 = pow2(b6, _3n3, P) * b3 % P;
  const b11 = pow2(b9, _2n3, P) * b2 % P;
  const b22 = pow2(b11, _11n, P) * b11 % P;
  const b44 = pow2(b22, _22n, P) * b22 % P;
  const b88 = pow2(b44, _44n, P) * b44 % P;
  const b176 = pow2(b88, _88n, P) * b88 % P;
  const b220 = pow2(b176, _44n, P) * b44 % P;
  const b223 = pow2(b220, _3n3, P) * b3 % P;
  const t1 = pow2(b223, _23n, P) * b22 % P;
  const t2 = pow2(t1, _6n, P) * b2 % P;
  const root = pow2(t2, _2n3, P);
  if (!Fpk1.eql(Fpk1.sqr(root), y))
    throw new Error("Cannot find square root");
  return root;
}
function taggedHash(tag, ...messages) {
  let tagP = TAGGED_HASH_PREFIXES[tag];
  if (tagP === void 0) {
    const tagH = sha256(utf8ToBytes(tag));
    tagP = concatBytes(tagH, tagH);
    TAGGED_HASH_PREFIXES[tag] = tagP;
  }
  return sha256(concatBytes(tagP, ...messages));
}
function schnorrGetExtPubKey(priv) {
  const { Fn, BASE } = Pointk1;
  const d_ = _normFnElement(Fn, priv);
  const p = BASE.multiply(d_);
  const scalar = hasEven(p.y) ? d_ : Fn.neg(d_);
  return { scalar, bytes: pointToBytes(p) };
}
function lift_x(x) {
  const Fp = Fpk1;
  if (!Fp.isValidNot0(x))
    throw new Error("invalid x: Fail if x \u2265 p");
  const xx = Fp.create(x * x);
  const c = Fp.create(xx * x + BigInt(7));
  let y = Fp.sqrt(c);
  if (!hasEven(y))
    y = Fp.neg(y);
  const p = Pointk1.fromAffine({ x, y });
  p.assertValidity();
  return p;
}
function challenge(...args) {
  return Pointk1.Fn.create(num(taggedHash("BIP0340/challenge", ...args)));
}
function schnorrGetPublicKey(secretKey) {
  return schnorrGetExtPubKey(secretKey).bytes;
}
function schnorrSign(message, secretKey, auxRand = randomBytes(32)) {
  const { Fn } = Pointk1;
  const m = ensureBytes("message", message);
  const { bytes: px, scalar: d } = schnorrGetExtPubKey(secretKey);
  const a = ensureBytes("auxRand", auxRand, 32);
  const t = Fn.toBytes(d ^ num(taggedHash("BIP0340/aux", a)));
  const rand = taggedHash("BIP0340/nonce", t, px, m);
  const { bytes: rx, scalar: k } = schnorrGetExtPubKey(rand);
  const e = challenge(rx, px, m);
  const sig = new Uint8Array(64);
  sig.set(rx, 0);
  sig.set(Fn.toBytes(Fn.create(k + e * d)), 32);
  if (!schnorrVerify(sig, m, px))
    throw new Error("sign: Invalid signature produced");
  return sig;
}
function schnorrVerify(signature, message, publicKey) {
  const { Fn, BASE } = Pointk1;
  const sig = ensureBytes("signature", signature, 64);
  const m = ensureBytes("message", message);
  const pub = ensureBytes("publicKey", publicKey, 32);
  try {
    const P = lift_x(num(pub));
    const r = num(sig.subarray(0, 32));
    if (!inRange(r, _1n5, secp256k1_CURVE.p))
      return false;
    const s = num(sig.subarray(32, 64));
    if (!inRange(s, _1n5, secp256k1_CURVE.n))
      return false;
    const e = challenge(Fn.toBytes(r), pointToBytes(P), m);
    const R = BASE.multiplyUnsafe(s).add(P.multiplyUnsafe(Fn.neg(e)));
    const { x, y } = R.toAffine();
    if (R.is0() || !hasEven(y) || x !== r)
      return false;
    return true;
  } catch (error) {
    return false;
  }
}
var secp256k1_CURVE, secp256k1_ENDO, _0n5, _1n5, _2n3, Fpk1, secp256k1, TAGGED_HASH_PREFIXES, pointToBytes, Pointk1, hasEven, num, schnorr, isoMap, mapSWU, secp256k1_hasher, hashToCurve, encodeToCurve;
var init_secp256k1 = __esm({
  "node_modules/@noble/curves/esm/secp256k1.js"() {
    init_checked_fetch();
    init_modules_watch_stub();
    init_sha2();
    init_utils();
    init_shortw_utils();
    init_hash_to_curve();
    init_modular();
    init_weierstrass();
    init_utils2();
    secp256k1_CURVE = {
      p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
      n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
      h: BigInt(1),
      a: BigInt(0),
      b: BigInt(7),
      Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
      Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
    };
    secp256k1_ENDO = {
      beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
      basises: [
        [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
        [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
      ]
    };
    _0n5 = /* @__PURE__ */ BigInt(0);
    _1n5 = /* @__PURE__ */ BigInt(1);
    _2n3 = /* @__PURE__ */ BigInt(2);
    __name(sqrtMod, "sqrtMod");
    Fpk1 = Field(secp256k1_CURVE.p, { sqrt: sqrtMod });
    secp256k1 = createCurve({ ...secp256k1_CURVE, Fp: Fpk1, lowS: true, endo: secp256k1_ENDO }, sha256);
    TAGGED_HASH_PREFIXES = {};
    __name(taggedHash, "taggedHash");
    pointToBytes = /* @__PURE__ */ __name((point) => point.toBytes(true).slice(1), "pointToBytes");
    Pointk1 = /* @__PURE__ */ (() => secp256k1.Point)();
    hasEven = /* @__PURE__ */ __name((y) => y % _2n3 === _0n5, "hasEven");
    __name(schnorrGetExtPubKey, "schnorrGetExtPubKey");
    __name(lift_x, "lift_x");
    num = bytesToNumberBE;
    __name(challenge, "challenge");
    __name(schnorrGetPublicKey, "schnorrGetPublicKey");
    __name(schnorrSign, "schnorrSign");
    __name(schnorrVerify, "schnorrVerify");
    schnorr = /* @__PURE__ */ (() => {
      const size = 32;
      const seedLength = 48;
      const randomSecretKey = /* @__PURE__ */ __name((seed = randomBytes(seedLength)) => {
        return mapHashToField(seed, secp256k1_CURVE.n);
      }, "randomSecretKey");
      secp256k1.utils.randomSecretKey;
      function keygen(seed) {
        const secretKey = randomSecretKey(seed);
        return { secretKey, publicKey: schnorrGetPublicKey(secretKey) };
      }
      __name(keygen, "keygen");
      return {
        keygen,
        getPublicKey: schnorrGetPublicKey,
        sign: schnorrSign,
        verify: schnorrVerify,
        Point: Pointk1,
        utils: {
          randomSecretKey,
          randomPrivateKey: randomSecretKey,
          taggedHash,
          // TODO: remove
          lift_x,
          pointToBytes,
          numberToBytesBE,
          bytesToNumberBE,
          mod
        },
        lengths: {
          secretKey: size,
          publicKey: size,
          publicKeyHasPrefix: false,
          signature: size * 2,
          seed: seedLength
        }
      };
    })();
    isoMap = /* @__PURE__ */ (() => isogenyMap(Fpk1, [
      // xNum
      [
        "0x8e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38daaaaa8c7",
        "0x7d3d4c80bc321d5b9f315cea7fd44c5d595d2fc0bf63b92dfff1044f17c6581",
        "0x534c328d23f234e6e2a413deca25caece4506144037c40314ecbd0b53d9dd262",
        "0x8e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38daaaaa88c"
      ],
      // xDen
      [
        "0xd35771193d94918a9ca34ccbb7b640dd86cd409542f8487d9fe6b745781eb49b",
        "0xedadc6f64383dc1df7c4b2d51b54225406d36b641f5e41bbc52a56612a8c6d14",
        "0x0000000000000000000000000000000000000000000000000000000000000001"
        // LAST 1
      ],
      // yNum
      [
        "0x4bda12f684bda12f684bda12f684bda12f684bda12f684bda12f684b8e38e23c",
        "0xc75e0c32d5cb7c0fa9d0a54b12a0a6d5647ab046d686da6fdffc90fc201d71a3",
        "0x29a6194691f91a73715209ef6512e576722830a201be2018a765e85a9ecee931",
        "0x2f684bda12f684bda12f684bda12f684bda12f684bda12f684bda12f38e38d84"
      ],
      // yDen
      [
        "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffff93b",
        "0x7a06534bb8bdb49fd5e9e6632722c2989467c1bfc8e8d978dfb425d2685c2573",
        "0x6484aa716545ca2cf3a70c3fa8fe337e0a3d21162f0d6299a7bf8192bfd2a76f",
        "0x0000000000000000000000000000000000000000000000000000000000000001"
        // LAST 1
      ]
    ].map((i) => i.map((j) => BigInt(j)))))();
    mapSWU = /* @__PURE__ */ (() => mapToCurveSimpleSWU(Fpk1, {
      A: BigInt("0x3f8731abdd661adca08a5558f0f5d272e953d363cb6f0e5d405447c01a444533"),
      B: BigInt("1771"),
      Z: Fpk1.create(BigInt("-11"))
    }))();
    secp256k1_hasher = /* @__PURE__ */ (() => createHasher2(secp256k1.Point, (scalars) => {
      const { x, y } = mapSWU(Fpk1.create(scalars[0]));
      return isoMap(x, y);
    }, {
      DST: "secp256k1_XMD:SHA-256_SSWU_RO_",
      encodeDST: "secp256k1_XMD:SHA-256_SSWU_NU_",
      p: Fpk1.ORDER,
      m: 1,
      k: 128,
      expand: "xmd",
      hash: sha256
    }))();
    hashToCurve = /* @__PURE__ */ (() => secp256k1_hasher.hashToCurve)();
    encodeToCurve = /* @__PURE__ */ (() => secp256k1_hasher.encodeToCurve)();
  }
});

// src/utils/image_storage.mjs
var image_storage_exports = {};
__export(image_storage_exports, {
  fetchAndHashImage: () => fetchAndHashImage,
  isImageContentType: () => isImageContentType,
  storeImageInR2: () => storeImageInR2
});
async function storeImageInR2(imageBlob, sha2562, contentType, env, metadata = {}, deps = {}) {
  const now = deps.now || (() => Date.now());
  console.log(`\u{1F4F8} IMAGE STORE: Starting R2-only storage for SHA-256: ${sha2562}, type: ${contentType}`);
  const results = {
    success: false,
    sha256: sha2562,
    urls: {},
    errors: {}
  };
  if (!env.R2_VIDEOS) {
    results.errors.r2 = "No R2 binding available";
    console.error("\u{1F4F8} IMAGE STORE: No R2_VIDEOS binding");
    return results;
  }
  if (!env.MEDIA_KV) {
    results.errors.kv = "No KV binding available";
    console.error("\u{1F4F8} IMAGE STORE: No MEDIA_KV binding");
    return results;
  }
  const extension = getExtensionFromMimeType(contentType);
  const r2Key = `images/${sha2562}${extension}`;
  try {
    console.log(`\u{1F4F8} IMAGE STORE: Storing in R2 with key: ${r2Key}`);
    await env.R2_VIDEOS.put(r2Key, imageBlob, {
      httpMetadata: {
        contentType,
        cacheControl: "public, max-age=31536000"
        // 1 year cache
      },
      customMetadata: {
        sha256: sha2562,
        uploadedAt: (/* @__PURE__ */ new Date()).toISOString(),
        type: "image",
        originalContentType: contentType,
        size: imageBlob.byteLength.toString()
      }
    });
    console.log(`\u2705 IMAGE STORE: R2 upload successful for ${r2Key}`);
    const record = {
      status: "ready",
      // Images are ready immediately (no processing needed)
      type: "image",
      contentType,
      owner: metadata.owner || "system",
      createdAt: now(),
      uploadedVia: "image_storage",
      sha256: sha2562,
      size: imageBlob.byteLength,
      filename: metadata.filename || `image${extension}`,
      r2Key
    };
    await env.MEDIA_KV.put(`image:${sha2562}`, JSON.stringify(record));
    console.log(`\u2705 IMAGE STORE: KV metadata stored for SHA-256: ${sha2562}`);
    await env.MEDIA_KV.put(`idx:sha256:${sha2562}`, JSON.stringify({
      sha256: sha2562,
      type: "image"
    }));
    if (record.owner && record.owner !== "system") {
      await env.MEDIA_KV.put(`idx:pubkey:${record.owner}:image:${sha2562}`, "1");
    }
    const cdnDomain = env.STREAM_DOMAIN || "cdn.divine.video";
    results.urls = {
      url: `https://${cdnDomain}/${sha2562}${extension}`,
      bareUrl: `https://${cdnDomain}/${sha2562}`,
      r2DirectUrl: env.R2_PUBLIC_DOMAIN ? `https://${env.R2_PUBLIC_DOMAIN}/${r2Key}` : null
    };
    results.success = true;
    console.log(`\u2705 IMAGE STORE: Complete for ${sha2562} - URLs generated`);
  } catch (error) {
    console.error(`\u274C IMAGE STORE: Failed for ${sha2562}:`, error);
    results.errors.storage = error.message;
  }
  return results;
}
function getExtensionFromMimeType(contentType) {
  const mimeToExt = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff"
  };
  return mimeToExt[contentType.toLowerCase()] || ".jpg";
}
function isImageContentType(contentType) {
  if (!contentType) return false;
  return contentType.toLowerCase().startsWith("image/");
}
async function fetchAndHashImage(sourceUrl, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  console.log(`\u{1F4F8} IMAGE FETCH: Fetching image from: ${sourceUrl}`);
  const response = await fetchFn(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!isImageContentType(contentType)) {
    throw new Error(`Invalid content type for image: ${contentType}`);
  }
  const blob = await response.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", blob);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sha2562 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  console.log(`\u2705 IMAGE FETCH: Image fetched and hashed - Size: ${blob.byteLength}, SHA-256: ${sha2562}, Type: ${contentType}`);
  return {
    blob,
    sha256: sha2562,
    size: blob.byteLength,
    contentType
  };
}
var init_image_storage = __esm({
  "src/utils/image_storage.mjs"() {
    init_checked_fetch();
    init_modules_watch_stub();
    __name(storeImageInR2, "storeImageInR2");
    __name(getExtensionFromMimeType, "getExtensionFromMimeType");
    __name(isImageContentType, "isImageContentType");
    __name(fetchAndHashImage, "fetchAndHashImage");
  }
});

// src/auth/blossom.mjs
var blossom_exports = {};
__export(blossom_exports, {
  createBlossomAuthTemplate: () => createBlossomAuthTemplate,
  createBlossomSpecAuthTemplate: () => createBlossomSpecAuthTemplate,
  verifyBlossomAuth: () => verifyBlossomAuth
});
async function verifyBlossomAuth(req, deps = {}) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  console.log("\u{1F338} Blossom auth called");
  if (!auth || !auth.startsWith("Nostr ")) {
    console.log("\u{1F338} No Nostr auth header found");
    return null;
  }
  try {
    const base64Event = auth.slice(6).trim();
    console.log("\u{1F338} Base64 event length:", base64Event.length);
    if (base64Event.startsWith("pubkey=")) {
      const pubkey = base64Event.slice(7);
      if (pubkey.match(/^[a-f0-9]{64}$/)) {
        console.log("\u{1F338} Simple pubkey auth succeeded");
        return { pubkey };
      }
      return null;
    }
    console.log("\u{1F338} Decoding base64 event");
    const eventJson = base64ToString2(base64Event);
    console.log("\u{1F338} Event JSON length:", eventJson.length);
    const event = JSON.parse(eventJson);
    console.log("\u{1F338} Event kind:", event.kind);
    if (event.kind !== 24242) {
      console.log("\u{1F338} Invalid kind:", event.kind);
      return null;
    }
    console.log("\u{1F338} Kind 24242 verified");
    if (!event.pubkey || !event.sig || !event.created_at || !Array.isArray(event.tags)) {
      console.log("\u{1F338} Required fields validation failed");
      return null;
    }
    console.log("\u{1F338} Required fields validated");
    const tag = /* @__PURE__ */ __name((k) => {
      for (const t of event.tags) if (Array.isArray(t) && t[0] === k) return t[1];
      return void 0;
    }, "tag");
    const blossomVerb = tag("t");
    const authUrl = tag("u");
    const authMethod = tag("method");
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    if (blossomVerb) {
      console.log("\u{1F338} Using Blossom spec format with 't' tag:", blossomVerb);
      const verbToMethod = {
        "upload": ["PUT", "POST"],
        "get": ["GET", "HEAD"],
        "list": ["GET"],
        "delete": ["DELETE"]
      };
      const allowedMethods = verbToMethod[blossomVerb];
      if (!allowedMethods) {
        console.log("\u{1F338} Unknown Blossom verb:", blossomVerb);
        return null;
      }
      if (!allowedMethods.includes(method)) {
        console.log("\u{1F338} Method mismatch for Blossom verb", {
          verb: blossomVerb,
          allowedMethods,
          actualMethod: method
        });
        return null;
      }
      const blobHash = tag("x");
      if (blobHash) {
        const pathMatch = url.pathname.match(/\/([a-f0-9]{64})/i);
        if (pathMatch && pathMatch[1].toLowerCase() !== blobHash.toLowerCase()) {
          console.log("\u{1F338} Blob hash mismatch", {
            urlHash: pathMatch[1],
            authHash: blobHash
          });
          return null;
        }
      }
      console.log("\u{1F338} Blossom spec validation passed");
    } else if (authUrl || authMethod) {
      console.log("\u{1F338} Using current format with 'u' and 'method' tags");
      console.log("\u{1F338} URL validation:", {
        requestUrl: url.toString(),
        authUrl,
        match: !authUrl || authUrl === url.toString()
      });
      console.log("\u{1F338} Method validation:", {
        requestMethod: method,
        authMethod: authMethod?.toUpperCase(),
        match: !authMethod || authMethod.toUpperCase() === method
      });
      if (authUrl && authUrl !== url.toString()) {
        console.log("\u{1F338} URL validation failed");
        return null;
      }
      if (authMethod && authMethod.toUpperCase() !== method) {
        console.log("\u{1F338} Method validation failed");
        return null;
      }
      console.log("\u{1F338} Current format validation passed");
    } else {
      console.log("\u{1F338} No specific auth tags, accepting event");
    }
    const expiration = tag("expiration");
    if (expiration) {
      const expireTime = parseInt(expiration, 10);
      const now = Math.floor((deps.now?.() || Date.now()) / 1e3);
      if (now > expireTime) {
        return null;
      }
    }
    console.log("\u{1F338} Starting signature verification");
    const id = await eventId2(event);
    console.log("\u{1F338} Event ID check:", {
      calculated: id,
      provided: event.id,
      match: !event.id || event.id === id
    });
    if (event.id && event.id !== id) {
      console.log("\u{1F338} Event ID verification failed");
      return null;
    }
    try {
      console.log("\u{1F338} Starting Schnorr verification");
      const { schnorr: schnorr2 } = await Promise.resolve().then(() => (init_secp256k1(), secp256k1_exports));
      const isValid = await schnorr2.verify(event.sig, id, event.pubkey);
      console.log("\u{1F338} Schnorr verification result:", isValid);
      if (!isValid) {
        console.log("\u{1F338} Signature verification failed");
        return null;
      }
    } catch (error) {
      console.log("\u{1F338} Schnorr verification error:", error.message);
      return null;
    }
    console.log("\u{1F338} Blossom auth SUCCESS! Returning result");
    return {
      pubkey: event.pubkey,
      event
    };
  } catch (error) {
    console.log("\u{1F338} Blossom auth error:", error.message);
    if (deps.verifyNip98) {
      console.log("\u{1F338} Falling back to NIP-98");
      return await deps.verifyNip98(req);
    }
    return null;
  }
}
async function eventId2(event) {
  const payload = [0, event.pubkey, event.created_at, event.kind, event.tags, event.content ?? ""];
  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(payload));
  return await sha256Hex2(data);
}
async function sha256Hex2(input) {
  const buf = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}
function base64ToString2(b64) {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, "base64").toString("utf8");
}
function createBlossomAuthTemplate(method, url, options = {}) {
  const now = Math.floor(Date.now() / 1e3);
  const { expiration, payload, format = "current", blobHash, content } = options;
  const tags = [];
  if (format === "blossom") {
    const methodToVerb = {
      "PUT": "upload",
      "POST": "upload",
      "GET": "get",
      "HEAD": "get",
      "DELETE": "delete"
    };
    const verb = methodToVerb[method.toUpperCase()] || "get";
    tags.push(["t", verb]);
    if (blobHash) {
      tags.push(["x", blobHash]);
    }
  } else {
    tags.push(["u", url]);
    tags.push(["method", method.toLowerCase()]);
    tags.push(["created_at", now.toString()]);
    if (payload) {
      tags.push(["payload", payload]);
    }
  }
  if (expiration) {
    tags.push(["expiration", expiration.toString()]);
  } else {
    if (format === "blossom") {
      tags.push(["expiration", (now + 60).toString()]);
    }
  }
  return {
    kind: 24242,
    created_at: now,
    tags,
    content: content || (format === "blossom" ? `Blossom ${method} request` : "")
  };
}
function createBlossomSpecAuthTemplate(verb, options = {}) {
  const now = Math.floor(Date.now() / 1e3);
  const { expiration, blobHash, content } = options;
  const tags = [
    ["t", verb]
  ];
  tags.push(["expiration", (expiration || now + 60).toString()]);
  if (blobHash) {
    tags.push(["x", blobHash]);
  }
  return {
    kind: 24242,
    created_at: now,
    tags,
    content: content || `Blossom ${verb} request`
  };
}
var init_blossom = __esm({
  "src/auth/blossom.mjs"() {
    init_checked_fetch();
    init_modules_watch_stub();
    __name(verifyBlossomAuth, "verifyBlossomAuth");
    __name(eventId2, "eventId");
    __name(sha256Hex2, "sha256Hex");
    __name(base64ToString2, "base64ToString");
    __name(createBlossomAuthTemplate, "createBlossomAuthTemplate");
    __name(createBlossomSpecAuthTemplate, "createBlossomSpecAuthTemplate");
  }
});

// .wrangler/tmp/bundle-GcmkCz/middleware-loader.entry.ts
init_checked_fetch();
init_modules_watch_stub();

// .wrangler/tmp/bundle-GcmkCz/middleware-insertion-facade.js
init_checked_fetch();
init_modules_watch_stub();

// src/worker.mjs
init_checked_fetch();
init_modules_watch_stub();
init_router();
init_videos();

// src/handlers/webhook.mjs
init_checked_fetch();
init_modules_watch_stub();
init_router();
async function handleStreamWebhook(req, env, deps) {
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
  } catch {
  }
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
    updatedAt: deps.now()
  };
  await env.MEDIA_KV.put(key, JSON.stringify(updated));
  if (status === "published" && current.status !== "published") {
    console.log("\u{1F514} Auto-enabling downloads for newly published UID:", uid);
    try {
      const accountId = env.STREAM_ACCOUNT_ID;
      const apiToken = env.STREAM_API_TOKEN;
      if (accountId && apiToken) {
        const downloadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`;
        const downloadRes = await deps.fetch(downloadUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiToken}`,
            "Content-Type": "application/json"
          }
        });
        if (downloadRes.ok) {
          console.log("\u{1F514} Downloads enabled successfully for UID:", uid);
        } else {
          console.log("\u{1F514} Download enable failed for UID:", uid, "status:", downloadRes.status);
        }
      }
    } catch (error) {
      console.log("\u{1F514} Download enable error for UID:", uid, "error:", error.message);
    }
  }
  return json(200, { ok: true });
}
__name(handleStreamWebhook, "handleStreamWebhook");

// src/handlers/status.mjs
init_checked_fetch();
init_modules_watch_stub();
init_router();
async function getVideoStatus(req, env, _deps) {
  const url = new URL(req.url);
  const uid = url.pathname.split("/").pop();
  if (!uid) return json(400, { error: "bad_request", reason: "missing_uid" });
  const v = await env.MEDIA_KV.get(`video:${uid}`);
  if (!v) return json(404, { error: "not_found" });
  const data = JSON.parse(v);
  return json(200, {
    uid,
    status: data.status,
    owner: data.owner,
    hlsUrl: data.hlsUrl ?? void 0,
    dashUrl: data.dashUrl ?? void 0,
    thumbnailUrl: data.thumbnailUrl ?? void 0,
    // Include original path information
    r2Key: data.r2Key ?? void 0,
    migratedFrom: data.migratedFrom ?? void 0,
    originalUrl: data.originalUrl ?? void 0,
    vineId: data.vineId ?? void 0,
    sha256: data.sha256 ?? void 0
  });
}
__name(getVideoStatus, "getVideoStatus");

// src/handlers/lookup.mjs
init_checked_fetch();
init_modules_watch_stub();
init_router();
init_stream_urls();
async function lookupUid(req, env, _deps) {
  const flag = env.LOOKUPS_ENABLED;
  const enabled = flag === true || flag === "true" || flag === "1";
  if (!enabled) return json(404, { error: "not_found" });
  const url = new URL(req.url);
  const sha2562 = url.searchParams.get("sha256");
  const vineId = url.searchParams.get("vineId");
  const rawUrl = url.searchParams.get("url");
  let key = null;
  if (sha2562) key = `idx:sha256:${sha2562.toLowerCase()}`;
  else if (vineId) key = `idx:vine:${vineId}`;
  else if (rawUrl) key = `idx:url:${await digestUrl2(rawUrl)}`;
  else return json(400, { error: "bad_request", reason: "missing_query" });
  const v = await env.MEDIA_KV.get(key);
  if (!v) return json(404, { error: "not_found" });
  try {
    const obj = JSON.parse(v);
    if (obj && obj.uid) {
      const videoData = await env.MEDIA_KV.get(`video:${obj.uid}`);
      if (videoData) {
        const data = JSON.parse(videoData);
        const urls2 = getStreamUrls(obj.uid, env);
        return json(200, {
          uid: obj.uid,
          status: data.status,
          // Stream URLs
          hlsUrl: data.hlsUrl || urls2.hlsUrl,
          dashUrl: data.dashUrl || urls2.dashUrl,
          mp4Url: data.mp4Url || urls2.mp4Url,
          thumbnailUrl: data.thumbnailUrl || urls2.thumbnailUrl,
          // Original path information
          r2Key: data.r2Key,
          migratedFrom: data.migratedFrom,
          originalUrl: data.originalUrl,
          vineId: data.vineId,
          sha256: data.sha256,
          readyToStream: data.status === "ready"
        });
      }
      return json(200, { uid: obj.uid });
    }
  } catch {
  }
  return json(404, { error: "not_found" });
}
__name(lookupUid, "lookupUid");
async function digestUrl2(input) {
  try {
    const u = new URL(input);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.protocol === "http:" && u.port === "80" || u.protocol === "https:" && u.port === "443") {
      u.port = "";
    }
    const params = Array.from(u.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    const usp = new URLSearchParams(params);
    u.search = usp.toString() ? `?${usp.toString()}` : "";
    const enc = new TextEncoder();
    const buf = enc.encode(u.toString());
    const hash = await crypto.subtle.digest("SHA-256", buf);
    const arr = Array.from(new Uint8Array(hash));
    return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return input;
  }
}
__name(digestUrl2, "digestUrl");

// src/handlers/aliases.mjs
init_checked_fetch();
init_modules_watch_stub();
init_router();
async function addAliases(req, env, deps) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return json(401, { error: "unauthorized", reason: "missing_nip98" });
  const verified = await deps.verifyNip98(req);
  if (!verified) return json(403, { error: "forbidden", reason: "invalid_nip98" });
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const uid = segments.slice(-2, -1)[0];
  if (!uid) return json(400, { error: "bad_request", reason: "missing_uid" });
  const existing = await env.MEDIA_KV.get(`video:${uid}`);
  if (!existing) return json(404, { error: "not_found" });
  const video = JSON.parse(existing);
  if (video.owner && video.owner !== verified.pubkey) {
    return json(403, { error: "forbidden", reason: "not_owner" });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request", reason: "invalid_json" });
  }
  const updates = {};
  const conflicts = [];
  if (body.sha256) {
    const hex = String(body.sha256).toLowerCase();
    const key = `idx:sha256:${hex}`;
    const existingIdx = await env.MEDIA_KV.get(key);
    if (existingIdx) {
      try {
        const obj = JSON.parse(existingIdx);
        if (obj.uid && obj.uid !== uid) conflicts.push("sha256");
      } catch {
        conflicts.push("sha256");
      }
    }
    updates.sha256 = hex;
  }
  if (body.vineId) {
    const key = `idx:vine:${body.vineId}`;
    const existingIdx = await env.MEDIA_KV.get(key);
    if (existingIdx) {
      try {
        const obj = JSON.parse(existingIdx);
        if (obj.uid && obj.uid !== uid) conflicts.push("vineId");
      } catch {
        conflicts.push("vineId");
      }
    }
    updates.vineId = body.vineId;
  }
  if (body.url) {
    const digest = await digestUrl3(body.url);
    const key = `idx:url:${digest}`;
    const existingIdx = await env.MEDIA_KV.get(key);
    if (existingIdx) {
      try {
        const obj = JSON.parse(existingIdx);
        if (obj.uid && obj.uid !== uid) conflicts.push("url");
      } catch {
        conflicts.push("url");
      }
    }
    updates.originalUrl = String(body.url);
    updates._urlDigest = digest;
  }
  if (!Object.keys(updates).length) return json(400, { error: "bad_request", reason: "no_aliases" });
  if (conflicts.length) return json(409, { error: "conflict", fields: conflicts });
  if (updates.sha256) await env.MEDIA_KV.put(`idx:sha256:${updates.sha256}`, JSON.stringify({ uid }));
  if (updates.vineId) await env.MEDIA_KV.put(`idx:vine:${updates.vineId}`, JSON.stringify({ uid }));
  if (updates._urlDigest) await env.MEDIA_KV.put(`idx:url:${updates._urlDigest}`, JSON.stringify({ uid, url: updates.originalUrl }));
  const merged = { ...video, ..."sha256" in updates ? { sha256: updates.sha256 } : {}, ..."vineId" in updates ? { vineId: updates.vineId } : {}, ..."originalUrl" in updates ? { originalUrl: updates.originalUrl } : {}, updatedAt: deps.now?.() ?? Date.now() };
  await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify(merged));
  return json(200, { ok: true });
}
__name(addAliases, "addAliases");
async function digestUrl3(input) {
  try {
    const u = new URL(input);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.protocol === "http:" && u.port === "80" || u.protocol === "https:" && u.port === "443") {
      u.port = "";
    }
    const params = Array.from(u.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    const usp = new URLSearchParams(params);
    u.search = usp.toString() ? `?${usp.toString()}` : "";
    const enc = new TextEncoder();
    const buf = enc.encode(u.toString());
    const hash = await crypto.subtle.digest("SHA-256", buf);
    const arr = Array.from(new Uint8Array(hash));
    return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return input;
  }
}
__name(digestUrl3, "digestUrl");

// src/auth/nip98.mjs
init_checked_fetch();
init_modules_watch_stub();
async function verifyNip98Request(req) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!auth.startsWith("Nostr ")) return null;
  const b64 = auth.slice(6).trim();
  let ev;
  try {
    const json2 = base64ToString(b64);
    ev = JSON.parse(json2);
  } catch {
    return null;
  }
  if (!ev || typeof ev !== "object") return null;
  if (ev.kind !== 27235 || !ev.pubkey || !ev.sig || !ev.created_at || !Array.isArray(ev.tags)) return null;
  const url = new URL(req.url);
  const method = req.method.toUpperCase();
  const tag = /* @__PURE__ */ __name((k) => {
    for (const t of ev.tags) if (Array.isArray(t) && t[0] === k) return t[1];
    return void 0;
  }, "tag");
  if (tag("u") !== url.toString()) return null;
  if ((tag("method") || "").toUpperCase() !== method) return null;
  const payloadTag = tag("payload");
  if (payloadTag) {
    const raw = await req.clone().arrayBuffer();
    const hash = await sha256Hex(new Uint8Array(raw));
    if (hash !== payloadTag) return null;
  }
  const id = await eventId(ev);
  if (ev.id && ev.id !== id) return null;
  try {
    const { schnorr: schnorr2 } = await Promise.resolve().then(() => (init_secp256k1(), secp256k1_exports));
    const ok = await schnorr2.verify(ev.sig, id, ev.pubkey);
    if (!ok) return null;
  } catch {
    return null;
  }
  return { pubkey: ev.pubkey };
}
__name(verifyNip98Request, "verifyNip98Request");
async function eventId(ev) {
  const payload = [0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content ?? ""];
  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(payload));
  return await sha256Hex(data);
}
__name(eventId, "eventId");
async function sha256Hex(input) {
  const buf = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
function base64ToString(b64) {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, "base64").toString("utf8");
}
__name(base64ToString, "base64ToString");

// src/handlers/users.mjs
init_checked_fetch();
init_modules_watch_stub();
init_router();
async function listUserVideos(req, env, _deps) {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const pubkey = parts[3];
  if (!pubkey) return json(400, { error: "bad_request", reason: "missing_pubkey" });
  const kv = env.MEDIA_KV;
  if (!kv || typeof kv.list !== "function") {
    return json(501, { error: "not_implemented", reason: "kv_list_unsupported" });
  }
  const prefix = `idx:pubkey:${pubkey}:`;
  const out = [];
  let cursor = void 0;
  while (true) {
    const res = await kv.list({ prefix, cursor });
    for (const k of res.keys || []) {
      const name = k.name || "";
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
__name(listUserVideos, "listUserVideos");

// src/handlers/migrate.mjs
init_checked_fetch();
init_modules_watch_stub();
init_router();
init_stream_urls();

// src/utils/auto_enable_downloads.mjs
init_checked_fetch();
init_modules_watch_stub();
async function enableDownloadsWithRetry(uid, env, deps = {}, options = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const {
    maxRetries = 3,
    initialDelay = 5e3,
    retryDelay = 1e4,
    logPrefix = "\u{1F525}"
  } = options;
  const accountId = env.STREAM_ACCOUNT_ID;
  const apiToken = env.STREAM_API_TOKEN;
  if (!accountId || !apiToken) {
    console.log(`${logPrefix} \u274C DOWNLOADS ENABLE SKIPPED - Missing Stream credentials for UID:`, uid);
    return { success: false, error: "missing_credentials" };
  }
  const downloadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`;
  console.log(`${logPrefix} \u23F3 DOWNLOADS ENABLE: Waiting ${initialDelay}ms for video processing:`, uid);
  await new Promise((resolve) => setTimeout(resolve, initialDelay));
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`${logPrefix} \u{1F504} DOWNLOADS ENABLE ATTEMPT ${attempt}/${maxRetries} for UID:`, uid);
      const downloadRes = await fetchFn(downloadUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json"
        }
      });
      if (downloadRes.ok) {
        console.log(`${logPrefix} \u2705 DOWNLOADS ENABLED SUCCESSFULLY (attempt ${attempt}) for UID:`, uid);
        return { success: true, attempt };
      }
      const errorText = await downloadRes.text();
      console.log(
        `${logPrefix} \u274C DOWNLOADS ENABLE FAILED (attempt ${attempt}/${maxRetries}) for UID:`,
        uid,
        `status: ${downloadRes.status}, response:`,
        errorText
      );
      if (attempt === maxRetries) {
        return {
          success: false,
          error: `Final attempt failed: ${downloadRes.status}`,
          attempts: maxRetries,
          lastResponse: errorText
        };
      }
      console.log(`${logPrefix} \u23F3 DOWNLOADS ENABLE: Waiting ${retryDelay}ms before retry for UID:`, uid);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    } catch (error) {
      console.log(
        `${logPrefix} \u274C DOWNLOADS ENABLE EXCEPTION (attempt ${attempt}/${maxRetries}) for UID:`,
        uid,
        `error:`,
        error.message
      );
      if (attempt === maxRetries) {
        return {
          success: false,
          error: `Final attempt exception: ${error.message}`,
          attempts: maxRetries
        };
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
  return { success: false, error: "unexpected_failure" };
}
__name(enableDownloadsWithRetry, "enableDownloadsWithRetry");
function enableDownloadsAsync(uid, env, deps, options = {}) {
  enableDownloadsWithRetry(uid, env, deps, options).then((result) => {
    if (!result.success) {
      console.log(
        `${options.logPrefix || "\u{1F525}"} \u274C ASYNC DOWNLOADS ENABLE FINAL FAILURE for UID:`,
        uid,
        `error:`,
        result.error
      );
    }
  }).catch((error) => {
    console.log(
      `${options.logPrefix || "\u{1F525}"} \u274C ASYNC DOWNLOADS ENABLE UNCAUGHT ERROR for UID:`,
      uid,
      `error:`,
      error.message
    );
  });
}
__name(enableDownloadsAsync, "enableDownloadsAsync");

// src/utils/dual_storage.mjs
init_checked_fetch();
init_modules_watch_stub();
async function dualStoreVideo(videoBlob, sha2562, env, metadata = {}, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const now = deps.now || (() => Date.now());
  console.log(`\u{1F504} DUAL STORE: Starting dual storage for SHA-256: ${sha2562}`);
  const results = {
    uid: null,
    streamSuccess: false,
    r2Success: false,
    urls: {},
    errors: {}
  };
  try {
    console.log(`\u{1F504} DUAL STORE: Uploading to Stream for ${sha2562}...`);
    const streamResult = await uploadToStream(videoBlob, sha2562, env, metadata, fetchFn);
    results.uid = streamResult.uid;
    results.streamSuccess = streamResult.success;
    if (!streamResult.success) {
      results.errors.stream = streamResult.error;
      console.error(`\u274C DUAL STORE: Stream upload failed for ${sha2562}:`, streamResult.error);
    } else {
      console.log(`\u2705 DUAL STORE: Stream upload successful for ${sha2562}, UID: ${streamResult.uid}`);
    }
  } catch (error) {
    console.error(`\u274C DUAL STORE: Stream upload exception for ${sha2562}:`, error);
    results.errors.stream = error.message;
  }
  if (results.uid && env.R2_VIDEOS) {
    try {
      console.log(`\u{1F504} DUAL STORE: Uploading to R2 for ${sha2562}...`);
      const r2Result = await uploadToR2(videoBlob, sha2562, env);
      results.r2Success = r2Result.success;
      if (!r2Result.success) {
        results.errors.r2 = r2Result.error;
        console.error(`\u274C DUAL STORE: R2 upload failed for ${sha2562}:`, r2Result.error);
      } else {
        console.log(`\u2705 DUAL STORE: R2 upload successful for ${sha2562}`);
      }
    } catch (error) {
      console.error(`\u274C DUAL STORE: R2 upload exception for ${sha2562}:`, error);
      results.errors.r2 = error.message;
    }
  } else if (!env.R2_VIDEOS) {
    console.log(`\u26A0\uFE0F DUAL STORE: No R2 binding available, skipping R2 storage for ${sha2562}`);
  } else if (!results.uid) {
    console.log(`\u26A0\uFE0F DUAL STORE: No Stream UID available, skipping R2 storage for ${sha2562}`);
  }
  if (results.uid) {
    results.urls = await generateHybridUrls(results.uid, sha2562, env, results.r2Success);
  }
  if (results.uid && env.MEDIA_KV) {
    try {
      await storeVideoMetadata(results.uid, sha2562, env, metadata, now(), results);
    } catch (error) {
      console.error(`\u274C DUAL STORE: KV storage failed for ${sha2562}:`, error);
      results.errors.kv = error.message;
    }
  }
  const successCount = [results.streamSuccess, results.r2Success].filter(Boolean).length;
  console.log(`\u{1F504} DUAL STORE: Completed for ${sha2562} - ${successCount}/2 stores successful`);
  return results;
}
__name(dualStoreVideo, "dualStoreVideo");
async function uploadToStream(videoBlob, sha2562, env, metadata, fetchFn) {
  const accountId = env.STREAM_ACCOUNT_ID;
  const apiToken = env.STREAM_API_TOKEN;
  console.log(`\u{1F504} DUAL STORE: Stream credentials check - Account ID: ${accountId ? "present" : "MISSING"}, API Token: ${apiToken ? "present" : "MISSING"}`);
  if (!accountId || !apiToken) {
    return { success: false, error: "Missing Stream credentials" };
  }
  const streamUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`;
  const requestBody = {
    maxDurationSeconds: 21600,
    // 6 hours max
    requireSignedURLs: false,
    allowedOrigins: ["*"],
    meta: {
      name: metadata.vineId || metadata.sha256 || "migrated_video"
    }
  };
  console.log(`\u{1F504} DUAL STORE: Stream API request to ${streamUrl}`);
  console.log(`\u{1F504} DUAL STORE: Request body: ${JSON.stringify(requestBody, null, 2)}`);
  const createRes = await fetchFn(streamUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });
  if (!createRes.ok) {
    const errorText = await createRes.text();
    return { success: false, error: `Stream API error: ${createRes.status} - ${errorText}` };
  }
  const createData = await createRes.json();
  const uploadURL = createData?.result?.uploadURL;
  const uid = createData?.result?.uid;
  if (!uploadURL || !uid) {
    return { success: false, error: "Missing upload URL or UID from Stream" };
  }
  const formData = new FormData();
  const videoFile = new File([videoBlob], "video.mp4", { type: "video/mp4" });
  formData.append("file", videoFile);
  const uploadRes = await fetchFn(uploadURL, {
    method: "POST",
    // Changed from PUT to POST like working system
    body: formData
    // Changed from raw blob to FormData
  });
  if (!uploadRes.ok) {
    return {
      success: false,
      error: `Stream upload failed: ${uploadRes.status}`,
      uid
    };
  }
  console.log(`\u2705 DUAL STORE: Stream upload successful for UID: ${uid}`);
  return { success: true, uid };
}
__name(uploadToStream, "uploadToStream");
async function uploadToR2(videoBlob, sha2562, env) {
  const r2Key = `videos/${sha2562}.mp4`;
  try {
    await env.R2_VIDEOS.put(r2Key, videoBlob, {
      httpMetadata: {
        contentType: "video/mp4",
        cacheControl: "public, max-age=31536000"
        // 1 year cache
      },
      customMetadata: {
        sha256: sha2562,
        uploadedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
    console.log(`\u2705 DUAL STORE: R2 upload successful for key: ${r2Key}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
__name(uploadToR2, "uploadToR2");
async function generateHybridUrls(uid, sha2562, env, r2Available) {
  const { getHybridUrls: getHybridUrls2 } = await Promise.resolve().then(() => (init_stream_urls(), stream_urls_exports));
  return getHybridUrls2(uid, sha2562, env, r2Available);
}
__name(generateHybridUrls, "generateHybridUrls");
async function storeVideoMetadata(uid, sha2562, env, metadata, timestamp, results) {
  const record = {
    status: "uploading",
    // Will be updated to 'ready' by webhook
    owner: metadata.owner || "system",
    createdAt: timestamp,
    uploadedVia: "dual_storage",
    sha256: sha2562,
    size: metadata.size || null,
    streamSuccess: results.streamSuccess,
    r2Success: results.r2Success,
    ...metadata
  };
  await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify(record));
  await env.MEDIA_KV.put(`idx:sha256:${sha2562}`, JSON.stringify({ uid }));
  if (record.owner && record.owner !== "system") {
    await env.MEDIA_KV.put(`idx:pubkey:${record.owner}:${uid}`, "1");
  }
  console.log(`\u2705 DUAL STORE: KV metadata stored for UID: ${uid}, SHA-256: ${sha2562}`);
}
__name(storeVideoMetadata, "storeVideoMetadata");
async function fetchAndHash(sourceUrl, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  console.log(`\u{1F504} DUAL STORE: Fetching video from: ${sourceUrl}`);
  const response = await fetchFn(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
  }
  const blob = await response.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", blob);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sha2562 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  console.log(`\u2705 DUAL STORE: Video fetched and hashed - Size: ${blob.byteLength}, SHA-256: ${sha2562}`);
  return {
    blob,
    sha256: sha2562,
    size: blob.byteLength
  };
}
__name(fetchAndHash, "fetchAndHash");

// src/handlers/migrate.mjs
async function migrateVideo(req, env, deps) {
  const verified = { pubkey: "migration_recovery" };
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request", reason: "invalid_json" });
  }
  const sourceUrl = body.sourceUrl || body.r2Url || body.url;
  if (!sourceUrl) {
    return json(400, { error: "bad_request", reason: "missing_source_url" });
  }
  const metadata = {
    sha256: body.sha256,
    vineId: body.vineId,
    originalUrl: body.originalUrl || sourceUrl,
    originalR2Path: body.r2Path,
    migrationBatch: body.batch,
    migrationTimestamp: deps.now(),
    originalOwner: body.originalOwner || verified.pubkey
  };
  if (metadata.sha256) {
    const existing = await env.MEDIA_KV.get(`idx:sha256:${metadata.sha256}`);
    if (existing) {
      const data = JSON.parse(existing);
      const urls2 = getStreamUrls(data.uid, env);
      return json(200, {
        uid: data.uid,
        status: "already_migrated",
        message: "Video already exists in hybrid storage",
        ...urls2
      });
    }
  }
  if (metadata.vineId) {
    const existing = await env.MEDIA_KV.get(`idx:vine:${metadata.vineId}`);
    if (existing) {
      const data = JSON.parse(existing);
      const urls2 = getStreamUrls(data.uid, env);
      return json(200, {
        uid: data.uid,
        status: "already_migrated",
        message: "Video already exists in hybrid storage",
        ...urls2
      });
    }
  }
  console.log(`\u{1F504} MIGRATE: Starting hybrid migration from: ${sourceUrl}`);
  try {
    let videoData;
    if (metadata.sha256) {
      console.log(`\u{1F504} MIGRATE: Fetching video (SHA-256 provided: ${metadata.sha256})`);
      const response = await deps.fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
      }
      videoData = {
        blob: await response.arrayBuffer(),
        sha256: metadata.sha256,
        size: parseInt(response.headers.get("content-length") || "0")
      };
    } else {
      videoData = await fetchAndHash(sourceUrl, deps);
      metadata.sha256 = videoData.sha256;
    }
    if (!body.forceUpload) {
      const existing = await env.MEDIA_KV.get(`idx:sha256:${videoData.sha256}`);
      if (existing) {
        const data = JSON.parse(existing);
        const urls2 = getStreamUrls(data.uid, env);
        return json(200, {
          uid: data.uid,
          status: "already_migrated",
          message: "Video already exists (detected via SHA-256)",
          sha256: videoData.sha256,
          ...urls2
        });
      }
    }
    const dualStoreMetadata = {
      name: metadata.vineId || metadata.sha256 || "migration_video",
      owner: verified.pubkey,
      vineId: metadata.vineId,
      originalUrl: metadata.originalUrl,
      originalR2Path: metadata.originalR2Path,
      migrationBatch: metadata.migrationBatch,
      migrationTimestamp: deps.now(),
      migratedFrom: sourceUrl,
      size: videoData.size
    };
    const storeResult = await dualStoreVideo(
      videoData.blob,
      videoData.sha256,
      env,
      dualStoreMetadata,
      deps
    );
    if (!storeResult.uid) {
      return json(502, {
        error: "migration_failed",
        message: "Failed to store video in hybrid storage",
        errors: storeResult.errors
      });
    }
    if (metadata.vineId) {
      await env.MEDIA_KV.put(`idx:vine:${metadata.vineId}`, JSON.stringify({ uid: storeResult.uid }));
    }
    if (metadata.originalUrl) {
      const urlDigest = await digestUrl4(metadata.originalUrl);
      await env.MEDIA_KV.put(`idx:url:${urlDigest}`, JSON.stringify({
        uid: storeResult.uid,
        url: metadata.originalUrl
      }));
    }
    await env.MEDIA_KV.put(`migration:${storeResult.uid}`, JSON.stringify({
      sourceUrl,
      timestamp: deps.now(),
      batch: body.batch,
      hybridStorage: true
    }));
    if (storeResult.streamSuccess) {
      enableDownloadsAsync(storeResult.uid, env, deps, {
        logPrefix: "\u{1F514} MIGRATE",
        initialDelay: 1e4,
        // Give Stream time to process
        maxRetries: 3
      });
    }
    console.log(`\u2705 MIGRATE: Hybrid migration completed for ${videoData.sha256} -> UID: ${storeResult.uid}`);
    console.log(`\u{1F4CA} MIGRATE: Storage results - Stream: ${storeResult.streamSuccess}, R2: ${storeResult.r2Success}`);
    return json(200, {
      uid: storeResult.uid,
      sha256: videoData.sha256,
      status: "hybrid_migration_completed",
      sourceUrl,
      storageResults: {
        stream: storeResult.streamSuccess,
        r2: storeResult.r2Success
      },
      ...storeResult.urls,
      metadata: {
        sha256: videoData.sha256,
        vineId: metadata.vineId,
        size: videoData.size
      }
    });
  } catch (error) {
    console.error(`\u274C MIGRATE: Hybrid migration failed for ${sourceUrl}:`, error);
    return json(500, {
      error: "migration_failed",
      message: error.message,
      sourceUrl
    });
  }
}
__name(migrateVideo, "migrateVideo");
async function digestUrl4(url) {
  const canonical = new URL(url).toString();
  const bytes = new TextEncoder().encode(canonical);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(digestUrl4, "digestUrl");

// src/handlers/migrate_batch.mjs
init_checked_fetch();
init_modules_watch_stub();
init_router();
async function migrateBatch(req, env, deps) {
  const verified = { pubkey: "batch_migration_recovery" };
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request", reason: "invalid_json" });
  }
  const videos = body.videos || [];
  if (!Array.isArray(videos) || videos.length === 0) {
    return json(400, { error: "bad_request", reason: "missing_videos_array" });
  }
  const batchLimit = Math.min(videos.length, 50);
  const videosToProcess = videos.slice(0, batchLimit);
  console.log(`\u{1F4E6} BATCH MIGRATE: Processing ${videosToProcess.length} videos with hybrid storage`);
  const results = [];
  for (const video of videosToProcess) {
    const sourceUrl = video.sourceUrl || video.r2Url || video.url;
    if (!sourceUrl) {
      results.push({
        sourceUrl: video.sourceUrl || "unknown",
        status: "error",
        error: "Missing source URL"
      });
      continue;
    }
    try {
      let videoData;
      const metadata = {
        sha256: video.sha256,
        vineId: video.vineId,
        originalUrl: video.originalUrl || sourceUrl,
        originalR2Path: video.originalR2Path,
        migrationBatch: body.batchId || `batch_${Date.now()}`,
        migrationTimestamp: deps.now(),
        originalOwner: video.originalOwner || "batch_migration"
      };
      if (video.sha256) {
        const existing = await env.MEDIA_KV.get(`idx:sha256:${video.sha256}`);
        if (existing) {
          const data = JSON.parse(existing);
          results.push({
            sourceUrl,
            uid: data.uid,
            sha256: video.sha256,
            status: "already_migrated",
            message: "Video already exists (detected via SHA-256)"
          });
          continue;
        }
      }
      videoData = await fetchAndHash(sourceUrl, deps);
      metadata.sha256 = videoData.sha256;
      const existingBySHA = await env.MEDIA_KV.get(`idx:sha256:${videoData.sha256}`);
      if (existingBySHA) {
        const data = JSON.parse(existingBySHA);
        results.push({
          sourceUrl,
          uid: data.uid,
          sha256: videoData.sha256,
          status: "already_migrated",
          message: "Video already exists (calculated SHA-256 match)"
        });
        continue;
      }
      const dualStoreMetadata = {
        name: metadata.vineId || metadata.sha256.substring(0, 8) || "batch_video",
        owner: verified.pubkey,
        vineId: metadata.vineId,
        originalUrl: metadata.originalUrl,
        originalR2Path: metadata.originalR2Path,
        migrationBatch: metadata.migrationBatch,
        migrationTimestamp: metadata.migrationTimestamp,
        originalOwner: metadata.originalOwner,
        size: videoData.size
      };
      const storeResult = await dualStoreVideo(
        videoData.blob,
        videoData.sha256,
        env,
        dualStoreMetadata,
        deps
      );
      if (!storeResult.uid) {
        results.push({
          sourceUrl,
          status: "error",
          error: "Failed to store in hybrid storage",
          errors: storeResult.errors
        });
        continue;
      }
      if (metadata.vineId) {
        await env.MEDIA_KV.put(`idx:vine:${metadata.vineId}`, JSON.stringify({ uid: storeResult.uid }));
      }
      if (storeResult.streamSuccess) {
        enableDownloadsAsync(storeResult.uid, env, deps, {
          logPrefix: "\u{1F4E6} BATCH",
          initialDelay: 15e3,
          // Longer delay for batch processing
          maxRetries: 3
        });
      }
      results.push({
        sourceUrl,
        uid: storeResult.uid,
        sha256: videoData.sha256,
        status: "hybrid_migration_completed",
        storageResults: {
          stream: storeResult.streamSuccess,
          r2: storeResult.r2Success
        },
        ...storeResult.urls,
        metadata: {
          sha256: videoData.sha256,
          vineId: metadata.vineId,
          size: videoData.size
        }
      });
      console.log(`\u2705 BATCH: Hybrid migration completed for ${videoData.sha256} -> UID: ${storeResult.uid}`);
    } catch (error) {
      console.error(`\u274C BATCH: Migration failed for ${sourceUrl}:`, error);
      results.push({
        sourceUrl,
        status: "error",
        error: error.message
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const successful = results.filter(
    (r) => r.status === "hybrid_migration_completed" || r.status === "already_migrated"
  ).length;
  console.log(`\u{1F4E6} BATCH MIGRATE: Completed ${successful}/${results.length} hybrid migrations`);
  return json(200, {
    processed: results.length,
    successful,
    failed: results.length - successful,
    batchId: body.batchId || `batch_${Date.now()}`,
    results
  });
}
__name(migrateBatch, "migrateBatch");

// src/handlers/migrate_openvine.mjs
init_checked_fetch();
init_modules_watch_stub();
init_stream_urls();
async function handleOpenVineMigration(request, env) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({
        error: "Missing or invalid Authorization header"
      }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    const token = authHeader.substring(7);
    const MIGRATION_TOKEN = env.MIGRATION_TOKEN || "823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c";
    if (token !== MIGRATION_TOKEN) {
      return new Response(JSON.stringify({
        error: "Invalid migration token"
      }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }
    const body = await request.json();
    const { videoId, vineId, sourceUrl, nip98Auth, useApiEndpoint } = body;
    let videoUrl;
    if (sourceUrl) {
      videoUrl = sourceUrl;
    } else if (videoId) {
      videoUrl = `https://api.openvine.co/media/${videoId}`;
    } else {
      return new Response(JSON.stringify({
        error: "Missing videoId or sourceUrl"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    console.log(`\u{1F33F} OPENVINE: Starting hybrid migration from: ${videoUrl}`);
    try {
      const existingByVineId = vineId ? await env.MEDIA_KV.get(`idx:vine:${vineId}`) : null;
      if (existingByVineId) {
        const data = JSON.parse(existingByVineId);
        const urls2 = getStreamUrls(data.uid, env);
        return new Response(JSON.stringify({
          status: "already_migrated",
          uid: data.uid,
          videoId,
          vineId,
          message: "OpenVine video already migrated to hybrid storage",
          ...urls2
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      const videoData = await fetchAndHash(videoUrl, { fetch });
      const existingBySHA = await env.MEDIA_KV.get(`idx:sha256:${videoData.sha256}`);
      if (existingBySHA) {
        const data = JSON.parse(existingBySHA);
        if (vineId) {
          await env.MEDIA_KV.put(`idx:vine:${vineId}`, JSON.stringify({ uid: data.uid }));
        }
        const urls2 = getStreamUrls(data.uid, env);
        return new Response(JSON.stringify({
          status: "already_migrated",
          uid: data.uid,
          sha256: videoData.sha256,
          videoId,
          vineId,
          message: "OpenVine video already exists (detected via SHA-256)",
          ...urls2
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      const dualStoreMetadata = {
        name: vineId || videoId || `openvine-${videoData.sha256.substring(0, 8)}`,
        owner: "openvine_migration",
        vineId: vineId || videoId,
        videoId,
        source: "openvine_migration",
        originalUrl: videoUrl,
        migratedFrom: videoUrl,
        size: videoData.size
      };
      const deps = { fetch, now: /* @__PURE__ */ __name(() => Date.now(), "now") };
      const storeResult = await dualStoreVideo(
        videoData.blob,
        videoData.sha256,
        env,
        dualStoreMetadata,
        deps
      );
      if (!storeResult.uid) {
        return new Response(JSON.stringify({
          error: "Failed to store OpenVine video in hybrid storage",
          errors: storeResult.errors,
          videoUrl
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (vineId) {
        await env.MEDIA_KV.put(`idx:vine:${vineId}`, JSON.stringify({ uid: storeResult.uid }));
      }
      await env.MEDIA_KV.put(`migration:openvine:${storeResult.uid}`, JSON.stringify({
        videoId,
        vineId: vineId || videoId,
        sourceUrl: videoUrl,
        sha256: videoData.sha256,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        hybridStorage: true,
        lookupKey: true
      }));
      if (storeResult.streamSuccess) {
        enableDownloadsAsync(storeResult.uid, env, deps, {
          logPrefix: "\u{1F33F} OPENVINE",
          initialDelay: 15e3,
          // OpenVine needs longer processing time
          maxRetries: 5
          // More retries for complex migrations
        });
      }
      console.log(`\u2705 OPENVINE: Hybrid migration completed for ${videoData.sha256} -> UID: ${storeResult.uid}`);
      console.log(`\u{1F4CA} OPENVINE: Storage results - Stream: ${storeResult.streamSuccess}, R2: ${storeResult.r2Success}`);
      return new Response(JSON.stringify({
        status: "hybrid_migration_completed",
        uid: storeResult.uid,
        sha256: videoData.sha256,
        videoId,
        vineId,
        sourceUrl: videoUrl,
        storageResults: {
          stream: storeResult.streamSuccess,
          r2: storeResult.r2Success
        },
        ...storeResult.urls,
        message: "Successfully migrated from OpenVine to hybrid storage"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      console.error("\u{1F33F} OPENVINE: Hybrid migration error:", error);
      return new Response(JSON.stringify({
        error: "OpenVine migration failed",
        message: error.message,
        videoUrl
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (error) {
    console.error("OpenVine migration error:", error);
    return new Response(JSON.stringify({
      error: "Migration failed",
      message: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(handleOpenVineMigration, "handleOpenVineMigration");
async function handleOpenVineBatchMigration(request, env) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({
        error: "Missing or invalid Authorization header"
      }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    const token = authHeader.substring(7);
    const MIGRATION_TOKEN = env.MIGRATION_TOKEN || "823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c";
    if (token !== MIGRATION_TOKEN) {
      return new Response(JSON.stringify({
        error: "Invalid migration token"
      }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }
    const body = await request.json();
    const { videoIds, limit = 10 } = body;
    if (!videoIds || !Array.isArray(videoIds)) {
      return new Response(JSON.stringify({
        error: "Missing or invalid videoIds array"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const videosToProcess = videoIds.slice(0, Math.min(limit, 50));
    const results = [];
    for (const videoId of videosToProcess) {
      try {
        if (env.MEDIA_KV) {
          const existing = await env.MEDIA_KV.get(`idx:vine:openvine_${videoId}`);
          if (existing) {
            const data = JSON.parse(existing);
            results.push({
              videoId,
              status: "already_migrated",
              uid: data.uid,
              message: "Video was previously migrated"
            });
            continue;
          }
        }
        const migrationRequest = new Request(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify({
            videoId,
            vineId: `openvine_${videoId}`
          })
        });
        const migrationResponse = await handleOpenVineMigration(migrationRequest, env);
        const migrationData = await migrationResponse.json();
        results.push({
          videoId,
          ...migrationData
        });
      } catch (error) {
        results.push({
          videoId,
          status: "error",
          error: error.message
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 1e3));
    }
    return new Response(JSON.stringify({
      processed: results.length,
      total: videoIds.length,
      results
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Batch migration error:", error);
    return new Response(JSON.stringify({
      error: "Batch migration failed",
      message: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(handleOpenVineBatchMigration, "handleOpenVineBatchMigration");

// src/handlers/enable_downloads.mjs
init_checked_fetch();
init_modules_watch_stub();
async function enableDownloads(request, env) {
  try {
    const url = new URL(request.url);
    const uid = url.pathname.split("/").pop();
    if (!uid || uid.length !== 32) {
      return new Response(JSON.stringify({
        error: "invalid_uid",
        message: "Please provide a valid 32-character Stream UID"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const result = await enableDownloadsWithRetry(uid, env, { fetch: fetch.bind(globalThis) }, {
      logPrefix: "\u{1F527} MANUAL",
      initialDelay: 2e3,
      // Shorter delay for manual requests
      maxRetries: 2
      // Fewer retries for individual requests
    });
    if (result.success) {
      return new Response(JSON.stringify({
        success: true,
        uid,
        attempts: result.attempt,
        mp4Url: `https://${env.STREAM_DOMAIN || "customer-4c3uhd5qzuhwz9hu.cloudflarestream.com"}/${uid}/downloads/default.mp4`,
        message: `Downloads enabled successfully (attempt ${result.attempt})`
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } else {
      return new Response(JSON.stringify({
        error: "enable_failed",
        uid,
        attempts: result.attempts,
        message: result.error,
        lastResponse: result.lastResponse
      }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (error) {
    console.error("Enable downloads error:", error);
    return new Response(JSON.stringify({
      error: "server_error",
      message: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(enableDownloads, "enableDownloads");
async function enableDownloadsBatch(request, env) {
  try {
    const { uids } = await request.json();
    if (!Array.isArray(uids) || uids.length === 0) {
      return new Response(JSON.stringify({
        error: "invalid_request",
        message: "Please provide an array of UIDs"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    console.log(`\u{1F527} BATCH: Starting batch enable for ${uids.length} UIDs`);
    const results = [];
    const errors = [];
    const deps = { fetch: fetch.bind(globalThis) };
    for (const [index, uid] of uids.entries()) {
      console.log(`\u{1F527} BATCH: Processing ${index + 1}/${uids.length} - UID: ${uid}`);
      try {
        const result = await enableDownloadsWithRetry(uid, env, deps, {
          logPrefix: `\u{1F527} BATCH[${index + 1}/${uids.length}]`,
          initialDelay: 3e3,
          // Reasonable delay for batch processing
          maxRetries: 3,
          // Standard retries for batch
          retryDelay: 5e3
          // 5s between retries
        });
        if (result.success) {
          results.push({
            uid,
            success: true,
            attempts: result.attempt,
            mp4Url: `https://${env.STREAM_DOMAIN || "customer-4c3uhd5qzuhwz9hu.cloudflarestream.com"}/${uid}/downloads/default.mp4`
          });
        } else {
          errors.push({
            uid,
            error: result.error,
            attempts: result.attempts,
            lastResponse: result.lastResponse
          });
        }
      } catch (error) {
        errors.push({
          uid,
          error: error.message
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    console.log(`\u{1F527} BATCH: Completed - ${results.length} enabled, ${errors.length} failed`);
    return new Response(JSON.stringify({
      success: true,
      enabled: results.length,
      failed: errors.length,
      results,
      errors
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Batch enable downloads error:", error);
    return new Response(JSON.stringify({
      error: "server_error",
      message: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(enableDownloadsBatch, "enableDownloadsBatch");

// src/handlers/home.mjs
init_checked_fetch();
init_modules_watch_stub();
function homePage(req, env, deps) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Divine Video Streaming Service</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      padding: 48px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      max-width: 600px;
      text-align: center;
    }
    h1 {
      color: #333;
      margin: 0 0 16px 0;
      font-size: 2.5em;
      font-weight: 700;
    }
    .subtitle {
      color: #666;
      font-size: 1.2em;
      margin-bottom: 32px;
      line-height: 1.6;
    }
    .stats {
      display: flex;
      justify-content: space-around;
      margin: 40px 0;
      padding: 24px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .stat {
      text-align: center;
    }
    .stat-value {
      font-size: 2em;
      font-weight: bold;
      color: #667eea;
    }
    .stat-label {
      color: #888;
      font-size: 0.9em;
      margin-top: 4px;
    }
    .link {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      font-weight: 600;
      transition: transform 0.2s, box-shadow 0.2s;
      margin-top: 20px;
    }
    .link:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
    }
    .tech {
      margin-top: 40px;
      padding-top: 32px;
      border-top: 1px solid #e0e0e0;
      color: #888;
      font-size: 0.9em;
    }
    .tech-item {
      display: inline-block;
      background: #f5f5f5;
      padding: 6px 12px;
      border-radius: 4px;
      margin: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>\u{1F3AC} Divine Video</h1>
    <div class="subtitle">
      Video hosting and streaming service powered by Cloudflare Stream
    </div>
    
    <div class="stats">
      <div class="stat">
        <div class="stat-value">\u221E</div>
        <div class="stat-label">Scalability</div>
      </div>
      <div class="stat">
        <div class="stat-value">Global</div>
        <div class="stat-label">CDN Coverage</div>
      </div>
      <div class="stat">
        <div class="stat-value">HLS</div>
        <div class="stat-label">Streaming</div>
      </div>
    </div>
    
    <p style="color: #666; line-height: 1.8; margin: 32px 0;">
      This API service handles video uploads, transcoding, and delivery for the Divine Video platform. 
      Videos are processed automatically and served through Cloudflare's global network.
    </p>
    
    <a href="https://divine.video" class="link">Visit Divine Video \u2192</a>
    
    <div class="tech">
      <div style="margin-bottom: 12px; color: #666;">Powered by</div>
      <span class="tech-item">Cloudflare Stream</span>
      <span class="tech-item">Workers</span>
      <span class="tech-item">KV Storage</span>
      <span class="tech-item">R2 Storage</span>
    </div>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}
__name(homePage, "homePage");

// src/handlers/blossom.mjs
init_checked_fetch();
init_modules_watch_stub();
init_router();
init_stream_urls();
async function getBlobByHash(req, env, deps) {
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/^\/([a-f0-9]{64})(\.[a-z0-9]+)?$/);
  if (!pathMatch) {
    return json(400, { error: "invalid_hash" });
  }
  const sha2562 = pathMatch[1];
  const indexData = await env.MEDIA_KV.get(`idx:sha256:${sha2562}`);
  if (!indexData) {
    return new Response("Not Found", { status: 404 });
  }
  try {
    const { uid } = JSON.parse(indexData);
    const videoData = await env.MEDIA_KV.get(`video:${uid}`);
    if (!videoData) {
      return new Response("Not Found", { status: 404 });
    }
    const video = JSON.parse(videoData);
    if (video.status !== "ready") {
      return new Response("Not Ready", { status: 202 });
    }
    const { hlsUrl } = getStreamUrls(uid, env);
    return Response.redirect(hlsUrl, 302);
  } catch (error) {
    return new Response("Server Error", { status: 500 });
  }
}
__name(getBlobByHash, "getBlobByHash");
async function headBlobByHash(req, env, deps) {
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/^\/([a-f0-9]{64})(\.[a-z0-9]+)?$/);
  if (!pathMatch) {
    return new Response(null, { status: 400 });
  }
  const sha2562 = pathMatch[1];
  const indexData = await env.MEDIA_KV.get(`idx:sha256:${sha2562}`);
  if (!indexData) {
    return new Response(null, { status: 404 });
  }
  try {
    const { uid } = JSON.parse(indexData);
    const videoData = await env.MEDIA_KV.get(`video:${uid}`);
    if (!videoData) {
      return new Response(null, { status: 404 });
    }
    const video = JSON.parse(videoData);
    if (video.status !== "ready") {
      return new Response(null, { status: 202 });
    }
    return new Response(null, { status: 200 });
  } catch (error) {
    return new Response(null, { status: 500 });
  }
}
__name(headBlobByHash, "headBlobByHash");
async function blossomUpload(req, env, deps) {
  console.log("\u{1F338} Blossom upload started");
  const auth = await verifyBlossomAuth2(req, deps);
  if (!auth) {
    console.log("\u{1F338} Auth failed, but continuing for debug...");
  }
  if (auth) {
    console.log("\u{1F338} Auth succeeded, pubkey:", auth.pubkey);
  }
  const contentType = req.headers.get("content-type") || "";
  const isJsonRequest = contentType.includes("application/json");
  console.log("\u{1F338} Content-Type:", contentType);
  console.log("\u{1F338} Is JSON request:", isJsonRequest);
  if (isJsonRequest) {
    console.log("\u{1F338} Processing JSON request (Option 1)");
    const body = await req.text();
    let metadata = {};
    try {
      metadata = JSON.parse(body);
      console.log("\u{1F338} Parsed metadata:", metadata);
    } catch (error) {
      console.log("\u{1F338} JSON parse error:", error.message);
      return json(400, { error: "bad_request", reason: "invalid_json" });
    }
    if (metadata.sha256) {
      console.log("\u{1F338} Checking for existing blob with SHA-256:", metadata.sha256);
      const existingIndex = await env.MEDIA_KV.get(`idx:sha256:${metadata.sha256}`);
      if (existingIndex) {
        console.log("\u{1F338} Found existing blob, returning descriptor");
        const { uid } = JSON.parse(existingIndex);
        const videoData = await env.MEDIA_KV.get(`video:${uid}`);
        if (videoData) {
          const video = JSON.parse(videoData);
          if (video.status === "ready") {
            const urls2 = getStreamUrls(uid, env);
            return json(200, {
              sha256: metadata.sha256,
              size: video.size || metadata.size,
              type: metadata.type || "video/mp4",
              uploaded: Math.floor(video.createdAt / 1e3),
              url: urls2.mp4Url,
              hls: urls2.hlsUrl,
              thumbnail: urls2.thumbnailUrl
            });
          }
        }
      }
    }
    const videoReq = new Request(req.url.replace("/upload", "/v1/videos"), {
      method: "POST",
      headers: {
        "Authorization": `Nostr pubkey=${auth.pubkey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ...metadata,
        name: metadata.name || metadata.filename || `blossom-${metadata.sha256?.substring(0, 8) || "upload"}.mp4`
      })
    });
    const { createVideo: createVideo2 } = await Promise.resolve().then(() => (init_videos(), videos_exports));
    const result = await createVideo2(videoReq, env, deps);
    if (result.status === 200) {
      const data = await result.json();
      return json(200, {
        uploadURL: data.uploadURL,
        uid: data.uid,
        expiresAt: data.expiresAt
      });
    }
    return result;
  } else {
    console.log("\u{1F338} Processing binary upload (Option 2)");
    let blob;
    let fileSize;
    try {
      console.log("\u{1F338} Reading request as ArrayBuffer...");
      blob = await req.arrayBuffer();
      fileSize = blob.byteLength;
      console.log("\u{1F338} ArrayBuffer read successfully, size:", fileSize, "bytes");
    } catch (error) {
      console.log("\u{1F338} ArrayBuffer read error:", error.message);
      return json(400, { error: "bad_request", reason: "cannot_read_body" });
    }
    const hashBuffer = await crypto.subtle.digest("SHA-256", blob);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha2562 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    const detectedContentType = contentType || detectContentTypeFromBlob(blob);
    console.log("\u{1F338} Detected content type:", detectedContentType);
    const { isImageContentType: isImageContentType2 } = await Promise.resolve().then(() => (init_image_storage(), image_storage_exports));
    if (isImageContentType2(detectedContentType)) {
      console.log("\u{1F338} Processing as IMAGE upload");
      return await handleImageUpload(blob, sha2562, detectedContentType, auth, env, deps);
    }
    console.log("\u{1F338} Processing as VIDEO upload");
    const accountId = env.STREAM_ACCOUNT_ID;
    const apiToken = env.STREAM_API_TOKEN;
    if (!accountId || !apiToken) {
      return json(500, { error: "server_error", reason: "misconfigured_stream_env" });
    }
    const streamUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`;
    const createRes = await deps.fetch(streamUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        maxDurationSeconds: 21600,
        // 6 hours max
        requireSignedURLs: false,
        allowedOrigins: ["*"],
        webhookUrl: `${new URL(req.url).origin}/v1/stream/webhook`,
        meta: {
          name: `blossom-${sha2562.substring(0, 8)}.mp4`,
          sha256: sha2562,
          blobSize: fileSize,
          uploadedVia: "blossom_direct",
          owner: auth.pubkey
        }
      })
    });
    if (!createRes.ok) {
      return json(502, { error: "stream_error", status: createRes.status });
    }
    const createData = await createRes.json();
    const uploadURL = createData?.result?.uploadURL;
    const uid = createData?.result?.uid;
    if (!uploadURL || !uid) {
      return json(502, { error: "stream_error", reason: "missing_upload_url" });
    }
    console.log("\u{1F338} Uploading blob to Stream URL:", uploadURL);
    const uploadRes = await deps.fetch(uploadURL, {
      method: "PUT",
      body: blob,
      headers: {
        "Content-Length": fileSize.toString(),
        "Content-Type": "video/mp4"
        // Assume MP4 for now
      }
    });
    console.log("\u{1F338} Stream upload result:", {
      status: uploadRes.status,
      statusText: uploadRes.statusText,
      headers: Object.fromEntries([...uploadRes.headers.entries()])
    });
    if (!uploadRes.ok) {
      console.log("\u{1F338} Stream upload failed:", {
        status: uploadRes.status,
        statusText: uploadRes.statusText
      });
      return json(502, { error: "upload_error", status: uploadRes.status });
    }
    console.log("\u{1F338} Stream upload successful for UID:", uid);
    enableDownloadsAsync(uid, env, deps, { logPrefix: "\u{1F338}" });
    const record = {
      status: "uploading",
      owner: auth.pubkey,
      createdAt: deps.now(),
      uploadedVia: "blossom_direct",
      sha256: sha2562,
      size: fileSize
    };
    await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify(record));
    await env.MEDIA_KV.put(`idx:sha256:${sha2562}`, JSON.stringify({ uid }));
    await env.MEDIA_KV.put(`idx:pubkey:${auth.pubkey}:${uid}`, "1");
    const urls2 = getStreamUrls(uid, env);
    return json(200, {
      sha256: sha2562,
      size: fileSize,
      type: "video/mp4",
      uploaded: Math.floor(Date.now() / 1e3),
      url: urls2.mp4Url,
      // Return direct MP4 URL as per BUD-02 spec
      // Additional fields (servers MAY include per BUD-02)
      hls: urls2.hlsUrl,
      // HLS streaming URL
      thumbnail: urls2.thumbnailUrl
      // Thumbnail URL
    });
  }
}
__name(blossomUpload, "blossomUpload");
async function listUserBlobs(req, env, deps) {
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/^\/list\/([a-f0-9]{64})$/);
  if (!pathMatch) {
    return json(400, { error: "invalid_pubkey" });
  }
  const pubkey = pathMatch[1];
  const auth = await verifyBlossomAuth2(req, deps);
  const isOwner = auth?.pubkey === pubkey;
  try {
    const listResult = await env.MEDIA_KV.list({ prefix: `idx:pubkey:${pubkey}:` });
    const blobs = [];
    for (const key of listResult.keys) {
      const uid = key.name.split(":").pop();
      const videoData = await env.MEDIA_KV.get(`video:${uid}`);
      if (!videoData) continue;
      const video = JSON.parse(videoData);
      if (video.status !== "ready") continue;
      const blob = {
        sha256: video.sha256,
        size: video.size || null,
        type: "video",
        uploaded: Math.floor(video.createdAt / 1e3)
      };
      if (blob.sha256) {
        blobs.push(blob);
      }
    }
    return json(200, blobs);
  } catch (error) {
    return json(500, { error: "server_error" });
  }
}
__name(listUserBlobs, "listUserBlobs");
async function deleteBlobByHash(req, env, deps) {
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/^\/([a-f0-9]{64})(\.[a-z0-9]+)?$/);
  if (!pathMatch) {
    return json(400, { error: "invalid_hash" });
  }
  const sha2562 = pathMatch[1];
  const auth = await verifyBlossomAuth2(req, deps);
  if (!auth) {
    return json(401, { error: "unauthorized" });
  }
  const indexData = await env.MEDIA_KV.get(`idx:sha256:${sha2562}`);
  if (!indexData) {
    return json(404, { error: "not_found" });
  }
  try {
    const { uid } = JSON.parse(indexData);
    const videoData = await env.MEDIA_KV.get(`video:${uid}`);
    if (!videoData) {
      return json(404, { error: "not_found" });
    }
    const video = JSON.parse(videoData);
    if (video.owner !== auth.pubkey) {
      return json(403, { error: "forbidden" });
    }
    const accountId = env.STREAM_ACCOUNT_ID;
    const apiToken = env.STREAM_API_TOKEN;
    if (accountId && apiToken && !env.MOCK_STREAM_API) {
      const deleteUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`;
      await deps.fetch(deleteUrl, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${apiToken}` }
      });
    }
    await Promise.all([
      env.MEDIA_KV.delete(`video:${uid}`),
      env.MEDIA_KV.delete(`idx:sha256:${sha2562}`),
      env.MEDIA_KV.delete(`idx:pubkey:${video.owner}:${uid}`)
    ]);
    return new Response(null, { status: 204 });
  } catch (error) {
    return json(500, { error: "server_error" });
  }
}
__name(deleteBlobByHash, "deleteBlobByHash");
async function handleImageUpload(blob, sha2562, contentType, auth, env, deps) {
  console.log("\u{1F4F8} BLOSSOM: Starting image upload for SHA-256:", sha2562);
  const existingIndex = await env.MEDIA_KV.get(`idx:sha256:${sha2562}`);
  if (existingIndex) {
    console.log("\u{1F4F8} BLOSSOM: Found existing image, returning descriptor");
    const existing = JSON.parse(existingIndex);
    if (existing.type === "image") {
      const imageData = await env.MEDIA_KV.get(`image:${sha2562}`);
      if (imageData) {
        const image = JSON.parse(imageData);
        const cdnDomain = env.STREAM_DOMAIN || "cdn.divine.video";
        const extension = getExtensionFromMimeType2(contentType);
        return json(200, {
          sha256: sha2562,
          size: image.size,
          type: contentType,
          uploaded: Math.floor(image.createdAt / 1e3),
          url: `https://${cdnDomain}/${sha2562}${extension}`
        });
      }
    }
  }
  const { storeImageInR2: storeImageInR22 } = await Promise.resolve().then(() => (init_image_storage(), image_storage_exports));
  const storeResult = await storeImageInR22(blob, sha2562, contentType, env, {
    owner: auth?.pubkey || "anonymous",
    filename: `image-${sha2562.substring(0, 8)}${getExtensionFromMimeType2(contentType)}`
  }, deps);
  if (!storeResult.success) {
    console.error("\u{1F4F8} BLOSSOM: Image storage failed:", storeResult.errors);
    return json(500, {
      error: "storage_error",
      details: storeResult.errors
    });
  }
  console.log("\u2705 BLOSSOM: Image stored successfully:", sha2562);
  return json(200, {
    sha256: sha2562,
    size: blob.byteLength,
    type: contentType,
    uploaded: Math.floor(Date.now() / 1e3),
    url: storeResult.urls.url
  });
}
__name(handleImageUpload, "handleImageUpload");
function detectContentTypeFromBlob(blob) {
  const bytes = new Uint8Array(blob.slice(0, 16));
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return "image/jpeg";
  }
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    return "image/png";
  }
  if (bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70) {
    return "image/gif";
  }
  if (bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) {
    return "image/webp";
  }
  return "video/mp4";
}
__name(detectContentTypeFromBlob, "detectContentTypeFromBlob");
function getExtensionFromMimeType2(contentType) {
  const mimeToExt = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff"
  };
  return mimeToExt[contentType.toLowerCase()] || ".jpg";
}
__name(getExtensionFromMimeType2, "getExtensionFromMimeType");
async function verifyBlossomAuth2(req, deps) {
  const authModule = await Promise.resolve().then(() => (init_blossom(), blossom_exports));
  return await authModule.verifyBlossomAuth(req, deps);
}
__name(verifyBlossomAuth2, "verifyBlossomAuth");

// src/handlers/list_all_videos.mjs
init_checked_fetch();
init_modules_watch_stub();
init_router();
async function listAllVideoUIDs(req, env, deps) {
  try {
    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000"), 1e3);
    console.log(`\u{1F4CB} Listing video UIDs, cursor: ${cursor}, limit: ${limit}`);
    const listOptions = {
      prefix: "video:",
      limit
    };
    if (cursor) {
      listOptions.cursor = cursor;
    }
    const result = await env.MEDIA_KV.list(listOptions);
    const uids = result.keys.map((key) => key.name.substring(6));
    console.log(`\u{1F4CB} Found ${uids.length} videos${result.list_complete ? " (complete)" : " (more available)"}`);
    return json(200, {
      uids,
      cursor: result.cursor,
      list_complete: result.list_complete,
      total_returned: uids.length
    });
  } catch (error) {
    console.error("\u274C Error listing video UIDs:", error);
    return json(500, {
      error: "server_error",
      message: error.message
    });
  }
}
__name(listAllVideoUIDs, "listAllVideoUIDs");

// src/worker.mjs
var router = createRouter([
  { method: "GET", path: /^\/$/, handler: homePage },
  // Blossom protocol endpoints
  { method: "GET", path: /^\/[a-f0-9]{64}(\.[a-z0-9]+)?$/, handler: getBlobByHash },
  { method: "HEAD", path: /^\/[a-f0-9]{64}(\.[a-z0-9]+)?$/, handler: headBlobByHash },
  { method: "PUT", path: /^\/upload$/, handler: blossomUpload },
  { method: "GET", path: /^\/list\/[a-f0-9]{64}$/, handler: listUserBlobs },
  { method: "DELETE", path: /^\/[a-f0-9]{64}(\.[a-z0-9]+)?$/, handler: deleteBlobByHash },
  // Existing video service endpoints
  { method: "POST", path: /^\/v1\/videos$/, handler: createVideo },
  { method: "POST", path: /^\/v1\/stream\/webhook$/, handler: handleStreamWebhook },
  { method: "GET", path: /^\/v1\/videos\/.+$/, handler: getVideoStatus },
  { method: "GET", path: /^\/v1\/lookup$/, handler: lookupUid },
  { method: "POST", path: /^\/v1\/videos\/.+\/aliases$/, handler: addAliases },
  { method: "GET", path: /^\/v1\/users\/.+\/videos$/, handler: listUserVideos },
  { method: "POST", path: /^\/v1\/migrate$/, handler: migrateVideo },
  { method: "POST", path: /^\/v1\/migrate\/batch$/, handler: migrateBatch },
  // Removed old R2 migration routes - using hybrid dual storage now
  { method: "POST", path: /^\/v1\/openvine\/migrate$/, handler: handleOpenVineMigration },
  { method: "POST", path: /^\/v1\/openvine\/migrate-batch$/, handler: handleOpenVineBatchMigration },
  { method: "POST", path: /^\/v1\/enable-downloads\/.+$/, handler: enableDownloads },
  { method: "POST", path: /^\/v1\/enable-downloads-batch$/, handler: enableDownloadsBatch },
  { method: "GET", path: /^\/v1\/list-all-uids/, handler: listAllVideoUIDs }
]);
function createApp(env, deps) {
  const defaults = {
    now: /* @__PURE__ */ __name(() => Date.now(), "now"),
    fetch: globalThis.fetch.bind(globalThis),
    verifyNip98: env.DEV_AUTH_MODE === "true" ? async (req) => {
      const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
      if (!auth.startsWith("Nostr ")) return null;
      const parts = auth.slice(6).trim();
      if (parts.startsWith("pubkey=")) {
        return { pubkey: parts.slice(7) };
      }
      return verifyNip98Request(req);
    } : verifyNip98Request
  };
  const mergedDeps = { ...defaults, ...deps || {} };
  if (!mergedDeps.verifyStreamWebhook) {
    mergedDeps.verifyStreamWebhook = async (req, env2) => {
      const secret = env2?.STREAM_WEBHOOK_SECRET;
      if (!secret) return false;
      const sig = req.headers.get("webhook-signature") || req.headers.get("x-webhook-signature");
      if (sig) {
        try {
          const parts = Object.fromEntries(sig.split(",").map((p) => p.split("=")));
          const t = parseInt(parts.t, 10);
          const v1 = String(parts.v1 || "");
          if (!t || !v1) return false;
          const nowSec = Math.floor(mergedDeps.now() / 1e3);
          if (Math.abs(nowSec - t) > 5 * 60) return false;
          const body = await req.clone().text();
          const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
          const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
          const hex = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
          return timingSafeEqual(hex, v1);
        } catch {
          return false;
        }
      }
      const hdr = req.headers.get("x-webhook-secret");
      return hdr === secret;
    };
  }
  return async (req) => router(req, env, mergedDeps);
}
__name(createApp, "createApp");
var worker_default = {
  fetch: /* @__PURE__ */ __name((req, env) => createApp(env)(req), "fetch")
};
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let out = 0;
  for (let i = 0; i < bufA.length; i++) out |= bufA[i] ^ bufB[i];
  return out === 0;
}
__name(timingSafeEqual, "timingSafeEqual");

// ../../../.nvm/versions/node/v23.7.0/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
init_checked_fetch();
init_modules_watch_stub();
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../.nvm/versions/node/v23.7.0/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
init_checked_fetch();
init_modules_watch_stub();
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-GcmkCz/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../.nvm/versions/node/v23.7.0/lib/node_modules/wrangler/templates/middleware/common.ts
init_checked_fetch();
init_modules_watch_stub();
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-GcmkCz/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  createApp,
  middleware_loader_entry_default as default
};
/*! Bundled license information:

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/utils.js:
@noble/curves/esm/abstract/modular.js:
@noble/curves/esm/abstract/curve.js:
@noble/curves/esm/abstract/weierstrass.js:
@noble/curves/esm/_shortw_utils.js:
@noble/curves/esm/secp256k1.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
//# sourceMappingURL=worker.js.map
