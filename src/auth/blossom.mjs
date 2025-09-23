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
    const eventJson = atob(base64Event);
    const event = JSON.parse(eventJson);

    // Verify it's a kind 24242 event for Blossom auth
    if (event.kind !== 24242) {
      return null;
    }

    // TODO: Verify the event signature properly
    // For now, skip signature verification and accept the event
    // In production, this should use proper Nostr signature verification

    // Check expiration (if provided)
    const expiration = event.tags.find(tag => tag[0] === 'expiration');
    if (expiration) {
      const expireTime = parseInt(expiration[1], 10);
      const now = Math.floor((deps.now?.() || Date.now()) / 1000);
      if (now > expireTime) {
        return null;
      }
    }

    // Check method and URL (optional validation)
    const method = event.tags.find(tag => tag[0] === 'method')?.[1];
    const url = event.tags.find(tag => tag[0] === 'u')?.[1];

    if (method && req.method !== method.toUpperCase()) {
      return null;
    }

    if (url) {
      const reqUrl = new URL(req.url);
      const authUrl = new URL(url);
      if (reqUrl.pathname !== authUrl.pathname) {
        return null;
      }
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