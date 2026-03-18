/**
 * NUFORC (National UFO Reporting Center) data fetcher.
 * Uses daily posting pages (e.g. https://nuforc.org/subndx/?id=p260314 for 2026-03-14)
 * and falls back to id=all if needed. Resolves lat/lon from city when cached (see seed-uap-geocode),
 * otherwise uses US state and country centroids.
 */

import type { UapSighting } from '../../../../src/generated/server/worldmonitor/uap/v1/service_server';
import { CHROME_UA } from '../../../_shared/constants';
import { getCachedJson, setCachedJson } from '../../../_shared/redis';

const NUFORC_BASE = 'https://nuforc.org/subndx/';
const NUFORC_ALL_URL = `${NUFORC_BASE}?id=all`;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_SIGHTINGS = 500;
/** Number of recent daily pages to fetch (e.g. 14 = last two weeks of posted reports). */
const DAILY_PAGES_DAYS = 14;
const DELAY_BETWEEN_FETCHES_MS = 200;

// US state/territory abbreviation -> [lat, lon] (approximate state centroid)
const US_STATE_CENTROIDS: Record<string, [number, number]> = {
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

// Country name (as on NUFORC) -> [lat, lon]
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  USA: [37.1, -95.7], US: [37.1, -95.7], 'United States': [37.1, -95.7],
  Canada: [56.1, -106.3], CAN: [56.1, -106.3],
  UK: [55.4, -3.4], 'United Kingdom': [55.4, -3.4], GBR: [55.4, -3.4], England: [52.4, -1.5],
  Hungary: [47.2, 19.5], HUN: [47.2, 19.5],
  Australia: [-25.3, 133.8], AUS: [-25.3, 133.8],
  'South Korea': [35.9, 127.8], KOR: [35.9, 127.8],
  Germany: [51.2, 10.4], DEU: [51.2, 10.4],
  France: [46.2, 2.2], FRA: [46.2, 2.2],
  Brazil: [-14.2, -51.9], BRA: [-14.2, -51.9],
  Mexico: [23.6, -102.6], MEX: [23.6, -102.6],
  India: [20.6, 79.0], IND: [20.6, 79.0],
  Spain: [40.5, -3.7], ESP: [40.5, -3.7],
  Italy: [41.9, 12.6], ITA: [41.9, 12.6],
  Netherlands: [52.1, 5.3], NLD: [52.1, 5.3],
  Belgium: [50.5, 4.5], BEL: [50.5, 4.5],
  Sweden: [62.2, 17.6], SWE: [62.2, 17.6],
  Japan: [36.2, 138.3], JPN: [36.2, 138.3],
  'South Africa': [-30.6, 22.9], ZAF: [-30.6, 22.9],
  Argentina: [-38.4, -63.6], ARG: [-38.4, -63.6],
  Chile: [-35.7, -71.5], CHL: [-35.7, -71.5],
  'New Zealand': [-40.9, 174.9], NZL: [-40.9, 174.9],
  Ireland: [53.1, -8.0], IRL: [53.1, -8.0],
  Portugal: [39.4, -8.0], PRT: [39.4, -8.0],
  Poland: [52.0, 19.4], POL: [52.0, 19.4],
  Russia: [61.5, 105.3], RUS: [61.5, 105.3],
  China: [35.9, 104.2], CHN: [35.9, 104.2],
};

