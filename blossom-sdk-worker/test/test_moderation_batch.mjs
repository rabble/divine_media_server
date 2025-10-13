#!/usr/bin/env node
// ABOUTME: Test moderation with multiple videos and verify processing
// ABOUTME: Uploads test videos and checks their moderation status

import { webcrypto } from 'crypto';
import { randomBytes } from 'crypto';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const UPLOAD_URL = 'https://cf-stream-service-prod.protestnet.workers.dev/upload';
const CDN_URL = 'https://cdn.divine.video';

// Create test videos with different sizes
function createTestVideo(sizeMB = 0.1, seed = Math.random()) {
  const sizeBytes = Math.floor(sizeMB * 1024 * 1024);

  // MP4 header
  const header = Buffer.from([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31
  ]);

  // Add seed bytes to make each video unique
  const seedBytes = Buffer.from(seed.toString());
  const data = randomBytes(sizeBytes - header.length - seedBytes.length);

  return Buffer.concat([header, seedBytes, data]);
}

async function calculateSHA256(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function createAuthEvent(sha256) {
  const now = Math.floor(Date.now() / 1000);
  return {
    kind: 24242,
    created_at: now,
    pubkey: 'test_batch_' + Math.random().toString(36).substring(7),
    tags: [
      ['t', 'upload'],
      ['expiration', String(now + 300)],
      ['x', sha256]
    ],
    content: 'Batch test upload',
    id: '0'.repeat(64),
    sig: '0'.repeat(128)
  };
}

async function uploadVideo(videoNum) {
  console.log(`\n📤 Uploading test video #${videoNum}...`);

  const testVideo = createTestVideo(0.05, videoNum); // 50KB videos
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
      console.log(`   ✅ Upload successful`);
      return { sha256, success: true };
    } else {
      console.error(`   ❌ Upload failed: ${response.status}`);
      return { sha256, success: false };
    }
  } catch (error) {
    console.error(`   ❌ Upload error: ${error.message}`);
    return { sha256, success: false };
  }
}

async function checkModerationStatus(sha256) {
  const { execSync } = await import('child_process');

  try {
    // Check moderation result
    const cmd = `wrangler kv key get --namespace-id eee0689974834390acd39d543002cac3 "moderation:${sha256}" 2>&1`;
    const result = execSync(cmd, { encoding: 'utf-8' });

    if (result && !result.includes('Value not found')) {
      try {
        const data = JSON.parse(result);
        return {
          status: 'moderated',
          action: data.action,
          scores: data.scores
        };
      } catch {
        return { status: 'pending' };
      }
    }

    // Check quarantine
    const quarCmd = `wrangler kv key get --namespace-id eee0689974834390acd39d543002cac3 "quarantine:${sha256}" 2>&1`;
    const quarResult = execSync(quarCmd, { encoding: 'utf-8' });

    if (quarResult && !quarResult.includes('Value not found')) {
      return { status: 'quarantined' };
    }

    return { status: 'pending' };
  } catch {
    return { status: 'pending' };
  }
}

async function testCDNAccess(sha256) {
  const url = `${CDN_URL}/${sha256}.mp4`;

  try {
    const response = await fetch(url, { method: 'HEAD' });

    if (response.status === 451) {
      return { accessible: false, reason: 'quarantined' };
    }

    if (response.status === 404) {
      return { accessible: false, reason: 'not_found' };
    }

    if (response.ok) {
      return { accessible: true };
    }

    return { accessible: false, reason: `http_${response.status}` };
  } catch (error) {
    return { accessible: false, reason: 'error' };
  }
}

async function runBatchTest() {
  console.log('🧪 Batch Moderation Test');
  console.log('=' .repeat(60));

  // Upload 3 test videos
  const uploads = [];
  for (let i = 1; i <= 3; i++) {
    const result = await uploadVideo(i);
    if (result.success) {
      uploads.push(result.sha256);
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // Space out uploads
  }

  console.log(`\n✅ Uploaded ${uploads.length} test videos`);
  console.log('⏳ Waiting 10 seconds for moderation processing...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Check moderation status for all
  console.log('\n📊 Checking moderation status...');
  const results = [];

  for (const sha256 of uploads) {
    const status = await checkModerationStatus(sha256);
    const cdn = await testCDNAccess(sha256);

    results.push({
      sha256: sha256.substring(0, 16) + '...',
      moderation: status.status,
      action: status.action || 'N/A',
      cdn: cdn.accessible ? '✅ Accessible' : `❌ ${cdn.reason}`
    });
  }

  // Display results table
  console.log('\n' + '=' .repeat(80));
  console.log('📊 RESULTS SUMMARY');
  console.log('=' .repeat(80));
  console.table(results);

  // Check queue stats
  console.log('\n📈 Queue Statistics:');
  const { execSync } = await import('child_process');
  try {
    const queueList = execSync('wrangler queues list 2>&1', { encoding: 'utf-8' });
    const moderationLine = queueList.split('\n').find(line => line.includes('video-moderation-queue'));
    if (moderationLine) {
      console.log('   ' + moderationLine.trim());
    }
  } catch {}

  // Summary
  const moderated = results.filter(r => r.moderation === 'moderated').length;
  const pending = results.filter(r => r.moderation === 'pending').length;
  const quarantined = results.filter(r => r.moderation === 'quarantined').length;

  console.log('\n📋 Summary:');
  console.log(`   Total Videos: ${uploads.length}`);
  console.log(`   Moderated: ${moderated}`);
  console.log(`   Pending: ${pending}`);
  console.log(`   Quarantined: ${quarantined}`);

  if (moderated > 0) {
    console.log('\n✅ Moderation service is working!');
  } else if (pending === uploads.length) {
    console.log('\n⚠️ All videos still pending - moderation service may be slow or not processing');
    console.log('   Try: wrangler tail divine-moderation-service');
  }
}

runBatchTest().catch(console.error);