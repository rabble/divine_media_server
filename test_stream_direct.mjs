#!/usr/bin/env node
// Test direct Stream API to diagnose the issue

const STREAM_ACCOUNT_ID = '5c1b75cf95f77b5c09f8b4087e019a3f';
const STREAM_API_TOKEN = process.env.STREAM_API_TOKEN || 'YOUR_TOKEN_HERE';

console.log('🔍 Testing Stream API directly...');
console.log('   Account ID:', STREAM_ACCOUNT_ID);
console.log('   Token:', STREAM_API_TOKEN.substring(0, 10) + '...');

async function testStreamAPI() {
  const url = `https://api.cloudflare.com/client/v4/accounts/${STREAM_ACCOUNT_ID}/stream/direct_upload`;
  
  console.log('\n📤 Creating direct upload URL...');
  console.log('   URL:', url);
  
  const body = {
    maxDurationSeconds: 21600,
    requireSignedURLs: false,
    allowedOrigins: ["*"],
    meta: {
      name: "test-upload.mp4",
      sha256: "test123",
      blobSize: 982,
      uploadedVia: "blossom_direct",
      owner: "test_pubkey"
    }
  };
  
  console.log('   Body:', JSON.stringify(body, null, 2));
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STREAM_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    
    console.log('\n📥 Response Status:', response.status, response.statusText);
    
    const responseText = await response.text();
    console.log('📥 Response Body:', responseText);
    
    if (response.ok) {
      const data = JSON.parse(responseText);
      console.log('\n✅ SUCCESS! Got upload URL:');
      console.log('   UID:', data.result?.uid);
      console.log('   Upload URL:', data.result?.uploadURL);
    } else {
      console.log('\n❌ Stream API request failed');
      try {
        const error = JSON.parse(responseText);
        console.log('   Error:', JSON.stringify(error, null, 2));
      } catch {
        console.log('   Raw error:', responseText);
      }
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

testStreamAPI();
