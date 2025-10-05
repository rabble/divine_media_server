#!/usr/bin/env node
// ABOUTME: Script to batch enable MP4 downloads for all existing videos
// ABOUTME: Uses pagination to get all UIDs then batch enables downloads

async function enableAllDownloads() {
  const WORKER_URL = 'https://cf-stream-service-prod.protestnet.workers.dev';
  const BATCH_SIZE = 100; // Max batch size for enable-downloads-batch endpoint

  console.log('🚀 Starting batch download enable for all videos...');

  try {
    let cursor = null;
    let totalProcessed = 0;
    let totalEnabled = 0;
    let totalFailed = 0;

    do {
      // Get batch of video UIDs
      console.log(`📋 Fetching video UIDs${cursor ? ` (cursor: ${cursor.substring(0, 20)}...)` : ''}...`);

      const listUrl = `${WORKER_URL}/v1/list-all-uids?limit=1000${cursor ? `&cursor=${cursor}` : ''}`;
      const listResponse = await fetch(listUrl);

      if (!listResponse.ok) {
        throw new Error(`Failed to fetch UIDs: ${listResponse.status}`);
      }

      const listResult = await listResponse.json();
      const { uids, cursor: nextCursor, list_complete } = listResult;

      console.log(`📋 Got ${uids.length} UIDs${list_complete ? ' (final batch)' : ''}`);

      // Process UIDs in batches of 100
      for (let i = 0; i < uids.length; i += BATCH_SIZE) {
        const batch = uids.slice(i, i + BATCH_SIZE);
        console.log(`🔄 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(uids.length/BATCH_SIZE)}: ${batch.length} UIDs...`);

        try {
          const batchResponse = await fetch(`${WORKER_URL}/v1/enable-downloads-batch`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              uids: batch
            })
          });

          if (!batchResponse.ok) {
            console.log(`⚠️  Batch failed with status ${batchResponse.status}`);
            totalFailed += batch.length;
            continue;
          }

          const batchResult = await batchResponse.json();
          totalEnabled += batchResult.enabled || 0;
          totalFailed += batchResult.failed || 0;

          console.log(`✅ Batch result: ${batchResult.enabled} enabled, ${batchResult.failed} failed`);

          // Small delay to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (batchError) {
          console.log(`❌ Batch error:`, batchError.message);
          totalFailed += batch.length;
        }

        totalProcessed += batch.length;
      }

      cursor = nextCursor;
      console.log(`📊 Progress: ${totalProcessed} processed, ${totalEnabled} enabled, ${totalFailed} failed`);

    } while (cursor);

    console.log(`\n🎉 COMPLETE!`);
    console.log(`📊 Final stats:`);
    console.log(`   Total processed: ${totalProcessed}`);
    console.log(`   Successfully enabled: ${totalEnabled}`);
    console.log(`   Failed: ${totalFailed}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
enableAllDownloads();