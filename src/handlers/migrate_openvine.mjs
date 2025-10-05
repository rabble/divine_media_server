// ABOUTME: Handler for migrating videos from OpenVine CDN to Cloudflare Stream
// ABOUTME: Fetches videos from cdn.openvine.co and uploads them to Stream with NIP-98 auth

import { getStreamUrls } from '../utils/stream_urls.mjs';
import { enableDownloadsAsync } from '../utils/auto_enable_downloads.mjs';
import { fetchAndHash, dualStoreVideo } from '../utils/dual_storage.mjs';

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

    console.log(`🌿 OPENVINE: Starting hybrid migration from: ${videoUrl}`);

    try {
      // Step 1: Check if already migrated
      const existingByVineId = vineId ? await env.MEDIA_KV.get(`idx:vine:${vineId}`) : null;
      if (existingByVineId) {
        const data = JSON.parse(existingByVineId);
        const urls = getStreamUrls(data.uid, env);
        return new Response(JSON.stringify({
          status: 'already_migrated',
          uid: data.uid,
          videoId: videoId,
          vineId: vineId,
          message: 'OpenVine video already migrated to hybrid storage',
          ...urls
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Step 2: Fetch video and calculate SHA-256
      const videoData = await fetchAndHash(videoUrl, { fetch });

      // Check for existing video by SHA-256
      const existingBySHA = await env.MEDIA_KV.get(`idx:sha256:${videoData.sha256}`);
      if (existingBySHA) {
        const data = JSON.parse(existingBySHA);

        // Update vineId mapping if needed
        if (vineId) {
          await env.MEDIA_KV.put(`idx:vine:${vineId}`, JSON.stringify({ uid: data.uid }));
        }

        const urls = getStreamUrls(data.uid, env);
        return new Response(JSON.stringify({
          status: 'already_migrated',
          uid: data.uid,
          sha256: videoData.sha256,
          videoId: videoId,
          vineId: vineId,
          message: 'OpenVine video already exists (detected via SHA-256)',
          ...urls
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Step 3: Dual store in Stream + R2
      const dualStoreMetadata = {
        name: vineId || videoId || `openvine-${videoData.sha256.substring(0, 8)}`,
        owner: 'openvine_migration',
        vineId: vineId || videoId,
        videoId: videoId,
        source: 'openvine_migration',
        originalUrl: videoUrl,
        migratedFrom: videoUrl,
        size: videoData.size
      };

      const deps = { fetch, now: () => Date.now() };
      const storeResult = await dualStoreVideo(
        videoData.blob,
        videoData.sha256,
        env,
        dualStoreMetadata,
        deps
      );

      if (!storeResult.uid) {
        return new Response(JSON.stringify({
          error: 'Failed to store OpenVine video in hybrid storage',
          errors: storeResult.errors,
          videoUrl: videoUrl
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Step 4: Create OpenVine-specific indexes
      if (vineId) {
        await env.MEDIA_KV.put(`idx:vine:${vineId}`, JSON.stringify({ uid: storeResult.uid }));
      }

      // Store migration-specific record
      await env.MEDIA_KV.put(`migration:openvine:${storeResult.uid}`, JSON.stringify({
        videoId: videoId,
        vineId: vineId || videoId,
        sourceUrl: videoUrl,
        sha256: videoData.sha256,
        timestamp: new Date().toISOString(),
        hybridStorage: true,
        lookupKey: true
      }));

      // Step 5: Auto-enable Stream MP4 downloads (backup for R2)
      if (storeResult.streamSuccess) {
        enableDownloadsAsync(storeResult.uid, env, deps, {
          logPrefix: "🌿 OPENVINE",
          initialDelay: 15000,  // OpenVine needs longer processing time
          maxRetries: 5         // More retries for complex migrations
        });
      }

      console.log(`✅ OPENVINE: Hybrid migration completed for ${videoData.sha256} -> UID: ${storeResult.uid}`);
      console.log(`📊 OPENVINE: Storage results - Stream: ${storeResult.streamSuccess}, R2: ${storeResult.r2Success}`);

      return new Response(JSON.stringify({
        status: 'hybrid_migration_completed',
        uid: storeResult.uid,
        sha256: videoData.sha256,
        videoId: videoId,
        vineId: vineId,
        sourceUrl: videoUrl,
        storageResults: {
          stream: storeResult.streamSuccess,
          r2: storeResult.r2Success
        },
        ...storeResult.urls,
        message: 'Successfully migrated from OpenVine to hybrid storage'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('🌿 OPENVINE: Hybrid migration error:', error);
      return new Response(JSON.stringify({
        error: 'OpenVine migration failed',
        message: error.message,
        videoUrl: videoUrl
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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