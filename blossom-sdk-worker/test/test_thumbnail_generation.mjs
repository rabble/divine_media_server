#!/usr/bin/env node
// ABOUTME: Test thumbnail generation with Cloudflare Media Transformations
// ABOUTME: Verifies that thumbnails are generated once and cached forever in R2

import { webcrypto } from 'crypto';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const CDN_URL = 'https://cdn.divine.video';

// Test SHA-256 from your previous uploads
const testVideos = [
  {
    sha256: '1da60abe8f59e89f1b0d0b376015634f0c0e957c0babe57f3aa0e3bc4c88a54a',
    description: 'Previously stuck video'
  }
];

async function testThumbnailGeneration(video) {
  console.log(`\n📹 Testing thumbnail for: ${video.description}`);
  console.log(`   SHA-256: ${video.sha256}`);

  // Test 1: Direct thumbnail URL (old style)
  const thumbnailUrl = `${CDN_URL}/${video.sha256.substring(0, 8)}/thumbnails/thumbnail.jpg`;
  console.log(`\n🔍 Test 1: Direct thumbnail URL`);
  console.log(`   URL: ${thumbnailUrl}`);

  const startTime = Date.now();
  const response = await fetch(thumbnailUrl);
  const duration = Date.now() - startTime;

  console.log(`   Status: ${response.status}`);
  console.log(`   Response time: ${duration}ms`);
  console.log(`   X-Thumbnail-Status: ${response.headers.get('X-Thumbnail-Status')}`);
  console.log(`   Cache-Control: ${response.headers.get('Cache-Control')}`);

  // Test 2: Media Transformations URL (new style)
  const mediaTransformUrl = `${CDN_URL}/cdn-cgi/media/mode=frame,time=1s,width=640,height=360,fit=cover/${video.sha256}.mp4`;
  console.log(`\n🎬 Test 2: Media Transformations URL`);
  console.log(`   URL: ${mediaTransformUrl}`);

  const startTime2 = Date.now();
  const response2 = await fetch(mediaTransformUrl);
  const duration2 = Date.now() - startTime2;

  console.log(`   Status: ${response2.status}`);
  console.log(`   Response time: ${duration2}ms`);
  console.log(`   X-Thumbnail-Status: ${response2.headers.get('X-Thumbnail-Status')}`);
  console.log(`   Cache-Control: ${response2.headers.get('Cache-Control')}`);

  if (response2.ok) {
    const contentType = response2.headers.get('Content-Type');
    const contentLength = response2.headers.get('Content-Length');
    console.log(`   Content-Type: ${contentType}`);
    console.log(`   Size: ${contentLength ? `${(parseInt(contentLength) / 1024).toFixed(2)} KB` : 'Unknown'}`);
  }

  // Test 3: Verify caching by requesting again
  console.log(`\n⚡ Test 3: Verify caching (second request)`);
  const startTime3 = Date.now();
  const response3 = await fetch(mediaTransformUrl);
  const duration3 = Date.now() - startTime3;

  console.log(`   Status: ${response3.status}`);
  console.log(`   Response time: ${duration3}ms (should be faster if cached)`);
  console.log(`   X-Thumbnail-Status: ${response3.headers.get('X-Thumbnail-Status')}`);

  if (duration3 < duration2 / 2) {
    console.log(`   ✅ Caching works! Second request was ${((1 - duration3/duration2) * 100).toFixed(0)}% faster`);
  } else {
    console.log(`   ⚠️ Caching may not be working optimally`);
  }
}

// Test different time parameters
async function testTimeParameters(sha256) {
  console.log(`\n🕐 Testing different time parameters for ${sha256.substring(0, 8)}...`);

  const times = ['0s', '1s', '2s', '3s'];

  for (const time of times) {
    const url = `${CDN_URL}/cdn-cgi/media/mode=frame,time=${time},width=320,height=180/${sha256}.mp4`;
    const response = await fetch(url);
    console.log(`   time=${time}: ${response.status} ${response.statusText}`);
  }
}

// Main test execution
async function runTests() {
  console.log('🚀 Starting Thumbnail Generation Tests');
  console.log('=====================================');

  for (const video of testVideos) {
    await testThumbnailGeneration(video);
    await testTimeParameters(video.sha256);
  }

  console.log('\n✅ All tests completed!');
}

runTests().catch(console.error);