/** Normalize NUFORC country string to stable regionId for AAI (e.g. USA, GBR). */
export function normalizeCountryForRegion(country: string): string {
  const c = (country ?? '').trim();
  if (!c) return 'Unknown';
  const u = c.toUpperCase();
  if (u === 'US' || u === 'USA' || u === 'UNITED STATES') return 'USA';
  if (u === 'UK' || u === 'GBR' || u === 'UNITED KINGDOM' || u === 'ENGLAND') return 'GBR';
  if (u === 'CANADA' || u === 'CAN') return 'Canada';
  if (u === 'AUSTRALIA' || u === 'AUS') return 'Australia';
  if (u === 'JAPAN' || u === 'JPN') return 'Japan';
  if (u === 'GERMANY' || u === 'DEU') return 'Germany';
  if (u === 'FRANCE' || u === 'FRA') return 'France';
  if (u === 'BRAZIL' || u === 'BRA') return 'Brazil';
  if (u === 'MEXICO' || u === 'MEX') return 'Mexico';
  if (u === 'INDIA' || u === 'IND') return 'India';
  if (u === 'SPAIN' || u === 'ESP') return 'Spain';
  if (u === 'ITALY' || u === 'ITA') return 'Italy';
  if (u === 'NETHERLANDS' || u === 'NLD') return 'Netherlands';
  if (u === 'NEW ZEALAND' || u === 'NZL') return 'New Zealand';
  if (u === 'SOUTH KOREA' || u === 'KOR') return 'South Korea';
  if (u === 'SOUTH AFRICA' || u === 'ZAF') return 'South Africa';
  if (u === 'ARGENTINA' || u === 'ARG') return 'Argentina';
  if (u === 'RUSSIA' || u === 'RUS') return 'Russia';
  if (u === 'CHINA' || u === 'CHN') return 'China';
  return c;
}

