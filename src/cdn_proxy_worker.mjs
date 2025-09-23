// ABOUTME: CDN proxy worker to serve Stream content from custom domains
// ABOUTME: Deploy this as a separate Worker on cdn.divine.video

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      
      // Extract the path after the domain
      const path = url.pathname + url.search;
      
      // Construct the actual Stream URL
      // Note: Stream uses a different subdomain - customer-4c3uhd5qzuhwz9hu
      const streamUrl = `https://customer-4c3uhd5qzuhwz9hu.cloudflarestream.com${path}`;
      
      // Create new headers without the Host header
      const headers = new Headers(request.headers);
      headers.delete('Host');
      
      // Only include body for methods that support it
      const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method);
      
      // Proxy the request to Stream
      const response = await fetch(streamUrl, {
        method: request.method,
        headers: headers,
        body: hasBody ? request.body : undefined
      });
      
      // Return the response with CORS headers if needed
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      newHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
      
      // Handle MP4 files
      if (path.endsWith('.mp4') || path.includes('/downloads/')) {
        // Always ensure correct content type for MP4
        newHeaders.set('Content-Type', 'video/mp4');
        
        // Check if user wants to force download with ?download=true
        if (url.searchParams.get('download') === 'true') {
          newHeaders.set('Content-Disposition', 'attachment; filename="video.mp4"');
        } else {
          // Allow inline playback by default, but specify filename for saves
          newHeaders.set('Content-Disposition', 'inline; filename="video.mp4"');
        }
      }
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    } catch (error) {
      console.error('CDN proxy error:', error);
      return new Response(JSON.stringify({ 
        error: 'CDN proxy error', 
        message: error.message 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};