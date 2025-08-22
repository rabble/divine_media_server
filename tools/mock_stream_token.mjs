#!/usr/bin/env node
// ABOUTME: Creates a mock Stream API token for local testing
// ABOUTME: This allows testing the service without real Stream API access

import crypto from 'crypto';

const mockToken = crypto.randomBytes(40).toString('base64url');
console.log('Mock Stream API Token (for testing only):');
console.log(mockToken);
console.log('\nTo use this mock token for testing:');
console.log(`echo "${mockToken}" | wrangler secret put STREAM_API_TOKEN --env staging`);
console.log('\nNote: This will only work with a mock Stream API endpoint.');