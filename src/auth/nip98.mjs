// NIP-98 HTTP Auth verification (Schnorr over secp256k1)
// Validates: header payload, url/method tags, optional payload hash, signature

export async function verifyNip98Request(req) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  if (!auth.startsWith('Nostr ')) return null;
  const b64 = auth.slice(6).trim();
  let ev;
  try {
    const json = base64ToString(b64);
    ev = JSON.parse(json);
  } catch {
    return null;
  }
  if (!ev || typeof ev !== 'object') return null;
  if (ev.kind !== 27235 || !ev.pubkey || !ev.sig || !ev.created_at || !Array.isArray(ev.tags)) return null;

  const url = new URL(req.url);
  const method = req.method.toUpperCase();
  const tag = (k) => {
    for (const t of ev.tags) if (Array.isArray(t) && t[0] === k) return t[1];
    return undefined;
  };
  if (tag('u') !== url.toString()) return null;
  if ((tag('method') || '').toUpperCase() !== method) return null;

  const payloadTag = tag('payload');
  if (payloadTag) {
    // If provided, must match sha256(rawBody)
    const raw = await req.clone().arrayBuffer();
    const hash = await sha256Hex(new Uint8Array(raw));
    if (hash !== payloadTag) return null;
  }

  const id = await eventId(ev);
  if (ev.id && ev.id !== id) return null;

  // Schnorr verify
  try {
    const { schnorr } = await import('@noble/curves/secp256k1');
    const ok = await schnorr.verify(ev.sig, id, ev.pubkey);
    if (!ok) return null;
  } catch {
    return null;
  }
  return { pubkey: ev.pubkey };
}

async function eventId(ev) {
  const payload = [0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content ?? ''];
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
