/**
 * Infer country/region for UAP sightings when the feed omits `country` (common on data.world CSV)
 * but lat/lon (and optionally NUFORC state) are present — same logic for map list + AAI scoring.
 */

import type { UapSighting } from '../../../../src/generated/server/worldmonitor/uap/v1/service_server';
import { normalizeCountryForRegion } from './nuforc';

/** US state / DC / territory codes as used in NUFORC "state" column */
const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
  'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
]);

/** Approximate bounding boxes (ISO 3166-1 alpha-2). Smaller countries first after sort for overlap resolution. */
const COUNTRY_BBOX: Record<string, { minLat: number; maxLat: number; minLon: number; maxLon: number }> = {
  IL: { minLat: 29.5, maxLat: 33.3, minLon: 34.3, maxLon: 35.9 },
  KW: { minLat: 28.5, maxLat: 30.1, minLon: 46.5, maxLon: 48.4 },
  BE: { minLat: 49.5, maxLat: 51.6, minLon: 2.5, maxLon: 6.4 },
  CH: { minLat: 45.8, maxLat: 47.8, minLon: 5.9, maxLon: 10.5 },
  NL: { minLat: 50.7, maxLat: 53.7, minLon: 3.2, maxLon: 7.2 },
  PT: { minLat: 36.9, maxLat: 42.2, minLon: -9.5, maxLon: -6.2 },
  TW: { minLat: 21.9, maxLat: 25.3, minLon: 120.0, maxLon: 122.0 },
  KR: { minLat: 33.2, maxLat: 38.6, minLon: 124.6, maxLon: 132.0 },
  AE: { minLat: 22.6, maxLat: 26.1, minLon: 51.6, maxLon: 56.4 },
  KP: { minLat: 37.7, maxLat: 43.0, minLon: 124.3, maxLon: 130.7 },
  IE: { minLat: 51.2, maxLat: 55.4, minLon: -10.5, maxLon: -6.0 },
  DK: { minLat: 54.6, maxLat: 57.8, minLon: 8.0, maxLon: 15.2 },
  AT: { minLat: 46.3, maxLat: 49.0, minLon: 9.5, maxLon: 17.2 },
  CZ: { minLat: 48.5, maxLat: 51.1, minLon: 12.0, maxLon: 18.9 },
  HU: { minLat: 45.7, maxLat: 48.6, minLon: 16.1, maxLon: 22.9 },
  SY: { minLat: 32.3, maxLat: 37.3, minLon: 35.7, maxLon: 42.4 },
  YE: { minLat: 12.1, maxLat: 19.0, minLon: 42.5, maxLon: 54.5 },
  CU: { minLat: 19.8, maxLat: 23.3, minLon: -85.0, maxLon: -74.1 },
  GR: { minLat: 34.8, maxLat: 41.7, minLon: 20.0, maxLon: 26.6 },
  NZ: { minLat: -47.3, maxLat: -34.4, minLon: 166.0, maxLon: 178.6 },
  RO: { minLat: 43.6, maxLat: 48.2, minLon: 20.2, maxLon: 29.7 },
  PL: { minLat: 49.0, maxLat: 54.8, minLon: 14.1, maxLon: 24.2 },
  GB: { minLat: 49.9, maxLat: 60.9, minLon: -8.2, maxLon: 1.8 },
  IT: { minLat: 35.5, maxLat: 47.1, minLon: 6.6, maxLon: 18.5 },
  ES: { minLat: 27.6, maxLat: 43.8, minLon: -9.5, maxLon: 4.5 },
  DE: { minLat: 47.3, maxLat: 55.1, minLon: 5.9, maxLon: 15.0 },
  FR: { minLat: 41.4, maxLat: 51.1, minLon: -5.1, maxLon: 9.6 },
  SE: { minLat: 55.3, maxLat: 69.1, minLon: 11.0, maxLon: 24.2 },
  NO: { minLat: 58.0, maxLat: 71.3, minLon: 4.5, maxLon: 31.1 },
  FI: { minLat: 59.8, maxLat: 70.1, minLon: 20.6, maxLon: 31.6 },
  UA: { minLat: 44.4, maxLat: 52.4, minLon: 22.1, maxLon: 40.2 },
  TR: { minLat: 36.0, maxLat: 42.1, minLon: 26.0, maxLon: 44.8 },
  SA: { minLat: 16.4, maxLat: 32.2, minLon: 34.6, maxLon: 55.7 },
  IR: { minLat: 25.1, maxLat: 39.8, minLon: 44.0, maxLon: 63.3 },
  PK: { minLat: 23.7, maxLat: 37.1, minLon: 60.9, maxLon: 77.8 },
  TH: { minLat: 5.6, maxLat: 20.5, minLon: 97.3, maxLon: 105.6 },
  PH: { minLat: 4.6, maxLat: 21.1, minLon: 116.9, maxLon: 126.6 },
  MY: { minLat: 0.8, maxLat: 7.4, minLon: 99.6, maxLon: 119.3 },
  ZA: { minLat: -34.8, maxLat: -22.1, minLon: 16.5, maxLon: 32.9 },
  CL: { minLat: -55.1, maxLat: -17.5, minLon: -75.7, maxLon: -66.4 },
  VE: { minLat: 0.6, maxLat: 12.2, minLon: -73.4, maxLon: -59.8 },
  CO: { minLat: -4.2, maxLat: 12.5, minLon: -79.0, maxLon: -66.7 },
  PE: { minLat: -18.4, maxLat: -0.0, minLon: -81.4, maxLon: -68.7 },
  AR: { minLat: -55.1, maxLat: -21.8, minLon: -73.6, maxLon: -53.6 },
  BR: { minLat: -33.7, maxLat: 5.3, minLon: -73.9, maxLon: -34.8 },
  MX: { minLat: 14.5, maxLat: 32.7, minLon: -118.4, maxLon: -86.7 },
  IN: { minLat: 6.7, maxLat: 35.5, minLon: 68.1, maxLon: 97.4 },
  MM: { minLat: 9.8, maxLat: 28.5, minLon: 92.2, maxLon: 101.2 },
  JP: { minLat: 24.2, maxLat: 45.5, minLon: 122.9, maxLon: 145.8 },
  CN: { minLat: 18.2, maxLat: 53.6, minLon: 73.5, maxLon: 135.1 },
  AU: { minLat: -43.6, maxLat: -10.1, minLon: 113.0, maxLon: 153.6 },
  CA: { minLat: 41.7, maxLat: 83.1, minLon: -141.0, maxLon: -52.6 },
  US: { minLat: 24.5, maxLat: 49.4, minLon: -125.0, maxLon: -66.9 },
  RU: { minLat: 41.2, maxLat: 81.9, minLon: 19.6, maxLon: 180.0 },
};

