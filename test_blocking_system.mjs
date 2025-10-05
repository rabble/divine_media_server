#!/usr/bin/env node
// ABOUTME: Comprehensive test suite for content blocking system
// ABOUTME: Tests all blocking endpoints and verifies CDN integration

import { randomBytes } from 'crypto';
import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'https://cf-stream-service-prod.protestnet.workers.dev';
const CDN_URL = 'https://cdn.divine.video';
const ADMIN_TOKEN = process.env.MODERATION_ADMIN_TOKEN || 'test-admin-token-123';

// Test configuration
const TEST_VIDEOS = [
  // Real video hashes from your system (if available)
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // Example hash
  'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', // Another example
];

// Color codes for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

class BlockingSystemTester {
  constructor() {
    this.results = {
      passed: [],
      failed: [],
      warnings: []
    };
  }

  log(message, type = 'info') {
    const prefix = {
      success: `${colors.green}✅`,
      error: `${colors.red}❌`,
      warning: `${colors.yellow}⚠️`,
      info: `${colors.blue}ℹ️`
    }[type] || '';

    console.log(`${prefix} ${message}${colors.reset}`);
  }

  async runTest(name, testFunc) {
    this.log(`Running: ${name}`, 'info');
    try {
      await testFunc();
      this.results.passed.push(name);
      this.log(`Passed: ${name}`, 'success');
    } catch (error) {
      this.results.failed.push({ name, error: error.message });
      this.log(`Failed: ${name} - ${error.message}`, 'error');
    }
  }

