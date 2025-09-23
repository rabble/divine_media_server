#!/usr/bin/env node
// ABOUTME: Debug Blossom authentication to see what the server receives
// ABOUTME: Tests kind 24242 event creation and validation

import crypto from 'crypto';
import { schnorr } from '@noble/curves/secp256k1';

const API_URL = process.argv[2] || 'https://cf-stream-service-staging.protestnet.workers.dev';

async function sha256Hex(data) {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64Encode(str) {
  return Buffer.from(str).toString('base64');
}

async function createBlossomAuth(url, method) {
  console.log('🔧 Creating Blossom auth for:', { url, method });

  // Generate a test keypair
  const privKey = crypto.randomBytes(32);
  const pubKey = schnorr.getPublicKey(privKey);
  const pubKeyHex = Buffer.from(pubKey).toString('hex');
  console.log('🔑 Generated pubkey:', pubKeyHex.substring(0, 16) + '...');

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

  console.log('📝 Event before signing:', JSON.stringify(event, null, 2));

  // Calculate event ID
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);

  console.log('🔢 Serialized for hashing:', serialized);

  const eventId = await sha256Hex(new TextEncoder().encode(serialized));
  event.id = eventId;
  console.log('🆔 Event ID:', eventId);

  // Sign the event
  const signature = await schnorr.sign(eventId, privKey);
  event.sig = Buffer.from(signature).toString('hex');
  console.log('✍️ Signature:', event.sig.substring(0, 16) + '...');

  console.log('📄 Final event:', JSON.stringify(event, null, 2));

  // Create the auth header
  const eventJson = JSON.stringify(event);
  const authHeader = 'Nostr ' + base64Encode(eventJson);
  console.log('🔐 Auth header length:', authHeader.length);
  console.log('🔐 Auth header preview:', authHeader.substring(0, 50) + '...');

  return { authHeader, pubKey: pubKeyHex, event };
}

async function testBlossomAuth() {
  try {
    const url = `${API_URL}/upload`;
    console.log('🧪 Testing Blossom auth against:', url);

    const { authHeader, pubKey, event } = await createBlossomAuth(url, 'PUT');

    console.log('\n📤 Making request...');
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sha256: crypto.randomBytes(32).toString('hex') })
    });

    console.log('📥 Response status:', response.status);
    const responseText = await response.text();
    console.log('📥 Response body:', responseText);

    if (response.status === 200) {
      console.log('🎉 Blossom auth SUCCESS!');
    } else {
      console.log('❌ Blossom auth failed');

      // Let's also test if our event would validate locally
      console.log('\n🔍 Validating event locally...');
      try {
        const id = await calculateEventId(event);
        console.log('🔍 Calculated ID:', id);
        console.log('🔍 Expected ID:', event.id);
        console.log('🔍 IDs match:', id === event.id);

        const isValidSig = await schnorr.verify(event.sig, event.id, event.pubkey);
        console.log('🔍 Signature valid:', isValidSig);
      } catch (err) {
        console.log('🔍 Local validation error:', err.message);
      }
    }

  } catch (error) {
    console.error('💥 Error:', error);
  }
}

async function calculateEventId(event) {
  const payload = [0, event.pubkey, event.created_at, event.kind, event.tags, event.content ?? ''];
  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(payload));
  return await sha256Hex(data);
}

testBlossomAuth();