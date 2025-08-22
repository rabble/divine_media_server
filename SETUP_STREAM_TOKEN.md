# Setting Up Cloudflare Stream API Token

## Current Status
The service is deployed but needs a proper Stream API token with the correct permissions.

## Steps to Create Stream API Token

1. Go to Cloudflare Dashboard: https://dash.cloudflare.com/
2. Click on your profile icon (top right) → "My Profile"
3. Go to "API Tokens" tab
4. Click "Create Token"
5. Use "Custom token" template
6. Configure the token:
   - **Token name**: CF Stream Service Token
   - **Permissions**: 
     - Account → Cloudflare Stream → Edit
   - **Account Resources**: 
     - Include → Nos Verse (or select your account)
   - **Client IP Address Filtering** (optional)
   - **TTL** (optional)
7. Click "Continue to summary"
8. Click "Create Token"
9. Copy the token (you won't see it again!)

## Set the Token in Your Service

```bash
# Set for staging (with dev auth mode for testing)
echo "YOUR_STREAM_API_TOKEN_HERE" | wrangler secret put STREAM_API_TOKEN --env staging

# Set for production (requires proper NIP-98 auth)
echo "YOUR_STREAM_API_TOKEN_HERE" | wrangler secret put STREAM_API_TOKEN --env production
```

## Test the Setup

After setting the token, test with staging (which has DEV_AUTH_MODE enabled):

```bash
curl -X POST "https://cf-stream-service-staging.protestnet.workers.dev/v1/videos" \
  -H 'Authorization: Nostr pubkey=npub1234567890abcdef' \
  -H 'Content-Type: application/json' \
  -d '{"sha256":"test_sha256","vineId":"test_vine"}' | jq '.'
```

You should get a response with:
- `uid`: Stream video ID
- `uploadURL`: Direct upload URL for the video
- `expiresAt`: Expiration timestamp
- `owner`: The pubkey from auth

## Webhook Configuration

After successful upload, configure the webhook in Cloudflare Stream dashboard:
1. Go to Stream → Settings → Webhooks
2. Add webhook URL: `https://cf-stream-service-staging.protestnet.workers.dev/v1/stream/webhook`
3. The webhook secret is already configured in the service

## Production Notes

Production requires proper NIP-98 authentication. DEV_AUTH_MODE is only enabled on staging for testing.