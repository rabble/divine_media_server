#!/usr/bin/env node
// ABOUTME: Test concurrent CDN requests to verify HTTP 500 error fixes
// ABOUTME: Simulates high concurrent load to validate rate limiting and caching

import { performance } from 'perf_hooks';

const CDN_URL = 'https://cdn.divine.video';

// Test configuration
const CONCURRENT_REQUESTS = 60; // More than the 50 that was failing
const TEST_ITERATIONS = 3;

// Sample thumbnail URLs (you can add more)
const TEST_URLS = [
  '/1da60abe8f59e89f1b0d0b376015634f/thumbnails/thumbnail.jpg',
  // Add more URLs here if you have them
];

// Statistics tracking
const stats = {
  successful: 0,
  failed500: 0,
  failed429: 0,
  failedOther: 0,
  totalTime: 0,
  responseTimes: [],
  cacheHits: {
    memory: 0,
    edge: 0,
    coalesced: 0,
    r2: 0
  }
};

async function makeRequest(url, requestId) {
  const startTime = performance.now();

  try {
    const response = await fetch(CDN_URL + url, {
      headers: {
        'User-Agent': `CDN-Test-${requestId}`
      }
    });

    const responseTime = performance.now() - startTime;
    stats.responseTimes.push(responseTime);

    // Check monitoring headers
    const cacheStatus = response.headers.get('X-CDN-Cache-Status');
    const processingTime = response.headers.get('X-CDN-Processing-Time');
    const activeR2 = response.headers.get('X-CDN-Active-R2');
    const queueSize = response.headers.get('X-CDN-Queue-Size');
    const memCacheSize = response.headers.get('X-CDN-Memory-Cache-Size');

    // Track cache hit types
    if (cacheStatus === 'memory-hit') stats.cacheHits.memory++;
    else if (cacheStatus === 'edge-hit') stats.cacheHits.edge++;
    else if (cacheStatus === 'coalesced') stats.cacheHits.coalesced++;
    else if (cacheStatus?.includes('r2')) stats.cacheHits.r2++;

    if (response.status === 200) {
      stats.successful++;
      return {
        requestId,
        status: response.status,
        responseTime,
        cacheStatus,
        processingTime,
        activeR2,
        queueSize,
        memCacheSize
      };
    } else if (response.status === 500) {
      stats.failed500++;
      console.error(`❌ Request ${requestId}: HTTP 500 (responseTime: ${responseTime.toFixed(2)}ms)`);
    } else if (response.status === 429) {
      stats.failed429++;
      const retryAfter = response.headers.get('Retry-After');
      console.log(`⚠️ Request ${requestId}: HTTP 429 Rate Limited (retry after ${retryAfter}s)`);
    } else {
      stats.failedOther++;
      console.log(`⚠️ Request ${requestId}: HTTP ${response.status}`);
    }

    return {
      requestId,
      status: response.status,
      responseTime,
      cacheStatus
    };

  } catch (error) {
    stats.failedOther++;
    console.error(`❌ Request ${requestId} failed:`, error.message);
    return {
      requestId,
      status: 'error',
      responseTime: performance.now() - startTime,
      error: error.message
    };
  }
}

