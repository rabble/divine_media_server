// ABOUTME: NIP-78 Application-specific data fetcher for content preferences
// ABOUTME: Fetches user content preference settings from Nostr relays

/**
 * Fetch user content preferences from NIP-78 kind 30078 event
 * @param {string} pubkey - User's Nostr public key
 * @param {string[]} relays - List of relay URLs to query
 * @returns {Promise<Object>} User preferences or defaults
 */
export async function fetchUserContentPreferences(pubkey, relays = ['wss://relay.damus.io', 'wss://relay.nostr.band']) {
  try {
    // Build NIP-01 filter for kind 30078 with our app identifier
    const filter = {
      kinds: [30078],
      authors: [pubkey],
      "#d": ["divine.video/content-preferences"]
    };

    // Try each relay until we get a result
    for (const relayUrl of relays) {
      try {
        const event = await fetchFromRelay(relayUrl, filter);
        if (event) {
          return parsePreferences(event);
        }
      } catch (error) {
        console.error(`Failed to fetch from ${relayUrl}:`, error.message);
        // Continue to next relay
      }
    }

    // No preferences found, return defaults
    return getDefaultPreferences();

  } catch (error) {
    console.error('Error fetching user preferences:', error);
    return getDefaultPreferences();
  }
}

/**
 * Fetch event from a single relay
 */
async function fetchFromRelay(relayUrl, filter) {
  return new Promise((resolve, reject) => {
    let ws;
    let timeout;
    let resolved = false;

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };

    timeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error('Relay timeout'));
      }
    }, 5000); // 5 second timeout

    try {
      ws = new WebSocket(relayUrl);

      ws.onopen = () => {
        // Send REQ message
        const subId = 'prefs_' + Math.random().toString(36).substring(7);
        ws.send(JSON.stringify(['REQ', subId, filter]));
      };

      ws.onmessage = (msg) => {
        try {
          const [type, subId, event] = JSON.parse(msg.data);

          if (type === 'EVENT' && event) {
            resolved = true;
            cleanup();
            resolve(event);
          } else if (type === 'EOSE') {
            // End of stored events, no match found
            resolved = true;
            cleanup();
            resolve(null);
          }
        } catch (error) {
          console.error('Error parsing relay message:', error);
        }
      };

      ws.onerror = (error) => {
        if (!resolved) {
          cleanup();
          reject(error);
        }
      };

    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

/**
 * Parse preferences from NIP-78 event
 */
function parsePreferences(event) {
  const prefs = {
    adult_content: false,
    violence: false,
    ai_generated: false,
    age_verified: false,
    verified_at: null
  };

  // Parse tags
  for (const tag of event.tags) {
    const [key, value] = tag;

    if (key === 'adult_content') {
      prefs.adult_content = value === 'true' || value === '1';
    } else if (key === 'violence') {
      prefs.violence = value === 'true' || value === '1';
    } else if (key === 'ai_generated') {
      prefs.ai_generated = value === 'true' || value === '1';
    } else if (key === 'age_verified') {
      prefs.age_verified = value === 'true' || value === '1';
    } else if (key === 'age_verified_at') {
      prefs.verified_at = parseInt(value) || null;
    }
  }

  return prefs;
}

/**
 * Default preferences (restrictive)
 */
function getDefaultPreferences() {
  return {
    adult_content: false,
    violence: false,
    ai_generated: true,  // AI content is okay by default
    age_verified: false,
    verified_at: null
  };
}

/**
 * Check if user has permission to view content based on category
 */
export function checkContentAccess(preferences, contentCategory) {
  switch (contentCategory) {
    case 'adult':
      return preferences.adult_content && preferences.age_verified;

    case 'violence':
      return preferences.violence;

    case 'ai_generated':
      return preferences.ai_generated;

    case 'csam':
    case 'illegal':
      return false; // Never allow

    default:
      return true; // Unknown categories are allowed
  }
}
