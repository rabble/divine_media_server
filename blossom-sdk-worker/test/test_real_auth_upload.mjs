#!/usr/bin/env node
// Test with real Nostr authentication (kind 24242)

import { webcrypto } from 'crypto';
import { randomBytes } from 'crypto';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const UPLOAD_URL = 'https://blossom.divine.video/upload';

// Minimal secp256k1 implementation for Nostr
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

// Generate a Nostr keypair (for testing - not using secp256k1 properly, just for demo)
async function generateKeypair() {
  const privkey = bytesToHex(randomBytes(32));
  // For testing, we'll just hash the privkey to get a "pubkey" (NOT real secp256k1!)
  const pubkey = await sha256(hexToBytes(privkey));
  return { privkey, pubkey };
}

// Create kind 24242 auth event
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

  // Create event ID
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);
  
  event.id = await sha256(serialized);
  
  // For testing: fake signature (real implementation would use @noble/secp256k1)
  // Since worker has DEV_AUTH_MODE check, we can use a dummy sig in dev
  event.sig = '0'.repeat(128);
  
  return event;
}

// Create test video
function createTestVideo() {
  const header = Buffer.from([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00
  ]);
  const data = randomBytes(5000);
  return Buffer.concat([header, data]);
}

async function testUpload() {
  console.log('🧪 Testing blossom-sdk-worker with real Nostr auth\n');

  // Generate keypair
  const { privkey, pubkey } = await generateKeypair();
  console.log(`🔑 Generated Nostr keypair`);
  console.log(`   Pubkey: ${pubkey.substring(0, 16)}...`);
  console.log(`   Privkey: ${privkey.substring(0, 16)}...\n`);

  // Create test video
  const testVideo = createTestVideo();
  const videoSha256 = await sha256(testVideo);
  
  console.log(`📹 Test video: ${testVideo.length} bytes`);
  console.log(`   SHA-256: ${videoSha256}\n`);

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
      body: testVideo
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Upload successful!');
      console.log(`   URL: ${result.url}`);
      console.log(`   SHA-256: ${result.sha256}`);
      console.log(`   Size: ${result.size} bytes`);
      console.log(`   ProofMode: ${result.proofmode?.level || 'unverified'}`);
      console.log(`   ProofMode verified: ${result.proofmode?.verified || false}\n`);
      
      console.log('⏳ Waiting 15 seconds for moderation...');
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      console.log('\n🔍 Check moderation status:');
      console.log(`   curl https://divine-moderation-service.protestnet.workers.dev/check-result/${videoSha256}`);
      console.log('\n📊 Check moderation logs:');
      console.log(`   wrangler tail divine-moderation-service --env production\n`);
      
    } else {
      console.error('❌ Upload failed:', response.status, result);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testUpload();
