#!/usr/bin/env node
// Test upload with real video file

import { webcrypto } from 'crypto';
import { readFileSync } from 'fs';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const UPLOAD_URL = 'https://blossom.divine.video/upload';

// Minimal functions for Nostr auth
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
      ['t', 'upload'],
      ['x', sha256Hash],
      ['expiration', expiration.toString()]
    ],
    content: 'Upload to Blossom',
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

async function testUpload(videoPath) {
  console.log('🧪 Testing blossom-sdk-worker with REAL video file\n');

  // Read video file
  const videoBuffer = readFileSync(videoPath);
  const videoSha256 = await sha256(videoBuffer);

  console.log(`📹 Real video: ${videoPath}`);
  console.log(`   Size: ${videoBuffer.length} bytes (${(videoBuffer.length / 1024).toFixed(1)} KB)`);
  console.log(`   SHA-256: ${videoSha256}\n`);

  // Generate keypair
  const { privkey, pubkey } = await generateKeypair();
  console.log(`🔑 Generated Nostr keypair`);
  console.log(`   Pubkey: ${pubkey.substring(0, 16)}...\n`);

  // Create auth event
  const expiration = Math.floor(Date.now() / 1000) + 300; // 5 min
  const authEvent = await createAuthEvent(pubkey, privkey, videoSha256, expiration);

  console.log(`✍️  Created kind 24242 auth event`);
  console.log(`   Event ID: ${authEvent.id.substring(0, 16)}...\n`);

  // Encode auth header
  const authHeader = 'Nostr ' + Buffer.from(JSON.stringify(authEvent)).toString('base64');

  try {
    console.log('📤 Uploading to blossom.divine.video...');
    const response = await fetch(UPLOAD_URL, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'video/mp4'
      },
      body: videoBuffer
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Upload successful!');
      console.log(`   URL: ${result.url}`);
      console.log(`   SHA-256: ${result.sha256}`);
      console.log(`   Size: ${result.size} bytes`);
      console.log(`   ProofMode: ${result.proofmode?.level || 'unverified'}\n`);

      console.log('⏳ Waiting 30 seconds for Sightengine moderation...');
      await new Promise(resolve => setTimeout(resolve, 30000));

      console.log('\n🔍 Check moderation status:');
      console.log(`   curl https://divine-moderation-service.protestnet.workers.dev/check-result/${videoSha256}`);
      console.log('\n📊 Check moderation logs:');
      console.log(`   wrangler tail divine-moderation-service\n`);

      // Check result
      const checkResponse = await fetch(`https://divine-moderation-service.protestnet.workers.dev/check-result/${videoSha256}`);
      const checkResult = await checkResponse.json();

      console.log('\n📋 Moderation result:');
      console.log(JSON.stringify(checkResult, null, 2));

    } else {
      console.error('❌ Upload failed:', response.status, result);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Use first video file
const videoPath = process.argv[2] || 'blossom-sdk-worker/example_vine_porn/xvideos.com_336023e33f8838cec10d19da4852e0bf-2.mp4';
testUpload(videoPath);
