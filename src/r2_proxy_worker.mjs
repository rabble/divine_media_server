// ABOUTME: R2 proxy worker to serve R2 content from custom domains
// ABOUTME: Deploy this to handle r2.divine.video requests

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Extract the path after the domain
    const path = url.pathname + url.search;
    
    // Construct the actual R2 public URL
    const r2Url = `https://pub-9aabd5174f254ffba8cacfee9ef11a89.r2.dev${path}`;
    
    // Proxy the request to R2
    const response = await fetch(r2Url, {
      method: request.method,
      headers: request.headers
    });
    
    // Return the response with proper headers
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }
};