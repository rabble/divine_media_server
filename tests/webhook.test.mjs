import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/worker.mjs';

function makeReq(url, init) {
  return new Request(new URL(url, 'https://example.com').toString(), init);
}

test('POST /v1/stream/webhook requires valid signature', async () => {
  const env = /** @type {any} */({
    MEDIA_KV: { async get() { return null; }, async put() {} },
  });
  const app = createApp(env, { verifyStreamWebhook: async () => false });

  const res = await app(makeReq('/v1/stream/webhook', { method: 'POST', body: JSON.stringify({ id: 'uid1' }) }));
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.reason, 'invalid_webhook_signature');
});

test('POST /v1/stream/webhook updates video record and is idempotent', async () => {
  const store = new Map();
  const env = /** @type {any} */({
    MEDIA_KV: {
      async get(k) { return store.has(k) ? store.get(k) : null; },
      async put(k, v) { store.set(k, v); },
    },
  });

  // Seed pending record with owner
  store.set('video:uid1', JSON.stringify({ status: 'pending_upload', owner: 'npub_x' }));

  const app = createApp(env, {
    verifyStreamWebhook: async () => true,
    now: () => 111,
  });

  // First webhook
  let res = await app(makeReq('/v1/stream/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'uid1', status: 'ready', playback: { hls: 'hls://url' }, thumbnails: { default: 'thumb://url' } })
  }));
  assert.equal(res.status, 200);
  let record = JSON.parse(store.get('video:uid1'));
  assert.equal(record.status, 'published');
  assert.equal(record.hlsUrl, 'hls://url');
  assert.equal(record.thumbnailUrl, 'thumb://url');
  assert.equal(record.owner, 'npub_x'); // preserved

  // Second (idempotent)
  res = await app(makeReq('/v1/stream/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'uid1', status: 'ready', playback: { hls: 'hls://url' }, thumbnails: { default: 'thumb://url' } })
  }));
  assert.equal(res.status, 200);
  const record2 = JSON.parse(store.get('video:uid1'));
  assert.equal(record2.status, 'published');
  assert.equal(record2.hlsUrl, 'hls://url');
});
