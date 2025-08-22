# Cloudflare Stream Serving Costs

## Pricing Structure

Cloudflare Stream has two main cost components:

### 1. Storage Costs (What you pay to keep videos)
- **$5 per 1,000 minutes stored per month**
- Your 150k Vine videos (6 seconds each) = 15,000 minutes
- Storage cost: **$75/month**

### 2. Delivery/Streaming Costs (What you pay when videos are watched)
- **$1 per 1,000 minutes delivered per month**
- This is usage-based - you only pay for what gets watched

## Delivery Cost Calculation for Your Vine Videos

### Scenario 1: Moderate Usage
If each video is watched **10 times per month**:
- 150,000 videos × 10 views × 0.1 minutes = 150,000 minutes delivered
- Delivery cost: 150 × $1 = **$150/month**

### Scenario 2: High Usage  
If each video is watched **100 times per month**:
- 150,000 videos × 100 views × 0.1 minutes = 1,500,000 minutes delivered
- Delivery cost: 1,500 × $1 = **$1,500/month**

### Scenario 3: Viral Content
If 1% of videos go viral (1,500 videos) with 10,000 views each:
- 1,500 videos × 10,000 views × 0.1 minutes = 1,500,000 minutes
- 148,500 regular videos × 10 views × 0.1 minutes = 148,500 minutes
- Total: 1,648,500 minutes delivered
- Delivery cost: 1,649 × $1 = **$1,649/month**

## Total Monthly Costs

| Usage Level | Storage | Delivery | Total Monthly |
|------------|---------|----------|---------------|
| Low (1 view/video) | $75 | $15 | **$90/month** |
| Moderate (10 views/video) | $75 | $150 | **$225/month** |
| High (100 views/video) | $75 | $1,500 | **$1,575/month** |
| Mixed/Viral | $75 | $1,649 | **$1,724/month** |

## Bandwidth & CDN Benefits

### Included with Stream:
- ✅ **Global CDN delivery** - No extra CDN costs
- ✅ **Adaptive bitrate streaming** - Automatic quality adjustment
- ✅ **No bandwidth/egress charges** - Unlike AWS/GCP
- ✅ **DDoS protection** - Cloudflare's network protection
- ✅ **Analytics** - View counts, watch time, etc.

### Traditional CDN Comparison:
With AWS CloudFront or similar:
- Storage: ~$23/TB/month (videos ~45GB = ~$1)
- CDN bandwidth: $0.085/GB (expensive!)
- 1.5M minutes delivered = ~450GB = **$38 in bandwidth alone**
- Plus transcoding costs, origin requests, etc.

## Cost Optimization Strategies

### 1. Implement Caching Headers
```javascript
// In your CDN proxy worker
newHeaders.set('Cache-Control', 'public, max-age=31536000'); // 1 year
newHeaders.set('CDN-Cache-Control', 'max-age=31536000');
```

### 2. Use Signed URLs for Premium Content
Limit access to reduce unnecessary views:
```javascript
// Require signed URLs for certain videos
requireSignedURLs: true,
allowedOrigins: ['https://divine.video']
```

### 3. Implement View Limits
Track views in KV and limit per user:
```javascript
// Example: Limit views per IP
const viewKey = `views:${clientIP}:${videoId}`;
const views = await env.MEDIA_KV.get(viewKey);
if (views > 100) return new Response('View limit exceeded', { status: 429 });
```

### 4. Delete Inactive Content
Remove videos not watched in 90+ days:
```bash
# Monitor and remove inactive content
curl -X GET "https://api.cloudflare.com/client/v4/accounts/{account}/stream?meta.lastViewed=lt:90d" \
  -H "Authorization: Bearer {token}"
```

## Real-World Example

For a Vine-like platform with 150k videos:

**Typical month:**
- Each video viewed average 50 times
- 10% of videos get 80% of views (power law distribution)
- 15,000 videos × 400 views × 0.1 min = 600,000 minutes
- 135,000 videos × 5 views × 0.1 min = 67,500 minutes
- **Total delivery: 667,500 minutes = $668**
- **Storage: $75**
- **Total: $743/month**

## Comparison with Other Platforms

| Service | Storage (15k min) | Delivery (1M min) | Extras |
|---------|-------------------|-------------------|---------|
| **Cloudflare Stream** | $75 | $1,000 | Included CDN, DDoS |
| **AWS (S3 + CloudFront)** | ~$1 | ~$2,500 | Complex pricing |
| **Vimeo Pro** | $240/month | Included (limits) | 1TB/year limit |
| **YouTube** | Free | Free | Ads, no control |
| **Bunny Stream** | $5/TB | $5-30/TB | Varies by region |

## Budget Planning

### For your 150k Vine videos:
- **Minimum** (low traffic): $90/month
- **Expected** (moderate traffic): $225-750/month  
- **Maximum** (viral success): $1,500-2,000/month

### Cost per video:
- Storage: $0.0005/video/month
- Delivery: $0.001 per 10 views
- **Total: ~$0.005/video/month** at moderate usage

## Free Optimizations

1. **Use HLS over MP4** - More efficient streaming
2. **Enable Stream Analytics** - Monitor actual usage
3. **Set up Cloudflare caching** - Reduce repeat deliveries
4. **Use poster images** - Don't autoplay everything
5. **Implement lazy loading** - Only load visible videos

## API to Monitor Costs

```bash
# Get current usage stats
curl -X GET "https://api.cloudflare.com/client/v4/accounts/{account}/stream/storage" \
  -H "Authorization: Bearer {token}"

# Get delivery analytics
curl -X GET "https://api.cloudflare.com/client/v4/accounts/{account}/stream/analytics" \
  -H "Authorization: Bearer {token}"
```

## Summary

For 150k Vine videos (6 seconds each):
- **Fixed cost**: $75/month storage
- **Variable cost**: $1 per 1,000 minutes watched
- **Typical total**: $200-750/month
- **No hidden fees**: CDN, bandwidth, DDoS protection included
- **Much cheaper than traditional CDN** for video delivery