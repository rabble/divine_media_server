#!/usr/bin/env node
// Test migration with a sample video

const MIGRATION_TOKEN = '823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c';
const API_URL = 'https://cf-stream-service-prod.protestnet.workers.dev';

async function testMigration() {
  // Test with a public sample video
  const testVideo = {
    sourceUrl: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
    sha256: 'test_migration_' + Date.now(),
    vineId: 'test_vine_' + Date.now(),
    originalOwner: 'test_migration_user'
  };

  console.log('🧪 Testing migration endpoint...');
  console.log('Source:', testVideo.sourceUrl);
  
  try {
    const response = await fetch(`${API_URL}/v1/migrate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MIGRATION_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testVideo)
    });

    const result = await response.json();
    console.log('\nResponse:', JSON.stringify(result, null, 2));
    
    if (result.uid) {
      console.log('\n✅ Migration successful!');
      console.log('Stream UID:', result.uid);
      console.log('Stream URL:', result.streamUrl);
      console.log('Thumbnail:', result.thumbnailUrl);
      
      // Check status
      console.log('\n📊 Checking video status...');
      const statusRes = await fetch(`${API_URL}/v1/videos/${result.uid}`);
      const status = await statusRes.json();
      console.log('Status:', JSON.stringify(status, null, 2));
    } else {
      console.log('\n❌ Migration failed:', result.error || 'Unknown error');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testMigration();