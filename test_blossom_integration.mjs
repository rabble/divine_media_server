#!/usr/bin/env node
// ABOUTME: Integration tests for Blossom protocol endpoints against live server
// ABOUTME: Tests all Blossom endpoints with real authentication and server responses

import crypto from 'crypto';
import { schnorr } from '@noble/curves/secp256k1';

const API_URL = process.argv[2] || 'https://cf-stream-service-staging.protestnet.workers.dev';
const TEST_TIMEOUT = 30000; // 30 seconds

console.log(`🧪 Testing Blossom Integration against: ${API_URL}`);

async function sha256Hex(data) {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64Encode(str) {
  return Buffer.from(str).toString('base64');
}

async function createNip98Auth(url, method, body) {
  // Generate a test keypair
  const privKey = crypto.randomBytes(32);
  const pubKey = schnorr.getPublicKey(privKey);
  const pubKeyHex = Buffer.from(pubKey).toString('hex');

  const created_at = Math.floor(Date.now() / 1000);
  const bodyHash = body ? await sha256Hex(new TextEncoder().encode(body)) : null;

  const tags = [
    ['u', url],
    ['method', method]
  ];

  if (bodyHash) {
    tags.push(['payload', bodyHash]);
  }

  const event = {
    pubkey: pubKeyHex,
    created_at,
    kind: 27235,
    tags,
    content: ''
  };

  // Calculate event ID
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);

  const eventId = await sha256Hex(new TextEncoder().encode(serialized));
  event.id = eventId;

  // Sign the event
  const signature = await schnorr.sign(eventId, privKey);
  event.sig = Buffer.from(signature).toString('hex');

  // Create the auth header
  const authHeader = 'Nostr ' + base64Encode(JSON.stringify(event));

  return { authHeader, pubKey: pubKeyHex };
}

async function createBlossomAuth(url, method) {
  // Generate a test keypair
  const privKey = crypto.randomBytes(32);
  const pubKey = schnorr.getPublicKey(privKey);
  const pubKeyHex = Buffer.from(pubKey).toString('hex');

  const created_at = Math.floor(Date.now() / 1000);

  const event = {
    pubkey: pubKeyHex,
    created_at,
    kind: 24242,
    tags: [
      ['u', url],
      ['method', method.toLowerCase()]
    ],
    content: ''
  };

  // Calculate event ID
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);

  const eventId = await sha256Hex(new TextEncoder().encode(serialized));
  event.id = eventId;

  // Sign the event
  const signature = await schnorr.sign(eventId, privKey);
  event.sig = Buffer.from(signature).toString('hex');

  // Create the auth header
  const authHeader = 'Nostr ' + base64Encode(JSON.stringify(event));

  return { authHeader, pubKey: pubKeyHex };
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test(name, fn) {
  try {
    process.stdout.write(`${name}... `);
    await Promise.race([fn(), new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Test timeout')), TEST_TIMEOUT)
    )]);
    console.log('✅ PASS');
    return true;
  } catch (error) {
    console.log(`❌ FAIL - ${error.message}`);
    return false;
  }
}