/** Normalize "City, State, Country" for cache key (lowercase, trimmed, single spaces). */
export function normalizeLocationKey(city: string, state: string, country: string): string {
  const c = (city ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const s = (state ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const co = (country ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return `${c}|${s}|${co}`;
}

const UAP_GEO_CACHE_KEY_PREFIX = 'uap:geo:';
const UAP_GEO_CACHE_TTL = 604800; // 7 days

/** Synchronous fallback: US state or country centroid (no city). */
function getCoordsFromCentroid(_city: string, state: string, country: string): { lat: number; lon: number } | null {
  const countryNorm = country?.trim() || '';
  const stateNorm = (state?.trim() || '').toUpperCase().slice(0, 2);
  if (countryNorm.toUpperCase() === 'USA' || countryNorm.toUpperCase() === 'US' || countryNorm === 'United States') {
    const centroid = stateNorm && US_STATE_CENTROIDS[stateNorm];
    if (centroid) return { lat: centroid[0], lon: centroid[1] };
    return { lat: 37.1, lon: -95.7 };
  }
  const centroid = COUNTRY_CENTROIDS[countryNorm] ?? COUNTRY_CENTROIDS[countryNorm.toUpperCase()];
  if (centroid) return { lat: centroid[0], lon: centroid[1] };
  return null;
}

/** Resolve coords: Redis cache (city-level) first, then state/country centroid. */
export async function resolveCoords(city: string, state: string, country: string): Promise<{ lat: number; lon: number } | null> {
  const key = normalizeLocationKey(city, state, country);
  if (!key || key === '||' || key === 'unknown||') return getCoordsFromCentroid(city, state, country);
  const cached = (await getCachedJson(`${UAP_GEO_CACHE_KEY_PREFIX}${key}`)) as { lat: number; lon: number } | null;
  const fromCache = !!(cached && typeof cached.lat === 'number' && typeof cached.lon === 'number');
  const result = fromCache ? { lat: cached!.lat, lon: cached!.lon } : getCoordsFromCentroid(city, state, country);
  return result;
}

/** Write city-level coords to Redis (used by seed-uap-geocode). */
export async function setCachedCoords(city: string, state: string, country: string, lat: number, lon: number): Promise<void> {
  const key = normalizeLocationKey(city, state, country);
  if (!key || key === '||' || key === 'unknown||') return;
  await setCachedJson(`${UAP_GEO_CACHE_KEY_PREFIX}${key}`, { lat, lon }, UAP_GEO_CACHE_TTL);
}

/** Parse MM/DD/YYYY HH:MM or MM/DD/YYYY to Unix ms. */
function parseOccurred(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return 0;
  const [, month, day, year, hour = '0', min = '0'] = match;
  const d = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min), 0);
  return d.getTime();
}

/** Strip HTML tags and decode basic entities. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
    .replace(/\s+/g, ' ');
}

export interface NuforcRow {
  id: string;
  occurred: string;
  city: string;
  state: string;
  country: string;
  shape: string;
  summary: string;
}

/** Extract row from HTML by finding sighting id then collecting the following <td> cells in order. */
function parseNuforcByIdThenTds(html: string): NuforcRow[] {
  const rows: NuforcRow[] = [];
  const idRe = /sighting\/\?id=(\d+)/gi;
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const dateInTextRe = /\d{1,2}\/\d{1,2}\/\d{4}/;
  let m;
  while ((m = idRe.exec(html)) !== null) {
    const id = m[1] ?? '';
    const from = Math.max(0, m.index - 80);
    const chunk = html.slice(from, Math.min(html.length, m.index + 1100));
    const cells: string[] = [];
    tdRe.lastIndex = 0;
    let tdMatch;
    while ((tdMatch = tdRe.exec(chunk)) !== null) {
      cells.push(stripHtml(tdMatch[1] ?? '').trim());
    }
    if (cells.length < 6) continue;
    // Chunk may include previous row's last <td>; find where the date cell is (Occurred is always next after link)
    const dateCellIndex = cells.findIndex((c) => dateInTextRe.test(c));
    const start = dateCellIndex >= 0 ? dateCellIndex : 1;
    if (cells.length < start + 6) continue;
    const occurred = cells[start] ?? '';
    const city = cells[start + 1] ?? '';
    const state = cells[start + 2] ?? '';
    const country = cells[start + 3] ?? 'USA';
    const shapeOrSummary = cells[start + 4] ?? '';
    const summaryPart = cells[start + 5] ?? '';
    const hasSummary = cells.length > start + 5;
    const shape = hasSummary ? shapeOrSummary : shapeOrSummary;
    const summary = hasSummary ? summaryPart : shapeOrSummary;
    if (!dateInTextRe.test(occurred) && !dateInTextRe.test(cells.join(' '))) continue;
    rows.push({
      id: `nuforc-${id}`,
      occurred: occurred.trim(),
      city: city.trim() || 'Unknown',
      state: state.trim(),
      country: country.trim() || 'USA',
      shape: shape || '',
      summary: summary || '',
    });
  }
  return rows;
}

/**
 * Parse NUFORC table into structured rows.
 * When response looks like markdown (id=all often does), try pipe table first; else try HTML <td>, then loose.
 */
function parseNuforcHtml(html: string): NuforcRow[] {
  const looksLikeMarkdown = html.includes('| Link |') || html.includes('| --- |');
  let rows: NuforcRow[] = [];
  if (looksLikeMarkdown) {
    rows = parseNuforcPipeTable(html);
    if (rows.length > 0) return rows;
  }

  rows = parseNuforcByIdThenTds(html);
  if (rows.length > 0) return rows;

  rows = parseNuforcPipeTable(html);
  if (rows.length > 0) return rows;

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRe.exec(html)) !== null) {
    const rowHtml = trMatch[1];
    if (rowHtml == null) continue;
    const idMatch = rowHtml.match(/sighting\/\?id=(\d+)/i);
    if (!idMatch) continue;
    const id = idMatch[1] ?? idMatch[0].replace(/.*id=(\d+)/i, '$1');
    const cells: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    tdRe.lastIndex = 0;
    let tdMatch;
    while ((tdMatch = tdRe.exec(rowHtml)) !== null) {
      cells.push(stripHtml(tdMatch[1] ?? ''));
    }
    if (cells.length < 6) continue;
    const [, occurred, city, state, country, shapeOrSummary] = cells;
    const hasSummary = cells.length >= 7;
    const shape = hasSummary ? (shapeOrSummary ?? '') : '';
    const summary = hasSummary ? (cells[6] ?? '') : (shapeOrSummary ?? '');
    if (!occurred || !(city ?? '').trim()) continue;
    rows.push({
      id: `nuforc-${id}`,
      occurred: occurred ?? '',
      city: (city ?? '').trim(),
      state: (state ?? '') || '',
      country: (country ?? '') || 'USA',
      shape: shape || '',
      summary: summary || '',
    });
  }

  if (rows.length === 0) {
    rows = parseNuforcLoose(html);
  }
  return rows;
}

