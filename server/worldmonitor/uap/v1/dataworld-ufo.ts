/**
 * Fetch UAP sightings from the data.world dataset by timothyrenner (nuforc_sightings_data).
 * Cleaned, geocoded NUFORC-derived data; avoids scraping nuforc.org.
 * See: https://data.world/timothyrenner/ufo-sightings and https://github.com/timothyrenner/nuforc_sightings_data
 */

import type { UapSighting } from '../../../../src/generated/server/worldmonitor/uap/v1/service_server';
import { inferCountryNameFromLatLonState } from './uap-sighting-region';
import { normalizeCountryForRegion } from './nuforc';

const DATAWORLD_OWNER = 'timothyrenner';
const DATAWORLD_DATASET = 'ufo-sightings';
const DATAWORLD_FILES = ['scrubbed.csv', 'nuforc_reports.csv'];
const FETCH_TIMEOUT_MS = 25_000;
const MAX_SIGHTINGS = 500;

/** Parse ISO or M/D/YYYY date to Unix seconds. */
function parseDateToSeconds(val: string): number {
  if (!val || typeof val !== 'string') return 0;
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const sec = Math.floor(new Date(trimmed).getTime() / 1000);
    return Number.isFinite(sec) ? sec : 0;
  }
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [, month, day, year] = match;
    const sec = Math.floor(new Date(Number(year), Number(month) - 1, Number(day)).getTime() / 1000);
    return Number.isFinite(sec) ? sec : 0;
  }
  return 0;
}

/** Extract NUFORC id from report_link (e.g. https://nuforc.org/sighting/?id=12345 -> 12345). */
function idFromReportLink(link: string, index: number): string {
  if (link && typeof link === 'string') {
    const m = link.match(/sighting\/\?id=(\d+)/i);
    if (m) return `nuforc-${m[1]}`;
  }
  return `dataworld-${index}`;
}

/**
 * Fetch UFO sightings from data.world (timothyrenner/ufo-sightings).
 * Requires DATA_WORLD_TOKEN env var. Returns [] if token missing or fetch fails.
 */
export async function fetchDataworldUfoSightings(): Promise<UapSighting[]> {
  const token = process.env.DATA_WORLD_TOKEN;
  if (!token || typeof token !== 'string') return [];

  let text = '';
  for (const file of DATAWORLD_FILES) {
    const url = `https://download.data.world/file_download/${DATAWORLD_OWNER}/${DATAWORLD_DATASET}/${file}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (e) {
      console.warn('[UAP] data.world fetch failed:', e);
      continue;
    }
    if (!res.ok) {
      if (res.status === 404) continue;
      console.warn('[UAP] data.world response:', res.status);
      return [];
    }
    text = await res.text();
    break;
  }
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const header = lines[0]!.toLowerCase();
  const cols = header.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
  const idx = {
    city_latitude: cols.indexOf('city_latitude'),
    city_longitude: cols.indexOf('city_longitude'),
    summary: cols.indexOf('summary'),
    city: cols.indexOf('city'),
    state: cols.indexOf('state'),
    date_time: cols.indexOf('date_time'),
    shape: cols.indexOf('shape'),
    report_link: cols.indexOf('report_link'),
    country: cols.indexOf('country'),
  };
  if (idx.city_latitude < 0 || idx.city_longitude < 0) {
    console.warn('[UAP] data.world CSV missing lat/lon columns');
    return [];
  }

  const sightings: UapSighting[] = [];
  for (let i = 1; i < lines.length && sightings.length < MAX_SIGHTINGS; i++) {
    const line = lines[i];
    if (!line) continue;
    const row = parseCsvLine(line);
    const lat = Number(row[idx.city_latitude] ?? '');
    const lon = Number(row[idx.city_longitude] ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const summary = idx.summary >= 0 ? (row[idx.summary] ?? '').slice(0, 500) : '';
    const reportLink = idx.report_link >= 0 ? row[idx.report_link] ?? '' : '';
    const countryRaw = idx.country >= 0 ? (row[idx.country] ?? '').trim() : '';
    const stateVal = idx.state >= 0 ? (row[idx.state] ?? '').trim() : '';
    const inferred = !countryRaw ? inferCountryNameFromLatLonState(lat, lon, stateVal) : null;
    const countryNorm = countryRaw
      ? normalizeCountryForRegion(countryRaw)
      : inferred
        ? normalizeCountryForRegion(inferred)
        : undefined;
    // timestamp = occurrence date (date_time in this CSV is when the sighting occurred, not posted)
    sightings.push({
      id: idFromReportLink(reportLink, i),
      lat,
      lon,
      timestamp: parseDateToSeconds(idx.date_time >= 0 ? (row[idx.date_time] ?? '') : ''),
      source: 'NUFORC',
      shape: (idx.shape >= 0 ? row[idx.shape] : '') || 'Unknown',
      description: summary,
      credibilityScore: 0.5,
      ...(countryNorm ? { country: countryNorm } : {}),
    });
  }
  return sightings;
}

/** Simple CSV line parse (handles quoted fields with commas). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
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
