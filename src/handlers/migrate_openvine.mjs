// ABOUTME: Handler for migrating videos from OpenVine CDN to Cloudflare Stream
// ABOUTME: Fetches videos from cdn.openvine.co and uploads them to Stream with NIP-98 auth

import { getStreamUrls } from '../utils/stream_urls.mjs';

// Helper function to fetch from OpenVine API with NIP-98 auth
async function fetchFromOpenVine(url, nip98AuthHeader) {
  const headers = {
    'Accept': 'application/json'
  };
  
  // Add NIP-98 auth if provided
  if (nip98AuthHeader) {
    headers['Authorization'] = nip98AuthHeader;
  }
  
  return await fetch(url, { headers });
}

export async function handleOpenVineMigration(request, env) {
  try {
    // Extract auth header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ 
        error: 'Missing or invalid Authorization header' 
      }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.substring(7);
    
    // Check migration token
    const MIGRATION_TOKEN = env.MIGRATION_TOKEN || '823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c';
    if (token !== MIGRATION_TOKEN) {
      return new Response(JSON.stringify({ 
        error: 'Invalid migration token' 
      }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const body = await request.json();
    const { videoId, vineId, sourceUrl, nip98Auth, useApiEndpoint } = body;

    // Determine source URL
    let videoUrl;
    if (sourceUrl) {
      videoUrl = sourceUrl;
    } else if (videoId) {
      // api.openvine.co serves media, not cdn.openvine.co
      // Media endpoint pattern: https://api.openvine.co/media/{fileId}
      videoUrl = `https://api.openvine.co/media/${videoId}`;
    } else {
      return new Response(JSON.stringify({ 
        error: 'Missing videoId or sourceUrl' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`Starting migration from OpenVine: ${videoUrl}`);

    // Use Stream's copy from URL feature directly (more reliable than upload)
    // Step 1: Copy video to Stream
    const copyResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.STREAM_ACCOUNT_ID}/stream/copy`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.STREAM_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: videoUrl,
          meta: {
            name: vineId || videoId,
            source: 'openvine_migration',
            originalUrl: videoUrl,
            videoId: videoId
          },
          downloadable: true  // Enable MP4 downloads
        })
      }
    );

    if (!copyResponse.ok) {
      const errorText = await copyResponse.text();
      console.error('Stream copy API error:', errorText);
      return new Response(JSON.stringify({ 
        error: 'Failed to copy video to Stream',
        details: errorText
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get the UID from the copy response
    const copyData = await copyResponse.json();
    const uid = copyData.result.uid;
    
    console.log(`Video copied to Stream: ${uid}`);
    
    // Step 2: Enable downloads for the video via separate API call
    // Wait for Stream to fully process the video before enabling downloads
    // Testing shows Stream needs 10-15 seconds after copy API returns
    console.log(`Waiting 15 seconds for Stream to fully process video ${uid} before enabling downloads...`);
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    let downloadStatus = 'not_attempted';
    try {
      const accountId = env.CLOUDFLARE_ACCOUNT_ID || env.STREAM_ACCOUNT_ID;
      const apiToken = env.CLOUDFLARE_API_TOKEN || env.STREAM_API_TOKEN;
      
      console.log(`Attempting to enable downloads for ${uid} with account ${accountId}`);
      if (!apiToken) {
        console.error('ERROR: No API token available for enabling downloads');
        downloadStatus = 'no_token';
        throw new Error('Missing API token');
      }
      
      const enableDownloadResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
      if (enableDownloadResponse.ok) {
        const downloadData = await enableDownloadResponse.json();
        downloadStatus = downloadData.result?.default?.status || 'enabled';
        console.log(`SUCCESS: Downloads enabled for ${uid}, status: ${downloadStatus}`);
      } else {
        const errorText = await enableDownloadResponse.text();
        downloadStatus = 'failed';
        console.error(`FAILED to enable downloads for ${uid}: ${enableDownloadResponse.status} - ${errorText}`);
      }
    } catch (error) {
      console.error(`ERROR enabling downloads for ${uid}:`, error.message);
      downloadStatus = 'error';
    }
    
    console.log(`Download enable status for ${uid}: ${downloadStatus}`);
    
    // Step 3: Store migration record
    const record = {
      status: 'migrated',
      owner: 'openvine_migration',
      migratedFrom: videoUrl,
      videoId: videoId,
      vineId: vineId || videoId,
      uid: uid,
      timestamp: new Date().toISOString()
    };

    // Store in KV using correct namespace and key patterns
    if (env.MEDIA_KV) {
      // Store main video record
      await env.MEDIA_KV.put(`video:${uid}`, JSON.stringify(record));
      
      // Store index for vineId lookup
      await env.MEDIA_KV.put(`idx:vine:${vineId || videoId}`, JSON.stringify({ uid }));
      
      // Store migration-specific record
      await env.MEDIA_KV.put(`migration:openvine:${uid}`, JSON.stringify({
        ...record,
        lookupKey: true
      }));
    }

    // Get URLs
    const urls = getStreamUrls(uid, env);

    return new Response(JSON.stringify({
      status: 'migrated',
      uid: uid,
      videoId: videoId,
      sourceUrl: videoUrl,
      ...urls,
      downloadStatus: downloadStatus,
      message: 'Successfully migrated from OpenVine'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('OpenVine migration error:', error);
    return new Response(JSON.stringify({ 
      error: 'Migration failed',
      message: error.message
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Batch migration endpoint
export async function handleOpenVineBatchMigration(request, env) {
  try {
    // Check auth
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ 
        error: 'Missing or invalid Authorization header' 
      }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.substring(7);
    const MIGRATION_TOKEN = env.MIGRATION_TOKEN || '823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c';
    
    if (token !== MIGRATION_TOKEN) {
      return new Response(JSON.stringify({ 
        error: 'Invalid migration token' 
      }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse request
    const body = await request.json();
    const { videoIds, limit = 10 } = body;

    if (!videoIds || !Array.isArray(videoIds)) {
      return new Response(JSON.stringify({ 
        error: 'Missing or invalid videoIds array' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Limit batch size
    const videosToProcess = videoIds.slice(0, Math.min(limit, 50));
    const results = [];

    for (const videoId of videosToProcess) {
      try {
        // Check if already migrated
        if (env.MEDIA_KV) {
          const existing = await env.MEDIA_KV.get(`idx:vine:openvine_${videoId}`);
          if (existing) {
            const data = JSON.parse(existing);
            results.push({
              videoId: videoId,
              status: 'already_migrated',
              uid: data.uid,
              message: 'Video was previously migrated'
            });
            continue;
          }
        }

        // Migrate video
        const migrationRequest = new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify({
            videoId: videoId,
            vineId: `openvine_${videoId}`
          })
        });

        const migrationResponse = await handleOpenVineMigration(migrationRequest, env);
        const migrationData = await migrationResponse.json();

        results.push({
          videoId: videoId,
          ...migrationData
        });

      } catch (error) {
        results.push({
          videoId: videoId,
          status: 'error',
          error: error.message
        });
      }

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return new Response(JSON.stringify({
      processed: results.length,
      total: videoIds.length,
      results: results
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Batch migration error:', error);
    return new Response(JSON.stringify({ 
      error: 'Batch migration failed',
      message: error.message
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}