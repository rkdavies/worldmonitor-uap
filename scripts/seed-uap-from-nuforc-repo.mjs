#!/usr/bin/env node
/**
 * Seed UAP sightings in Redis from the local nuforc_sightings_data repo.
 * Reads either:
 *   - Raw JSON (from crawl-recent.sh): NUFORC_REPO_RAW_JSON or ~/git/nuforc/data/raw/nuforc_reports_new.json
 *     Uses Redis uap:geo:<city|state|country> for city-level coords when set (run seed-uap-geocode first for best results); else state/country centroids.
 *   - Processed CSV: NUFORC_REPO_CSV or ~/git/nuforc/data/processed/nuforc_reports.csv (uses city_latitude/city_longitude when present).
 * Takes the last 200 by date and writes to Redis (uap:sightings:nuforc:v1).
 *
 * Prerequisites: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (in .env.local or exported in the shell).
 *
 * Usage:
 *   node scripts/seed-uap-from-nuforc-repo.mjs
 *   NUFORC_REPO_RAW_JSON=/Users/you/git/nuforc/data/raw/nuforc_reports_new.json node scripts/seed-uap-from-nuforc-repo.mjs
 *   NUFORC_REPO_CSV=/path/to/nuforc_reports.csv node scripts/seed-uap-from-nuforc-repo.mjs
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { access } from 'node:fs/promises';
import { loadEnvFile } from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

const CACHE_KEY = 'uap:sightings:nuforc:v1';
const CACHE_TTL = 3600; // 1 hour; API will serve this
const LIMIT = 200;

/** Match server/_shared/redis.ts so the API reads the key we write. */
function getRedisKeyPrefix() {
  const env = process.env.VERCEL_ENV;
  if (!env || env === 'production') return '';
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 8);
  return `${env}:${sha}:`;
}

const defaultRawJson = resolve(homedir(), 'git/nuforc/data/raw/nuforc_reports_new.json');
const defaultCsv = resolve(homedir(), 'git/nuforc/data/processed/nuforc_reports.csv');

// US state -> [lat, lon]; country name -> [lat, lon] (for raw JSON geocoding)
const US_STATE = {
  AL: [32.8, -86.9], AK: [64.0, -152.0], AZ: [34.0, -111.1], AR: [34.9, -92.4], CA: [37.0, -120.0],
  CO: [39.1, -105.3], CT: [41.6, -72.8], DE: [38.9, -75.5], FL: [28.4, -82.2], GA: [32.6, -83.4],
  HI: [20.3, -155.8], ID: [44.4, -114.6], IL: [40.0, -89.2], IN: [40.3, -86.1], IA: [42.0, -93.5],
  KS: [38.5, -98.4], KY: [37.7, -85.5], LA: [31.2, -92.0], ME: [45.4, -69.4], MD: [39.0, -76.6],
  MA: [42.4, -71.4], MI: [43.3, -84.5], MN: [46.3, -94.7], MS: [32.7, -89.6], MO: [37.9, -91.5],
  MT: [47.0, -110.4], NE: [41.1, -98.0], NV: [39.3, -116.4], NH: [43.2, -71.5], NJ: [40.2, -74.5],
  NM: [34.4, -106.1], NY: [43.0, -75.5], NC: [35.6, -79.4], ND: [47.5, -100.5], OH: [40.4, -82.8],
  OK: [35.5, -97.5], OR: [44.0, -120.5], PA: [41.2, -77.2], RI: [41.6, -71.5], SC: [33.8, -81.0],
  SD: [44.4, -100.2], TN: [35.9, -86.6], TX: [31.2, -99.5], UT: [39.3, -111.7], VT: [44.1, -72.6],
  VA: [37.5, -78.5], WA: [47.3, -120.7], WV: [38.6, -80.6], WI: [44.3, -89.6], WY: [43.0, -107.5],
  DC: [38.9, -77.0],
};
const COUNTRY = {
  USA: [37.1, -95.7], US: [37.1, -95.7], 'United States': [37.1, -95.7],
  Canada: [56.1, -106.3], CAN: [56.1, -106.3],
  UK: [55.4, -3.4], 'United Kingdom': [55.4, -3.4], GBR: [55.4, -3.4], England: [52.4, -1.5],
  Australia: [-25.3, 133.8], AUS: [-25.3, 133.8], Germany: [51.2, 10.4], France: [46.2, 2.2],
  Brazil: [-14.2, -51.9], Mexico: [23.6, -102.6], India: [20.6, 79.0], Spain: [40.5, -3.7],
  Italy: [41.9, 12.6], Netherlands: [52.1, 5.3], Japan: [36.2, 138.3], Ireland: [53.1, -8.0],
  'New Zealand': [-40.9, 174.9], Poland: [52.0, 19.4], Russia: [61.5, 105.3], China: [35.9, 104.2],
};

