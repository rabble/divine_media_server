// ABOUTME: Unit and integration tests for blossom-sdk-worker
// ABOUTME: Tests all Blossom protocol endpoints using SDK abstractions

import test from 'node:test';
import assert from 'node:assert/strict';

// Mock Worker environment
function createMockEnv() {
  // Mock KV
  const kvStore = new Map();
  const MEDIA_KV = {
    async get(key) {
      return kvStore.get(key) || null;
    },
    async put(key, value) {
      kvStore.set(key, value);
    },
    async delete(key) {
      kvStore.delete(key);
    },
    async list(opts) {
      const keys = Array.from(kvStore.keys())
        .filter(k => !opts.prefix || k.startsWith(opts.prefix))
        .map(name => ({ name }));
      return { keys };
    }
  };

  // Mock R2
  const r2Store = new Map();
  const R2_BLOBS = {
    async head(key) {
      const obj = r2Store.get(key);
      return obj ? { size: obj.size, etag: obj.etag } : null;
    },
    async get(key) {
      const obj = r2Store.get(key);
      if (!obj) return null;
      return {
        body: obj.body,
        size: obj.size,
        httpMetadata: obj.httpMetadata
      };
    },
    async put(key, data, options) {
      r2Store.set(key, {
        body: data,
        size: data instanceof ArrayBuffer ? data.byteLength : data.length,
        httpMetadata: options?.httpMetadata || {},
        etag: Math.random().toString(36),
        customMetadata: options?.customMetadata || {}
      });
    },
    async delete(key) {
      r2Store.delete(key);
    }
  };

  return {
    MEDIA_KV,
    R2_BLOBS,
    DEV_AUTH_MODE: 'true',
    STREAM_DOMAIN: 'cdn.divine.video'
  };
}

function makeRequest(url, init = {}) {
  return new Request(new URL(url, 'http://localhost:8787').toString(), init);
}

const TEST_HASH = 'a'.repeat(64);
const TEST_PUBKEY = 'b'.repeat(64);
const TEST_BLOB_CONTENT = 'test blob content';

// Import the worker
let worker;
try {
  const module = await import('../src/index.mjs');
  worker = module.default;
} catch (error) {
  console.error('Failed to import worker:', error);
  throw error;
}

// Helper to calculate SHA-256
async function sha256(data) {
  const buffer = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

test('CORS: OPTIONS /upload returns proper CORS headers', async () => {
  const env = createMockEnv();
  const req = makeRequest('/upload', { method: 'OPTIONS' });

  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(res.headers.get('Access-Control-Allow-Methods'), 'GET, HEAD, PUT, DELETE');
  assert(res.headers.get('Access-Control-Allow-Headers').includes('Authorization'));
});

test('GET /<sha256>: returns 404 for non-existent blob', async () => {
  const env = createMockEnv();
  const req = makeRequest(`/${TEST_HASH}`);

  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 404);
  const text = await res.text();
  assert.equal(text, 'Not Found');
});

test('HEAD /<sha256>: returns 404 for non-existent blob', async () => {
  const env = createMockEnv();
  const req = makeRequest(`/${TEST_HASH}`, { method: 'HEAD' });

  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 404);
});

test('PUT /upload: returns 401 without authentication', async () => {
  const env = createMockEnv();
  const req = makeRequest('/upload', {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: TEST_BLOB_CONTENT
  });

  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, 'unauthorized');
});

test('PUT /upload: successfully uploads blob with auth', async () => {
  const env = createMockEnv();
  const req = makeRequest('/upload', {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/plain',
      'Authorization': `Nostr pubkey=${TEST_PUBKEY}`
    },
    body: TEST_BLOB_CONTENT
  });

  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 200);
  const body = await res.json();

  assert(body.url);
  assert(body.sha256);
  assert.equal(body.size, TEST_BLOB_CONTENT.length);
  assert.equal(body.type, 'text/plain');
  assert(body.uploaded);

  // Verify blob was stored
  const hash = await sha256(TEST_BLOB_CONTENT);
  const metadata = await env.MEDIA_KV.get(`blob:${hash}`);
  assert(metadata);
});

test('PUT /upload: returns existing blob if already uploaded', async () => {
  const env = createMockEnv();
  const hash = await sha256(TEST_BLOB_CONTENT);

  // Pre-populate blob metadata
  await env.MEDIA_KV.put(`blob:${hash}`, JSON.stringify({
    sha256: hash,
    size: TEST_BLOB_CONTENT.length,
    type: 'text/plain',
    uploaded: Math.floor(Date.now() / 1000)
  }));

  const req = makeRequest('/upload', {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/plain',
      'Authorization': `Nostr pubkey=${TEST_PUBKEY}`
    },
    body: TEST_BLOB_CONTENT
  });

  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.sha256, hash);
});

test('PUT /upload: validates SHA-256 hash in auth event', async () => {
  const env = createMockEnv();
  const wrongHash = 'c'.repeat(64);

  // Create mock event with 'x' tag
  const event = {
    kind: 24242,
    pubkey: TEST_PUBKEY,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'upload'],
      ['x', wrongHash] // Wrong hash
    ],
    content: 'Upload request'
  };

  const base64Event = btoa(JSON.stringify(event));

  const req = makeRequest('/upload', {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/plain',
      'Authorization': `Nostr ${base64Event}`
    },
    body: TEST_BLOB_CONTENT
  });

  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'hash_mismatch');
});

