#!/usr/bin/env node
// Instructions to create a Cloudflare Stream API token

console.log(`
📺 To enable thumbnail generation, you need a valid Cloudflare Stream API token.

Steps to create one:

1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use "Custom token" template
4. Configure permissions:
   - Account > Cloudflare Stream:Edit
   - Account > Account Settings:Read (optional)
5. Account Resources: Include > Your account
6. Click "Continue to summary" and "Create Token"
7. Copy the token

Then set it as a secret:
wrangler secret put STREAM_API_TOKEN --env production

Current account ID: c84e7a9bf7ed99cb41b8e73566568c75

Without a valid Stream token, videos are stored in R2 only and thumbnails 
must be generated client-side.
`);
