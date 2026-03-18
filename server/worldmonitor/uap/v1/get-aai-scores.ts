/**
 * GetAaiScores — Anomalous Activity Index: regional sighting density plus
 * observation-context adjustment (Medina et al. 2023, Sci Reports — reporting opportunity).
 */

import type {
  ServerContext,
  GetAaiScoresRequest,
  GetAaiScoresResponse,
  AaiScore,
  RecentSightingSummary,
  UapSighting,
} from '../../../../src/generated/server/worldmonitor/uap/v1/service_server';

import { getCachedJson, setCachedJson } from '../../../_shared/redis';
import { fetchDataworldUfoSightings } from './dataworld-ufo';
import { fetchNuforcSightings } from './nuforc';
import { FALLBACK_SIGHTINGS } from './fallback-sightings';
import { enrichSightingsWithInferredCountry, regionIdForSighting } from './uap-sighting-region';
import {
  expectationMultiplier,
  observationContextIndex,
} from './observation-context';

const SIGHTINGS_CACHE_KEY = 'uap:sightings:nuforc:v1';
const SIGHTINGS_CACHE_TTL = 3600;
const CACHE_KEY = 'uap:aai-scores:v1';
const PREV_CACHE_KEY = 'uap:aai-scores:prev:v1';
const CACHE_TTL = 600;
const AAI_LOOKBACK_DAYS = 90;
const MAX_REGIONS_RETURNED = 100;
const RECENT_SIGHTINGS_DAYS = 7;
const RECENT_SIGHTINGS_MAX = 20;
/** Max points raw AAI can move when applying context adjustment vs unadjusted density score. */
const ADJUSTMENT_DELTA_CAP = 15;

const BUCKET_DAYS = [1, 7, 30, 90, 180, 365] as const;

const METHODOLOGY_NOTE =
  'Adjusted AAI weights sightings by regional reporting-opportunity proxies (sky visibility, air traffic, military activity) per Medina et al., Sci Rep 2023; elevated context increases expected reports—not proven anomalous activity.';

const SCORE_LEVEL_BANDS: [number, number, string][] = [
  [0, 25, 'low'],
  [25, 50, 'moderate'],
  [50, 75, 'elevated'],
  [75, 101, 'high'],
];

function scoreToLevel(score: number): string {
  for (const [lo, hi, level] of SCORE_LEVEL_BANDS) {
    if (score >= lo && score < hi) return level;
  }
  return 'low';
}

async function getRawSightings(): Promise<UapSighting[]> {
  const cached = (await getCachedJson(SIGHTINGS_CACHE_KEY)) as UapSighting[] | null;
  if (Array.isArray(cached) && cached.length > 0) return enrichSightingsWithInferredCountry(cached);
  try {
    if (process.env.DATA_WORLD_TOKEN) {
      const fromDataworld = await fetchDataworldUfoSightings();
      if (fromDataworld.length > 0) {
        await setCachedJson(SIGHTINGS_CACHE_KEY, fromDataworld, SIGHTINGS_CACHE_TTL);
        return enrichSightingsWithInferredCountry(fromDataworld);
      }
    }
    const fromNuforc = await fetchNuforcSightings();
    if (fromNuforc.length > 0) {
      await setCachedJson(SIGHTINGS_CACHE_KEY, fromNuforc, SIGHTINGS_CACHE_TTL);
      return enrichSightingsWithInferredCountry(fromNuforc);
    }
  } catch (e) {
    console.warn('[UAP] AAI sightings fetch failed:', e);
  }
  const fallback = [...FALLBACK_SIGHTINGS];
  await setCachedJson(SIGHTINGS_CACHE_KEY, fallback, SIGHTINGS_CACHE_TTL);
  return enrichSightingsWithInferredCountry(fallback);
}

function normalizeShape(shape: string): string {
  const s = (shape ?? '').trim();
  return s || 'Unknown';
}

