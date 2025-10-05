#!/usr/bin/env node
// ABOUTME: Admin CLI tool to block/unblock videos from being served
// ABOUTME: Usage: node admin_block_video.mjs <action> <sha256> [options]

const API_URL = 'https://cf-stream-service-prod.protestnet.workers.dev';

// Get admin token from environment or use test token
const ADMIN_TOKEN = process.env.MODERATION_ADMIN_TOKEN || 'test-admin-token-123';

async function blockVideo(sha256, options = {}) {
  console.log(`🚫 Blocking video: ${sha256}`);

  const response = await fetch(`${API_URL}/admin/block/${sha256}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': ADMIN_TOKEN
    },
    body: JSON.stringify({
      reason: options.reason || 'Admin decision',
      category: options.category || 'manual',
      severity: options.severity || 'high',
      notes: options.notes,
      appealable: options.appealable !== false
    })
  });

  const result = await response.json();

  if (response.ok && result.success) {
    console.log('✅ Video blocked successfully');
    console.log('   Reason:', result.data.reason);
    console.log('   Category:', result.data.category);
    console.log('   Severity:', result.data.severity);
    console.log('   Appealable:', result.data.appealable);
  } else {
    console.error('❌ Failed to block video:', result.error || result.message);
  }

  return result;
}

async function unblockVideo(sha256, options = {}) {
  console.log(`✅ Unblocking video: ${sha256}`);

  const response = await fetch(`${API_URL}/admin/unblock/${sha256}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': ADMIN_TOKEN
    },
    body: JSON.stringify({
      reason: options.reason || 'Admin decision'
    })
  });

  const result = await response.json();

  if (response.ok && result.success) {
    console.log('✅ Video unblocked successfully');
    console.log('   Was blocked:', result.wasBlocked);
  } else {
    console.error('❌ Failed to unblock video:', result.error || result.message);
  }

  return result;
}

async function checkVideo(sha256) {
  console.log(`🔍 Checking video status: ${sha256}`);

  const response = await fetch(`${API_URL}/admin/check/${sha256}`, {
    method: 'GET',
    headers: {
      'X-Admin-Token': ADMIN_TOKEN
    }
  });

  const result = await response.json();

  if (response.ok) {
    console.log('📊 Video Status:');
    console.log('   Blocked:', result.blocked ? '🚫 Yes' : '✅ No');
    if (result.blocked) {
      console.log('   Reason:', result.reason);
      console.log('   Category:', result.category);
      console.log('   Severity:', result.severity);
      console.log('   Appealable:', result.appealable);
      if (result.expiresAt) {
        const expiresIn = Math.floor((result.expiresAt - Date.now()) / 1000);
        console.log('   Expires in:', `${expiresIn} seconds`);
      }
    }
  } else {
    console.error('❌ Failed to check video:', result.error || result.message);
  }

  return result;
}