  async testBlockEndpoint(sha256) {
    const response = await fetch(`${API_URL}/admin/block/${sha256}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': ADMIN_TOKEN
      },
      body: JSON.stringify({
        reason: 'Test blocking - automated test suite',
        category: 'test',
        severity: 'low',
        notes: 'This is a test block from the automated test suite',
        appealable: true
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(`Block failed: ${JSON.stringify(result)}`);
    }

    return result;
  }

  async testUnblockEndpoint(sha256) {
    const response = await fetch(`${API_URL}/admin/unblock/${sha256}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': ADMIN_TOKEN
      },
      body: JSON.stringify({
        reason: 'Test unblock - automated test suite'
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(`Unblock failed: ${JSON.stringify(result)}`);
    }

    return result;
  }

  async testCheckEndpoint(sha256) {
    const response = await fetch(`${API_URL}/admin/check/${sha256}`, {
      method: 'GET',
      headers: {
        'X-Admin-Token': ADMIN_TOKEN
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Check failed: ${JSON.stringify(result)}`);
    }

    return result;
  }

  async testListBlockedEndpoint() {
    const response = await fetch(`${API_URL}/admin/blocked?limit=10`, {
      method: 'GET',
      headers: {
        'X-Admin-Token': ADMIN_TOKEN
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`List failed: ${JSON.stringify(result)}`);
    }

    return result;
  }

  async testCDNAccess(sha256) {
    const url = `${CDN_URL}/${sha256}.mp4`;

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        timeout: 5000
      });

      return {
        status: response.status,
        blocked: response.status === 451,
        accessible: response.status === 200
      };
    } catch (error) {
      return {
        status: 0,
        error: error.message
      };
    }
  }

  async testTempBlockEndpoint(sha256, duration = 60) {
    const response = await fetch(`${API_URL}/admin/temp-block/${sha256}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': ADMIN_TOKEN
      },
      body: JSON.stringify({
        duration: duration,
        reason: `Test temporary block - ${duration}s`
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(`Temp block failed: ${JSON.stringify(result)}`);
    }

    return result;
  }

  async testBulkBlockEndpoint(hashes) {
    const response = await fetch(`${API_URL}/admin/block-bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': ADMIN_TOKEN
      },
      body: JSON.stringify({
        hashes: hashes,
        reason: 'Bulk test block',
        category: 'test',
        severity: 'medium'
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Bulk block failed: ${JSON.stringify(result)}`);
    }

    return result;
  }

  async runFullBlockingWorkflow(sha256) {
    this.log(`\n${'='.repeat(60)}`, 'info');
    this.log(`Testing Full Blocking Workflow for: ${sha256.substring(0, 16)}...`, 'info');
    this.log(`${'='.repeat(60)}\n`, 'info');

    // Test 1: Check initial status
    await this.runTest('1. Check initial status', async () => {
      const status = await this.testCheckEndpoint(sha256);
      this.log(`   Initial blocked status: ${status.blocked ? 'BLOCKED' : 'NOT BLOCKED'}`);
    });

    // Test 2: Initial CDN access
    await this.runTest('2. Test initial CDN access', async () => {
      const cdn = await this.testCDNAccess(sha256);
      this.log(`   CDN status: ${cdn.status} (${cdn.blocked ? 'BLOCKED' : 'ACCESSIBLE'})`);
    });

    // Test 3: Block the content
    await this.runTest('3. Block content', async () => {
      const result = await this.testBlockEndpoint(sha256);
      this.log(`   Blocked with reason: ${result.data.reason}`);
      this.log(`   Category: ${result.data.category}, Severity: ${result.data.severity}`);
    });

    // Wait for propagation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 4: Verify blocked status
    await this.runTest('4. Verify blocked status', async () => {
      const status = await this.testCheckEndpoint(sha256);
      if (!status.blocked) {
        throw new Error('Content should be blocked but is not');
      }
      this.log(`   Confirmed blocked: ${status.reason}`);
    });

    // Test 5: Test CDN returns 451
    await this.runTest('5. Test CDN returns HTTP 451', async () => {
      const cdn = await this.testCDNAccess(sha256);
      if (cdn.status !== 451) {
        throw new Error(`Expected HTTP 451 but got ${cdn.status}`);
      }
      this.log(`   CDN correctly returns 451 (Unavailable for Legal Reasons)`);
    });

    // Test 6: Unblock the content
    await this.runTest('6. Unblock content', async () => {
      const result = await this.testUnblockEndpoint(sha256);
      this.log(`   Unblocked successfully`);
    });

    // Wait for propagation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 7: Verify unblocked
    await this.runTest('7. Verify unblocked status', async () => {
      const status = await this.testCheckEndpoint(sha256);
      if (status.blocked) {
        throw new Error('Content should be unblocked but is still blocked');
      }
      this.log(`   Confirmed unblocked`);
    });

    // Test 8: Test CDN is accessible again
    await this.runTest('8. Test CDN is accessible', async () => {
      const cdn = await this.testCDNAccess(sha256);
      if (cdn.blocked) {
        throw new Error('CDN should be accessible but is blocked');
      }
      this.log(`   CDN access restored (status: ${cdn.status})`);
    });
  }

  async runTemporaryBlockTest(sha256) {
    this.log(`\n${'='.repeat(60)}`, 'info');
    this.log(`Testing Temporary Block for: ${sha256.substring(0, 16)}...`, 'info');
    this.log(`${'='.repeat(60)}\n`, 'info');

    // Test temporary block
    await this.runTest('1. Apply temporary block (5 seconds)', async () => {
      const result = await this.testTempBlockEndpoint(sha256, 5);
      this.log(`   Expires at: ${new Date(result.data.expiresAt).toISOString()}`);
    });

    // Check immediately
    await this.runTest('2. Verify temporarily blocked', async () => {
      const status = await this.testCheckEndpoint(sha256);
      if (!status.blocked) {
        throw new Error('Content should be temporarily blocked');
      }
      this.log(`   Confirmed blocked until: ${new Date(status.expiresAt).toISOString()}`);
    });

    // Test CDN
    await this.runTest('3. Test CDN returns 451 during temp block', async () => {
      const cdn = await this.testCDNAccess(sha256);
      if (cdn.status !== 451) {
        throw new Error(`Expected HTTP 451 but got ${cdn.status}`);
      }
    });

    // Wait for expiration
    this.log('   Waiting for temporary block to expire...', 'info');
    await new Promise(resolve => setTimeout(resolve, 6000));

    // Check after expiration
    await this.runTest('4. Verify auto-unblocked after expiration', async () => {
      const status = await this.testCheckEndpoint(sha256);
      if (status.blocked) {
        throw new Error('Content should be auto-unblocked after expiration');
      }
      this.log(`   Confirmed auto-unblocked`);
    });
  }

  async runBulkOperationTest(hashes) {
    this.log(`\n${'='.repeat(60)}`, 'info');
    this.log(`Testing Bulk Operations with ${hashes.length} hashes`, 'info');
    this.log(`${'='.repeat(60)}\n`, 'info');

    // Test bulk block
    await this.runTest('1. Bulk block multiple videos', async () => {
      const result = await this.testBulkBlockEndpoint(hashes);
      this.log(`   Successfully blocked: ${result.successful.length}`);
      this.log(`   Failed: ${result.failed.length}`);

      if (result.failed.length > 0) {
        this.log(`   Failed hashes: ${result.failed.map(f => f.sha256.substring(0, 8)).join(', ')}`, 'warning');
      }
    });

    // Verify all are blocked
    await this.runTest('2. Verify all are blocked', async () => {
      for (const hash of hashes) {
        const status = await this.testCheckEndpoint(hash);
        if (!status.blocked) {
          throw new Error(`Hash ${hash.substring(0, 8)} should be blocked`);
        }
      }
      this.log(`   All ${hashes.length} videos confirmed blocked`);
    });

    // List blocked content
    await this.runTest('3. List blocked content', async () => {
      const list = await this.testListBlockedEndpoint();
      this.log(`   Total blocked videos: ${list.count}`);

      if (list.blocked && list.blocked.length > 0) {
        this.log(`   Recent blocks:`, 'info');
        list.blocked.slice(0, 3).forEach(item => {
          this.log(`     - ${item.sha256.substring(0, 16)}... (${item.category}/${item.severity})`);
        });
      }
    });

    // Cleanup - unblock all
    await this.runTest('4. Cleanup - unblock all test videos', async () => {
      for (const hash of hashes) {
        await this.testUnblockEndpoint(hash);
      }
      this.log(`   Cleaned up ${hashes.length} test blocks`);
    });
  }

  async runAuthorizationTests() {
    this.log(`\n${'='.repeat(60)}`, 'info');
    this.log(`Testing Authorization`, 'info');
    this.log(`${'='.repeat(60)}\n`, 'info');

    const testHash = TEST_VIDEOS[0] || 'a'.repeat(64);

    // Test without token
    await this.runTest('1. Block without auth token (should fail)', async () => {
      const response = await fetch(`${API_URL}/admin/block/${testHash}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: 'Unauthorized test' })
      });

      if (response.status !== 401) {
        throw new Error(`Expected 401 but got ${response.status}`);
      }
      this.log(`   Correctly rejected with 401 Unauthorized`);
    });

    // Test with wrong token
    await this.runTest('2. Block with wrong token (should fail)', async () => {
      const response = await fetch(`${API_URL}/admin/block/${testHash}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': 'wrong-token'
        },
        body: JSON.stringify({ reason: 'Wrong token test' })
      });

      if (response.status !== 401) {
        throw new Error(`Expected 401 but got ${response.status}`);
      }
      this.log(`   Correctly rejected wrong token`);
    });

    // Test with correct token
    await this.runTest('3. Block with correct token (should succeed)', async () => {
      const result = await this.testBlockEndpoint(testHash);
      this.log(`   Correctly accepted valid token`);

      // Cleanup
      await this.testUnblockEndpoint(testHash);
    });
  }

  printSummary() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${colors.blue}📊 TEST SUMMARY${colors.reset}`);
    console.log(`${'='.repeat(60)}`);

    console.log(`${colors.green}✅ Passed: ${this.results.passed.length}${colors.reset}`);
    if (this.results.passed.length > 0) {
      this.results.passed.forEach(test => {
        console.log(`   - ${test}`);
      });
    }

    if (this.results.failed.length > 0) {
      console.log(`\n${colors.red}❌ Failed: ${this.results.failed.length}${colors.reset}`);
      this.results.failed.forEach(({ name, error }) => {
        console.log(`   - ${name}: ${error}`);
      });
    }

    if (this.results.warnings.length > 0) {
      console.log(`\n${colors.yellow}⚠️ Warnings: ${this.results.warnings.length}${colors.reset}`);
      this.results.warnings.forEach(warning => {
        console.log(`   - ${warning}`);
      });
    }

    const successRate = (this.results.passed.length / (this.results.passed.length + this.results.failed.length) * 100).toFixed(1);
    const status = this.results.failed.length === 0 ?
      `${colors.green}ALL TESTS PASSED! 🎉${colors.reset}` :
      `${colors.red}SOME TESTS FAILED${colors.reset}`;

    console.log(`\n${status}`);
    console.log(`Success Rate: ${successRate}%`);
    console.log(`${'='.repeat(60)}\n`);

    process.exit(this.results.failed.length === 0 ? 0 : 1);
  }
}

async function generateTestHashes(count = 3) {
  // Generate random SHA-256-like hashes for testing
  const hashes = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(32);
    const hash = bytes.toString('hex');
    hashes.push(hash);
  }
  return hashes;
}

async function main() {
  console.log(`${colors.blue}🚀 Content Blocking System Test Suite${colors.reset}`);
  console.log(`API URL: ${API_URL}`);
  console.log(`CDN URL: ${CDN_URL}`);
  console.log(`Admin Token: ${ADMIN_TOKEN.substring(0, 10)}...`);
  console.log();

  const tester = new BlockingSystemTester();

  // Generate test hashes
  const testHashes = await generateTestHashes(3);
  const primaryTestHash = testHashes[0];

  try {
    // Run authorization tests
    await tester.runAuthorizationTests();

    // Run full blocking workflow
    await tester.runFullBlockingWorkflow(primaryTestHash);

    // Run temporary block test
    await tester.runTemporaryBlockTest(testHashes[1]);

    // Run bulk operations test
    await tester.runBulkOperationTest(testHashes);

  } catch (error) {
    console.error(`\n${colors.red}Fatal error: ${error.message}${colors.reset}`);
    console.error(error.stack);
  }

  // Print summary
  tester.printSummary();
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { BlockingSystemTester, generateTestHashes };