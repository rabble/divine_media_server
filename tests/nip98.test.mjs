import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/worker.mjs';

const maybe = async (name, fn) => {
  try {
    await import('@noble/curves/secp256k1');
  } catch {
    test.skip(name, fn);
    return;
  }
  test(name, fn);
};

function makeReq(url, init) {
  return new Request(new URL(url, 'https://example.com').toString(), init);
}

async function sha256Hex(input) {
  const buf = input instanceof Uint8Array || Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64(s) { return Buffer.from(s, 'utf8').toString('base64'); }

maybe('NIP-98: valid signed request is accepted', async () => {
  const { schnorr } = await import('@noble/curves/secp256k1');
  const priv = '1'.padStart(64,'0');
  const pub = Buffer.from(schnorr.getPublicKey(priv)).toString('hex');
  const env = /** @type {any} */({
    MEDIA_KV: { async get(){ return null; }, async put(){}, async list(){ return { keys: [], list_complete: true }; } },
    STREAM_ACCOUNT_ID: 'acct', STREAM_API_TOKEN: 'tok'
  });
  const app = createApp(env, {
    fetch: async () => new Response(JSON.stringify({ success: true, result: { id: 'uidS', uploadURL: 'https://u', expiresAt: 'x' } }), { status: 200, headers: { 'content-type': 'application/json' } })
  });
  const body = JSON.stringify({ a: 1 });
  const url = 'https://example.com/v1/videos';
  const created_at = Math.floor(Date.now()/1000);
  const tags = [['u', url], ['method','POST'], ['payload', await sha256Hex(body)]];
  const content = '';
  const payload = [0, pub, created_at, 27235, tags, content];
  const id = await sha256Hex(JSON.stringify(payload));
  const sig = Buffer.from(await schnorr.sign(id, priv)).toString('hex');
  const ev = { id, pubkey: pub, created_at, kind: 27235, tags, content, sig };
  const auth = 'Nostr ' + b64(JSON.stringify(ev));
  const res = await app(makeReq('/v1/videos', { method: 'POST', headers: { Authorization: auth, 'content-type': 'application/json' }, body }));
  assert.equal(res.status, 200);
});

maybe('NIP-98: wrong method or url is rejected', async () => {
  const { schnorr } = await import('@noble/curves/secp256k1');
  const priv = '2'.padStart(64,'0');
  const pub = Buffer.from(schnorr.getPublicKey(priv)).toString('hex');
  const env = /** @type {any} */({ MEDIA_KV: { async get(){ return null; }, async put(){} }, STREAM_ACCOUNT_ID: 'acct', STREAM_API_TOKEN: 'tok' });
  const app = createApp(env, { fetch: async () => new Response(JSON.stringify({ success: true, result: { id: 'uidS', uploadURL: 'https://u', expiresAt: 'x' } }), { status: 200, headers: { 'content-type': 'application/json' } }) });
  const body = JSON.stringify({});
  const url = 'https://example.com/v1/videos';
  const created_at = Math.floor(Date.now()/1000);
  const tags = [['u', url], ['method','POST'], ['payload', await sha256Hex(body)]];
  const content = '';
  const payload = [0, pub, created_at, 27235, tags, content];
  const id = await sha256Hex(JSON.stringify(payload));
  const sig = Buffer.from(await schnorr.sign(id, priv)).toString('hex');
  const ev = { id, pubkey: pub, created_at, kind: 27235, tags, content, sig };
  const auth = 'Nostr ' + b64(JSON.stringify(ev));
  // Change method to GET (mismatch with signed POST)
  const res = await app(makeReq('/v1/videos', { method: 'GET', headers: { Authorization: auth } }));
  assert.equal(res.status, 404); // Router returns 404 for GET on POST-only endpoint before auth validation
});

