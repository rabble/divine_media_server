# How to Increase Cloudflare Stream Quota

## Current Status
- **Used**: 1080.32 minutes
- **Allocated**: 1000 minutes
- **Status**: OVER QUOTA - Cannot upload new videos

## Steps to Increase Quota

### Option 1: Cloudflare Dashboard (Recommended)

1. **Go to Cloudflare Dashboard**
   - https://dash.cloudflare.com
   - Select your account

2. **Navigate to Stream**
   - Click on "Stream" in the left sidebar
   - Or go directly to: https://dash.cloudflare.com/?to=/:account/stream

3. **Check Storage Usage**
   - Look for "Storage" or "Minutes Used" section
   - Should show something like "1080.32 / 1000 minutes"

4. **Purchase More Storage**
   - Look for "Buy more minutes" or "Upgrade" button
   - Options typically include:
     - Pay-as-you-go: $5 per 1000 minutes stored per month
     - Or subscription plans with included storage

5. **Billing Page Alternative**
   - Go to: https://dash.cloudflare.com/?to=/:account/billing/subscriptions
   - Find "Stream" service
   - Click "Manage subscription" or "Add minutes"

### Option 2: Delete Existing Videos First

If you want to free up space before purchasing:

1. **Go to Stream Videos**
   - https://dash.cloudflare.com/?to=/:account/stream/videos

2. **Delete Test/Unused Videos**
   - Select videos you don't need
   - Click "Delete" to free up minutes
   - This will immediately reduce your usage

3. **Check Which Videos to Delete**
   ```bash
   # List all videos in your Stream account
   curl -X GET "https://api.cloudflare.com/client/v4/accounts/c84e7a9bf7ed99cb41b8e73566568c75/stream" \
     -H "Authorization: Bearer YOUR_STREAM_API_TOKEN" \
     -H "Content-Type: application/json"
   ```

### Option 3: Stream Subscription Plans

Cloudflare Stream pricing (as of 2024):
- **Storage**: $5 per 1,000 minutes stored per month
- **Delivery**: $1 per 1,000 minutes delivered per month
- **Encoding**: Included free

To upgrade to a plan:
1. Go to: https://dash.cloudflare.com/?to=/:account/billing
2. Click on "Plans" or "Subscriptions"
3. Find "Stream" and select a plan

### Quick Fix for Testing

If you just need to test the migration:

```bash
# Delete the test videos we created
# Get list of videos first
curl -X GET "https://api.cloudflare.com/client/v4/accounts/c84e7a9bf7ed99cb41b8e73566568c75/stream" \
  -H "Authorization: Bearer uJDzTLyLMd8dgUfmH65jkOwD-jeFYNog3MvVQsNW" \
  -H "Content-Type: application/json" | jq '.result[] | {uid, created, duration}'

# Delete a specific video
curl -X DELETE "https://api.cloudflare.com/client/v4/accounts/c84e7a9bf7ed99cb41b8e73566568c75/stream/{VIDEO_UID}" \
  -H "Authorization: Bearer uJDzTLyLMd8dgUfmH65jkOwD-jeFYNog3MvVQsNW"
```

## For 150k Video Migration

You'll need substantial storage:
- Assuming average video length of 30 seconds = 0.5 minutes
- 150,000 videos × 0.5 minutes = 75,000 minutes
- Cost: 75,000 ÷ 1,000 × $5 = **$375/month for storage**

Consider:
1. **Migrate in batches** - Start with most important videos
2. **Delete old/unused content** first
3. **Use retention policies** - Auto-delete after X days
4. **Contact Cloudflare Sales** for volume pricing if migrating 150k videos

## Direct Links

- **Stream Dashboard**: https://dash.cloudflare.com/?to=/:account/stream
- **Billing/Subscriptions**: https://dash.cloudflare.com/?to=/:account/billing/subscriptions
- **Stream Pricing**: https://www.cloudflare.com/products/cloudflare-stream/

## Support

If you can't find the upgrade option:
1. Click "Support" in dashboard
2. Or email: support@cloudflare.com
3. Or check: https://developers.cloudflare.com/stream/