/** Normalize "City, State, Country" for cache key — match server/worldmonitor/uap/v1/nuforc.ts */
function normalizeLocationKey(city, state, country) {
  const c = (city ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const s = (state ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const co = (country ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return `${c}|${s}|${co}`;
}

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_DELAY_MS = 1200; // 1 req/sec policy
const UAP_GEO_CACHE_TTL = 604800; // 7 days — match server nuforc.ts

/** Fetch city-level coords from Redis uap:geo:<key> when available (from seed-uap-geocode or prior run). */
async function getCachedGeo(url, token, prefix, geoKey) {
  if (!url || !token) return null;
  const fullKey = prefix ? `${prefix}${geoKey}` : geoKey;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(fullKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.result;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const lat = Number(parsed?.lat);
    const lon = Number(parsed?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

/** Write city-level coords to Redis so API and future runs use them. */
async function setCachedGeo(url, token, prefix, geoKey, lat, lon) {
  if (!url || !token) return;
  const fullKey = prefix ? `${prefix}${geoKey}` : geoKey;
  const body = JSON.stringify({ lat, lon });
  try {
    await fetch(`${url}/set/${encodeURIComponent(fullKey)}/${encodeURIComponent(body)}/EX/${UAP_GEO_CACHE_TTL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // ignore
  }
}

/** Geocode one query via Nominatim (rate-limit caller to 1/sec). */
async function geocodeQuery(query) {
  if (!query || typeof query !== 'string' || query.trim().length < 2) return null;
  const url = `${NOMINATIM_SEARCH}?${new URLSearchParams({ q: query.trim(), format: 'json', limit: '1' })}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WorldMonitor/2.0 (https://worldmonitor.app; UAP seed)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const first = data?.[0];
    if (!first) return null;
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

function getCoords(state, country) {
  const c = (country || '').trim();
  const s = (state || '').toUpperCase().slice(0, 2);
  if (/^(USA|US|United States)$/i.test(c)) {
    const pt = US_STATE[s];
    if (pt) return { lat: pt[0], lon: pt[1] };
    return { lat: 37.1, lon: -95.7 };
  }
  const pt = COUNTRY[c] ?? COUNTRY[c.toUpperCase()];
  return pt ? { lat: pt[0], lon: pt[1] } : null;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ',') {
      out.push(cur.trim().replace(/^"|"$/g, ''));
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim().replace(/^"|"$/g, ''));
  return out;
}

function parseDateToSeconds(val) {
  if (!val || typeof val !== 'string') return 0;
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const sec = Math.floor(new Date(trimmed).getTime() / 1000);
    return Number.isFinite(sec) ? sec : 0;
  }
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [, month, day, year] = match;
    const sec = Math.floor(
      new Date(Number(year), Number(month) - 1, Number(day)).getTime() / 1000
    );
    return Number.isFinite(sec) ? sec : 0;
  }
  return 0;
}

function idFromReportLink(link, index) {
  if (link && typeof link === 'string') {
    const m = link.match(/sighting\/\?id=(\d+)/i);
    if (m) return `nuforc-${m[1]}`;
  }
  return `nuforc-repo-${index}`;
}

async function readCsv(path) {
  const rows = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let header = null;
  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    const cells = parseCsvLine(line);
    if (lineNo === 1) {
      header = cells.map((c) => c.toLowerCase().trim());
      continue;
    }
    if (cells.length < 10) continue;
    const get = (name) => {
      const i = header.indexOf(name);
      return i >= 0 ? (cells[i] ?? '').trim() : '';
    };
    const lat = Number(get('city_latitude'));
    const lon = Number(get('city_longitude'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    rows.push({
      date_time: get('date_time'),
      summary: get('summary'),
      report_link: get('report_link'),
      shape: get('shape') || 'Unknown',
      city: get('city'),
      state: get('state'),
      country: get('country'),
      city_latitude: lat,
      city_longitude: lon,
    });
  }
  return rows;
}

/** Read raw JSONL from crawl-recent.sh; use Redis uap:geo: when available, else geocode via Nominatim, else state/country centroids. */
async function readRawJson(path, redisUrl, redisToken, redisPrefix) {
  const rows = [];
  const geoMem = new Map(); // in-run cache so we don't geocode the same place twice
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const city = (obj.city ?? obj.City ?? '').trim();
    const state = (obj.state ?? obj.State ?? '').trim();
    const country = (obj.country ?? obj.Country ?? 'USA').trim();
    let coords = null;
    const key = normalizeLocationKey(city, state, country);
    if (key && key !== '||' && key !== 'unknown||') {
      coords = await getCachedGeo(redisUrl, redisToken, redisPrefix, `uap:geo:${key}`);
      if (!coords && geoMem.has(key)) coords = geoMem.get(key);
      if (!coords && (city || state || country)) {
        const query = [city, state, country].filter(Boolean).join(', ');
        coords = await geocodeQuery(query);
        if (coords) {
          await setCachedGeo(redisUrl, redisToken, redisPrefix, `uap:geo:${key}`, coords.lat, coords.lon);
          geoMem.set(key, coords);
        }
        await new Promise((r) => setTimeout(r, NOMINATIM_DELAY_MS));
      }
    }
    if (!coords) coords = getCoords(state, country);
    if (!coords) continue;
    rows.push({
      date_time: obj.date_time ?? obj.date ?? '',
      summary: obj.summary ?? obj.text ?? '',
      report_link: obj.report_link ?? '',
      shape: (obj.shape ?? 'Unknown').trim() || 'Unknown',
      city_latitude: coords.lat,
      city_longitude: coords.lon,
    });
  }
  return rows;
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const rawJsonPath = process.env.NUFORC_REPO_RAW_JSON || defaultRawJson;
  const csvPath = process.env.NUFORC_REPO_CSV || defaultCsv;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const prefix = getRedisKeyPrefix();

  let rows;
  let source;
  if (process.env.NUFORC_REPO_RAW_JSON !== undefined) {
    try {
      rows = await readRawJson(rawJsonPath, url, token, prefix);
      source = 'raw JSON';
    } catch (e) {
      if (e.code === 'ENOENT') {
        console.error(`Raw JSON not found at ${rawJsonPath}`);
        process.exit(1);
      }
      throw e;
    }
  } else if (process.env.NUFORC_REPO_CSV !== undefined) {
    try {
      rows = await readCsv(csvPath);
      source = 'CSV';
    } catch (e) {
      if (e.code === 'ENOENT') {
        console.error(`CSV not found at ${csvPath}`);
        process.exit(1);
      }
      throw e;
    }
  } else {
    const rawExists = await fileExists(rawJsonPath);
    const csvExists = await fileExists(csvPath);
    if (rawExists) {
      rows = await readRawJson(rawJsonPath, url, token, prefix);
      source = 'raw JSON';
    } else if (csvExists) {
      rows = await readCsv(csvPath);
      source = 'CSV';
    } else {
      console.error(
        `No input file found. Set NUFORC_REPO_RAW_JSON or NUFORC_REPO_CSV, or create:\n  ${rawJsonPath}\n  (from: cd ~/git/nuforc && ./scripts/crawl-recent.sh)\nor\n  ${csvPath}`
      );
      process.exit(1);
    }
  }

  if (rows.length === 0) {
    console.error(`No valid rows from ${source}.`);
    process.exit(1);
  }
  rows.sort((a, b) => parseDateToSeconds(b.date_time) - parseDateToSeconds(a.date_time));
  const last200 = rows.slice(0, LIMIT).map((r, i) => ({
    id: idFromReportLink(r.report_link, i),
    lat: r.city_latitude,
    lon: r.city_longitude,
    timestamp: parseDateToSeconds(r.date_time),
    source: 'NUFORC',
    shape: r.shape,
    description: (r.summary || '').slice(0, 500),
    credibilityScore: 0.5,
  }));

  if (!url || !token) {
    console.error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
    process.exit(1);
  }
  const key = prefix + CACHE_KEY;
  const body = JSON.stringify(last200);
  const setUrl = `${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(body)}/EX/${CACHE_TTL}`;
  const res = await fetch(setUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error('Redis SET failed:', res.status, await res.text());
    process.exit(1);
  }
  console.log(`Seeded ${last200.length} UAP sightings to Redis (${key}) from ${source}, TTL ${CACHE_TTL}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
