#!/usr/bin/env npx tsx
/**
 * Warm Redis cache with city-level coordinates for UAP sightings.
 * Fetches NUFORC rows, dedupes by location, then for each uncached location
 * calls Nominatim (1 req/sec), writes uap:geo:<key> so listUapSightings uses city coords.
 *
 * Prerequisites: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.
 *
 * Usage: npx tsx scripts/seed-uap-geocode.ts
 */

import { fetchNuforcRows, normalizeLocationKey, setCachedCoords } from '../server/worldmonitor/uap/v1/nuforc';
import { getCachedJson } from '../server/_shared/redis';

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'WorldMonitor/2.0 (https://worldmonitor.app; UAP geocode seed)';
const DELAY_MS = 1200; // Nominatim policy: 1 request per second

async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
  const url = `${NOMINATIM_SEARCH}?${new URLSearchParams({ q: query, format: 'json', limit: '1' })}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  const first = data?.[0];
  if (!first) return null;
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function main(): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
    process.exit(1);
  }

  console.log('Fetching NUFORC rows...');
  const rows = await fetchNuforcRows();
  const keys = new Map<string, { city: string; state: string; country: string }>();
  for (const row of rows) {
    const key = normalizeLocationKey(row.city, row.state, row.country);
    if (!key || key === '||' || key === 'unknown||') continue;
    if (!keys.has(key)) keys.set(key, { city: row.city, state: row.state, country: row.country });
  }

  const cachePrefix = 'uap:geo:';
  let cached = 0;
  let geocoded = 0;
  let failed = 0;

  for (const [key, loc] of keys) {
    const cachedVal = (await getCachedJson(`${cachePrefix}${key}`)) as { lat: number; lon: number } | null;
    if (cachedVal?.lat != null && cachedVal?.lon != null) {
      cached++;
      continue;
    }
    const query = [loc.city, loc.state, loc.country].filter(Boolean).join(', ');
    const coords = await geocode(query);
    if (coords) {
      await setCachedCoords(loc.city, loc.state, loc.country, coords.lat, coords.lon);
      geocoded++;
      if (geocoded % 10 === 0) console.log(`  Geocoded ${geocoded}...`);
    } else {
      failed++;
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`Done. Cached: ${cached}, geocoded: ${geocoded}, failed: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
