/**
 * OpenSky /states/all parsing and bbox quantization for aviation track-aircraft.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OPENSKY_UAV_EMITTER_CATEGORY,
  parseOpenSkyStates,
  quantizeCoord,
} from '../server/worldmonitor/aviation/v1/opensky-states.ts';

describe('opensky-states', () => {
  it('quantizeCoord aligns to step', () => {
    assert.equal(quantizeCoord(37.123456, 0.01), 37.12);
    assert.equal(quantizeCoord(-122.449, 0.01), -122.45);
  });

  it('parseOpenSkyStates reads position and UAV category from extended row', () => {
    const row = [
      'abc9f3',
      'UAV01   ',
      'United States',
      1000,
      1700000000,
      -122.4,
      37.7,
      500,
      false,
      50,
      90,
      2,
      null,
      null,
      null,
      false,
      0,
      OPENSKY_UAV_EMITTER_CATEGORY,
    ];
    const out = parseOpenSkyStates([row], { maxPositions: 100 });
    assert.equal(out.length, 1);
    assert.equal(out[0].icao24, 'abc9f3');
    assert.equal(out[0].lat, 37.7);
    assert.equal(out[0].lon, -122.4);
    assert.equal((out[0] as { emitterCategory?: number }).emitterCategory, 14);
  });

  it('parseOpenSkyStates skips rows without lat/lon', () => {
    const out = parseOpenSkyStates(
      [[null, null, null, null, null, null, null]],
      { maxPositions: 10 },
    );
    assert.equal(out.length, 0);
  });

  it('parseOpenSkyStates respects maxPositions', () => {
    const rows = Array.from({ length: 5 }, (_, i) => [
      `id${i}`,
      '',
      '',
      0,
      1000,
      i,
      i,
      0,
      false,
      0,
      0,
      0,
    ]);
    const out = parseOpenSkyStates(rows, { maxPositions: 2 });
    assert.equal(out.length, 2);
  });
});
