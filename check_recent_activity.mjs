#!/usr/bin/env node
// ABOUTME: Check what videos were in the account to understand the deletion impact
// ABOUTME: Analyze the account to see if we deleted important content

const STREAM_TOKEN = 'uJDzTLyLMd8dgUfmH65jkOwD-jeFYNog3MvVQsNW';
const ACCOUNT_ID = 'c84e7a9bf7ed99cb41b8e73566568c75';

async function analyzeAccount() {
  try {
    console.log('🔍 Analyzing remaining videos in account...\n');

    // Get some recent videos to see what's left
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream?per_page=20&sort=created:desc`,
      {
        headers: {
          'Authorization': `Bearer ${STREAM_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();

    console.log('📊 Recent videos (latest first):');
    data.result.forEach((video, i) => {
      const duration = video.duration ? `${video.duration}s` : 'unknown';
      const state = video.status.state;
      console.log(`${i+1}. ${video.uid} - ${state} - ${duration} - ${video.created}`);
    });

    console.log('\n📈 Storage breakdown by state:');

    // Get videos by different states
    const states = ['ready', 'inprogress', 'pendingupload', 'error'];

    for (const state of states) {
      const stateResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream?per_page=50&status=${state}`,
        {
          headers: {
            'Authorization': `Bearer ${STREAM_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const stateData = await stateResponse.json();

      let totalDuration = 0;
      stateData.result.forEach(video => {
        if (video.duration) totalDuration += video.duration;
      });

      console.log(`   ${state}: ${stateData.result.length} videos, ~${(totalDuration/60).toFixed(1)} minutes`);
    }

    // Check if there are any really long videos
    console.log('\n🎬 Looking for long videos...');
    const longVideosResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream?per_page=100&sort=duration:desc`,
      {
        headers: {
          'Authorization': `Bearer ${STREAM_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const longVideos = await longVideosResponse.json();
    console.log('Top 10 longest videos:');
    longVideos.result.slice(0, 10).forEach((video, i) => {
      const duration = video.duration ? `${(video.duration/60).toFixed(1)}min` : 'unknown';
      console.log(`   ${i+1}. ${video.uid} - ${duration} - ${video.status.state}`);
    });

  } catch (error) {
    console.error('💥 Analysis failed:', error.message);
  }
}

analyzeAccount();