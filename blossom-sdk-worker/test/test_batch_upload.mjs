#!/usr/bin/env node
// Batch upload multiple test videos

import { webcrypto } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const UPLOAD_URL = 'https://blossom.divine.video/upload';

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
  event.sig = '0'.repeat(128);

  return event;
}

async function uploadVideo(videoPath, filename) {
  const videoBuffer = readFileSync(videoPath);
  const videoSha256 = await sha256(videoBuffer);

  console.log(`\n📹 ${filename}`);
  console.log(`   Size: ${(videoBuffer.length / 1024).toFixed(1)} KB`);
  console.log(`   SHA-256: ${videoSha256.substring(0, 16)}...`);

  const { privkey, pubkey } = await generateKeypair();
  const expiration = Math.floor(Date.now() / 1000) + 300;
  const authEvent = await createAuthEvent(pubkey, privkey, videoSha256, expiration);
  const authHeader = 'Nostr ' + Buffer.from(JSON.stringify(authEvent)).toString('base64');

  try {
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
      console.log(`   ✅ Uploaded successfully`);
      return { success: true, sha256: videoSha256 };
    } else {
      console.log(`   ❌ Failed: ${response.status}`);
      return { success: false, error: result };
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function batchUpload() {
  console.log('🧪 Batch uploading test videos\n');

  const videoDir = 'blossom-sdk-worker/example_vine_porn';
  const files = readdirSync(videoDir).filter(f => f.endsWith('.mp4'));

  console.log(`Found ${files.length} video files\n`);

  const results = [];

  // Upload first 5 videos (to avoid overwhelming the system)
  const filesToUpload = files.slice(0, 5);

  for (const file of filesToUpload) {
    const result = await uploadVideo(join(videoDir, file), file);
    results.push(result);

    // Wait 2 seconds between uploads
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n\n📊 Summary:');
  console.log(`   Successful: ${results.filter(r => r.success).length}`);
  console.log(`   Failed: ${results.filter(r => !r.success).length}`);

  console.log('\n⏳ Waiting 45 seconds for moderation to process all videos...');
  await new Promise(resolve => setTimeout(resolve, 45000));

  console.log('\n✅ Done! Check the admin dashboard:');
  console.log('   https://divine-moderation-service.protestnet.workers.dev/admin/dashboard\n');
}

batchUpload();
