#!/usr/bin/env node
// Upload a test video to verify CDN proxy is working

const API_URL = 'https://cf-stream-service-prod.protestnet.workers.dev';

async function uploadTestVideo() {
  console.log('📤 Uploading test video to Stream...\n');
  
  // Step 1: Create upload URL (using dev auth mode)
  const createRes = await fetch(`${API_URL}/v1/videos`, {
    method: 'POST',
    headers: {
      'Authorization': 'Nostr pubkey=test_uploader',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sha256: 'test_cdn_' + Date.now(),
      vineId: 'cdn_test_' + Date.now()
    })
  });
  
  if (!createRes.ok) {
    const error = await createRes.text();
    console.error('❌ Failed to create upload URL:', error);
    return;
  }
  
  const { uploadURL, uid } = await createRes.json();
  console.log('✅ Got upload URL');
  console.log('   UID:', uid);
  
  // Step 2: Upload a small test video (create a simple one)
  // Using a tiny valid MP4 (base64 encoded minimal video)
  const testVideoBase64 = 'AAAAGGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAr9tZGF0AAACoAYF//+c3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0OCByMjYwMSBhMGNkN2QzIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTEwIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAD2WIhAA3//728P4FNjuZQQAAAu5tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAZAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACGHRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAZAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAgAAAAIAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAAGQAAAAAAAEAAAAAAZBtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAFAAAAAgAFXEAAAAAAAtaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFZpZGVvSGFuZGxlcgAAAAE7bWluZgAAABR2bWhkAAAAAQAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAA+3N0YmwAAACXc3RzZAAAAAAAAAABAAAAh2F2YzEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAACAAIASAAAAEgAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABj//wAAADFhdmNDAWQAC//hABhnZAALrNlfllw4QAAAAwBAAAADAKPFCmWAAQAGaOvjyyLAAAAAGHN0dHMAAAAAAAAAAQAAAAEAAAAgAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAQGN0dHMAAAAAAAAAAgAAAAEAAAAgAAAAAQAAAGAAAAABAAAAIAAAAAEAAAAAAAAAAQAAACAAAAABAAAAYAAAAAEAAAAgAAAAAQAAAAAAAAABAAAAIAAAAAEAAABgAAAAAQAAACAAAABcc3RzYwAAAAAAAAACAAAAAQAAAAIAAAABAAAABgAAAAEAAAACAAAAAQAAAAEAAAABAAAABAAAAAIAAAABAAAAFHN0c3oAAAAAAAAC5gAAAA0AAAA8c3RjbwAAAAAAAAAGAAADVAAAA+AAAAQUAAAEMwAABJEAAATXAAAAGHVkdGEAAABYbWV0YQAAAAAAAAAlaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY1Ni4xNS4xMDI=';
  
  const testVideo = Buffer.from(testVideoBase64, 'base64');
  
  console.log('📤 Uploading test video...');
  const uploadRes = await fetch(uploadURL, {
    method: 'PUT',
    body: testVideo,
    headers: {
      'Content-Length': testVideo.length.toString()
    }
  });
  
  if (!uploadRes.ok) {
    console.error('❌ Upload failed:', uploadRes.status);
    return;
  }
  
  console.log('✅ Video uploaded successfully!\n');
  
  // Step 3: Check status and get URLs
  console.log('🔍 Checking video status...');
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for processing
  
  const statusRes = await fetch(`${API_URL}/v1/videos/${uid}`);
  const status = await statusRes.json();
  
  console.log('📊 Video Status:', status.status);
  console.log('\n🎬 Video URLs:');
  console.log('================================');
  console.log(`UID: ${uid}`);
  console.log(`\nDirect Stream URL:`);
  console.log(`https://customer-c84e7a9bf7ed99cb41b8e73566568c75.cloudflarestream.com/${uid}/manifest/video.m3u8`);
  console.log(`\nCustom Domain URL (via CDN proxy):`);
  console.log(`https://cdn.divine.video/${uid}/manifest/video.m3u8`);
  console.log(`\nThumbnail:`);
  console.log(`https://cdn.divine.video/${uid}/thumbnails/thumbnail.jpg`);
  console.log('================================\n');
  
  // Step 4: Test the CDN proxy
  console.log('🧪 Testing CDN proxy...');
  const cdnTestUrl = `https://cdn.divine.video/${uid}/manifest/video.m3u8`;
  const cdnRes = await fetch(cdnTestUrl, { method: 'HEAD' });
  
  if (cdnRes.ok || cdnRes.status === 200 || cdnRes.status === 302) {
    console.log('✅ CDN proxy is WORKING! Video accessible at:', cdnTestUrl);
  } else {
    console.log(`⚠️  CDN returned status ${cdnRes.status} - video might still be processing`);
    console.log('   Try again in 10-30 seconds');
  }
  
  return uid;
}

uploadTestVideo().catch(console.error);