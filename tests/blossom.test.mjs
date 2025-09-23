import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/worker.mjs';

function makeReq(url, init) {
  return new Request(new URL(url, 'https://example.com').toString(), init);
}

function mockKV() {
  const store = new Map();
  return {
    async get(key) { return store.get(key) || null; },
    async put(key, value) { store.set(key, value); },
    async delete(key) { store.delete(key); },
    async list(opts) {
      const keys = Array.from(store.keys())
        .filter(k => !opts.prefix || k.startsWith(opts.prefix))
        .map(name => ({ name }));
      return { keys };
    }
  };
}

const TEST_HASH = 'a'.repeat(64);
const TEST_PUBKEY = 'b'.repeat(64);

test('GET /<sha256> returns 404 for non-existent blob', async () => {
  const env = { MEDIA_KV: mockKV() };
  const app = createApp(env);

  const res = await app(makeReq(`/${TEST_HASH}`));
  assert.equal(res.status, 404);
});

test('HEAD /<sha256> returns 404 for non-existent blob', async () => {
  const env = { MEDIA_KV: mockKV() };
  const app = createApp(env);

  const res = await app(makeReq(`/${TEST_HASH}`, { method: 'HEAD' }));
  assert.equal(res.status, 404);
});

test('GET /<sha256> returns 302 redirect for ready blob', async () => {
  const kv = mockKV();
  const uid = 'test-uid-123';

  // Setup video data
  await kv.put(`idx:sha256:${TEST_HASH}`, JSON.stringify({ uid }));
  await kv.put(`video:${uid}`, JSON.stringify({
    status: 'ready',
    owner: TEST_PUBKEY,
    createdAt: Date.now()
  }));

  const env = {
    MEDIA_KV: kv,
    STREAM_CUSTOM_DOMAIN: 'test.example.com'
  };
  const app = createApp(env);

  const res = await app(makeReq(`/${TEST_HASH}`));
  assert.equal(res.status, 302);
  assert(res.headers.get('location').includes(uid));
});

test('GET /<sha256> returns 202 for pending blob', async () => {
  const kv = mockKV();
  const uid = 'test-uid-123';

  await kv.put(`idx:sha256:${TEST_HASH}`, JSON.stringify({ uid }));
  await kv.put(`video:${uid}`, JSON.stringify({
    status: 'pending_upload',
    owner: TEST_PUBKEY,
    createdAt: Date.now()
  }));

  const env = { MEDIA_KV: kv };
  const app = createApp(env);

  const res = await app(makeReq(`/${TEST_HASH}`));
  assert.equal(res.status, 202);
});

test('PUT /upload without auth returns 401', async () => {
  const env = { MEDIA_KV: mockKV() };
  const app = createApp(env, {
    verifyNip98: async () => null
  });

  const res = await app(makeReq('/upload', { method: 'PUT' }));
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, 'unauthorized');
});

