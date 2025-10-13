#!/usr/bin/env node
// Test that the Blossom response follows the spec

import { webcrypto } from 'crypto';
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const UPLOAD_URL = 'https://cf-stream-service-prod.protestnet.workers.dev/upload';

// Create test video
const testVideo = Buffer.concat([
  Buffer.from([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31
  ]),
  Buffer.from('TEST BLOSSOM SPEC ' + Date.now())
]);

const hashBuffer = await crypto.subtle.digest('SHA-256', testVideo);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

console.log('🔍 Testing Blossom BUD-02 response format');
console.log('   SHA-256:', sha256);
console.log('   Size:', testVideo.length, 'bytes\n');

// Create auth event
const now = Math.floor(Date.now() / 1000);
const authEvent = {
  kind: 24242,
  created_at: now,
  pubkey: '0000000000000000000000000000000000000000000000000000000000000000',
  tags: [
    ['t', 'upload'],
    ['expiration', String(now + 300)]
  ],
  content: 'Test Blossom spec compliance',
  id: '0000000000000000000000000000000000000000000000000000000000000000',
  sig: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
};

const authHeader = 'Nostr ' + Buffer.from(JSON.stringify(authEvent)).toString('base64');

const uploadRes = await fetch(UPLOAD_URL, {
  method: 'PUT',
  headers: {
    'Authorization': authHeader,
    'Content-Type': 'video/mp4',
    'Content-Length': testVideo.length.toString()
  },
  body: testVideo
});

if (!uploadRes.ok) {
  console.error('❌ Upload failed:', uploadRes.status);
  process.exit(1);
}

const response = await uploadRes.json();
console.log('📥 Server Response:', JSON.stringify(response, null, 2));

// Validate BUD-02 required fields
console.log('\n✅ BUD-02 Compliance Check:');

const requiredFields = ['url', 'sha256', 'size', 'type', 'uploaded'];
for (const field of requiredFields) {
  const value = response[field];
  const type = typeof value;
  console.log(`   ${field}: ${type === 'undefined' ? '❌ MISSING' : '✅ ' + type + ' = ' + JSON.stringify(value)}`);
}

// Check specific field types
console.log('\n📊 Field Type Validation:');
console.log(`   uploaded is Unix timestamp integer: ${typeof response.uploaded === 'number' ? '✅' : '❌'} (${typeof response.uploaded})`);
console.log(`   size is number: ${typeof response.size === 'number' ? '✅' : '❌'} (${typeof response.size})`);
console.log(`   sha256 matches: ${response.sha256 === sha256 ? '✅' : '❌'}`);

// If uploaded is a number, check if it's a valid Unix timestamp
if (typeof response.uploaded === 'number') {
  const uploadDate = new Date(response.uploaded * 1000);
  console.log(`   uploaded timestamp converts to: ${uploadDate.toISOString()}`);
  const isRecent = Math.abs(Date.now()/1000 - response.uploaded) < 60;
  console.log(`   uploaded timestamp is recent (within 60s): ${isRecent ? '✅' : '❌'}`);
}

console.log('\n🎉 Test complete!');
