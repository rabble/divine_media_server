#!/bin/bash
# Setup Stream custom domains via API

# You need to set these environment variables:
# export CF_API_TOKEN="your-api-token"
# export CF_ACCOUNT_ID="c84e7a9bf7ed99cb41b8e73566568c75"

if [ -z "$CF_API_TOKEN" ]; then
  echo "Please set CF_API_TOKEN environment variable"
  exit 1
fi

ACCOUNT_ID="${CF_ACCOUNT_ID:-c84e7a9bf7ed99cb41b8e73566568c75}"

echo "Setting up Stream custom domains for account: $ACCOUNT_ID"
echo ""

# Check if custom domains are available
echo "Checking Stream settings..."
curl -X GET "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/settings" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" | jq .

echo ""
echo "Attempting to add custom domain..."

# Try to add custom domain (this endpoint might not exist for all plans)
curl -X POST "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/custom_hostnames" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "hostname": "cdn.divine.video"
  }' | jq .

echo ""
echo "If the above failed, custom domains might not be available on your Stream plan."
echo "Alternative: Use Workers to proxy requests from your domain to Stream."