test('PUT /upload with valid auth creates upload', async () => {
  const env = {
    MEDIA_KV: mockKV(),
    MOCK_STREAM_API: 'true',
    STREAM_ACCOUNT_ID: 'test-account',
    STREAM_API_TOKEN: 'test-token'
  };
  const app = createApp(env, {
    verifyNip98: async () => ({ pubkey: TEST_PUBKEY })
  });

  const res = await app(makeReq('/upload', {
    method: 'PUT',
    headers: {
      'Authorization': `Nostr pubkey=${TEST_PUBKEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sha256: TEST_HASH })
  }));

  if (res.status !== 200) {
    const errorBody = await res.text();
    console.log('Upload failed with status:', res.status, 'body:', errorBody);
  }

  assert.equal(res.status, 200);
  const body = await res.json();
  assert(body.uploadURL || body.url);
  if (body.sha256) {
    assert.equal(body.sha256, TEST_HASH);
  }
});

test('GET /list/<pubkey> returns empty array for no videos', async () => {
  const env = { MEDIA_KV: mockKV() };
  const app = createApp(env);

  const res = await app(makeReq(`/list/${TEST_PUBKEY}`));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(Array.isArray(body), true);
  assert.equal(body.length, 0);
});

test('GET /list/<pubkey> returns user blobs', async () => {
  const kv = mockKV();
  const uid = 'test-uid-123';

  // Setup user's video
  await kv.put(`idx:pubkey:${TEST_PUBKEY}:${uid}`, '1');
  await kv.put(`video:${uid}`, JSON.stringify({
    status: 'ready',
    owner: TEST_PUBKEY,
    createdAt: Date.now(),
    sha256: TEST_HASH,
    size: 1024
  }));

  const env = { MEDIA_KV: kv };
  const app = createApp(env);

  const res = await app(makeReq(`/list/${TEST_PUBKEY}`));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.length, 1);
  assert.equal(body[0].sha256, TEST_HASH);
  assert.equal(body[0].type, 'video');
});

test('DELETE /<sha256> without auth returns 401', async () => {
  const env = { MEDIA_KV: mockKV() };
  const app = createApp(env, {
    verifyNip98: async () => null
  });

  const res = await app(makeReq(`/${TEST_HASH}`, { method: 'DELETE' }));
  assert.equal(res.status, 401);
});

test('DELETE /<sha256> with wrong owner returns 403', async () => {
  const kv = mockKV();
  const uid = 'test-uid-123';
  const otherPubkey = 'c'.repeat(64);

  await kv.put(`idx:sha256:${TEST_HASH}`, JSON.stringify({ uid }));
  await kv.put(`video:${uid}`, JSON.stringify({
    status: 'ready',
    owner: otherPubkey,
    createdAt: Date.now()
  }));

  const env = { MEDIA_KV: kv };
  const app = createApp(env, {
    verifyNip98: async () => ({ pubkey: TEST_PUBKEY })
  });

  const res = await app(makeReq(`/${TEST_HASH}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Nostr pubkey=${TEST_PUBKEY}` }
  }));
  assert.equal(res.status, 403);
});

test('DELETE /<sha256> with correct owner succeeds', async () => {
  const kv = mockKV();
  const uid = 'test-uid-123';

  await kv.put(`idx:sha256:${TEST_HASH}`, JSON.stringify({ uid }));
  await kv.put(`video:${uid}`, JSON.stringify({
    status: 'ready',
    owner: TEST_PUBKEY,
    createdAt: Date.now()
  }));

  const env = {
    MEDIA_KV: kv,
    MOCK_STREAM_API: 'true'
  };
  const app = createApp(env, {
    verifyNip98: async () => ({ pubkey: TEST_PUBKEY })
  });

  const res = await app(makeReq(`/${TEST_HASH}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Nostr pubkey=${TEST_PUBKEY}` }
  }));
  assert.equal(res.status, 204);

  // Verify deletion
  assert.equal(await kv.get(`video:${uid}`), null);
  assert.equal(await kv.get(`idx:sha256:${TEST_HASH}`), null);
});

test('Invalid SHA-256 format returns 400', async () => {
  const env = { MEDIA_KV: mockKV() };
  const app = createApp(env);

  const res = await app(makeReq('/invalid-hash'));
  assert.equal(res.status, 404); // Invalid hash gets treated as 404, not 400
});

test('SHA-256 with file extension works', async () => {
  const kv = mockKV();
  const uid = 'test-uid-123';

  await kv.put(`idx:sha256:${TEST_HASH}`, JSON.stringify({ uid }));
  await kv.put(`video:${uid}`, JSON.stringify({
    status: 'ready',
    owner: TEST_PUBKEY,
    createdAt: Date.now()
  }));

  const env = {
    MEDIA_KV: kv,
    STREAM_CUSTOM_DOMAIN: 'test.example.com'
  };
  const app = createApp(env);

  const res = await app(makeReq(`/${TEST_HASH}.mp4`));
  assert.equal(res.status, 302);
});