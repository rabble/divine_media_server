#!/usr/bin/env node
// Export all migrated video URLs for Nostr event republishing

import fs from 'fs/promises';
import { createWriteStream } from 'fs';

const API_URL = process.env.API_URL || 'https://cf-stream-service-prod.protestnet.workers.dev';
const MIGRATION_TOKEN = process.env.MIGRATION_TOKEN || '823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c';
const ACCOUNT_ID = 'c84e7a9bf7ed99cb41b8e73566568c75';

async function exportMigrationUrls(options = {}) {
  const {
    inputFile = 'r2_videos.jsonl',  // Input file with vineId/sha256 list
    outputFile = 'migration_urls.jsonl',
    batchSize = 100
  } = options;

  console.log('📤 Exporting Migration URLs');
  console.log('Input:', inputFile);
  console.log('Output:', outputFile);
  console.log('');

  // Read input file (expected format: JSONL with {vineId, sha256, r2Key} per line)
  let videos = [];
  try {
    const content = await fs.readFile(inputFile, 'utf-8');
    videos = content.trim().split('\n').map(line => JSON.parse(line));
    console.log(`📊 Found ${videos.length} videos to lookup`);
  } catch (error) {
    console.error('❌ Error reading input file:', error.message);
    console.log('\nExpected format (one JSON object per line):');
    console.log('{"vineId": "vine123", "sha256": "abc...", "r2Key": "videos/123.mp4"}');
    return;
  }

  const outputStream = createWriteStream(outputFile);
  let processed = 0;
  let found = 0;
  let notFound = 0;

  // Process in batches
  for (let i = 0; i < videos.length; i += batchSize) {
    const batch = videos.slice(i, i + batchSize);
    const results = [];

    for (const video of batch) {
      try {
        // Lookup by vineId first, then sha256
        const lookupUrl = new URL(`${API_URL}/v1/lookup`);
        
        if (video.vineId) {
          lookupUrl.searchParams.set('vineId', video.vineId);
        } else if (video.sha256) {
          lookupUrl.searchParams.set('sha256', video.sha256);
        } else {
          console.warn(`⚠️  Skipping video without vineId or sha256:`, video);
          continue;
        }

        const res = await fetch(lookupUrl);
        const data = await res.json();

        if (data.uid) {
          const urlMapping = {
            // Original identifiers
            vineId: video.vineId,
            sha256: video.sha256,
            r2Key: video.r2Key,
            
            // New Stream URLs
            uid: data.uid,
            hlsUrl: data.hlsUrl || `https://customer-${ACCOUNT_ID}.cloudflarestream.com/${data.uid}/manifest/video.m3u8`,
            dashUrl: data.dashUrl || `https://customer-${ACCOUNT_ID}.cloudflarestream.com/${data.uid}/manifest/video.mpd`,
            mp4Url: data.mp4Url || `https://customer-${ACCOUNT_ID}.cloudflarestream.com/${data.uid}/downloads/default.mp4`,
            thumbnailUrl: data.thumbnailUrl || `https://customer-${ACCOUNT_ID}.cloudflarestream.com/${data.uid}/thumbnails/thumbnail.jpg`,
            iframeUrl: `https://customer-${ACCOUNT_ID}.cloudflarestream.com/${data.uid}/iframe`,
            
            // Status
            status: data.status,
            readyToStream: data.readyToStream || data.status === 'ready',
            
            // Metadata
            duration: data.duration,
            size: data.size,
            width: data.width,
            height: data.height,
            
            // Timestamps
            createdAt: data.createdAt,
            exportedAt: new Date().toISOString()
          };

          outputStream.write(JSON.stringify(urlMapping) + '\n');
          found++;
          
          // For Nostr event republishing
          if (video.nostrEventId) {
            urlMapping.nostrEventId = video.nostrEventId;
          }
          
          results.push(urlMapping);
        } else {
          notFound++;
          console.log(`❌ Not found: ${video.vineId || video.sha256}`);
        }

      } catch (error) {
        console.error(`❌ Error looking up ${video.vineId || video.sha256}:`, error.message);
        notFound++;
      }

      processed++;
      if (processed % 100 === 0) {
        console.log(`Progress: ${processed}/${videos.length} (${found} found, ${notFound} not found)`);
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < videos.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  outputStream.end();

  console.log('\n✅ Export Complete!');
  console.log(`Total processed: ${processed}`);
  console.log(`Found: ${found}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Output saved to: ${outputFile}`);
  
  // Print sample for verification
  try {
    const sample = (await fs.readFile(outputFile, 'utf-8')).split('\n')[0];
    if (sample) {
      console.log('\n📋 Sample output:');
      console.log(JSON.stringify(JSON.parse(sample), null, 2));
    }
  } catch {}

  return {
    processed,
    found,
    notFound,
    outputFile
  };
}

// Direct lookup mode - just provide vineIds or sha256s as arguments
async function directLookup() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage modes:');
    console.log('1. Bulk export: node export_migration_urls.mjs < r2_videos.jsonl');
    console.log('2. Direct lookup: node export_migration_urls.mjs [vineId1] [vineId2] ...');
    console.log('3. With options: INPUT=videos.jsonl OUTPUT=urls.jsonl node export_migration_urls.mjs');
    return;
  }

  // Direct lookup mode
  if (args.length > 0 && !args[0].endsWith('.jsonl')) {
    console.log('🔍 Direct lookup mode\n');
    
    for (const id of args) {
      const lookupUrl = new URL(`${API_URL}/v1/lookup`);
      
      // Detect if it's a sha256 (64 chars hex) or vineId
      if (id.match(/^[a-f0-9]{64}$/i)) {
        lookupUrl.searchParams.set('sha256', id);
      } else {
        lookupUrl.searchParams.set('vineId', id);
      }

      try {
        const res = await fetch(lookupUrl);
        const data = await res.json();
        
        if (data.uid) {
          console.log(`✅ ${id}:`);
          console.log(`  UID: ${data.uid}`);
          console.log(`  HLS: ${data.hlsUrl || `https://customer-${ACCOUNT_ID}.cloudflarestream.com/${data.uid}/manifest/video.m3u8`}`);
          console.log(`  MP4: ${data.mp4Url || `https://customer-${ACCOUNT_ID}.cloudflarestream.com/${data.uid}/downloads/default.mp4`}`);
          console.log(`  Thumbnail: ${data.thumbnailUrl || `https://customer-${ACCOUNT_ID}.cloudflarestream.com/${data.uid}/thumbnails/thumbnail.jpg`}`);
          console.log(`  Status: ${data.status}`);
        } else {
          console.log(`❌ ${id}: Not found`);
        }
      } catch (error) {
        console.log(`❌ ${id}: Error - ${error.message}`);
      }
      console.log('');
    }
    return;
  }

  // Bulk export mode
  exportMigrationUrls({
    inputFile: process.env.INPUT || args[0] || 'r2_videos.jsonl',
    outputFile: process.env.OUTPUT || args[1] || 'migration_urls.jsonl',
    batchSize: parseInt(process.env.BATCH_SIZE || '100')
  });
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  directLookup();
}

export { exportMigrationUrls };