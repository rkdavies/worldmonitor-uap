/**
 * UAP domain: static checks on server wiring, cache keys, and variant routing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('UAP server handlers', () => {
  it('handler wires all four UAP RPCs', () => {
    const h = read('server/worldmonitor/uap/v1/handler.ts');
    assert.match(h, /UapServiceHandler/);
    assert.match(h, /listUapSightings/);
    assert.match(h, /getAaiScores/);
    assert.match(h, /listUapInstitutionalReports/);
    assert.match(h, /listUapSensorStations/);
  });

  it('list-uap-sightings uses nuforc cache key prefix', () => {
    const s = read('server/worldmonitor/uap/v1/list-uap-sightings.ts');
    assert.match(s, /uap:sightings:nuforc:v1/);
    assert.match(s, /fetchNuforcSightings/);
    assert.match(s, /FALLBACK_SIGHTINGS/);
  });

  it('get-aai-scores uses static cache key and context-adjusted fields', () => {
    const s = read('server/worldmonitor/uap/v1/get-aai-scores.ts');
    assert.match(s, /uap:aai-scores:v1/);
    assert.match(s, /adjustedAaiScore/);
    assert.match(s, /observationContextIndex/);
  });

  it('UAP observation context uses Medina weights and shared seed', () => {
    assert.match(read('server/worldmonitor/uap/v1/medina-observation-weights.ts'), /W_SKY_VISIBILITY/);
    assert.match(read('server/worldmonitor/uap/v1/observation-context.ts'), /uap-observation-context-by-region/);
    const j = read('shared/uap-observation-context-by-region.json');
    assert.match(j, /"USA"/);
    assert.match(read('scripts/ingest-uap-observation-context.mjs'), /ourairports-data/);
    assert.match(read('shared/uap-observation-ingest-meta.json'), /countsByRegion/);
  });

  it('track-aircraft uses OpenSky OAuth, extended states, and UAV filter', () => {
    const tr = read('server/worldmonitor/aviation/v1/track-aircraft.ts');
    assert.match(tr, /getOpenSkyBearerToken/);
    assert.match(tr, /extended=1/);
    assert.match(tr, /uav_only|uavEmittersOnly/);
    assert.match(read('server/worldmonitor/aviation/v1/opensky-states.ts'), /OPENSKY_UAV_EMITTER_CATEGORY/);
  });

  it('dataworld-ufo references expected dataset id', () => {
    const s = read('server/worldmonitor/uap/v1/dataworld-ufo.ts');
    assert.match(s, /timothyrenner\/ufo-sightings/);
  });

  it('institutional and sensor handlers define cache keys', () => {
    assert.match(read('server/worldmonitor/uap/v1/list-uap-institutional-reports.ts'), /uap:institutional:v1/);
    assert.match(read('server/worldmonitor/uap/v1/list-uap-sensor-stations.ts'), /uap:sensor-stations:v1/);
  });
});

describe('UAP variant routing', () => {
  it('variant.ts treats uap subdomain and stored uap like other site variants', () => {
    const v = read('src/config/variant.ts');
    assert.match(v, /startsWith\('uap\.'\)/);
    assert.match(v, /stored === 'uap'/);
  });

  it('variant-meta defines uap entry', () => {
    const m = read('src/config/variant-meta.ts');
    assert.match(m, /\buap:\s*\{/);
    assert.match(m, /uap\.worldmonitor\.app/);
  });
});
