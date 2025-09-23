// ABOUTME: Blossom protocol authentication using Nostr events
// ABOUTME: Handles kind 24242 authorization events for blob operations

/**
 * Verify Blossom authorization event (kind 24242)
 * @param {Request} req - The HTTP request
 * @param {Object} deps - Dependencies
 * @returns {Promise<Object|null>} - Auth result with pubkey or null if invalid
 */
export async function verifyBlossomAuth(req, deps = {}) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth || !auth.startsWith('Nostr ')) {
    return null;
  }

  try {
    // Parse the authorization header
    const base64Event = auth.slice(6).trim();

    // Handle simple pubkey format for development
    if (base64Event.startsWith('pubkey=')) {
      const pubkey = base64Event.slice(7);
      if (pubkey.match(/^[a-f0-9]{64}$/)) {
        return { pubkey };
      }
      return null;
    }

    // Decode the base64 event
    const eventJson = base64ToString(base64Event);
    const event = JSON.parse(eventJson);

    // Verify it's a kind 24242 event for Blossom auth
    if (event.kind !== 24242) {
      return null;
    }

    // Validate required fields
    if (!event.pubkey || !event.sig || !event.created_at || !Array.isArray(event.tags)) {
      return null;
    }

    // Validate URL and method tags
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const tag = (k) => {
      for (const t of event.tags) if (Array.isArray(t) && t[0] === k) return t[1];
      return undefined;
    };

    const authUrl = tag('u');
    const authMethod = tag('method');

    if (authUrl && authUrl !== url.toString()) {
      return null;
    }

    if (authMethod && authMethod.toUpperCase() !== method) {
      return null;
    }

    // Check expiration (if provided)
    const expiration = tag('expiration');
    if (expiration) {
      const expireTime = parseInt(expiration, 10);
      const now = Math.floor((deps.now?.() || Date.now()) / 1000);
      if (now > expireTime) {
        return null;
      }
    }

    // Verify event ID
    const id = await eventId(event);
    if (event.id && event.id !== id) {
      return null;
    }

    // Schnorr signature verification
    try {
      const { schnorr } = await import('@noble/curves/secp256k1');
      const isValid = await schnorr.verify(event.sig, id, event.pubkey);
      if (!isValid) {
        return null;
      }
    } catch {
      return null;
    }

    return {
      pubkey: event.pubkey,
      event
    };

  } catch (error) {
    // Fallback to NIP-98 verification for compatibility
    if (deps.verifyNip98) {
      return await deps.verifyNip98(req);
    }
    return null;
  }
}

async function eventId(event) {
  const payload = [0, event.pubkey, event.created_at, event.kind, event.tags, event.content ?? ''];
  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(payload));
  return await sha256Hex(data);
}

async function sha256Hex(input) {
  const buf = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64ToString(b64) {
  if (typeof atob === 'function') {
    // Browser/Workers
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  // Node fallback
  // Using Buffer here is fine in tests/CI; Workers won't hit this branch
  // eslint-disable-next-line no-undef
  return Buffer.from(b64, 'base64').toString('utf8');
}

/**
 * Create a Blossom authorization event template
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {Object} options - Additional options
 * @returns {Object} - Event template to be signed
 */
export function createBlossomAuthTemplate(method, url, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const { expiration, payload } = options;

  const tags = [
    ['u', url],
    ['method', method.toLowerCase()],
    ['created_at', now.toString()]
  ];

  if (expiration) {
    tags.push(['expiration', expiration.toString()]);
  }

  if (payload) {
    tags.push(['payload', payload]);
  }

  return {
    kind: 24242,
    created_at: now,
    tags,
    content: ""
  };
}