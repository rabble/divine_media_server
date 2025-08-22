import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/worker.mjs';

function makeReq(url, init) {
  return new Request(new URL(url, 'https://example.com').toString(), init);
}

test('Injected verifyNip98 allows requests and assigns owner', async () => {
  const env = /** @type {any} */({
    MEDIA_KV: { async get(){ return null; }, async put(){}, async list(){ return { keys: [], list_complete: true }; } },
    STREAM_ACCOUNT_ID: 'acct_123',
    STREAM_API_TOKEN: 'tok_abc',
  });
  const app = createApp(env, {
    verifyNip98: async () => ({ pubkey: 'npub_stub' }),
    fetch: async () => new Response(JSON.stringify({ success: true, result: { id: 'u1', uploadURL: 'https://u', expiresAt: 'x' } }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  const res = await app(makeReq('/v1/videos', { method: 'POST', headers: { Authorization: 'Nostr something' } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.owner, 'npub_stub');
});

test('Malformed Authorization yields 400 bad_request malformed_nip98', async () => {
  const env = /** @type {any} */({ MEDIA_KV: { async get(){ return null; }, async put(){} } });
  const app = createApp(env);
  const res = await app(makeReq('/v1/videos', { method: 'POST', headers: { Authorization: 'Bearer xyz' } }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.reason, 'malformed_nip98');
});

test('Default webhook verifier checks x-webhook-secret against env', async () => {
  const store = new Map();
  store.set('video:u2', JSON.stringify({ status: 'pending_upload', owner: 'npub_test' }));
  const env = /** @type {any} */({ MEDIA_KV: { async get(k){ return store.get(k) ?? null; }, async put(k,v){ store.set(k,v); } }, STREAM_WEBHOOK_SECRET: 's3cr3t' });
  const app = createApp(env);
  const res = await app(makeReq('/v1/stream/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-secret': 's3cr3t' }, body: JSON.stringify({ id: 'u2', status: 'ready', playback: { hls: 'h' } }) }));
  assert.equal(res.status, 200);
});
