#!/usr/bin/env node
// ABOUTME: Debug what the auth function sees vs what we send
// ABOUTME: Tests kind 24242 event validation step by step

import crypto from 'crypto';
import { schnorr } from '@noble/curves/secp256k1';

async function sha256Hex(input) {
  const buf = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function eventId(event) {
  const payload = [0, event.pubkey, event.created_at, event.kind, event.tags, event.content ?? ''];
  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(payload));
  return await sha256Hex(data);
}

function base64ToString(b64) {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, 'base64').toString('utf8');
}

// Replicate the server's Blossom auth logic
async function debugBlossomAuth(authHeader, requestUrl, requestMethod) {
  console.log('🔍 Debug: Auth header:', authHeader.substring(0, 50) + '...');
  console.log('🔍 Debug: Request URL:', requestUrl);
  console.log('🔍 Debug: Request Method:', requestMethod);

  if (!authHeader || !authHeader.startsWith('Nostr ')) {
    console.log('❌ Debug: Invalid auth header format');
    return null;
  }

  try {
    const base64Event = authHeader.slice(6).trim();
    console.log('🔍 Debug: Base64 event length:', base64Event.length);

    const eventJson = base64ToString(base64Event);
    console.log('🔍 Debug: Event JSON length:', eventJson.length);

    const event = JSON.parse(eventJson);
    console.log('🔍 Debug: Parsed event:', JSON.stringify(event, null, 2));

    // Check if it's kind 24242
    if (event.kind !== 24242) {
      console.log(`❌ Debug: Wrong event kind: ${event.kind}, expected 24242`);
      return null;
    }
    console.log('✅ Debug: Event kind is 24242');

    // Check required fields
    if (!event.pubkey || !event.sig || !event.created_at || !Array.isArray(event.tags)) {
      console.log('❌ Debug: Missing required fields');
      console.log('   - pubkey:', !!event.pubkey);
      console.log('   - sig:', !!event.sig);
      console.log('   - created_at:', !!event.created_at);
      console.log('   - tags array:', Array.isArray(event.tags));
      return null;
    }
    console.log('✅ Debug: All required fields present');

    // Validate URL and method
    const url = new URL(requestUrl);
    const method = requestMethod.toUpperCase();
    const tag = (k) => {
      for (const t of event.tags) if (Array.isArray(t) && t[0] === k) return t[1];
      return undefined;
    };

    const authUrl = tag('u');
    const authMethod = tag('method');

    console.log('🔍 Debug: URL comparison:');
    console.log('   - Request URL:', url.toString());
    console.log('   - Auth URL:', authUrl);
    console.log('   - URLs match:', authUrl === url.toString());

    console.log('🔍 Debug: Method comparison:');
    console.log('   - Request method:', method);
    console.log('   - Auth method:', authMethod);
    console.log('   - Methods match:', authMethod && authMethod.toUpperCase() === method);

    if (authUrl && authUrl !== url.toString()) {
      console.log('❌ Debug: URL mismatch');
      return null;
    }

    if (authMethod && authMethod.toUpperCase() !== method) {
      console.log('❌ Debug: Method mismatch');
      return null;
    }

    console.log('✅ Debug: URL and method validation passed');

    // Verify event ID
    const calculatedId = await eventId(event);
    console.log('🔍 Debug: Event ID comparison:');
    console.log('   - Calculated:', calculatedId);
    console.log('   - Provided:', event.id);
    console.log('   - Match:', calculatedId === event.id);

    if (event.id && event.id !== calculatedId) {
      console.log('❌ Debug: Event ID mismatch');
      return null;
    }

    console.log('✅ Debug: Event ID validation passed');

    // Verify signature
    try {
      const isValid = await schnorr.verify(event.sig, calculatedId, event.pubkey);
      console.log('🔍 Debug: Signature verification:', isValid);

      if (!isValid) {
        console.log('❌ Debug: Signature verification failed');
        return null;
      }
    } catch (err) {
      console.log('❌ Debug: Signature verification error:', err.message);
      return null;
    }

    console.log('✅ Debug: All validation passed!');
    return { pubkey: event.pubkey, event };

  } catch (error) {
    console.log('❌ Debug: Exception:', error.message);
    return null;
  }
}

// Test with a real example
async function testDebug() {
  // Generate the same event as our test
  const url = 'https://cf-stream-service-staging.protestnet.workers.dev/upload';
  const method = 'PUT';

  const privKey = crypto.randomBytes(32);
  const pubKey = schnorr.getPublicKey(privKey);
  const pubKeyHex = Buffer.from(pubKey).toString('hex');
  const created_at = Math.floor(Date.now() / 1000);

  const event = {
    pubkey: pubKeyHex,
    created_at,
    kind: 24242,
    tags: [
      ['u', url],
      ['method', method.toLowerCase()]
    ],
    content: ''
  };

  const id = await eventId(event);
  event.id = id;
  const signature = await schnorr.sign(id, privKey);
  event.sig = Buffer.from(signature).toString('hex');

  const authHeader = 'Nostr ' + Buffer.from(JSON.stringify(event)).toString('base64');

  console.log('🧪 Testing debug auth validation...\n');
  const result = await debugBlossomAuth(authHeader, url, method);

  if (result) {
    console.log('🎉 Debug validation SUCCESS!');
  } else {
    console.log('❌ Debug validation FAILED!');
  }
}

testDebug();