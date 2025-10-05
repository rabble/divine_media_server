#!/usr/bin/env node
// Debug Stream API issue

const ACCOUNT_ID = 'c84e7a9bf7ed99cb41b8e73566568c75';

console.log('🔍 Debugging Stream API issue...\n');

// First, test with the account ID from the error message
const altAccountId = '5c1b75cf95f77b5c09f8b4087e019a3f';

console.log('Account IDs:');
console.log('  In wrangler.toml:', ACCOUNT_ID);
console.log('  Previously used:', altAccountId);
console.log('');

// The Stream customer subdomain format
const customerSubdomain = 'customer-4c3uhd5qzuhwz9hu';
console.log('Customer subdomain:', customerSubdomain);

// Extract the account hash from the subdomain
// customer-{hash}.cloudflarestream.com
// The hash is a base32-like encoding of part of the account ID

// Try to get the Stream token from the worker
console.log('\n📊 Stream Configuration Check:');
console.log('  STREAM_ACCOUNT_ID should be:', ACCOUNT_ID);
console.log('  Stream URL pattern: https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/stream/direct_upload');

// The actual issue
console.log('\n❌ The problem:');
console.log('  Stream API error 10005 means: "Bad Request: The request was invalid"');
console.log('  This typically happens when:');
console.log('  1. The account doesn\'t have Stream enabled');
console.log('  2. The API token doesn\'t have Stream permissions');  
console.log('  3. The request body is malformed');

console.log('\n📝 Let\'s check what request we\'re sending:');

const requestBody = {
  maxDurationSeconds: 21600,
  requireSignedURLs: false,
  allowedOrigins: ["*"],
  webhookUrl: "https://cf-stream-service-prod.protestnet.workers.dev/v1/stream/webhook",
  meta: {
    name: "blossom-test.mp4",
    sha256: "test",
    blobSize: 1000,
    uploadedVia: "blossom_direct",
    owner: "anonymous"
  }
};

console.log(JSON.stringify(requestBody, null, 2));

console.log('\n⚠️  The issue might be:');
console.log('  - webhookUrl field might not be allowed');
console.log('  - meta fields might have restrictions');
console.log('  - Account might not have Stream subscription active');
