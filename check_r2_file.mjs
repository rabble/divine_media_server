#!/usr/bin/env node
// Check if file exists in R2

const sha256 = '3fcd95f5af26f48b0d99e9e6a74f33bfac6c723adb77b15eadbc46cb9b5826cd';

console.log('🔍 Checking R2 for SHA256:', sha256);

// Check via CDN with direct SHA256
const urls = [
  `https://cdn.divine.video/${sha256}`,
  `https://cdn.divine.video/${sha256}.mp4`,
  `https://r2.divine.video/${sha256}.mp4`
];

for (const url of urls) {
  try {
    console.log(`\n📡 Testing: ${url}`);
    const res = await fetch(url, { method: 'HEAD' });
    console.log(`   Status: ${res.status} ${res.statusText}`);
    if (res.ok) {
      console.log(`   ✅ Found! Content-Type: ${res.headers.get('content-type')}, Size: ${res.headers.get('content-length')}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

// Check KV metadata
console.log('\n🔍 Checking KV metadata via API...');
const listUrl = 'https://cf-stream-service-prod.protestnet.workers.dev/v1/media/list?sha256=' + sha256;
const listRes = await fetch(listUrl);
if (listRes.ok) {
  const data = await listRes.json();
  console.log('   KV data:', JSON.stringify(data, null, 2));
} else {
  console.log('   No KV data found');
}
