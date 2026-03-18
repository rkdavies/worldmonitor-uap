/**
 * OpenSky OAuth2 client-credentials token (REST API).
 * Credentials: env OPENSKY_CLIENT_ID + OPENSKY_CLIENT_SECRET first; else ./credentials.json (local dev).
 * @see https://openskynetwork.github.io/opensky-api/rest.html
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHROME_UA } from './constants';

const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const REFRESH_MARGIN_MS = 35_000;

let cachedToken: string | null = null;
let cachedExpiresAt = 0;

type FileCredState = 'unset' | 'empty' | { id: string; secret: string };
let credentialsFileCache: FileCredState = 'unset';

function pickStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function readOpenSkyCredentialsFromFile(): { id: string; secret: string } | null {
  if (credentialsFileCache !== 'unset') {
    return credentialsFileCache === 'empty' ? null : credentialsFileCache;
  }
  try {
    const p = join(process.cwd(), 'credentials.json');
    if (!existsSync(p)) {
      credentialsFileCache = 'empty';
      return null;
    }
    const j = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
    const nested =
      j.opensky && typeof j.opensky === 'object' && j.opensky !== null
        ? (j.opensky as Record<string, unknown>)
        : null;
    const id =
      pickStr(j.OPENSKY_CLIENT_ID) ||
      pickStr(j.client_id) ||
      pickStr(j.clientId) ||
      pickStr(nested?.client_id) ||
      pickStr(nested?.OPENSKY_CLIENT_ID) ||
      pickStr(nested?.clientId);
    const secret =
      pickStr(j.OPENSKY_CLIENT_SECRET) ||
      pickStr(j.client_secret) ||
      pickStr(j.clientSecret) ||
      pickStr(nested?.client_secret) ||
      pickStr(nested?.OPENSKY_CLIENT_SECRET) ||
      pickStr(nested?.clientSecret);
    if (id && secret) {
      credentialsFileCache = { id, secret };
      return credentialsFileCache;
    }
  } catch {
    /* malformed or unreadable */
  }
  credentialsFileCache = 'empty';
  return null;
}

function getOpenSkyClientCredentials(): { id: string; secret: string } | null {
  const eid = process.env.OPENSKY_CLIENT_ID?.trim();
  const esec = process.env.OPENSKY_CLIENT_SECRET?.trim();
  if (eid && esec) return { id: eid, secret: esec };
  return readOpenSkyCredentialsFromFile();
}

export async function getOpenSkyBearerToken(): Promise<string | null> {
  const creds = getOpenSkyClientCredentials();
  if (!creds) return null;

  if (cachedToken && Date.now() < cachedExpiresAt) return cachedToken;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.id,
    client_secret: creds.secret,
  });

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': CHROME_UA,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    console.warn(`[OpenSky OAuth] token request failed: HTTP ${resp.status}`);
    return null;
  }

  const data = (await resp.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;

  cachedToken = data.access_token;
  const ttlSec = typeof data.expires_in === 'number' ? data.expires_in : 1800;
  cachedExpiresAt = Date.now() + ttlSec * 1000 - REFRESH_MARGIN_MS;
  return cachedToken;
}

/** Test hook */
export function resetOpenSkyTokenCacheForTests(): void {
  cachedToken = null;
  cachedExpiresAt = 0;
  credentialsFileCache = 'unset';
}
