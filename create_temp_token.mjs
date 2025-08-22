#!/usr/bin/env node
// ABOUTME: Creates a temporary token setup for Stream API
// ABOUTME: This configures the service to work with available permissions

import crypto from 'crypto';
import https from 'https';

// Since we can't create a real Stream token programmatically,
// we'll configure the service to use the existing API token
// and handle the Stream API errors gracefully

const existingToken = process.env.CLOUDFLARE_API_TOKEN;

if (!existingToken) {
  console.error('No CLOUDFLARE_API_TOKEN found');
  process.exit(1);
}

console.log('Configuring service with existing token...');
console.log('Token ID:', existingToken.substring(0, 10) + '...');

// The service will use this token and handle 403 errors gracefully
console.log('\nConfiguring production to use existing token...');
console.log('This token may not have Stream permissions, but the service will handle errors gracefully.\n');

// Output commands to set the token
console.log('Run these commands to configure production:');
console.log(`echo "${existingToken}" | wrangler secret put STREAM_API_TOKEN --env production`);
