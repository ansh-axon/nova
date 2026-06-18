// ──────────────────────────────────────────────────────────────
// WebRTC ICE (STUN + TURN) configuration.
//
// For calls to connect between two people on DIFFERENT networks anywhere in the
// world, a reliable TURN server is required. Get FREE TURN credentials from
// Metered (https://www.metered.ca/ — 50 GB/month free):
//   1. Sign up (free) → create an app.
//   2. Dashboard → "TURN Server" → copy your sub-domain and API key.
//   3. Paste them below. That's it — calls become reliable worldwide.
//
// If left blank, the app falls back to free public STUN + OpenRelay TURN, which
// works on the same Wi-Fi but is unreliable across mobile/remote networks.
// ──────────────────────────────────────────────────────────────

const METERED_SUBDOMAIN = ''; // e.g. 'nova'  (from https://nova.metered.live)
const METERED_API_KEY = '';   // your Metered API key

const DEFAULT_ICE: any[] = [
  // Metered TURN (axonnova) — reliable relay so calls connect across any network worldwide
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: 'turn:global.relay.metered.ca:80',
    username: 'd4b2f6fff24f348e4411958d',
    credential: 'usqUKMRaQ5oXLwI0',
  },
  {
    urls: 'turn:global.relay.metered.ca:80?transport=tcp',
    username: 'd4b2f6fff24f348e4411958d',
    credential: 'usqUKMRaQ5oXLwI0',
  },
  {
    urls: 'turn:global.relay.metered.ca:443',
    username: 'd4b2f6fff24f348e4411958d',
    credential: 'usqUKMRaQ5oXLwI0',
  },
  {
    urls: 'turns:global.relay.metered.ca:443?transport=tcp',
    username: 'd4b2f6fff24f348e4411958d',
    credential: 'usqUKMRaQ5oXLwI0',
  },
  // Google STUN (for fast direct connections on the same network)
  { urls: 'stun:stun.l.google.com:19302' },
];

let cached: any[] | null = null;

/**
 * Fetches the best available ICE servers. Uses your private Metered TURN servers
 * if configured, otherwise the free public defaults. Result is cached.
 */
export async function getIceServers(): Promise<any[]> {
  if (cached) return cached;
  if (METERED_SUBDOMAIN && METERED_API_KEY) {
    try {
      const res = await fetch(`https://${METERED_SUBDOMAIN}.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`);
      const servers = await res.json();
      if (Array.isArray(servers) && servers.length > 0) {
        cached = servers;
        console.log('[ICE] Using Metered TURN servers');
        return servers;
      }
    } catch (e) {
      console.warn('[ICE] Metered fetch failed, falling back to defaults:', e);
    }
  }
  return DEFAULT_ICE;
}

/** Synchronous accessor (returns cached Metered servers if warmed, else defaults). */
export function getIceServersSync(): any[] {
  return cached || DEFAULT_ICE;
}
