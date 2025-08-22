#!/usr/bin/env node
// Test R2 migration endpoints

const MIGRATION_TOKEN = '823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c';
const API_URL = process.env.API_URL || 'https://cf-stream-service-staging.protestnet.workers.dev';

async function testR2Migration() {
  console.log('🚀 Testing R2 Migration Endpoints');
  console.log('API URL:', API_URL);
  console.log('');

  // Test 1: List R2 videos
  console.log('📋 Test 1: Listing R2 videos...');
  try {
    const listRes = await fetch(`${API_URL}/v1/r2/list?prefix=videos/&limit=5`, {
      headers: {
        'Authorization': `Bearer ${MIGRATION_TOKEN}`
      }
    });
    
    const listData = await listRes.json();
    console.log('Response:', JSON.stringify(listData, null, 2));
    
    if (listData.error === "r2_not_configured") {
      console.log('⚠️  R2 bucket not configured yet');
      console.log('Need to create R2 bucket or update bucket name in wrangler.toml');
      return;
    }
    
    if (listData.objects && listData.objects.length > 0) {
      console.log(`✅ Found ${listData.objects.length} videos in R2`);
      
      // Test 2: Migrate single video
      const firstVideo = listData.objects[0];
      console.log('\n📤 Test 2: Migrating single video from R2...');
      console.log('R2 Key:', firstVideo.key);
      
      const migrateRes = await fetch(`${API_URL}/v1/r2/migrate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MIGRATION_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          r2Key: firstVideo.key,
          vineId: `test_r2_${Date.now()}`,
          sha256: `test_sha_${Date.now()}`,
          metadata: {
            test: true,
            timestamp: new Date().toISOString()
          }
        })
      });
      
      const migrateData = await migrateRes.json();
      console.log('Response:', JSON.stringify(migrateData, null, 2));
      
      if (migrateData.uid) {
        console.log('✅ Migration successful!');
        console.log('Stream UID:', migrateData.uid);
        console.log('Stream URL:', migrateData.streamUrl);
      }
      
    } else {
      console.log('⚠️  No videos found in R2 bucket');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 3: Batch migration
  console.log('\n📦 Test 3: Testing batch migration...');
  try {
    const batchRes = await fetch(`${API_URL}/v1/r2/migrate-batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MIGRATION_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prefix: 'videos/',
        limit: 3
      })
    });
    
    const batchData = await batchRes.json();
    console.log('Response:', JSON.stringify(batchData, null, 2));
    
    if (batchData.batchId) {
      console.log('✅ Batch migration initiated');
      console.log('Batch ID:', batchData.batchId);
      console.log('Processed:', batchData.processed);
      console.log('Successful:', batchData.successful);
      console.log('Failed:', batchData.failed);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testR2Migration();