function computeScoresFromSightings(
  sightings: UapSighting[],
  prevScores: AaiScore[] | null,
): AaiScore[] {
  const nowSec = Math.floor(Date.now() / 1000);
  const since90d = nowSec - AAI_LOOKBACK_DAYS * 86400;
  const inWindow90d = sightings.filter((s) => (s.timestamp ?? 0) >= since90d);

  const byRegion = new Map<string, number>();
  const byRegionByBucket = new Map<string, Partial<Record<(typeof BUCKET_DAYS)[number], number>>>();
  const byRegionByShape = new Map<string, Record<string, number>>();

  for (const s of sightings) {
    const ts = s.timestamp ?? 0;
    const regionId = regionIdForSighting(s);
    for (const bucketDays of BUCKET_DAYS) {
      const since = nowSec - bucketDays * 86400;
      if (ts < since) continue;
      if (bucketDays === 90) {
        byRegion.set(regionId, (byRegion.get(regionId) ?? 0) + 1);
      }
      const buckets = byRegionByBucket.get(regionId) ?? {};
      buckets[bucketDays] = (buckets[bucketDays] ?? 0) + 1;
      byRegionByBucket.set(regionId, buckets);
    }
  }

  for (const s of inWindow90d) {
    const regionId = regionIdForSighting(s);
    const shape = normalizeShape(s.shape);
    const shapes = byRegionByShape.get(regionId) ?? {};
    shapes[shape] = (shapes[shape] ?? 0) + 1;
    byRegionByShape.set(regionId, shapes);
  }

  const prevByAdjusted = new Map<string, number>();
  if (Array.isArray(prevScores)) {
    for (const p of prevScores) {
      const key = p.adjustedAaiScore ?? p.score;
      prevByAdjusted.set(p.regionId, key);
    }
  }

  const maxDensity = Math.max(1, ...byRegion.values());
  const regions = [...byRegion.keys()];
  const effectiveByRegion = new Map<string, number>();
  for (const regionId of regions) {
    const count = byRegion.get(regionId) ?? 0;
    const e = Math.max(0.25, expectationMultiplier(regionId));
    effectiveByRegion.set(regionId, count / e);
  }
  const maxEffective = Math.max(1e-6, ...effectiveByRegion.values());

  const instScore = 0;

  const scores: AaiScore[] = [];
  for (const [regionId, count] of byRegion.entries()) {
    const sightingDensity = count;
    const institutionalActivity = instScore;
    const densityScore = Math.min(70, (count / maxDensity) * 70);
    const rawScore = Math.round(Math.min(100, densityScore + institutionalActivity));

    const obsCtx = observationContextIndex(regionId);
    const eff = effectiveByRegion.get(regionId) ?? 0;
    const adjustedDensityUncapped = Math.min(70, (eff / maxEffective) * 70);
    const adjustedCandidate = Math.min(100, adjustedDensityUncapped + institutionalActivity);
    const delta = adjustedCandidate - rawScore;
    const clamped =
      delta > ADJUSTMENT_DELTA_CAP
        ? ADJUSTMENT_DELTA_CAP
        : delta < -ADJUSTMENT_DELTA_CAP
          ? -ADJUSTMENT_DELTA_CAP
          : delta;
    const adjustedAaiScore = Math.round(Math.min(100, Math.max(0, rawScore + clamped)));

    const residualActivityIndex = Math.round(
      Math.min(100, Math.max(0, (eff / maxEffective) * 100)),
    );

    const prevKey = prevByAdjusted.get(regionId);
    let trend = 'stable';
    if (prevKey != null) {
      if (adjustedAaiScore > prevKey) trend = 'up';
      else if (adjustedAaiScore < prevKey) trend = 'down';
    }

    const buckets = byRegionByBucket.get(regionId) ?? {};
    const shapeCounts = byRegionByShape.get(regionId) ?? {};
    scores.push({
      regionId,
      score: rawScore,
      level: scoreToLevel(adjustedAaiScore),
      trend,
      sightingDensity,
      institutionalActivity,
      lastUpdated: nowSec,
      sightings1d: buckets[1] ?? 0,
      sightings7d: buckets[7] ?? 0,
      sightings30d: buckets[30] ?? 0,
      sightings90d: buckets[90] ?? count,
      sightings180d: buckets[180] ?? 0,
      sightings365d: buckets[365] ?? 0,
      shapeCounts: Object.keys(shapeCounts).length > 0 ? shapeCounts : undefined,
      observationContextIndex: obsCtx,
      adjustedAaiScore,
      residualActivityIndex,
      methodologyNote: METHODOLOGY_NOTE,
    });
  }
  scores.sort((a, b) => (b.adjustedAaiScore ?? b.score) - (a.adjustedAaiScore ?? a.score));
  return scores.slice(0, MAX_REGIONS_RETURNED);
}

export async function getAaiScores(
  _ctx: ServerContext,
  req: GetAaiScoresRequest,
): Promise<GetAaiScoresResponse> {
  const cacheKey = `${CACHE_KEY}:${req.region ?? 'global'}`;
  const cached = (await getCachedJson(cacheKey)) as GetAaiScoresResponse | null;
  if (cached?.scores && cached.scores.length > 0) return cached;

  const sightings = await getRawSightings();
  const prevScores = (await getCachedJson(PREV_CACHE_KEY)) as AaiScore[] | null;
  const allScores = computeScoresFromSightings(sightings, prevScores);
  await setCachedJson(PREV_CACHE_KEY, allScores, CACHE_TTL);

  const regionFilter = (req.region ?? '').trim();
  let scores = allScores;
  let recentSightings: RecentSightingSummary[] | undefined;
  if (regionFilter && regionFilter !== 'global') {
    scores = allScores.filter((s) => s.regionId === regionFilter);
    if (scores.length === 0) {
      const obsCtx = observationContextIndex(regionFilter);
      scores = [{
        regionId: regionFilter,
        score: 0,
        level: 'low',
        trend: 'stable',
        sightingDensity: 0,
        institutionalActivity: 0,
        lastUpdated: Math.floor(Date.now() / 1000),
        sightings1d: 0,
        sightings7d: 0,
        sightings30d: 0,
        sightings90d: 0,
        sightings180d: 0,
        sightings365d: 0,
        observationContextIndex: obsCtx,
        adjustedAaiScore: 0,
        residualActivityIndex: 0,
        methodologyNote: METHODOLOGY_NOTE,
      }];
    }
    const since7d = Math.floor(Date.now() / 1000) - RECENT_SIGHTINGS_DAYS * 86400;
    const regionSightings = sightings
      .filter((s) => regionIdForSighting(s) === regionFilter && (s.timestamp ?? 0) >= since7d)
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      .slice(0, RECENT_SIGHTINGS_MAX)
      .map((s): RecentSightingSummary => ({
        timestamp: s.timestamp ?? 0,
        shape: normalizeShape(s.shape),
        description: (s.description ?? '').trim() || undefined,
      }));
    if (regionSightings.length > 0) {
      recentSightings = regionSightings;
    }
  }

  const response: GetAaiScoresResponse = { scores };
  if (recentSightings) response.recentSightings = recentSightings;
  await setCachedJson(cacheKey, response, CACHE_TTL);
  return response;
}
