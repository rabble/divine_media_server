#!/usr/bin/env node
// ABOUTME: Test script for production with proper NIP-98 authentication
// ABOUTME: Generates valid Nostr event signatures for testing

import crypto from 'crypto';
import { schnorr } from '@noble/curves/secp256k1';

const API_URL = process.argv[2] || 'https://cf-stream-service-prod.protestnet.workers.dev';

async function sha256Hex(data) {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64Encode(str) {
  return Buffer.from(str).toString('base64');
}

async function createNip98Auth(url, method, body) {
  // Generate a test keypair
  const privKey = crypto.randomBytes(32);
  const pubKey = schnorr.getPublicKey(privKey);
  const pubKeyHex = Buffer.from(pubKey).toString('hex');
  
  const created_at = Math.floor(Date.now() / 1000);
  const bodyHash = body ? await sha256Hex(new TextEncoder().encode(body)) : null;
  
  const tags = [
    ['u', url],
    ['method', method]
  ];
  
  if (bodyHash) {
    tags.push(['payload', bodyHash]);
  }
  
  const event = {
    pubkey: pubKeyHex,
    created_at,
    kind: 27235,
    tags,
    content: ''
  };
  
  // Calculate event ID
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);
  
  const eventId = await sha256Hex(new TextEncoder().encode(serialized));
  event.id = eventId;
  
  // Sign the event
  const signature = await schnorr.sign(eventId, privKey);
  event.sig = Buffer.from(signature).toString('hex');
  
  // Create the auth header
  const authHeader = 'Nostr ' + base64Encode(JSON.stringify(event));
  
  return { authHeader, pubKey: pubKeyHex };
}

async function testProductionUpload() {
  try {
    const url = `${API_URL}/v1/videos`;
    const body = JSON.stringify({
      sha256: 'test_sha256_' + Date.now(),
      vineId: 'test_vine_' + Date.now()
    });
    
    const { authHeader, pubKey } = await createNip98Auth(url, 'POST', body);
    
    console.log('Testing production with NIP-98 auth...');
    console.log('Public key:', pubKey.substring(0, 16) + '...');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body
    });

    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (data.uid && data.uploadURL) {
      console.log('\n✅ Production upload successful!');
      console.log('UID:', data.uid);
      console.log('Owner:', data.owner);
      
      // Test status endpoint
      console.log('\n📊 Testing status endpoint...');
      const statusRes = await fetch(`${API_URL}/v1/videos/${data.uid}`);
      const statusData = await statusRes.json();
      console.log('Status:', JSON.stringify(statusData, null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testProductionUpload();