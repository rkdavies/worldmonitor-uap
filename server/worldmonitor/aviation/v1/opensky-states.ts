/**
 * OpenSky /states/all state vector parsing (extended=1 for emitter category).
 * @see https://openskynetwork.github.io/opensky-api/rest.html
 */
import type { PositionSample } from '../../../../src/generated/server/worldmonitor/aviation/v1/service_server';

export const OPENSKY_UAV_EMITTER_CATEGORY = 14;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function quantizeCoord(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function parseOpenSkyStates(
  states: unknown[][],
  options: { maxPositions: number },
): PositionSample[] {
  const now = Date.now();
  const out: PositionSample[] = [];
  for (const s of states) {
    if (!Array.isArray(s) || s[5] == null || s[6] == null) continue;
    const rowLen = s.length;
    const emitterCategory =
      rowLen > 17 && s[17] != null && s[17] !== ''
        ? Math.trunc(Number(s[17]))
        : 0;
    const sample = {
      icao24: String(s[0] ?? ''),
      callsign: String(s[1] ?? '').trim(),
      lat: Number(s[6]),
      lon: Number(s[5]),
      altitudeM: num(s[7]),
      groundSpeedKts: num(s[9]) * 1.944,
      trackDeg: num(s[10]),
      verticalRate: num(s[11]),
      onGround: Boolean(s[8]),
      source: 'POSITION_SOURCE_OPENSKY' as const,
      observedAt: Number(s[4] ?? now / 1000) * 1000,
      emitterCategory,
    } as PositionSample;
    out.push(sample);
    if (out.length >= options.maxPositions) break;
  }
  return out;
}