/**
 * Fallback: extract sighting id + date + state/country from surrounding HTML (no table structure).
 */
function parseNuforcLoose(html: string): NuforcRow[] {
  const rows: NuforcRow[] = [];
  const idRe = /sighting\/\?id=(\d+)/gi;
  const dateRe = /(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+\d{1,2}:\d{2})?/;
  const stateRe = /\b([A-Z]{2})\b/;
  const usaRe = /\b(USA|US|United States)\b/i;
  let m;
  while ((m = idRe.exec(html)) !== null) {
    const id = m[1] ?? '';
    const start = Math.max(0, m.index - 50);
    const end = Math.min(html.length, m.index + 400);
    const chunk = html.slice(start, end);
    const dateMatch = chunk.match(dateRe);
    const occurred = dateMatch?.[1] ?? '';
    const stateMatch = chunk.match(stateRe);
    const rawState = (stateMatch?.[1] ?? '').toUpperCase();
    const state = rawState && rawState in US_STATE_CENTROIDS ? rawState : '';
    const country = usaRe.test(chunk) ? 'USA' : 'USA';
    rows.push({
      id: `nuforc-${id}`,
      occurred,
      city: 'Unknown',
      state,
      country,
      shape: '',
      summary: stripHtml(chunk).slice(0, 200),
    });
  }
  return rows;
}

/**
 * Parse pipe-separated table lines (markdown or pre-rendered text).
 * NUFORC id=all often returns this format. Columns: Link | Occurred | City | State | Country | Shape | Summary | Reported | Media | Explanation
 */
function parseNuforcPipeTable(html: string): NuforcRow[] {
  const rows: NuforcRow[] = [];
  const lines = html.split(/\r?\n/);
  const idRe = /sighting\/\?id=(\d+)/i;
  const dateRe = /(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2})?)/;
  for (const line of lines) {
    const idMatch = line.match(idRe);
    if (!idMatch) continue;
    const id = idMatch[1];
    const parts = line.split(/\s*\|\s*/).map((p) => p.trim());
    // After split: 0=empty, 1=Link, 2=Occurred, 3=City, 4=State, 5=Country, 6=Shape or Summary, 7+=Summary/Reported
    if (parts.length < 8) continue;
    const occurred = parts[2]?.match(dateRe)?.[1] ?? '';
    const city = (parts[3] ?? '').replace(/^\[.*?\]\(.*?\)\s*/, '').trim();
    const state = (parts[4] ?? '').trim();
    const country = (parts[5] ?? 'USA').trim();
    const col6 = (parts[6] ?? '').trim();
    const col7 = (parts[7] ?? '').trim();
    // When Shape column is empty, col6 is the summary and col7 is Reported date
    const col7IsDate = dateRe.test(col7);
    const shape = col7IsDate && col6.length > 40 ? '' : col6;
    const summary =
      parts.length > 10
        ? parts.slice(7, -3).join('|').trim()
        : col7IsDate && col6.length > 40
          ? col6
          : col7;
    if (!occurred && !city && !state) continue;
    rows.push({
      id: `nuforc-${id}`,
      occurred,
      city: city || 'Unknown',
      state,
      country: country || 'USA',
      shape,
      summary,
    });
  }
  return rows;
}

