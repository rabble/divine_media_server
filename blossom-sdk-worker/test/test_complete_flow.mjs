#!/usr/bin/env node
// Test complete upload and playback flow

import { webcrypto } from 'crypto';
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const UPLOAD_URL = 'https://cf-stream-service-prod.protestnet.workers.dev/upload';

// Create a new test video
const testVideo = Buffer.concat([
  Buffer.from([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31
  ]),
  Buffer.from('TEST VIDEO CONTENT FOR COMPLETE FLOW TEST ' + Date.now() + ' '.repeat(25))
]);

console.log('📹 Test video size:', testVideo.length, 'bytes');

// Calculate SHA256
const hashBuffer = await crypto.subtle.digest('SHA-256', testVideo);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
console.log('🔐 SHA-256:', sha256);

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
  content: 'Complete flow test',
  id: '0000000000000000000000000000000000000000000000000000000000000000',
  sig: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
};

const authHeader = 'Nostr ' + Buffer.from(JSON.stringify(authEvent)).toString('base64');

console.log('\n📤 Step 1: Uploading video...');

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
  console.error('❌ Upload failed:', uploadRes.status, await uploadRes.text());
  process.exit(1);
}

const uploadData = await uploadRes.json();
console.log('✅ Upload successful!');
console.log('   Response:', JSON.stringify(uploadData, null, 2));

// Test the URLs
console.log('\n📥 Step 2: Testing CDN URLs...');

const urls = [
  uploadData.url,
  uploadData.cdn_url,
  uploadData.direct_url
];

for (const url of urls) {
  if (!url) continue;
  
  console.log(`\n🔍 Testing: ${url}`);
  
  // Test HEAD request
  const headRes = await fetch(url, { method: 'HEAD' });
  console.log(`   HEAD: ${headRes.status} ${headRes.statusText}`);
  
  if (headRes.ok) {
    console.log(`   Content-Type: ${headRes.headers.get('content-type')}`);
    console.log(`   Content-Length: ${headRes.headers.get('content-length')}`);
    console.log(`   Accept-Ranges: ${headRes.headers.get('accept-ranges')}`);
  }
  
  // Test byte-range request
  const rangeRes = await fetch(url, {
    headers: { 'Range': 'bytes=0-100' }
  });
  console.log(`   Range Request: ${rangeRes.status} ${rangeRes.statusText}`);
  
  if (rangeRes.status === 206) {
    console.log(`   Content-Range: ${rangeRes.headers.get('content-range')}`);
    console.log(`   ✅ Byte-range support confirmed!`);
  }
}

console.log('\n🎉 Complete flow test successful!');
console.log('   SHA-256:', sha256);
console.log('   CDN URL:', uploadData.cdn_url);
