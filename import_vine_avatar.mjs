#!/usr/bin/env node
// ABOUTME: Script to download a single Vine avatar and upload it to R2 storage
// ABOUTME: Fetches avatar from Vine CDN, calculates SHA-256, and stores via Blossom endpoint

import { createHash } from 'crypto';
import fetch from 'node-fetch';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const WORKER_URL = 'https://cf-stream-service-prod.protestnet.workers.dev';

/**
 * Download avatar from Vine CDN
 */
async function downloadAvatar(avatarUrl) {
  console.log(`📸 Downloading avatar from: ${avatarUrl}`);

  const response = await fetch(avatarUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch avatar: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || 'image/jpeg';

  console.log(`   ✅ Downloaded ${Buffer.byteLength(buffer)} bytes`);
  console.log(`   📄 Content-Type: ${contentType}`);

  return {
    buffer: Buffer.from(buffer),
    contentType
  };
}

/**
 * Calculate SHA-256 hash of image data
 */
function calculateSHA256(buffer) {
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * Upload avatar to R2 via Blossom endpoint
 */
async function uploadToR2(imageBuffer, contentType) {
  console.log(`📤 Uploading to R2 storage...`);

  const response = await fetch(`${WORKER_URL}/upload`, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Authorization': 'Nostr pubkey=vine_importer' // For dev/testing
    },
    body: imageBuffer
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload failed: ${error}`);
  }

  const result = await response.json();
  console.log(`   ✅ Upload successful!`);

  return result;
}

/**
 * Main import function
 */
async function importVineAvatar(avatarUrl, userId, metadata = {}) {
  try {
    // 1. Download the avatar
    const { buffer, contentType } = await downloadAvatar(avatarUrl);

    // 2. Calculate SHA-256
    const sha256 = calculateSHA256(buffer);
    console.log(`🔐 SHA-256: ${sha256}`);

    // 3. Determine file extension
    let extension = 'jpg';
    if (contentType.includes('png')) extension = 'png';
    else if (contentType.includes('webp')) extension = 'webp';
    else if (contentType.includes('gif')) extension = 'gif';

    // 4. Upload to R2
    const uploadResult = await uploadToR2(buffer, contentType);

    // 5. Build access URLs
    const cdnUrl = `https://cdn.divine.video/${sha256}.${extension}`;
    const r2Url = `https://r2.divine.video/${sha256}.${extension}`;

    // 6. Create result object
    const result = {
      success: true,
      sha256,
      userId,
      originalUrl: avatarUrl,
      cdnUrl,
      r2Url,
      contentType,
      size: buffer.length,
      extension,
      uploadedAt: new Date().toISOString(),
      ...metadata
    };

    console.log(`\n✨ Avatar Import Complete!`);
    console.log(`   User ID: ${userId}`);
    console.log(`   CDN URL: ${cdnUrl}`);
    console.log(`   R2 URL: ${r2Url}`);
    console.log(`   Size: ${(buffer.length / 1024).toFixed(2)} KB`);

    // 7. Save result to JSON file for record keeping
    const outputFile = `avatar_${userId}_${sha256.substring(0, 8)}.json`;
    writeFileSync(outputFile, JSON.stringify(result, null, 2));
    console.log(`\n📝 Result saved to: ${outputFile}`);

    return result;

  } catch (error) {
    console.error(`\n❌ Import failed:`, error.message);
    return {
      success: false,
      error: error.message,
      userId,
      originalUrl: avatarUrl
    };
  }
}

// Command line usage
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Usage: node import_vine_avatar.mjs <avatar_url> <user_id> [username]

Example:
  node import_vine_avatar.mjs "https://v.cdn.vine.co/r/avatars/1234.jpg" "912345678901234567" "cooluser"
    `);
    process.exit(1);
  }

  const [avatarUrl, userId, username] = args;

  const metadata = username ? { username } : {};

  await importVineAvatar(avatarUrl, userId, metadata);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { importVineAvatar, downloadAvatar, calculateSHA256, uploadToR2 };