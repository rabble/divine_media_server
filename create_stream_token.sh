#!/bin/bash
# Create a new API token with Stream permissions
# This requires the Cloudflare email and global API key

echo "Creating Stream API token..."

# The permission ID for Stream:Edit
STREAM_PERMISSION="f7f0eda5697f475c90846e879bab8666"
ACCOUNT_ID="c84e7a9bf7ed99cb41b8e73566568c75"

# Create token request
REQUEST_BODY=$(cat <<JSON
{
  "name": "CF Stream Service Token $(date +%s)",
  "policies": [
    {
      "effect": "allow",
      "resources": {
        "com.cloudflare.api.account.$ACCOUNT_ID": "*"
      },
      "permission_groups": [
        {
          "id": "$STREAM_PERMISSION"
        }
      ]
    }
  ]
}
JSON
)

echo "$REQUEST_BODY"