async function tempBlockVideo(sha256, duration, options = {}) {
  console.log(`⏱️ Temporarily blocking video for ${duration} seconds: ${sha256}`);

  const response = await fetch(`${API_URL}/admin/temp-block/${sha256}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': ADMIN_TOKEN
    },
    body: JSON.stringify({
      duration: duration,
      reason: options.reason || `Temporary ${duration}s block`
    })
  });

  const result = await response.json();

  if (response.ok && result.success) {
    console.log('✅ Video temporarily blocked');
    console.log('   Duration:', `${duration} seconds`);
    console.log('   Expires at:', new Date(result.data.expiresAt).toISOString());
  } else {
    console.error('❌ Failed to temporarily block video:', result.error || result.message);
  }

  return result;
}

async function listBlocked() {
  console.log('📋 Fetching list of blocked videos...');

  const response = await fetch(`${API_URL}/admin/blocked`, {
    method: 'GET',
    headers: {
      'X-Admin-Token': ADMIN_TOKEN
    }
  });

  const result = await response.json();

  if (response.ok) {
    console.log(`\n📊 Blocked Videos (${result.count} total):`);
    console.log('=' .repeat(80));

    if (result.count === 0) {
      console.log('No videos are currently blocked');
    } else {
      result.blocked.forEach((video, index) => {
        console.log(`\n${index + 1}. SHA256: ${video.sha256}`);
        console.log(`   Reason: ${video.reason}`);
        console.log(`   Category: ${video.category}`);
        console.log(`   Severity: ${video.severity}`);
        console.log(`   Blocked at: ${new Date(video.blockedAt).toISOString()}`);
        console.log(`   Blocked by: ${video.blockedBy}`);
        console.log(`   Appealable: ${video.appealable}`);
      });
    }
  } else {
    console.error('❌ Failed to list blocked videos:', result.error || result.message);
  }

  return result;
}

async function testCDNAccess(sha256) {
  console.log(`\n🌐 Testing CDN access for ${sha256}...`);

  const cdnUrl = `https://cdn.divine.video/${sha256}.mp4`;
  console.log(`   URL: ${cdnUrl}`);

  try {
    const response = await fetch(cdnUrl, { method: 'HEAD' });
    console.log(`   Status: ${response.status}`);

    if (response.status === 451) {
      console.log('   🚫 Video is blocked (HTTP 451 - Unavailable for Legal Reasons)');
      return false;
    } else if (response.status === 200) {
      console.log('   ✅ Video is accessible');
      return true;
    } else {
      console.log(`   ⚠️ Unexpected status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error('   ❌ Error testing CDN:', error.message);
    return false;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node admin_block_video.mjs <action> <sha256> [options]');
    console.log('\nActions:');
    console.log('  block <sha256>     - Block a video');
    console.log('  unblock <sha256>   - Unblock a video');
    console.log('  check <sha256>     - Check if video is blocked');
    console.log('  temp <sha256> <seconds> - Temporarily block a video');
    console.log('  list               - List all blocked videos');
    console.log('  test <sha256>      - Test full blocking workflow');
    console.log('\nOptions:');
    console.log('  --reason "text"    - Reason for action');
    console.log('  --category type    - Category (manual, nsfw, violence, etc)');
    console.log('  --severity level   - Severity (low, medium, high, critical)');
    console.log('\nExamples:');
    console.log('  node admin_block_video.mjs block abc123... --reason "Copyright violation"');
    console.log('  node admin_block_video.mjs temp abc123... 3600 --reason "Under review"');
    console.log('  node admin_block_video.mjs test abc123...');
    process.exit(0);
  }

  const action = args[0];
  const sha256 = args[1];

  // Parse options
  const options = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      options[key] = args[i + 1];
      i++;
    }
  }

  try {
    switch (action) {
      case 'block':
        await blockVideo(sha256, options);
        await testCDNAccess(sha256);
        break;

      case 'unblock':
        await unblockVideo(sha256, options);
        await testCDNAccess(sha256);
        break;

      case 'check':
        await checkVideo(sha256);
        await testCDNAccess(sha256);
        break;

      case 'temp':
        const duration = parseInt(args[2]) || 60;
        await tempBlockVideo(sha256, duration, options);
        await testCDNAccess(sha256);
        break;

      case 'list':
        await listBlocked();
        break;

      case 'test':
        console.log('\n🧪 Testing full blocking workflow...');
        console.log('=' .repeat(60));

        // 1. Check initial status
        console.log('\n1️⃣ Initial status:');
        await checkVideo(sha256);
        const initialAccess = await testCDNAccess(sha256);

        // 2. Block the video
        console.log('\n2️⃣ Blocking video:');
        await blockVideo(sha256, { reason: 'Test block', category: 'test' });
        await new Promise(resolve => setTimeout(resolve, 2000));
        const blockedAccess = await testCDNAccess(sha256);

        // 3. Check blocked status
        console.log('\n3️⃣ Checking blocked status:');
        await checkVideo(sha256);

        // 4. Unblock the video
        console.log('\n4️⃣ Unblocking video:');
        await unblockVideo(sha256, { reason: 'Test complete' });
        await new Promise(resolve => setTimeout(resolve, 2000));
        const unblockedAccess = await testCDNAccess(sha256);

        // 5. Summary
        console.log('\n' + '=' .repeat(60));
        console.log('📊 TEST SUMMARY');
        console.log('=' .repeat(60));
        console.log(`Initial access: ${initialAccess ? '✅' : '❌'}`);
        console.log(`After blocking: ${blockedAccess ? '❌ FAIL - Should be blocked' : '✅ Correctly blocked'}`);
        console.log(`After unblocking: ${unblockedAccess ? '✅ Correctly accessible' : '❌ FAIL - Should be accessible'}`);

        if (!blockedAccess && unblockedAccess) {
          console.log('\n✅ All tests passed!');
        } else {
          console.log('\n⚠️ Some tests failed');
        }
        break;

      default:
        console.error('Unknown action:', action);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}