#!/usr/bin/env node
// ABOUTME: Test script for creating a video upload with simplified auth
// ABOUTME: Uses the pre-prod auth stub format for testing

const API_URL = process.argv[2] || 'https://cf-stream-service-staging.protestnet.workers.dev';

async function testUpload() {
  try {
    // Using the pre-prod auth stub format (simplified)
    const response = await fetch(`${API_URL}/v1/videos`, {
      method: 'POST',
      headers: {
        'Authorization': 'Nostr pubkey=npub1234567890abcdef',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sha256: 'test_sha256_' + Date.now(),
        vineId: 'test_vine_' + Date.now()
      })
    });

    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (data.uid && data.uploadURL) {
      console.log('\n✅ Upload URL created successfully!');
      console.log('UID:', data.uid);
      console.log('Upload URL:', data.uploadURL);
      console.log('Expires at:', new Date(data.expiresAt).toISOString());
      console.log('Owner:', data.owner);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testUpload();