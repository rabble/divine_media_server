import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/worker.mjs';

function makeReq(url, init) {
  return new Request(new URL(url, 'https://example.com').toString(), init);
}

test('GET /v1/users/{pubkey}/videos lists UIDs from sparse index', async () => {
  const store = new Map([
    ['idx:pubkey:npub_a:uid1', '1'],
    ['idx:pubkey:npub_a:uid2', '1'],
    ['idx:pubkey:npub_b:uidX', '1'],
  ]);
  const env = /** @type {any} */({
    MEDIA_KV: {
      async get(k){ return store.get(k) ?? null; },
      async put(k,v){ store.set(k,v); },
      async list({ prefix, cursor }){
        const keys = Array.from(store.keys()).filter(k => k.startsWith(prefix)).map(name => ({ name }));
        return { keys, list_complete: true };
      },
    },
  });
  const app = createApp(env);
  const res = await app(makeReq('/v1/users/npub_a/videos', { method: 'GET' }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.uids.sort(), ['uid1','uid2']);
});

test('GET /v1/users/{pubkey}/videos returns empty when none', async () => {
  const env = /** @type {any} */({ MEDIA_KV: { async get(){ return null; }, async put(){}, async list(){ return { keys: [], list_complete: true }; } } });
  const app = createApp(env);
  const res = await app(makeReq('/v1/users/npub_none/videos', { method: 'GET' }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.uids, []);
});