test('GET /<sha256>: retrieves blob content', async () => {
  const env = createMockEnv();
  const hash = await sha256(TEST_BLOB_CONTENT);

  // Setup blob metadata
  await env.MEDIA_KV.put(`blob:${hash}`, JSON.stringify({
    sha256: hash,
    size: TEST_BLOB_CONTENT.length,
    type: 'text/plain',
    uploaded: Math.floor(Date.now() / 1000)
  }));

  // Setup blob storage
  await env.R2_BLOBS.put(`blobs/${hash}`, new TextEncoder().encode(TEST_BLOB_CONTENT), {
    httpMetadata: { contentType: 'text/plain' }
  });

  const req = makeRequest(`/${hash}`);
  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'text/plain');
  assert(res.headers.get('Cache-Control').includes('immutable'));

  const text = await res.text();
  assert.equal(text, TEST_BLOB_CONTENT);
});

test('HEAD /<sha256>: returns headers without body', async () => {
  const env = createMockEnv();
  const hash = await sha256(TEST_BLOB_CONTENT);

  // Setup blob metadata
  await env.MEDIA_KV.put(`blob:${hash}`, JSON.stringify({
    sha256: hash,
    size: TEST_BLOB_CONTENT.length,
    type: 'text/plain',
    uploaded: Math.floor(Date.now() / 1000)
  }));

  const req = makeRequest(`/${hash}`, { method: 'HEAD' });
  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'text/plain');
  assert.equal(res.headers.get('Content-Length'), TEST_BLOB_CONTENT.length.toString());
  assert(res.headers.get('Cache-Control').includes('immutable'));

  const text = await res.text();
  assert.equal(text, ''); // No body
});

test('GET /list/<pubkey>: returns empty array for unknown user', async () => {
  const env = createMockEnv();
  const req = makeRequest(`/list/${TEST_PUBKEY}`);

  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(Array.isArray(body), true);
  assert.equal(body.length, 0);
});

test('GET /list/<pubkey>: returns user blobs', async () => {
  const env = createMockEnv();
  const hash = await sha256(TEST_BLOB_CONTENT);

  // Setup blob metadata
  await env.MEDIA_KV.put(`blob:${hash}`, JSON.stringify({
    sha256: hash,
    size: TEST_BLOB_CONTENT.length,
    type: 'text/plain',
    uploaded: Math.floor(Date.now() / 1000)
  }));

  // Setup ownership
  await env.MEDIA_KV.put(`pubkey:${TEST_PUBKEY}:${hash}`, '1');

  const req = makeRequest(`/list/${TEST_PUBKEY}`);
  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.length, 1);
  assert.equal(body[0].sha256, hash);
  assert.equal(body[0].size, TEST_BLOB_CONTENT.length);
  assert.equal(body[0].type, 'text/plain');
});

test('DELETE /<sha256>: returns 401 without authentication', async () => {
  const env = createMockEnv();
  const req = makeRequest(`/${TEST_HASH}`, { method: 'DELETE' });

  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, 'unauthorized');
});

test('DELETE /<sha256>: returns 404 for non-existent blob', async () => {
  const env = createMockEnv();
  const req = makeRequest(`/${TEST_HASH}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Nostr pubkey=${TEST_PUBKEY}` }
  });

  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 404);
});

test('DELETE /<sha256>: returns 403 for non-owner', async () => {
  const env = createMockEnv();
  const hash = await sha256(TEST_BLOB_CONTENT);
  const otherPubkey = 'c'.repeat(64);

  // Setup blob metadata
  await env.MEDIA_KV.put(`blob:${hash}`, JSON.stringify({
    sha256: hash,
    size: TEST_BLOB_CONTENT.length,
    type: 'text/plain',
    uploaded: Math.floor(Date.now() / 1000)
  }));

  // Setup ownership for different user
  await env.MEDIA_KV.put(`owner:${hash}:${otherPubkey}`, '1');

  const req = makeRequest(`/${hash}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Nostr pubkey=${TEST_PUBKEY}` }
  });

  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 403);
});

test('DELETE /<sha256>: successfully deletes owned blob', async () => {
  const env = createMockEnv();
  const hash = await sha256(TEST_BLOB_CONTENT);

  // Setup blob metadata
  await env.MEDIA_KV.put(`blob:${hash}`, JSON.stringify({
    sha256: hash,
    size: TEST_BLOB_CONTENT.length,
    type: 'text/plain',
    uploaded: Math.floor(Date.now() / 1000)
  }));

  // Setup blob storage
  await env.R2_BLOBS.put(`blobs/${hash}`, new TextEncoder().encode(TEST_BLOB_CONTENT));

  // Setup ownership
  await env.MEDIA_KV.put(`owner:${hash}:${TEST_PUBKEY}`, '1');
  await env.MEDIA_KV.put(`pubkey:${TEST_PUBKEY}:${hash}`, '1');

  const req = makeRequest(`/${hash}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Nostr pubkey=${TEST_PUBKEY}` }
  });

  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 204);

  // Verify deletion
  assert.equal(await env.MEDIA_KV.get(`blob:${hash}`), null);
  assert.equal(await env.MEDIA_KV.get(`owner:${hash}:${TEST_PUBKEY}`), null);
});

test('Error handling: returns 500 for internal errors', async () => {
  const env = createMockEnv();
  const hash = await sha256(TEST_BLOB_CONTENT);

  // Setup valid blob metadata
  await env.MEDIA_KV.put(`blob:${hash}`, JSON.stringify({
    sha256: hash,
    size: TEST_BLOB_CONTENT.length,
    type: 'text/plain',
    uploaded: Math.floor(Date.now() / 1000)
  }));

  // Break the R2 storage to cause error during GET
  env.R2_BLOBS.get = async () => {
    throw new Error('Simulated R2 failure');
  };

  const req = makeRequest(`/${hash}`);
  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, 'internal_server_error');
});

test('Invalid routes return 404', async () => {
  const env = createMockEnv();
  const req = makeRequest('/invalid/route');

  const res = await worker.fetch(req, env, {});

  assert.equal(res.status, 404);
});
