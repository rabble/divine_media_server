#!/usr/bin/env node
// ABOUTME: Simple Blossom integration test using dev auth format
// ABOUTME: Tests Blossom endpoints with simplified authentication

const API_URL = process.argv[2] || 'https://cf-stream-service-staging.protestnet.workers.dev';
const TEST_PUBKEY = 'a'.repeat(64);
const TEST_SHA = 'b'.repeat(64);

console.log(`🧪 Testing Blossom Endpoints (Dev Mode): ${API_URL}`);

async function test(name, fn) {
  try {
    process.stdout.write(`${name}... `);
    await fn();
    console.log('✅ PASS');
    return true;
  } catch (error) {
    console.log(`❌ FAIL - ${error.message}`);
    return false;
  }
}

async function runSimpleTests() {
  const results = [];

  // Test 1: Blob retrieval 404
  results.push(await test('GET /<sha256> returns 404', async () => {
    const response = await fetch(`${API_URL}/${TEST_SHA}`);
    if (response.status !== 404) {
      throw new Error(`Expected 404, got ${response.status}`);
    }
  }));

  // Test 2: List empty
  results.push(await test('GET /list/<pubkey> returns empty', async () => {
    const response = await fetch(`${API_URL}/list/${TEST_PUBKEY}`);
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(`Expected array, got ${typeof data}`);
    }
  }));

  // Test 3: Upload with dev auth
  results.push(await test('PUT /upload with dev auth', async () => {
    const response = await fetch(`${API_URL}/upload`, {
      method: 'PUT',
      headers: {
        'Authorization': `Nostr pubkey=${TEST_PUBKEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sha256: TEST_SHA })
    });

    if (response.status !== 200) {
      const errorText = await response.text();
      throw new Error(`Expected 200, got ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (!data.url && !data.uploadURL) {
      throw new Error(`Missing upload URL in response: ${JSON.stringify(data)}`);
    }
  }));

  // Summary
  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log(`\n📊 Results: ${passed}/${total} passed`);

  if (passed === total) {
    console.log('🎉 All Blossom endpoints working!');
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

runSimpleTests().catch(console.error);