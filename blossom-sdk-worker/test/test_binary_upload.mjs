#!/usr/bin/env node
// Test binary upload exactly as Flutter client does

import { webcrypto } from 'crypto';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const UPLOAD_URL = 'https://cf-stream-service-prod.protestnet.workers.dev/upload';

// Create a minimal MP4 file (same as Flutter test)
const testVideo = Buffer.concat([
  // MP4 ftyp header
  Buffer.from([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31
  ]),
  // Test data
  Buffer.from('test video content for blossom upload '.repeat(25))
]);

console.log('📹 Test video size:', testVideo.length, 'bytes');

// Calculate SHA256
const hashBuffer = await crypto.subtle.digest('SHA-256', testVideo);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
console.log('🔐 SHA-256:', sha256);

// Create auth event (same structure as Flutter)
const now = Math.floor(Date.now() / 1000);
const authEvent = {
  kind: 24242,
  created_at: now,
  pubkey: '0000000000000000000000000000000000000000000000000000000000000000',
  tags: [
    ['t', 'upload'],
    ['expiration', String(now + 300)]
  ],
  content: 'Test Blossom upload',
  id: '0000000000000000000000000000000000000000000000000000000000000000',
  sig: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
};

const authHeader = 'Nostr ' + Buffer.from(JSON.stringify(authEvent)).toString('base64');

console.log('\n📤 Uploading to:', UPLOAD_URL);
console.log('   Content-Type: video/mp4');
console.log('   Content-Length:', testVideo.length);

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
  console.log('📥 Response Body:', responseText);

  if (response.ok) {
    const data = JSON.parse(responseText);
    console.log('\n✅ SUCCESS! Got response:');
    console.log('   SHA-256:', data.sha256);
    console.log('   URL:', data.url);
    console.log('   Size:', data.size);
  } else {
    console.log('\n❌ Upload failed');

    // Parse error if JSON
    try {
      const error = JSON.parse(responseText);
      console.log('   Error:', error.error);
      console.log('   Status:', error.status);
      console.log('   Details:', error.details || error.message || '(none)');
    } catch (e) {
      console.log('   Raw error:', responseText);
    }
  }

} catch (error) {
  console.error('❌ Request failed:', error.message);
}