/** Build NUFORC daily page URL: id=pYYMMDD (e.g. p260314 = 2026-03-14). */
function nuforcDailyUrl(date: Date): string {
  const yy = date.getFullYear() % 100;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${NUFORC_BASE}?id=p${yy}${mm}${dd}`;
}

async function rowsToSightings(rows: NuforcRow[]): Promise<UapSighting[]> {
  const sightings: UapSighting[] = [];
  for (const row of rows) {
    const coords = await resolveCoords(row.city, row.state, row.country);
    if (!coords) continue;
    // timestamp = occurrence date (when the sighting occurred; NUFORC "Occurred" column)
    const timestamp = parseOccurred(row.occurred);
    sightings.push({
      id: row.id,
      lat: coords.lat,
      lon: coords.lon,
      timestamp: timestamp > 0 ? Math.floor(timestamp / 1000) : 0,
      source: 'NUFORC',
      shape: row.shape || '',
      description: row.summary ? row.summary.slice(0, 500) : '',
      credibilityScore: 0.5,
      country: normalizeCountryForRegion(row.country),
    });
  }
  return sightings;
}

/**
 * Fetch NUFORC sightings: try id=all first (most reliable, pipe/markdown table), then daily pages.
 */
export async function fetchNuforcSightings(): Promise<UapSighting[]> {
  const seenIds = new Set<string>();
  const allRows: NuforcRow[] = [];

  // id=all is the most reliable source (pipe/markdown table format); try first, with one retry.
  for (let attempt = 0; attempt < 2 && allRows.length === 0; attempt++) {
    try {
      const res = await fetch(NUFORC_ALL_URL, {
        headers: { 'User-Agent': CHROME_UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.ok) {
        const html = await res.text();
        const parsed = parseNuforcHtml(html);
        for (const row of parsed) {
          if (seenIds.has(row.id)) continue;
          seenIds.add(row.id);
          allRows.push(row);
        }
      }
      if (allRows.length === 0 && attempt === 0) await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      if (attempt === 1) console.warn('[UAP] NUFORC id=all fetch failed:', e);
    }
  }

  if (allRows.length > 0) {
    const sightings = await rowsToSightings(allRows.slice(0, MAX_SIGHTINGS));
    if (sightings.length > 0) return sightings;
  }

  // Fallback: daily pages ?id=pYYMMDD (e.g. p260314 for March 14, 2026)
  for (let i = 0; i < DAILY_PAGES_DAYS; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const url = nuforcDailyUrl(d);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': CHROME_UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const rows = parseNuforcHtml(html);
      for (const row of rows) {
        if (seenIds.has(row.id)) continue;
        seenIds.add(row.id);
        allRows.push(row);
      }
      if (i < DAILY_PAGES_DAYS - 1) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_FETCHES_MS));
      }
    } catch {
      // skip this day and continue
    }
  }

  if (allRows.length > 0) {
    const sightings = await rowsToSightings(allRows.slice(0, MAX_SIGHTINGS));
    if (sightings.length > 0) return sightings;
  }

  return [];
}

/** Fetch and parse NUFORC into raw rows (for geocode cache warming). */
export async function fetchNuforcRows(): Promise<NuforcRow[]> {
  const seenIds = new Set<string>();
  const allRows: NuforcRow[] = [];

  try {
    const res = await fetch(NUFORC_ALL_URL, {
      headers: { 'User-Agent': CHROME_UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const html = await res.text();
      const parsed = parseNuforcHtml(html);
      for (const row of parsed) {
        if (seenIds.has(row.id)) continue;
        seenIds.add(row.id);
        allRows.push(row);
      }
    }
  } catch {
    // continue to daily pages
  }

  if (allRows.length > 0) return allRows.slice(0, MAX_SIGHTINGS);

  for (let i = 0; i < DAILY_PAGES_DAYS; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const url = nuforcDailyUrl(d);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': CHROME_UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const rows = parseNuforcHtml(html);
      for (const row of rows) {
        if (seenIds.has(row.id)) continue;
        seenIds.add(row.id);
        allRows.push(row);
      }
      if (i < DAILY_PAGES_DAYS - 1) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_FETCHES_MS));
      }
    } catch {
      // skip
    }
  }

  return allRows.slice(0, MAX_SIGHTINGS);
}
