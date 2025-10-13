#!/usr/bin/env node
// Test tiered access control system

import { webcrypto } from 'crypto';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const TEST_VIDEO_SHA256 = '5bf75fcd5929dd403fcf35bbb8c47b7b8eaaabbc9c1fa99767559eeb3eb53d73';
const VIDEO_URL = `https://blossom.divine.video/${TEST_VIDEO_SHA256}.mp4`;

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function sha256(data) {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return bytesToHex(new Uint8Array(hash));
}

async function generateKeypair() {
  const privkey = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const pubkey = await sha256(hexToBytes(privkey));
  return { privkey, pubkey };
}

async function createAuthEvent(pubkey, privkey, sha256Hash, expiration) {
  const event = {
    kind: 24242,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'get'],
      ['x', sha256Hash],
      ['expiration', expiration.toString()]
    ],
    content: 'Access Blossom content',
    pubkey
  };

  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);

  event.id = await sha256(serialized);
  event.sig = '0'.repeat(128); // Dummy sig for dev mode

  return event;
}

async function runTests() {
  console.log('🧪 Testing Tiered Access Control System\n');
  console.log(`Test video: ${TEST_VIDEO_SHA256.substring(0, 16)}...\n`);

  // Test 1: No authentication
  console.log('📋 Test 1: Access without authentication');
  try {
    const response = await fetch(VIDEO_URL);
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('json')) {
      const result = await response.json();
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${result.error}`);
      console.log(`   Message: ${result.message}`);
      console.log(`   Category: ${result.category || 'N/A'}`);
    } else {
      console.log(`   Status: ${response.status}`);
      console.log(`   Content-Type: ${contentType}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log('\n---\n');

  // Test 2: With authentication (but no preferences)
  console.log('📋 Test 2: Access with authentication (no preferences in relay)');
  const { privkey, pubkey } = await generateKeypair();
  console.log(`   Generated pubkey: ${pubkey.substring(0, 16)}...`);

  const expiration = Math.floor(Date.now() / 1000) + 300;
  const authEvent = await createAuthEvent(pubkey, privkey, TEST_VIDEO_SHA256, expiration);
  const authHeader = 'Nostr ' + Buffer.from(JSON.stringify(authEvent)).toString('base64');

  try {
    const response = await fetch(VIDEO_URL, {
      headers: {
        'Authorization': authHeader
      }
    });

    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('json')) {
      const result = await response.json();
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${result.error}`);
      console.log(`   Message: ${result.message}`);
      console.log(`   Category: ${result.category || 'N/A'}`);
      if (result.preferences_url) {
        console.log(`   Preferences URL: ${result.preferences_url}`);
      }
    } else {
      console.log(`   Status: ${response.status}`);
      console.log(`   ✅ Content served! (This shouldn't happen if age-restricted)`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log('\n---\n');

  // Test 3: Check current moderation status
  console.log('📋 Test 3: Check moderation status');
  try {
    const response = await fetch(`https://divine-moderation-service.protestnet.workers.dev/check-result/${TEST_VIDEO_SHA256}`);
    const result = await response.json();

    console.log(`   Moderation action: ${result.moderation?.action || 'N/A'}`);
    console.log(`   Age restricted: ${result.age_restricted ? 'YES' : 'NO'}`);
    console.log(`   Permanent ban: ${result.permanent_ban ? 'YES' : 'NO'}`);
    console.log(`   Legacy quarantine: ${result.quarantine ? 'YES' : 'NO'}`);

    if (result.age_restricted) {
      console.log(`   Category: ${result.age_restricted.category}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log('\n✅ Tests complete\n');
}

runTests();