const ISO2_TO_ENGLISH: Record<string, string> = {
  US: 'United States', CA: 'Canada', GB: 'United Kingdom', DE: 'Germany', FR: 'France', AU: 'Australia',
  MX: 'Mexico', BR: 'Brazil', JP: 'Japan', IN: 'India', CN: 'China', RU: 'Russia', IT: 'Italy', ES: 'Spain',
  NL: 'Netherlands', SE: 'Sweden', NO: 'Norway', NZ: 'New Zealand', PL: 'Poland', UA: 'Ukraine', TR: 'Turkey',
  AR: 'Argentina', CL: 'Chile', ZA: 'South Africa', PT: 'Portugal', IE: 'Ireland', BE: 'Belgium', AT: 'Austria',
  CH: 'Switzerland', GR: 'Greece', CZ: 'Czech Republic', HU: 'Hungary', RO: 'Romania', FI: 'Finland', DK: 'Denmark',
  KR: 'South Korea', IL: 'Israel', SA: 'Saudi Arabia', AE: 'United Arab Emirates', IR: 'Iran', PK: 'Pakistan',
  TH: 'Thailand', PH: 'Philippines', MY: 'Malaysia', MM: 'Myanmar', SY: 'Syria', YE: 'Yemen', VE: 'Venezuela',
  CU: 'Cuba', CO: 'Colombia', PE: 'Peru', TW: 'Taiwan', KP: 'North Korea', KW: 'Kuwait',
};

const BBOX_SORTED = Object.entries(COUNTRY_BBOX)
  .map(([code, b]) => ({
    code,
    ...b,
    area: Math.max(0.001, (b.maxLat - b.minLat) * (b.maxLon - b.minLon)),
  }))
  .sort((a, b) => a.area - b.area);

function countryIso2FromLatLon(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let lonNorm = lon;
  while (lonNorm > 180) lonNorm -= 360;
  while (lonNorm < -180) lonNorm += 360;
  for (const b of BBOX_SORTED) {
    if (lat >= b.minLat && lat <= b.maxLat && lonNorm >= b.minLon && lonNorm <= b.maxLon) return b.code;
  }
  return null;
}

/**
 * English country name suitable for normalizeCountryForRegion, or undefined if unknown.
 */
export function inferCountryNameFromLatLonState(lat: number, lon: number, state?: string): string | undefined {
  const st2 = (state ?? '').trim().toUpperCase().slice(0, 2);
  if (st2.length === 2 && US_STATE_CODES.has(st2)) return 'United States';

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    // Alaska, Hawaii, PR/VI, Guam (outside CONUS bbox; avoid misclassifying as CA/RU)
    if (lat >= 51 && lat <= 72 && lon >= -179 && lon <= -129) return 'United States';
    if (lat >= 18 && lat <= 29 && lon >= -161 && lon <= -154) return 'United States';
    if (lat >= 17 && lat <= 20.5 && lon >= -68.5 && lon <= -64) return 'United States';
    if (lat >= 13 && lat <= 14.7 && lon >= 144.5 && lon <= 145) return 'United States';
  }

  const iso = countryIso2FromLatLon(lat, lon);
  if (!iso) return undefined;
  return ISO2_TO_ENGLISH[iso];
}

export function enrichSightingsWithInferredCountry(sightings: UapSighting[]): UapSighting[] {
  return sightings.map((s) => {
    if ((s.country ?? '').trim()) return s;
    const name = inferCountryNameFromLatLonState(s.lat ?? 0, s.lon ?? 0, undefined);
    if (!name) return s;
    return { ...s, country: normalizeCountryForRegion(name) };
  });
}

export function regionIdForSighting(s: UapSighting): string {
  const c = (s.country ?? '').trim();
  if (c) return normalizeCountryForRegion(c);
  const name = inferCountryNameFromLatLonState(s.lat ?? 0, s.lon ?? 0, undefined);
  if (name) return normalizeCountryForRegion(name);
  return 'Unknown';
}
