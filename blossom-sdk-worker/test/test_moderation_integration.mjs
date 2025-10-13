#!/usr/bin/env node
// ABOUTME: Test the content moderation integration
// ABOUTME: Verifies that uploads trigger moderation and quarantined content is blocked

import { webcrypto } from 'crypto';
import { randomBytes } from 'crypto';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const UPLOAD_URL = 'https://cf-stream-service-prod.protestnet.workers.dev/upload';
const CDN_URL = 'https://cdn.divine.video';

// Create a small test video
function createTestVideo(sizeMB = 0.1) {
  const sizeBytes = Math.floor(sizeMB * 1024 * 1024);

  // MP4 header (minimal valid MP4 structure)
  const header = Buffer.from([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31
  ]);

  // Random video data
  const data = randomBytes(sizeBytes - header.length);

  return Buffer.concat([header, data]);
}

// Calculate SHA-256
async function calculateSHA256(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Create auth event
function createAuthEvent(sha256) {
  const now = Math.floor(Date.now() / 1000);
  return {
    kind: 24242,
    created_at: now,
    pubkey: 'test_pubkey_' + Math.random().toString(36).substring(7),
    tags: [
      ['t', 'upload'],
      ['expiration', String(now + 300)],
      ['x', sha256]
    ],
    content: 'Test upload for moderation',
    id: '0'.repeat(64),
    sig: '0'.repeat(128)
  };
}

async function uploadVideo() {
  console.log('\n📤 Uploading test video...');

  const testVideo = createTestVideo(0.1); // 100KB test video
  const sha256 = await calculateSHA256(testVideo);

  console.log(`   Size: ${(testVideo.length / 1024).toFixed(2)} KB`);
  console.log(`   SHA-256: ${sha256}`);

  const authEvent = createAuthEvent(sha256);
  const authHeader = 'Nostr ' + Buffer.from(JSON.stringify(authEvent)).toString('base64');

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

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Upload successful');
      console.log(`   CDN URL: ${data.cdn_url || data.url}`);
      return { sha256, data };
    } else {
      console.error('❌ Upload failed:', response.status);
      const text = await response.text();
      console.error('   Response:', text);
      return null;
    }
  } catch (error) {
    console.error('❌ Upload error:', error.message);
    return null;
  }
}

async function checkModerationStatus(sha256) {
  // Use wrangler CLI to check KV
  const { execSync } = await import('child_process');

  try {
    // Check moderation result
    const moderationCmd = `wrangler kv:key get --namespace-id=eee0689974834390acd39d543002cac3 "moderation:${sha256}" 2>&1`;
    const moderationResult = execSync(moderationCmd, { encoding: 'utf-8' });

    if (moderationResult && !moderationResult.includes('not found')) {
      const data = JSON.parse(moderationResult);
      console.log('📊 Moderation result:', data);
      return data;
    }

    // Check quarantine status
    const quarantineCmd = `wrangler kv:key get --namespace-id=eee0689974834390acd39d543002cac3 "quarantine:${sha256}" 2>&1`;
    const quarantineResult = execSync(quarantineCmd, { encoding: 'utf-8' });

    if (quarantineResult && !quarantineResult.includes('not found')) {
      const data = JSON.parse(quarantineResult);
      console.log('🚫 Quarantine result:', data);
      return { quarantined: true, ...data };
    }

    return null;
  } catch (error) {
    // Key not found is expected for pending moderation
    return null;
  }
}

async function testCDNAccess(sha256) {
  console.log('\n🌐 Testing CDN access...');

  const cdnUrl = `${CDN_URL}/${sha256}.mp4`;
  console.log(`   URL: ${cdnUrl}`);

  try {
    const response = await fetch(cdnUrl, {
      method: 'HEAD'
    });

    console.log(`   Status: ${response.status}`);

    const quarantineStatus = response.headers.get('X-CDN-Status');
    if (quarantineStatus === 'quarantined') {
      console.log('   🚫 Content is quarantined');
      return false;
    }

    if (response.status === 451) {
      console.log('   🚫 HTTP 451: Content unavailable due to policy violation');
      return false;
    }

    if (response.ok) {
      console.log('   ✅ Content is accessible');
      return true;
    }

    return false;
  } catch (error) {
    console.error('   ❌ CDN error:', error.message);
    return false;
  }
}

async function runTest() {
  console.log('🧪 Content Moderation Integration Test');
  console.log('=' .repeat(60));

  // Step 1: Upload a test video
  const uploadResult = await uploadVideo();
  if (!uploadResult) {
    console.error('Test failed: Could not upload video');
    return;
  }

  const { sha256 } = uploadResult;

  console.log('\n⏳ Waiting 5 seconds for moderation to process...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Step 2: Check moderation status
  console.log('\n🔍 Checking moderation status...');
  const moderationStatus = await checkModerationStatus(sha256);

  if (moderationStatus) {
    console.log('   Action:', moderationStatus.action);
    if (moderationStatus.scores) {
      console.log('   Scores:', moderationStatus.scores);
    }
    if (moderationStatus.quarantined) {
      console.log('   ⚠️ Content has been quarantined');
    }
  } else {
    console.log('   ⏳ Moderation still pending or not found');
  }

  // Step 3: Test CDN access
  const isAccessible = await testCDNAccess(sha256);

  // Step 4: Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('=' .repeat(60));
  console.log(`SHA-256: ${sha256}`);
  console.log(`Upload: ✅ Successful`);
  console.log(`Moderation: ${moderationStatus ? '✅ Processed' : '⏳ Pending'}`);

  if (moderationStatus?.quarantined) {
    console.log(`CDN Access: ${isAccessible ? '❌ FAIL - Should be blocked' : '✅ Correctly blocked'}`);
  } else {
    console.log(`CDN Access: ${isAccessible ? '✅ Accessible' : '⚠️ Not accessible'}`);
  }

  console.log('\n💡 Monitor moderation logs:');
  console.log('   wrangler tail divine-moderation-service');
  console.log('\n💡 Check queue status:');
  console.log('   wrangler queues list');
}

// Run the test
runTest().catch(console.error);