import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/worker.mjs';

function makeReq(url, init) {
  return new Request(new URL(url, 'https://example.com').toString(), init);
}

test('POST /v1/videos/{uid}/aliases requires NIP-98', async () => {
  const env = /** @type {any} */({ MEDIA_KV: { async get(){ return null; }, async put(){} } });
  const app = createApp(env, { verifyNip98: async () => null });
  const res = await app(makeReq('/v1/videos/uidA/aliases', { method: 'POST', body: JSON.stringify({ sha256: 'abcd' }) }));
  assert.equal(res.status, 401);
});

test('POST /v1/videos/{uid}/aliases only owner can attach aliases; writes indexes', async () => {
  const store = new Map();
  store.set('video:uidA', JSON.stringify({ status: 'pending_upload', owner: 'npub_owner' }));
  const env = /** @type {any} */({
    MEDIA_KV: {
      async get(k){ return store.get(k) ?? null; },
      async put(k, v){ store.set(k, v); },
    },
    LOOKUPS_ENABLED: 'true',
  });

  const app = createApp(env, { verifyNip98: async () => ({ pubkey: 'npub_owner' }) });
  const res = await app(makeReq('/v1/videos/uidA/aliases', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Nostr valid' },
    body: JSON.stringify({ sha256: 'ABCD', vineId: 'v123', url: 'https://ExAmple.com/video?id=2&b=1#a' })
  }));
  assert.equal(res.status, 200);
  const idxSha = JSON.parse(store.get('idx:sha256:abcd'));
  assert.equal(idxSha.uid, 'uidA');
  const idxVine = JSON.parse(store.get('idx:vine:v123'));
  assert.equal(idxVine.uid, 'uidA');
  const record = JSON.parse(store.get('video:uidA'));
  assert.equal(record.sha256, 'abcd');
  assert.equal(record.vineId, 'v123');
  assert.ok(record.originalUrl);
});

test('POST /v1/videos/{uid}/aliases 409 on conflicting alias', async () => {
  const store = new Map();
  store.set('video:uidA', JSON.stringify({ status: 'pending_upload', owner: 'npub_owner' }));
  store.set('idx:sha256:abcd', JSON.stringify({ uid: 'other' }));
  const env = /** @type {any} */({
    MEDIA_KV: { async get(k){ return store.get(k) ?? null; }, async put(k,v){ store.set(k,v); } },
  });
  const app = createApp(env, { verifyNip98: async () => ({ pubkey: 'npub_owner' }) });
  const res = await app(makeReq('/v1/videos/uidA/aliases', {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Nostr valid' }, body: JSON.stringify({ sha256: 'ABCD' })
  }));
  assert.equal(res.status, 409);
});

test('POST /v1/videos/{uid}/aliases non-owner returns 403', async () => {
  const store = new Map();
  store.set('video:uidA', JSON.stringify({ status: 'pending_upload', owner: 'npub_owner' }));
  const env = /** @type {any} */({ MEDIA_KV: { async get(k){ return store.get(k) ?? null; }, async put(k,v){ store.set(k,v); } } });
  const app = createApp(env, { verifyNip98: async () => ({ pubkey: 'npub_other' }) });
  const res = await app(makeReq('/v1/videos/uidA/aliases', {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Nostr valid' }, body: JSON.stringify({ sha256: 'abcd' })
  }));
  assert.equal(res.status, 403);
});

