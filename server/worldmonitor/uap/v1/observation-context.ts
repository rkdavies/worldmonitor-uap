/**
 * Per-region observation context for AAI adjustment (reporting opportunity proxies).
 * See medina-observation-weights.ts for literature basis.
 */

import raw from '../../../../shared/uap-observation-context-by-region.json';
import {
  W_SKY_VISIBILITY,
  W_AIR_TRAFFIC_CONTEXT,
  W_MILITARY_TRAINING_CONTEXT,
  EXPECTATION_MULT_MIN,
  EXPECTATION_MULT_MAX,
} from './medina-observation-weights';

export interface RegionObservationRow {
  lat: number;
  lon: number;
  sky: number;
  airTraffic: number;
  militaryTraining: number;
}

const DATA = raw as Record<string, RegionObservationRow>;

export function getObservationRow(regionId: string): RegionObservationRow {
  const id = (regionId ?? '').trim();
  if (DATA[id]) return DATA[id];
  return DATA.Unknown;
}

/**
 * 0–100 composite: higher = more favorable to observing/reporting (per literature proxies).
 */
export function observationContextIndex(regionId: string): number {
  const r = getObservationRow(regionId);
  const v =
    W_SKY_VISIBILITY * r.sky +
    W_AIR_TRAFFIC_CONTEXT * r.airTraffic +
    W_MILITARY_TRAINING_CONTEXT * r.militaryTraining;
  return Math.round(Math.min(100, Math.max(0, v)));
}

/**
 * Relative expected report rate vs a baseline region (multiplier ~0.42–1.78).
 */
export function expectationMultiplier(regionId: string): number {
  const idx = observationContextIndex(regionId) / 100;
  return EXPECTATION_MULT_MIN + idx * (EXPECTATION_MULT_MAX - EXPECTATION_MULT_MIN);
}

export function centroidForRegion(regionId: string): { lat: number; lon: number } {
  const r = getObservationRow(regionId);
  return { lat: r.lat, lon: r.lon };
}

/** Map regionId -> context for all keys in seed data (for map overlay). */
export function allRegionContextEntries(): Array<{
  regionId: string;
  lat: number;
  lon: number;
  observationContextIndex: number;
}> {
  const out: Array<{ regionId: string; lat: number; lon: number; observationContextIndex: number }> = [];
  for (const regionId of Object.keys(DATA)) {
    if (regionId === 'Unknown') continue;
    out.push({
      regionId,
      lat: DATA[regionId].lat,
      lon: DATA[regionId].lon,
      observationContextIndex: observationContextIndex(regionId),
    });
  }
  return out;
}