async function runConcurrentTest(url, iteration) {
  console.log(`\n🚀 Iteration ${iteration}: Testing ${CONCURRENT_REQUESTS} concurrent requests to ${url}`);
  console.log('━'.repeat(80));

  const startTime = performance.now();

  // Create array of concurrent requests
  const requests = [];
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    requests.push(makeRequest(url, `${iteration}-${i}`));
  }

  // Execute all requests concurrently
  const results = await Promise.all(requests);

  const totalTime = performance.now() - startTime;

  // Analyze results
  const successful = results.filter(r => r.status === 200).length;
  const failed500 = results.filter(r => r.status === 500).length;
  const failed429 = results.filter(r => r.status === 429).length;

  console.log(`\n📊 Results:`);
  console.log(`   ✅ Successful: ${successful}/${CONCURRENT_REQUESTS}`);
  console.log(`   ❌ HTTP 500: ${failed500}`);
  console.log(`   ⚠️ HTTP 429 (Rate Limited): ${failed429}`);
  console.log(`   ⏱️ Total Time: ${totalTime.toFixed(2)}ms`);

  // Show cache statistics from successful requests
  const successfulResults = results.filter(r => r.status === 200);
  if (successfulResults.length > 0) {
    const avgProcessingTime = successfulResults
      .filter(r => r.processingTime)
      .reduce((sum, r) => sum + parseInt(r.processingTime), 0) / successfulResults.length;

    console.log(`\n📈 Performance Metrics:`);
    console.log(`   Avg Processing Time: ${avgProcessingTime.toFixed(2)}ms`);

    // Show cache hit distribution
    const cacheDistribution = {};
    successfulResults.forEach(r => {
      if (r.cacheStatus) {
        cacheDistribution[r.cacheStatus] = (cacheDistribution[r.cacheStatus] || 0) + 1;
      }
    });

    console.log(`\n🎯 Cache Distribution:`);
    Object.entries(cacheDistribution).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} (${((count/successfulResults.length)*100).toFixed(1)}%)`);
    });

    // Show monitoring info from last successful request
    const lastSuccess = successfulResults[successfulResults.length - 1];
    if (lastSuccess.activeR2 || lastSuccess.queueSize || lastSuccess.memCacheSize) {
      console.log(`\n📡 Worker State (from last request):`);
      if (lastSuccess.activeR2) console.log(`   Active R2 Requests: ${lastSuccess.activeR2}`);
      if (lastSuccess.queueSize) console.log(`   Queue Size: ${lastSuccess.queueSize}`);
      if (lastSuccess.memCacheSize) console.log(`   Memory Cache Size: ${lastSuccess.memCacheSize}`);
    }
  }

  return { successful, failed500, failed429, totalTime };
}

async function runTests() {
  console.log('🔧 CDN Concurrent Load Test');
  console.log('Testing fixes for HTTP 500 errors under high concurrent load');
  console.log('═'.repeat(80));

  for (const url of TEST_URLS) {
    console.log(`\n📍 Testing URL: ${url}`);

    for (let i = 1; i <= TEST_ITERATIONS; i++) {
      await runConcurrentTest(url, i);

      // Wait a bit between iterations to let the CDN settle
      if (i < TEST_ITERATIONS) {
        console.log(`\n⏸️ Waiting 2 seconds before next iteration...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  // Final summary
  console.log('\n' + '═'.repeat(80));
  console.log('📊 FINAL TEST SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Total Requests: ${stats.successful + stats.failed500 + stats.failed429 + stats.failedOther}`);
  console.log(`✅ Successful: ${stats.successful} (${((stats.successful/(stats.successful + stats.failed500 + stats.failed429 + stats.failedOther))*100).toFixed(1)}%)`);
  console.log(`❌ HTTP 500 Errors: ${stats.failed500}`);
  console.log(`⚠️ HTTP 429 Rate Limited: ${stats.failed429}`);
  console.log(`❓ Other Failures: ${stats.failedOther}`);

  if (stats.responseTimes.length > 0) {
    const avgResponseTime = stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length;
    const minResponseTime = Math.min(...stats.responseTimes);
    const maxResponseTime = Math.max(...stats.responseTimes);

    console.log(`\n⏱️ Response Times:`);
    console.log(`   Min: ${minResponseTime.toFixed(2)}ms`);
    console.log(`   Avg: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`   Max: ${maxResponseTime.toFixed(2)}ms`);
  }

  console.log(`\n🎯 Cache Hit Statistics:`);
  console.log(`   Memory Hits: ${stats.cacheHits.memory}`);
  console.log(`   Edge Hits: ${stats.cacheHits.edge}`);
  console.log(`   Coalesced Requests: ${stats.cacheHits.coalesced}`);
  console.log(`   R2 Fetches: ${stats.cacheHits.r2}`);

  // Test result
  if (stats.failed500 === 0) {
    console.log('\n✅ SUCCESS: No HTTP 500 errors! The CDN handles concurrent load properly.');
  } else {
    console.log(`\n⚠️ WARNING: Still seeing ${stats.failed500} HTTP 500 errors under load.`);
  }
}

// Run the tests
runTests().catch(console.error);