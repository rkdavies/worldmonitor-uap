/**
 * Runtime tests for UAP shared logic (fallback sightings, region/country inference).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FALLBACK_SIGHTINGS } from '../server/worldmonitor/uap/v1/fallback-sightings.ts';
import {
  enrichSightingsWithInferredCountry,
  inferCountryNameFromLatLonState,
  regionIdForSighting,
} from '../server/worldmonitor/uap/v1/uap-sighting-region.ts';
import {
  expectationMultiplier,
  observationContextIndex,
} from '../server/worldmonitor/uap/v1/observation-context.ts';
import type { UapSighting } from '../src/generated/server/worldmonitor/uap/v1/service_server.ts';

function sighting(partial: Partial<UapSighting> & Pick<UapSighting, 'id' | 'lat' | 'lon'>): UapSighting {
  return {
    timestamp: 0,
    source: 'nuforc',
    shape: '',
    description: '',
    credibilityScore: 0,
    ...partial,
  };
}

describe('FALLBACK_SIGHTINGS', () => {
  it('has a bounded non-empty list with required fields', () => {
    assert.ok(Array.isArray(FALLBACK_SIGHTINGS));
    assert.ok(FALLBACK_SIGHTINGS.length > 0);
    assert.ok(FALLBACK_SIGHTINGS.length <= 50);
    for (const s of FALLBACK_SIGHTINGS) {
      assert.equal(typeof s.id, 'string');
      assert.ok(Number.isFinite(s.lat));
      assert.ok(Number.isFinite(s.lon));
      assert.equal(typeof s.source, 'string');
    }
  });
});

describe('inferCountryNameFromLatLonState', () => {
  it('maps US state abbreviations', () => {
    assert.equal(inferCountryNameFromLatLonState(40, -74, 'NY'), 'United States');
    assert.equal(inferCountryNameFromLatLonState(34, -118, 'CA'), 'United States');
  });

  it('returns undefined when state and bbox give no match', () => {
    assert.equal(inferCountryNameFromLatLonState(0, 0, ''), undefined);
  });
});

describe('regionIdForSighting', () => {
  it('returns normalized region from lat/lon when country missing', () => {
    assert.equal(regionIdForSighting(sighting({ id: 'a', lat: 40.7, lon: -74 })), 'USA');
    assert.equal(regionIdForSighting(sighting({ id: 'b', lat: -33.8, lon: 151.2 })), 'Australia');
  });

  it('prefers explicit country when set', () => {
    assert.equal(
      regionIdForSighting(sighting({ id: 'c', lat: 0, lon: 0, country: 'United Kingdom' })),
      'GBR',
    );
  });
});

describe('observationContextIndex', () => {
  it('returns bounded index for known regions', () => {
    const us = observationContextIndex('USA');
    const nl = observationContextIndex('Netherlands');
    assert.ok(us >= 0 && us <= 100);
    assert.ok(nl >= 0 && nl <= 100);
    assert.ok(us > nl, 'US proxy context expected higher than dense urban NL');
  });

  it('expectationMultiplier scales with context', () => {
    assert.ok(expectationMultiplier('USA') > expectationMultiplier('Netherlands'));
  });
});

describe('enrichSightingsWithInferredCountry', () => {
  it('fills country from lat/lon bbox when missing', () => {
    // North Dakota — unambiguous US (southern US overlaps MX bbox in sorted-small-first scan)
    const rows: UapSighting[] = [sighting({ id: '1', lat: 47.5, lon: -100.5 })];
    const out = enrichSightingsWithInferredCountry(rows);
    assert.equal(out[0].country, 'USA');
  });

  it('does not overwrite existing country', () => {
    const rows: UapSighting[] = [
      sighting({ id: '2', lat: 51, lon: 0, country: 'United Kingdom' }),
    ];
    const out = enrichSightingsWithInferredCountry(rows);
    assert.equal(out[0].country, 'United Kingdom');
  });
});
