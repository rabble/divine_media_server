#!/usr/bin/env node
// ABOUTME: Migration script for moving videos from R2 to Cloudflare Stream
// ABOUTME: Handles bulk migration with progress tracking and error recovery

import fs from 'fs';
import { promisify } from 'util';

const MIGRATION_TOKEN = process.env.MIGRATION_TOKEN || '823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c';
const API_URL = process.env.API_URL || 'https://cf-stream-service-prod.protestnet.workers.dev';
const BATCH_SIZE = 50; // Process 50 videos at a time
const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds between batches

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Single video migration
async function migrateSingleVideo(video) {
  const response = await fetch(`${API_URL}/v1/migrate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MIGRATION_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(video)
  });

  return response.json();
}

// Batch migration
async function migrateBatch(videos, batchId) {
  const response = await fetch(`${API_URL}/v1/migrate/batch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MIGRATION_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      batchId,
      videos
    })
  });

  return response.json();
}

// Process CSV file with video metadata
async function processCSV(filename) {
  const content = fs.readFileSync(filename, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  
  const videos = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const video = {};
    headers.forEach((header, index) => {
      video[header.trim()] = values[index]?.trim();
    });
    videos.push(video);
  }
  
  return videos;
}

// Process JSON file with video list
async function processJSON(filename) {
  const content = fs.readFileSync(filename, 'utf-8');
  return JSON.parse(content);
}

// Main migration function
async function migrate(inputFile) {
  console.log('🚀 Starting R2 to Stream migration');
  console.log(`API: ${API_URL}`);
  console.log(`Input file: ${inputFile}`);
  
  // Load videos from file
  let videos = [];
  if (inputFile.endsWith('.csv')) {
    videos = await processCSV(inputFile);
  } else if (inputFile.endsWith('.json')) {
    videos = await processJSON(inputFile);
  } else {
    console.error('❌ Unsupported file format. Use .csv or .json');
    process.exit(1);
  }
  
  console.log(`📊 Found ${videos.length} videos to migrate`);
  
  // Create output log
  const logFile = `migration_log_${Date.now()}.json`;
  const results = {
    started: new Date().toISOString(),
    totalVideos: videos.length,
    successful: [],
    failed: [],
    skipped: []
  };
  
  // Process in batches
  const batches = [];
  for (let i = 0; i < videos.length; i += BATCH_SIZE) {
    batches.push(videos.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`📦 Processing ${batches.length} batches of up to ${BATCH_SIZE} videos each`);
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchId = `batch_${Date.now()}_${i}`;
    
    console.log(`\n🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} videos)`);
    
    try {
      const result = await migrateBatch(batch, batchId);
      
      console.log(`✅ Batch complete: ${result.successful} succeeded, ${result.failed} failed`);
      
      // Log results
      result.results.forEach(r => {
        if (r.status === 'migrating' || r.status === 'already_migrated') {
          results.successful.push(r);
        } else if (r.status === 'error') {
          results.failed.push(r);
        } else {
          results.skipped.push(r);
        }
      });
      
    } catch (error) {
      console.error(`❌ Batch ${i + 1} failed:`, error.message);
      batch.forEach(video => {
        results.failed.push({
          sourceUrl: video.sourceUrl || video.r2Url || video.url,
          error: error.message
        });
      });
    }
    
    // Save progress after each batch
    fs.writeFileSync(logFile, JSON.stringify(results, null, 2));
    
    // Wait between batches to avoid rate limiting
    if (i < batches.length - 1) {
      console.log(`⏳ Waiting ${DELAY_BETWEEN_BATCHES/1000} seconds before next batch...`);
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }
  
  // Final summary
  results.completed = new Date().toISOString();
  fs.writeFileSync(logFile, JSON.stringify(results, null, 2));
  
  console.log('\n📊 Migration Complete!');
  console.log(`✅ Successful: ${results.successful.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⏭️  Skipped: ${results.skipped.length}`);
  console.log(`📄 Log saved to: ${logFile}`);
}

// Example usage
function showUsage() {
  console.log(`
R2 to Cloudflare Stream Migration Tool

Usage:
  node migrate_r2_videos.mjs <input_file>

Input formats:

1. CSV format (videos.csv):
   sourceUrl,sha256,vineId,originalOwner
   https://r2.example.com/video1.mp4,abc123,vine_1,user123
   https://r2.example.com/video2.mp4,def456,vine_2,user456

2. JSON format (videos.json):
   [
     {
       "sourceUrl": "https://r2.example.com/video1.mp4",
       "sha256": "abc123",
       "vineId": "vine_1",
       "originalOwner": "user123"
     }
   ]

Environment variables:
  MIGRATION_TOKEN - Admin token for migration API
  API_URL - Stream service API URL (default: production)

Example:
  node migrate_r2_videos.mjs videos.csv
  MIGRATION_TOKEN=mytoken node migrate_r2_videos.mjs videos.json
`);
}

// Run migration
const inputFile = process.argv[2];
if (!inputFile) {
  showUsage();
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`❌ File not found: ${inputFile}`);
  process.exit(1);
}

migrate(inputFile).catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});