// ABOUTME: Handler to enable MP4 downloads for migrated Stream videos
// ABOUTME: Must be called after migration to make videos downloadable

export async function enableDownloads(request, env) {
  try {
    const url = new URL(request.url);
    const uid = url.pathname.split('/').pop();
    
    if (!uid || uid.length !== 32) {
      return new Response(JSON.stringify({ 
        error: 'invalid_uid',
        message: 'Please provide a valid 32-character Stream UID' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Enable downloads via Stream API
    const accountId = env.CLOUDFLARE_ACCOUNT_ID || env.STREAM_ACCOUNT_ID;
    const apiToken = env.CLOUDFLARE_API_TOKEN || env.STREAM_API_TOKEN;
    
    const streamApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`;
    
    const response = await fetch(streamApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      return new Response(JSON.stringify({ 
        error: 'stream_api_error',
        message: data.errors?.[0]?.message || 'Failed to enable downloads',
        details: data
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check download status
    const statusResponse = await fetch(streamApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`
      }
    });

    const statusData = await statusResponse.json();

    return new Response(JSON.stringify({
      success: true,
      uid: uid,
      download: statusData.result?.default || data.result,
      mp4Url: `https://${env.STREAM_DOMAIN || 'customer-4c3uhd5qzuhwz9hu.cloudflarestream.com'}/${uid}/downloads/default.mp4`,
      message: 'Downloads enabled successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Enable downloads error:', error);
    return new Response(JSON.stringify({ 
      error: 'server_error',
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Batch enable downloads for multiple videos
export async function enableDownloadsBatch(request, env) {
  try {
    const { uids } = await request.json();
    
    if (!Array.isArray(uids) || uids.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'invalid_request',
        message: 'Please provide an array of UIDs' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const results = [];
    const errors = [];

    const accountId = env.CLOUDFLARE_ACCOUNT_ID || env.STREAM_ACCOUNT_ID;
    const apiToken = env.CLOUDFLARE_API_TOKEN || env.STREAM_API_TOKEN;
    
    for (const uid of uids) {
      try {
        const streamApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`;
        
        const response = await fetch(streamApiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          results.push({
            uid: uid,
            success: true,
            mp4Url: `https://${env.STREAM_DOMAIN || 'customer-4c3uhd5qzuhwz9hu.cloudflarestream.com'}/${uid}/downloads/default.mp4`
          });
        } else {
          const errorData = await response.json();
          errors.push({
            uid: uid,
            error: errorData.errors?.[0]?.message || 'Failed to enable downloads'
          });
        }
      } catch (error) {
        errors.push({
          uid: uid,
          error: error.message
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      enabled: results.length,
      failed: errors.length,
      results: results,
      errors: errors
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Batch enable downloads error:', error);
    return new Response(JSON.stringify({ 
      error: 'server_error',
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}