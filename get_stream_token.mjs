#!/usr/bin/env node
// ABOUTME: Script to help get Stream API token from Cloudflare
// ABOUTME: Opens browser to create token with correct permissions

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function getStreamToken() {
  const tokenUrl = 'https://dash.cloudflare.com/profile/api-tokens';
  console.log('Opening Cloudflare Dashboard to create Stream API token...');
  console.log('\nPlease follow these steps:');
  console.log('1. Click "Create Token"');
  console.log('2. Use "Custom token" template');
  console.log('3. Set permissions: Account → Cloudflare Stream → Edit');
  console.log('4. Select "Nos Verse" account');
  console.log('5. Create the token and copy it');
  console.log('\nOpening browser...');
  
  try {
    await execAsync(`open "${tokenUrl}"`);
  } catch (e) {
    console.log(`\nPlease open this URL manually: ${tokenUrl}`);
  }
  
  console.log('\n📋 Once you have the token, run:');
  console.log('echo "YOUR_TOKEN_HERE" | wrangler secret put STREAM_API_TOKEN --env production');
  console.log('echo "YOUR_TOKEN_HERE" | wrangler secret put STREAM_API_TOKEN --env staging');
}

getStreamToken();
