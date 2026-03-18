/**
 * ListUapSightings — returns UAP sightings from data.world (timothyrenner/ufo-sightings) when
 * DATA_WORLD_TOKEN is set, else from NUFORC scrape (https://nuforc.org/subndx/?id=all).
 * Cached with TTL; optional bbox/sinceDate filtering.
 */

import type {
  ServerContext,
  ListUapSightingsRequest,
  ListUapSightingsResponse,
  UapSighting,
} from '../../../../src/generated/server/worldmonitor/uap/v1/service_server';

import { getCachedJson, setCachedJson } from '../../../_shared/redis';
import { fetchDataworldUfoSightings } from './dataworld-ufo';
import { fetchNuforcSightings } from './nuforc';
import { FALLBACK_SIGHTINGS } from './fallback-sightings';
import { enrichSightingsWithInferredCountry } from './uap-sighting-region';

const CACHE_KEY_RAW = 'uap:sightings:nuforc:v1';
const CACHE_TTL_RAW = 3600; // 1 hr — NUFORC index updates infrequently
const CACHE_TTL_FILTERED = 600; // 10 min for filtered responses

function inBbox(lat: number, lon: number, swLat?: number, swLon?: number, neLat?: number, neLon?: number): boolean {
  if (swLat == null || swLon == null || neLat == null || neLon == null) return true;
  return lat >= swLat && lat <= neLat && lon >= swLon && lon <= neLon;
}

export async function listUapSightings(
  _ctx: ServerContext,
  req: ListUapSightingsRequest,
): Promise<ListUapSightingsResponse> {
  const cached = (await getCachedJson(CACHE_KEY_RAW)) as UapSighting[] | null;
  let allSightings: UapSighting[] = Array.isArray(cached) ? cached : [];
  if (allSightings.length === 0) {
    try {
      if (process.env.DATA_WORLD_TOKEN) {
        allSightings = await fetchDataworldUfoSightings();
      }
      if (allSightings.length === 0) {
        allSightings = await fetchNuforcSightings();
      }
      if (allSightings.length > 0) {
        await setCachedJson(CACHE_KEY_RAW, allSightings, CACHE_TTL_RAW);
      } else {
        console.warn('[UAP] No sightings from data.world or NUFORC—serving bundled fallback');
        allSightings = [...FALLBACK_SIGHTINGS];
      }
    } catch (e) {
      console.warn('[UAP] Sightings fetch failed:', e);
      allSightings = [...FALLBACK_SIGHTINGS];
    }
  }

  allSightings = enrichSightingsWithInferredCountry(allSightings);

  let list: UapSighting[] = allSightings;
  if (req.source && req.source !== 'NUFORC') {
    list = list.filter((s: UapSighting) => s.source === req.source);
  }
  if (req.sinceDate && req.sinceDate > 0) {
    const sinceSec = Number(req.sinceDate);
    // Filter by occurrence date (timestamp = when the sighting occurred, not when reported)
    list = list.filter((s: UapSighting) => (s.timestamp ?? 0) >= sinceSec);
  }
  if (req.minCredibility != null && req.minCredibility > 0) {
    list = list.filter((s: UapSighting) => (s.credibilityScore ?? 0) >= req.minCredibility!);
  }
  // Only apply bbox when client sent a non-default box (missing params become 0; 0,0,0,0 = no filter).
  const hasBbox =
    (req.swLat != null && req.swLat !== 0) ||
    (req.swLon != null && req.swLon !== 0) ||
    (req.neLat != null && req.neLat !== 0) ||
    (req.neLon != null && req.neLon !== 0);
  if (hasBbox) {
    list = list.filter((s: UapSighting) =>
      inBbox(s.lat ?? 0, s.lon ?? 0, req.swLat, req.swLon, req.neLat, req.neLon),
    );
  }

  const pageSize = req.pageSize > 0 && req.pageSize <= 200 ? req.pageSize : 50;
  const sightings = list.slice(0, pageSize);

  const cacheKeyFiltered = `${CACHE_KEY_RAW}:${req.neLat ?? ''}:${req.neLon ?? ''}:${req.swLat ?? ''}:${req.swLon ?? ''}:${req.sinceDate ?? ''}:${req.source ?? ''}:${req.minCredibility ?? ''}`;
  if (sightings.length > 0) await setCachedJson(cacheKeyFiltered, { sightings }, CACHE_TTL_FILTERED);

  return { sightings };
}
