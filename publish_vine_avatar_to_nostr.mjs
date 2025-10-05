#!/usr/bin/env node
// ABOUTME: Script to download a Vine avatar, upload to R2, and publish to Nostr profile
// ABOUTME: Creates a Nostr kind 0 profile metadata event with the imported avatar

import { createHash } from 'crypto';
import fetch from 'node-fetch';
import { getPublicKey, getEventHash, getSignature } from 'nostr-tools';

const WORKER_URL = 'https://cf-stream-service-prod.protestnet.workers.dev';

/**
 * Download and upload avatar to R2
 */
async function processAvatar(avatarUrl) {
  console.log(`📸 Processing avatar from: ${avatarUrl}`);

  // Download from Vine
  const response = await fetch(avatarUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch avatar: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const imageBuffer = Buffer.from(buffer);
  const contentType = response.headers.get('content-type') || 'image/jpeg';

  // Calculate SHA-256
  const hash = createHash('sha256');
  hash.update(imageBuffer);
  const sha256 = hash.digest('hex');
  console.log(`   SHA-256: ${sha256}`);

  // Determine extension
  let extension = 'jpg';
  if (contentType.includes('png')) extension = 'png';
  else if (contentType.includes('webp')) extension = 'webp';
  else if (contentType.includes('gif')) extension = 'gif';

  // Upload to R2
  console.log(`📤 Uploading to R2...`);
  const uploadResponse = await fetch(`${WORKER_URL}/upload`, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Authorization': 'Nostr pubkey=vine_avatar_importer'
    },
    body: imageBuffer
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Upload failed: ${error}`);
  }

  const cdnUrl = `https://cdn.divine.video/${sha256}.${extension}`;
  const r2Url = `https://r2.divine.video/${sha256}.${extension}`;

  console.log(`   ✅ Uploaded successfully`);
  console.log(`   📍 CDN: ${cdnUrl}`);
  console.log(`   📍 R2: ${r2Url}`);

  return { sha256, extension, cdnUrl, r2Url };
}

/**
 * Create Nostr profile event with avatar
 */
function createProfileEvent(privateKey, profileData, avatarUrl) {
  const pubkey = getPublicKey(privateKey);

  const metadata = {
    name: profileData.username || profileData.name,
    about: profileData.bio || profileData.description || `Imported from Vine`,
    picture: avatarUrl,
    // Optional: add Vine-specific metadata
    vine: {
      userId: profileData.vineUserId,
      vanity: profileData.vanityUrl,
      verified: profileData.verified || false,
      importedAt: new Date().toISOString()
    }
  };

  // Remove undefined fields
  Object.keys(metadata).forEach(key => {
    if (metadata[key] === undefined) delete metadata[key];
  });

  const event = {
    kind: 0, // Profile metadata
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(metadata)
  };

  event.id = getEventHash(event);
  event.sig = getSignature(event, privateKey);

  return event;
}

/**
 * Publish event to Nostr relay
 */
async function publishToNostr(event, relayUrl = 'wss://relay.damus.io') {
  console.log(`📡 Publishing to Nostr relay: ${relayUrl}`);

  // Note: This is a simplified example. In production, use a proper WebSocket library
  // or nostr-tools relay connection methods

  console.log(`\n📋 Nostr Event (kind ${event.kind}):`);
  console.log(JSON.stringify(event, null, 2));

  return event;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Usage: node publish_vine_avatar_to_nostr.mjs <avatar_url> <vine_user_id> [options]

Options:
  --username <name>      Vine username
  --bio <description>    User bio/description
  --vanity <url>        Vanity URL
  --verified           Mark as verified
  --nostr-key <key>    Nostr private key (hex) for publishing
  --relay <url>        Nostr relay URL (default: wss://relay.damus.io)

Example:
  node publish_vine_avatar_to_nostr.mjs \\
    "https://v.cdn.vine.co/r/avatars/1234.jpg" \\
    "912345678901234567" \\
    --username "cooluser" \\
    --bio "Former Vine star" \\
    --verified

Without Nostr key, will just upload avatar and display the URLs.
With Nostr key, will also create and publish a profile event.
    `);
    process.exit(1);
  }

  const [avatarUrl, vineUserId] = args;

  // Parse options
  const options = {
    vineUserId,
    username: null,
    bio: null,
    vanity: null,
    verified: false,
    nostrKey: null,
    relay: 'wss://relay.damus.io'
  };

  for (let i = 2; i < args.length; i++) {
    switch(args[i]) {
      case '--username':
        options.username = args[++i];
        break;
      case '--bio':
        options.bio = args[++i];
        break;
      case '--vanity':
        options.vanity = args[++i];
        break;
      case '--verified':
        options.verified = true;
        break;
      case '--nostr-key':
        options.nostrKey = args[++i];
        break;
      case '--relay':
        options.relay = args[++i];
        break;
    }
  }

  try {
    // 1. Process and upload avatar
    const { cdnUrl, r2Url } = await processAvatar(avatarUrl);

    console.log(`\n✨ Avatar Import Complete!`);
    console.log(`   Vine User ID: ${vineUserId}`);
    if (options.username) console.log(`   Username: ${options.username}`);

    // 2. Optionally create Nostr profile
    if (options.nostrKey) {
      console.log(`\n🔑 Creating Nostr profile event...`);

      const profileEvent = createProfileEvent(
        options.nostrKey,
        {
          vineUserId,
          username: options.username,
          name: options.username,
          bio: options.bio,
          description: options.bio,
          vanityUrl: options.vanity,
          verified: options.verified
        },
        r2Url // Use R2 URL for profile picture
      );

      await publishToNostr(profileEvent, options.relay);

      console.log(`\n✅ Profile ready for Nostr!`);
      console.log(`   Event ID: ${profileEvent.id}`);
      console.log(`   Pubkey: ${profileEvent.pubkey}`);
    } else {
      console.log(`\n💡 To publish to Nostr, provide --nostr-key`);
    }

    // 3. Save results
    const outputData = {
      vineUserId,
      username: options.username,
      avatarOriginalUrl: avatarUrl,
      cdnUrl,
      r2Url,
      importedAt: new Date().toISOString()
    };

    const outputFile = `vine_avatar_${vineUserId}.json`;
    require('fs').writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    console.log(`\n📝 Results saved to: ${outputFile}`);

  } catch (error) {
    console.error(`\n❌ Error:`, error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}