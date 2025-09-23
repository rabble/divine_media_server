import { createRouter } from "./router.mjs";
import { createVideo } from "./handlers/videos.mjs";
import { handleStreamWebhook } from "./handlers/webhook.mjs";
import { getVideoStatus } from "./handlers/status.mjs";
import { lookupUid } from "./handlers/lookup.mjs";
import { addAliases } from "./handlers/aliases.mjs";
import { verifyNip98Request } from "./auth/nip98.mjs";
import { listUserVideos } from "./handlers/users.mjs";
import { migrateVideo } from "./handlers/migrate.mjs";
import { migrateBatch } from "./handlers/migrate_batch.mjs";
import { migrateFromR2, migrateR2Batch, listR2Videos } from "./handlers/migrate_r2.mjs";
import { handleOpenVineMigration, handleOpenVineBatchMigration } from "./handlers/migrate_openvine.mjs";
import { enableDownloads, enableDownloadsBatch } from "./handlers/enable_downloads.mjs";
import { homePage } from "./handlers/home.mjs";
import { getBlobByHash, headBlobByHash, blossomUpload, listUserBlobs, deleteBlobByHash } from "./handlers/blossom.mjs";

const router = createRouter([
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
  { method: "POST", path: /^\/v1\/r2\/migrate$/, handler: migrateFromR2 },
  { method: "POST", path: /^\/v1\/r2\/migrate-batch$/, handler: migrateR2Batch },
  { method: "GET", path: /^\/v1\/r2\/list$/, handler: listR2Videos },
  { method: "POST", path: /^\/v1\/openvine\/migrate$/, handler: handleOpenVineMigration },
  { method: "POST", path: /^\/v1\/openvine\/migrate-batch$/, handler: handleOpenVineBatchMigration },
  { method: "POST", path: /^\/v1\/enable-downloads\/.+$/, handler: enableDownloads },
  { method: "POST", path: /^\/v1\/enable-downloads-batch$/, handler: enableDownloadsBatch },
]);

export function createApp(env, deps) {
  const defaults = {
    now: () => Date.now(),
    fetch: globalThis.fetch.bind(globalThis),
    verifyNip98: env.DEV_AUTH_MODE === 'true' ? 
      async (req) => {
        const auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
        if (!auth.startsWith('Nostr ')) return null;
        const parts = auth.slice(6).trim();
        if (parts.startsWith('pubkey=')) {
          return { pubkey: parts.slice(7) };
        }
        return verifyNip98Request(req);
      } : verifyNip98Request,
  };
  const mergedDeps = { ...defaults, ...(deps || {}) };
  if (!mergedDeps.verifyStreamWebhook) {
    mergedDeps.verifyStreamWebhook = async (req, env) => {
      const secret = env?.STREAM_WEBHOOK_SECRET;
      if (!secret) return false;
      const sig = req.headers.get('webhook-signature') || req.headers.get('x-webhook-signature');
      if (sig) {
        try {
          const parts = Object.fromEntries(sig.split(',').map(p => p.split('=')));
          const t = parseInt(parts.t, 10);
          const v1 = String(parts.v1 || '');
          if (!t || !v1) return false;
          const nowSec = Math.floor(mergedDeps.now() / 1000);
          if (Math.abs(nowSec - t) > 5 * 60) return false;
          const body = await req.clone().text();
          const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
          const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`));
          const hex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
          return timingSafeEqual(hex, v1);
        } catch {
          return false;
        }
      }
      const hdr = req.headers.get('x-webhook-secret');
      return hdr === secret;
    };
  }
  return async (req) => router(req, env, mergedDeps);
}

export default {
  fetch: (req, env) => createApp(env)(req),
};

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let out = 0;
  for (let i = 0; i < bufA.length; i++) out |= bufA[i] ^ bufB[i];
  return out === 0;
}
