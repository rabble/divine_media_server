import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/worker.mjs';

function makeReq(url, init) {
  return new Request(new URL(url, 'https://example.com').toString(), init);
}

test('POST /v1/videos without NIP-98 returns 401', async () => {
  const env = /** @type {any} */({
    MEDIA_KV: {
      async get() { return null; },
      async put() { /* noop */ },
    },
  });

  const app = createApp(env, {
    verifyNip98: async () => null,
  });

  const res = await app(makeReq('/v1/videos', { method: 'POST' }));
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, 'unauthorized');
  assert.equal(body.reason, 'missing_nip98');
});

test('POST /v1/videos with invalid NIP-98 returns 403', async () => {
  const env = /** @type {any} */({
    MEDIA_KV: {
      async get() { return null; },
      async put() { /* noop */ },
    },
  });

  const app = createApp(env, {
    verifyNip98: async () => null,
  });

  const res = await app(makeReq('/v1/videos', { method: 'POST', headers: { Authorization: 'Nostr something' } }));
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error, 'forbidden');
  assert.equal(body.reason, 'invalid_nip98');
});

test('POST /v1/videos with valid NIP-98 creates direct upload and records owner', async () => {
  const puts = new Map();
  const env = /** @type {any} */({
    MEDIA_KV: {
      async get(k) { return puts.get(k) ?? null; },
      async put(k, v) { puts.set(k, v); },
    },
    STREAM_ACCOUNT_ID: 'acct_123',
    STREAM_API_TOKEN: 'tok_abc',
  });

  let lastFetch = null;
  const mockFetch = async (url, init) => {
    lastFetch = { url: String(url), init };
    return new Response(JSON.stringify({
      success: true,
      result: {
        id: 'uid123',
        uploadURL: 'https://upload.example/test',
        expiresAt: '2025-01-01T00:00:00Z'
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const app = createApp(env, {
    verifyNip98: async () => ({ pubkey: 'npub_test' }),
    fetch: mockFetch,
    now: () => 1734489600000, // fixed
  });

  const res = await app(makeReq('/v1/videos', { method: 'POST', headers: { Authorization: 'Nostr valid' } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.uid, 'uid123');
  assert.equal(body.uploadURL, 'https://upload.example/test');
  assert.equal(body.expiresAt, '2025-01-01T00:00:00Z');
  assert.equal(body.owner, 'npub_test');

  // Check KV wrote video record with owner and status
  const kvValue = JSON.parse(puts.get('video:uid123'));
  assert.equal(kvValue.owner, 'npub_test');
  assert.equal(kvValue.status, 'pending_upload');

  // Check Stream API was called with the right account and auth header
  assert.match(lastFetch.url, /accounts\/acct_123\/stream\/direct_upload$/);
  assert.equal(lastFetch.init.method, 'POST');
  assert.equal(lastFetch.init.headers['Authorization'], 'Bearer tok_abc');
  const sentBody = JSON.parse(lastFetch.init.body);
  assert.equal(sentBody.meta.pubkey, 'npub_test');
});

test('POST /v1/videos indexes provided aliases on create; 409 on conflicts', async () => {
  const store = new Map();
  const env = /** @type {any} */({
    MEDIA_KV: {
      async get(k){ return store.get(k) ?? null; },
      async put(k,v){ store.set(k,v); },
    },
    STREAM_ACCOUNT_ID: 'acct_123',
    STREAM_API_TOKEN: 'tok_abc',
  });
  const fetchMock = async () => new Response(JSON.stringify({ success: true, result: { id: 'uidZ', uploadURL: 'https://u', expiresAt: 'x' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  const app = createApp(env, { verifyNip98: async () => ({ pubkey: 'npub_owner' }), fetch: fetchMock });
  const res = await app(makeReq('/v1/videos', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Nostr valid' }, body: JSON.stringify({ sha256: 'DEAD', vineId: 'v-a', originalUrl: 'https://ex.am/ple?z=1&y=2' }) }));
  assert.equal(res.status, 200);
  const idxSha = JSON.parse(store.get('idx:sha256:dead'));
  assert.equal(idxSha.uid, 'uidZ');
  const idxVine = JSON.parse(store.get('idx:vine:v-a'));
  assert.equal(idxVine.uid, 'uidZ');
  const vrec = JSON.parse(store.get('video:uidZ'));
  assert.equal(vrec.sha256, 'dead');
  assert.equal(vrec.vineId, 'v-a');
  assert.ok(vrec.originalUrl);

  // Now simulate conflict: sha256 already points elsewhere
  store.set('idx:sha256:beef', JSON.stringify({ uid: 'other' }));
  const res2 = await app(makeReq('/v1/videos', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Nostr valid' }, body: JSON.stringify({ sha256: 'BEEF' }) }));
  assert.equal(res2.status, 409);
});

test('POST /v1/videos misconfigured env returns 500', async () => {
  const env = /** @type {any} */({
    MEDIA_KV: {
      async get() { return null; },
      async put() { /* noop */ },
    },
    // Missing STREAM_ACCOUNT_ID / STREAM_API_TOKEN
  });

  const app = createApp(env, {
    verifyNip98: async () => ({ pubkey: 'npub_test' }),
  });

  const res = await app(makeReq('/v1/videos', { method: 'POST', headers: { Authorization: 'Nostr valid' } }));
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, 'server_error');
  assert.equal(body.reason, 'misconfigured_stream_env');
});

test('POST /v1/videos rate limited returns 429', async () => {
  const puts = new Map();
  const gets = new Map();
  const fixedNow = 1734489600000; // arbitrary
  const bucket = Math.floor(fixedNow / 3600000);
  gets.set(`rl:pub:npub_test:${bucket}`, '30');
  const env = /** @type {any} */({
    MEDIA_KV: {
      async get(k) { return gets.has(k) ? gets.get(k) : null; },
      async put(k, v) { puts.set(k, v); },
    },
    STREAM_ACCOUNT_ID: 'acct_123',
    STREAM_API_TOKEN: 'tok_abc',
  });

  const app = createApp(env, {
    verifyNip98: async () => ({ pubkey: 'npub_test' }),
    now: () => fixedNow,
  });

  const res = await app(makeReq('/v1/videos', { method: 'POST', headers: { Authorization: 'Nostr valid' } }));
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.equal(body.error, 'rate_limited');
});
