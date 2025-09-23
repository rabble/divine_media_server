// ABOUTME: Landing page handler for the root path
// ABOUTME: Displays service information and link to main site

export function homePage(req, env, deps) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Divine Video Streaming Service</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      padding: 48px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      max-width: 600px;
      text-align: center;
    }
    h1 {
      color: #333;
      margin: 0 0 16px 0;
      font-size: 2.5em;
      font-weight: 700;
    }
    .subtitle {
      color: #666;
      font-size: 1.2em;
      margin-bottom: 32px;
      line-height: 1.6;
    }
    .stats {
      display: flex;
      justify-content: space-around;
      margin: 40px 0;
      padding: 24px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .stat {
      text-align: center;
    }
    .stat-value {
      font-size: 2em;
      font-weight: bold;
      color: #667eea;
    }
    .stat-label {
      color: #888;
      font-size: 0.9em;
      margin-top: 4px;
    }
    .link {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      font-weight: 600;
      transition: transform 0.2s, box-shadow 0.2s;
      margin-top: 20px;
    }
    .link:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
    }
    .tech {
      margin-top: 40px;
      padding-top: 32px;
      border-top: 1px solid #e0e0e0;
      color: #888;
      font-size: 0.9em;
    }
    .tech-item {
      display: inline-block;
      background: #f5f5f5;
      padding: 6px 12px;
      border-radius: 4px;
      margin: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎬 Divine Video</h1>
    <div class="subtitle">
      Video hosting and streaming service powered by Cloudflare Stream
    </div>
    
    <div class="stats">
      <div class="stat">
        <div class="stat-value">∞</div>
        <div class="stat-label">Scalability</div>
      </div>
      <div class="stat">
        <div class="stat-value">Global</div>
        <div class="stat-label">CDN Coverage</div>
      </div>
      <div class="stat">
        <div class="stat-value">HLS</div>
        <div class="stat-label">Streaming</div>
      </div>
    </div>
    
    <p style="color: #666; line-height: 1.8; margin: 32px 0;">
      This API service handles video uploads, transcoding, and delivery for the Divine Video platform. 
      Videos are processed automatically and served through Cloudflare's global network.
    </p>
    
    <a href="https://divine.video" class="link">Visit Divine Video →</a>
    
    <div class="tech">
      <div style="margin-bottom: 12px; color: #666;">Powered by</div>
      <span class="tech-item">Cloudflare Stream</span>
      <span class="tech-item">Workers</span>
      <span class="tech-item">KV Storage</span>
      <span class="tech-item">R2 Storage</span>
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}