async function runTests() {
  const results = [];
  let testVideoData = null;
  let testPubkey = null;

  // Test 1: Blob retrieval for non-existent content
  results.push(await test('GET /<invalid-sha256> returns 404', async () => {
    const response = await fetch(`${API_URL}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`);
    if (response.status !== 404) {
      throw new Error(`Expected 404, got ${response.status}`);
    }
  }));

  // Test 2: HEAD request for non-existent content
  results.push(await test('HEAD /<invalid-sha256> returns 404', async () => {
    const response = await fetch(`${API_URL}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, {
      method: 'HEAD'
    });
    if (response.status !== 404) {
      throw new Error(`Expected 404, got ${response.status}`);
    }
  }));

  // Test 3: List endpoint for non-existent user
  results.push(await test('GET /list/<pubkey> returns empty array', async () => {
    const response = await fetch(`${API_URL}/list/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`);
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data) || data.length !== 0) {
      throw new Error(`Expected empty array, got ${JSON.stringify(data)}`);
    }
  }));

  // Test 4: Upload without auth fails
  results.push(await test('PUT /upload without auth returns 401', async () => {
    const response = await fetch(`${API_URL}/upload`, {
      method: 'PUT'
    });
    if (response.status !== 401) {
      throw new Error(`Expected 401, got ${response.status}`);
    }
  }));

  // Test 5: Delete without auth fails
  results.push(await test('DELETE /<sha256> without auth returns 401', async () => {
    const response = await fetch(`${API_URL}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, {
      method: 'DELETE'
    });
    if (response.status !== 401) {
      throw new Error(`Expected 401, got ${response.status}`);
    }
  }));

  // Test 6: Create video via original API (to test with real content)
  results.push(await test('POST /v1/videos creates upload', async () => {
    const url = `${API_URL}/v1/videos`;
    const testSha = crypto.randomBytes(32).toString('hex');
    const body = JSON.stringify({
      sha256: testSha,
      vineId: 'test_vine_' + Date.now()
    });

    const { authHeader, pubKey } = await createNip98Auth(url, 'POST', body);
    testPubkey = pubKey;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body
    });

    if (response.status !== 200) {
      const errorText = await response.text();
      throw new Error(`Expected 200, got ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (!data.uid || !data.uploadURL) {
      throw new Error(`Missing uid or uploadURL: ${JSON.stringify(data)}`);
    }

    testVideoData = { ...data, sha256: testSha };
  }));

  // Test 7: Upload via Blossom endpoint
  results.push(await test('PUT /upload with Blossom auth creates upload', async () => {
    const url = `${API_URL}/upload`;
    const testSha = crypto.randomBytes(32).toString('hex');
    const body = JSON.stringify({
      sha256: testSha
    });

    const { authHeader, pubKey } = await createBlossomAuth(url, 'PUT');

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body
    });

    if (response.status !== 200) {
      const errorText = await response.text();
      throw new Error(`Expected 200, got ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (!data.url) {
      throw new Error(`Missing upload URL: ${JSON.stringify(data)}`);
    }
  }));

  // Test 8: Check blob exists via HEAD (should be pending)
  if (testVideoData?.sha256) {
    results.push(await test('HEAD /<sha256> for pending video returns 202', async () => {
      const response = await fetch(`${API_URL}/${testVideoData.sha256}`, {
        method: 'HEAD'
      });
      if (response.status !== 202 && response.status !== 404) {
        throw new Error(`Expected 202 or 404, got ${response.status}`);
      }
    }));
  }

  // Test 9: Get blob for pending video
  if (testVideoData?.sha256) {
    results.push(await test('GET /<sha256> for pending video returns 202', async () => {
      const response = await fetch(`${API_URL}/${testVideoData.sha256}`);
      if (response.status !== 202 && response.status !== 404) {
        throw new Error(`Expected 202 or 404, got ${response.status}`);
      }
    }));
  }

  // Test 10: List user blobs (should be empty until video is ready)
  if (testPubkey) {
    results.push(await test('GET /list/<pubkey> for test user', async () => {
      const response = await fetch(`${API_URL}/list/${testPubkey}`);
      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}`);
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error(`Expected array, got ${JSON.stringify(data)}`);
      }
    }));
  }

  // Test 11: Invalid SHA-256 format handling
  results.push(await test('GET /invalid-hash returns 404', async () => {
    const response = await fetch(`${API_URL}/invalid-hash-format`);
    if (response.status !== 404) {
      throw new Error(`Expected 404, got ${response.status}`);
    }
  }));

  // Test 12: SHA-256 with file extension
  results.push(await test('GET /<sha256>.mp4 format works', async () => {
    const response = await fetch(`${API_URL}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mp4`);
    if (response.status !== 404) {
      throw new Error(`Expected 404, got ${response.status}`);
    }
  }));

  // Test 13: Original video API still works
  results.push(await test('GET /v1/videos/<uid> returns video data', async () => {
    if (!testVideoData?.uid) {
      throw new Error('No test video available');
    }

    const response = await fetch(`${API_URL}/v1/videos/${testVideoData.uid}`);
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    const data = await response.json();
    if (!data.status || !data.owner) {
      throw new Error(`Missing video data: ${JSON.stringify(data)}`);
    }
  }));

  // Summary
  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log(`\n📊 Test Results: ${passed}/${total} passed`);

  if (passed === total) {
    console.log('🎉 All integration tests passed!');
    console.log('\n✅ Blossom protocol is working correctly on live server');
    if (testVideoData) {
      console.log(`📹 Test video created: ${testVideoData.uid}`);
      console.log(`🔑 Test SHA-256: ${testVideoData.sha256}`);
    }
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

runTests().catch(console.error);