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
  console.log("🌸 Blossom auth called");

  if (!auth || !auth.startsWith('Nostr ')) {
    console.log("🌸 No Nostr auth header found");
    return null;
  }

  try {
    // Parse the authorization header
    const base64Event = auth.slice(6).trim();
    console.log("🌸 Base64 event length:", base64Event.length);

    // Handle simple pubkey format for development
    if (base64Event.startsWith('pubkey=')) {
      const pubkey = base64Event.slice(7);
      if (pubkey.match(/^[a-f0-9]{64}$/)) {
        console.log("🌸 Simple pubkey auth succeeded");
        return { pubkey };
      }
      return null;
    }

    console.log("🌸 Decoding base64 event");
    // Decode the base64 event
    const eventJson = base64ToString(base64Event);
    console.log("🌸 Event JSON length:", eventJson.length);
    const event = JSON.parse(eventJson);
    console.log("🌸 Event kind:", event.kind);

    // Verify it's a kind 24242 event for Blossom auth
    if (event.kind !== 24242) {
      console.log("🌸 Invalid kind:", event.kind);
      return null;
    }
    console.log("🌸 Kind 24242 verified");

    // Validate required fields
    if (!event.pubkey || !event.sig || !event.created_at || !Array.isArray(event.tags)) {
      console.log("🌸 Required fields validation failed");
      return null;
    }
    console.log("🌸 Required fields validated");

    // Helper to get tag value
    const tag = (k) => {
      for (const t of event.tags) if (Array.isArray(t) && t[0] === k) return t[1];
      return undefined;
    };

    // Check for Blossom spec format (using 't' tag)
    const blossomVerb = tag('t');

    // Check for our current format (using 'u' and 'method' tags)
    const authUrl = tag('u');
    const authMethod = tag('method');

    const url = new URL(req.url);
    const method = req.method.toUpperCase();

    // If using Blossom spec format with 't' tag
    if (blossomVerb) {
      console.log("🌸 Using Blossom spec format with 't' tag:", blossomVerb);

      // Map Blossom verbs to HTTP methods and validate
      const verbToMethod = {
        'upload': ['PUT', 'POST'],
        'get': ['GET', 'HEAD'],
        'list': ['GET'],
        'delete': ['DELETE']
      };

      const allowedMethods = verbToMethod[blossomVerb];
      if (!allowedMethods) {
        console.log("🌸 Unknown Blossom verb:", blossomVerb);
        return null;
      }

      if (!allowedMethods.includes(method)) {
        console.log("🌸 Method mismatch for Blossom verb", {
          verb: blossomVerb,
          allowedMethods,
          actualMethod: method
        });
        return null;
      }

      // Validate 'x' tag if present (for specific blob operations)
      const blobHash = tag('x');
      if (blobHash) {
        // Extract hash from URL path
        const pathMatch = url.pathname.match(/\/([a-f0-9]{64})/i);
        if (pathMatch && pathMatch[1].toLowerCase() !== blobHash.toLowerCase()) {
          console.log("🌸 Blob hash mismatch", {
            urlHash: pathMatch[1],
            authHash: blobHash
          });
          return null;
        }
      }

      console.log("🌸 Blossom spec validation passed");
    }
    // If using our current format with 'u' and 'method' tags
    else if (authUrl || authMethod) {
      console.log("🌸 Using current format with 'u' and 'method' tags");

      console.log("🌸 URL validation:", {
        requestUrl: url.toString(),
        authUrl,
        match: !authUrl || authUrl === url.toString()
      });

      console.log("🌸 Method validation:", {
        requestMethod: method,
        authMethod: authMethod?.toUpperCase(),
        match: !authMethod || authMethod.toUpperCase() === method
      });

      if (authUrl && authUrl !== url.toString()) {
        console.log("🌸 URL validation failed");
        return null;
      }

      if (authMethod && authMethod.toUpperCase() !== method) {
        console.log("🌸 Method validation failed");
        return null;
      }

      console.log("🌸 Current format validation passed");
    }
    // If neither format is present, accept the event (backward compatibility)
    else {
      console.log("🌸 No specific auth tags, accepting event");
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

    console.log("🌸 Starting signature verification");
    // Verify event ID
    const id = await eventId(event);
    console.log("🌸 Event ID check:", {
      calculated: id,
      provided: event.id,
      match: !event.id || event.id === id
    });
    if (event.id && event.id !== id) {
      console.log("🌸 Event ID verification failed");
      return null;
    }

    // Schnorr signature verification
    try {
      console.log("🌸 Starting Schnorr verification");
      const { schnorr } = await import('@noble/curves/secp256k1');
      const isValid = await schnorr.verify(event.sig, id, event.pubkey);
      console.log("🌸 Schnorr verification result:", isValid);
      if (!isValid) {
        console.log("🌸 Signature verification failed");
        return null;
      }
    } catch (error) {
      console.log("🌸 Schnorr verification error:", error.message);
      return null;
    }

    console.log("🌸 Blossom auth SUCCESS! Returning result");
    return {
      pubkey: event.pubkey,
      event
    };

  } catch (error) {
    console.log("🌸 Blossom auth error:", error.message);
    // Fallback to NIP-98 verification for compatibility
    if (deps.verifyNip98) {
      console.log("🌸 Falling back to NIP-98");
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
  const { expiration, payload, format = 'current', blobHash, content } = options;

  const tags = [];

  if (format === 'blossom') {
    // Use Blossom spec format with 't' tag
    const methodToVerb = {
      'PUT': 'upload',
      'POST': 'upload',
      'GET': 'get',
      'HEAD': 'get',
      'DELETE': 'delete'
    };

    const verb = methodToVerb[method.toUpperCase()] || 'get';
    tags.push(['t', verb]);

    // Add blob hash if specified
    if (blobHash) {
      tags.push(['x', blobHash]);
    }
  } else {
    // Use current format with 'u' and 'method' tags
    tags.push(['u', url]);
    tags.push(['method', method.toLowerCase()]);
    tags.push(['created_at', now.toString()]);

    if (payload) {
      tags.push(['payload', payload]);
    }
  }

  // Add expiration (used by both formats)
  if (expiration) {
    tags.push(['expiration', expiration.toString()]);
  } else {
    // Default expiration of 1 minute for Blossom spec
    if (format === 'blossom') {
      tags.push(['expiration', (now + 60).toString()]);
    }
  }

  return {
    kind: 24242,
    created_at: now,
    tags,
    content: content || (format === 'blossom' ? `Blossom ${method} request` : "")
  };
}

/**
 * Create a Blossom spec compliant auth event template
 * @param {string} verb - Blossom verb: 'upload', 'get', 'list', or 'delete'
 * @param {Object} options - Additional options
 * @returns {Object} - Event template to be signed
 */
export function createBlossomSpecAuthTemplate(verb, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const { expiration, blobHash, content } = options;

  const tags = [
    ['t', verb]
  ];

  // Add expiration (required for Blossom spec)
  tags.push(['expiration', (expiration || now + 60).toString()]);

  // Add blob hash if specified
  if (blobHash) {
    tags.push(['x', blobHash]);
  }

  return {
    kind: 24242,
    created_at: now,
    tags,
    content: content || `Blossom ${verb} request`
  };
}