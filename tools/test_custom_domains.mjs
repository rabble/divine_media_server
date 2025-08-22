#!/usr/bin/env node
// Test all custom domains are working correctly

const domains = {
  'Stream Production': 'cdn.divine.video',
  'Stream Staging': 'cdn-staging.divine.video',
  'R2 Production': 'r2.divine.video',
  'R2 Staging': 'r2-staging.divine.video'
};

const testUrls = {
  // Test Stream domains (need a real video UID)
  'cdn.divine.video': '/[REPLACE_WITH_VIDEO_UID]/manifest/video.m3u8',
  'cdn-staging.divine.video': '/[REPLACE_WITH_VIDEO_UID]/manifest/video.m3u8',
  
  // Test R2 domains (these should work if files exist)
  'r2.divine.video': '/videos/test.mp4',
  'r2-staging.divine.video': '/videos/test.mp4'
};

async function testDomain(name, domain) {
  console.log(`\n📍 Testing ${name}: ${domain}`);
  
  try {
    // Test DNS resolution
    const dnsResponse = await fetch(`https://${domain}`, {
      method: 'HEAD',
      redirect: 'manual'
    }).catch(err => ({ ok: false, status: 0, error: err.message }));
    
    if (dnsResponse.status === 0) {
      console.log(`  ❌ DNS not resolving or SSL issue`);
      return false;
    }
    
    console.log(`  ✅ DNS resolves (Status: ${dnsResponse.status})`);
    
    // Test specific path if available
    const testPath = testUrls[domain];
    if (testPath && !testPath.includes('[REPLACE')) {
      const fullUrl = `https://${domain}${testPath}`;
      console.log(`  🔍 Testing: ${fullUrl}`);
      
      const response = await fetch(fullUrl, {
        method: 'HEAD'
      }).catch(err => ({ ok: false, status: 0 }));
      
      if (response.ok) {
        console.log(`  ✅ Content accessible`);
      } else if (response.status === 404) {
        console.log(`  ⚠️  404 - File doesn't exist (domain works though)`);
      } else {
        console.log(`  ⚠️  Status: ${response.status}`);
      }
    }
    
    return true;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return false;
  }
}

async function testAllDomains() {
  console.log('🧪 Testing Custom Domains for Divine Video\n');
  console.log('=' .repeat(50));
  
  let results = {};
  
  for (const [name, domain] of Object.entries(domains)) {
    results[domain] = await testDomain(name, domain);
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:\n');
  
  for (const [domain, success] of Object.entries(results)) {
    console.log(`  ${success ? '✅' : '❌'} ${domain}`);
  }
  
  // Check R2 bucket access directly
  console.log('\n📦 R2 Public Access Test:');
  const r2PublicUrl = 'https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev';
  try {
    const r2Response = await fetch(r2PublicUrl, { method: 'HEAD' });
    console.log(`  ✅ R2 public URL working: ${r2PublicUrl}`);
  } catch (error) {
    console.log(`  ❌ R2 public URL not accessible`);
  }
  
  // Next steps
  console.log('\n📝 Next Steps:');
  
  if (!results['cdn.divine.video'] || !results['cdn-staging.divine.video']) {
    console.log('\n1. Configure Stream custom domains:');
    console.log('   - Go to Cloudflare Dashboard → Stream → Settings');
    console.log('   - Add custom hostnames: cdn.divine.video and cdn-staging.divine.video');
  }
  
  console.log('\n2. To test with a real video:');
  console.log('   - Upload a test video to get a UID');
  console.log('   - Replace [REPLACE_WITH_VIDEO_UID] in this script');
  console.log('   - Run the test again');
  
  console.log('\n3. Test API endpoints:');
  console.log('   curl https://cf-stream-service-prod.protestnet.workers.dev/v1/lookup?vineId=test');
}

testAllDomains();