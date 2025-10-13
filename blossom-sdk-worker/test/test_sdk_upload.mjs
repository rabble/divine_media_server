#!/usr/bin/env node
// Quick test of blossom-sdk-worker upload with moderation integration

import { webcrypto } from 'crypto';
import { randomBytes } from 'crypto';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const UPLOAD_URL = 'https://blossom.divine.video/upload';

// Create a small test video
function createTestVideo() {
  const header = Buffer.from([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00
  ]);
  const data = randomBytes(5000); // 5KB
  return Buffer.concat([header, data]);
}

async function calculateSHA256(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function testUpload() {
  console.log('🧪 Testing blossom-sdk-worker upload + moderation integration\n');

  const testVideo = createTestVideo();
  const sha256 = await calculateSHA256(testVideo);

  console.log(`📹 Test video: ${testVideo.length} bytes`);
  console.log(`🔑 SHA-256: ${sha256}\n`);

  // Simple dev auth
  const authHeader = 'Nostr pubkey=test' + Date.now().toString(36);

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
      console.log(`   ProofMode: ${result.proofmode?.level || 'unverified'}\n`);
      
      console.log('⏳ Waiting 10 seconds for moderation...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      console.log('🔍 Checking moderation status...');
      console.log(`   Run: curl https://divine-moderation-service.protestnet.workers.dev/check-result/${sha256}`);
      
    } else {
      console.error('❌ Upload failed:', result);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testUpload();
