import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/worker.mjs';

function makeReq(url, init) {
  return new Request(new URL(url, 'https://example.com').toString(), init);
}

async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

test('Webhook signature HMAC v1 is verified with 5-minute window', async () => {
  const store = new Map();
  store.set('video:uidH', JSON.stringify({ status: 'pending_upload', owner: 'npub_test' }));
  const env = /** @type {any} */({
    MEDIA_KV: { async get(k){ return store.get(k) ?? null; }, async put(k,v){ store.set(k,v); } },
    STREAM_WEBHOOK_SECRET: 'sekrit',
  });
  const app = createApp(env, { now: () => 1_000_000_000_000 });
  const body = JSON.stringify({ id: 'uidH', status: 'ready', playback: { hls: 'h' } });
  const t = Math.floor((1_000_000_000_000 - 60_000) / 1000); // 1 minute in window
  const v1 = await hmacHex('sekrit', `${t}.${body}`);
  const sig = `t=${t},v1=${v1}`;
  const res = await app(makeReq('/v1/stream/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'webhook-signature': sig }, body }));
  assert.equal(res.status, 200);
});

test('Webhook signature outside window is rejected', async () => {
  const store = new Map();
  store.set('video:uidH', JSON.stringify({ status: 'pending_upload', owner: 'npub_test' }));
  const env = /** @type {any} */({ MEDIA_KV: { async get(k){ return store.get(k) ?? null; }, async put(k,v){ store.set(k,v); } }, STREAM_WEBHOOK_SECRET: 'sekrit' });
  const now = 1_000_000_000_000;
  const app = createApp(env, { now: () => now });
  const body = JSON.stringify({ id: 'uidH', status: 'ready' });
  const t = Math.floor((now - 10 * 60_000) / 1000); // 10 minutes old
  const v1 = await hmacHex('sekrit', `${t}.${body}`);
  const sig = `t=${t},v1=${v1}`;
  const res = await app(makeReq('/v1/stream/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'webhook-signature': sig }, body }));
  assert.equal(res.status, 403);
});

