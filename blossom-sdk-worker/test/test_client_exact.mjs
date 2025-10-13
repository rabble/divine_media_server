#!/usr/bin/env node
// Test with exact client parameters

import { webcrypto } from 'crypto';
import { randomBytes } from 'crypto';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const UPLOAD_URL = 'https://cf-stream-service-prod.protestnet.workers.dev/upload';

// Create a realistic size video (300KB like client logs showed)
const testVideo = Buffer.concat([
  // MP4 header
  Buffer.from([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31
  ]),
  // Add random data to reach ~300KB
  randomBytes(317405 - 32)
]);

console.log('📹 Testing with client-sized video');
console.log('   Size:', testVideo.length, 'bytes (matches client logs)');

// Calculate SHA256
const hashBuffer = await crypto.subtle.digest('SHA-256', testVideo);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
console.log('   SHA-256:', sha256);

// Create auth event exactly as client does
const now = Math.floor(Date.now() / 1000);
const authEvent = {
  kind: 24242,
  created_at: now,
  pubkey: '78a5c21b5166dc1474b64ddf7454bf79e6b5d6b4a77148593bf1e866b73c2738',  // Real pubkey from logs
  tags: [
    ['t', 'upload'],
    ['expiration', String(now + 300)],
    ['x', sha256]  // Client includes SHA256 in x tag
  ],
  content: 'Upload video to Blossom server',
  id: '0000000000000000000000000000000000000000000000000000000000000000',
  sig: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
};

const authHeader = 'Nostr ' + Buffer.from(JSON.stringify(authEvent)).toString('base64');

console.log('\n📤 Uploading (matching client request)...');
console.log('   Auth header length:', authHeader.length, 'chars');
console.log('   Content-Type: video/mp4');

try {
  const response = await fetch(UPLOAD_URL, {
    method: 'PUT',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'video/mp4',
      'Content-Length': testVideo.length.toString()
    },
    body: testVideo
  });

  console.log('\n📥 Response Status:', response.status, response.statusText);
  
  const responseText = await response.text();
  
  if (response.ok) {
    const data = JSON.parse(responseText);
    console.log('✅ SUCCESS!');
    console.log('   Response:', JSON.stringify(data, null, 2));
  } else {
    console.log('❌ FAILED');
    console.log('   Response:', responseText);
  }
  
} catch (error) {
  console.error('❌ Request error:', error.message);
}
