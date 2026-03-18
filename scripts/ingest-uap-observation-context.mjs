#!/usr/bin/env node
/**
 * Ingest primary sources for UAP observation-context airTraffic proxy.
 *
 * 1) OurAirports (CC0) — count large_airport + medium_airport per country,
 *    map ISO2 → WorldMonitor regionId, log-scale to 0–100 among tracked regions.
 *
 * Run: node scripts/ingest-uap-observation-context.mjs
 * Requires network. Updates shared/uap-observation-context-by-region.json
 * and writes shared/uap-observation-ingest-meta.json.
 *
 * @see https://ourairports.com/data/
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONTEXT_PATH = join(ROOT, 'shared/uap-observation-context-by-region.json');
const META_PATH = join(ROOT, 'shared/uap-observation-ingest-meta.json');

const OURAIRPORTS_CSV =
  process.env.OURAIRPORTS_CSV_URL ??
  'https://davidmegginson.github.io/ourairports-data/airports.csv';

/** ISO 3166-1 alpha-2 → regionId keys in uap-observation-context-by-region.json */
const ISO2_TO_REGION = {
  US: 'USA',
  GB: 'GBR',
  CA: 'Canada',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  MX: 'Mexico',
  BR: 'Brazil',
  JP: 'Japan',
  IN: 'India',
  ES: 'Spain',
  IT: 'Italy',
  NL: 'Netherlands',
  BE: 'Belgium',
  SE: 'Sweden',
  ZA: 'South Africa',
  AR: 'Argentina',
  CL: 'Chile',
  NZ: 'New Zealand',
  IE: 'Ireland',
  PT: 'Portugal',
  PL: 'Poland',
  RU: 'Russia',
  CN: 'China',
  HU: 'Hungary',
};

const AIRPORT_TYPES = new Set(['large_airport', 'medium_airport']);

function parseCsvFields(line) {
  const fields = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    if (line[i] === ',') {
      fields.push('');
      i++;
      continue;
    }
    if (line[i] === '"') {
      i++;
      let s = '';
      while (i < n) {
        if (line[i] === '"') {
          if (i + 1 < n && line[i + 1] === '"') {
            s += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        s += line[i++];
      }
      fields.push(s);
      if (line[i] === ',') i++;
      continue;
    }
    let s = '';
    while (i < n && line[i] !== ',') s += line[i++];
    fields.push(s);
    if (line[i] === ',') i++;
  }
  return fields;
}

function scaleLog(countsByRegion) {
  const regions = Object.keys(ISO2_TO_REGION).map((iso) => ISO2_TO_REGION[iso]);
  const vals = regions.map((r) => Math.log1p(countsByRegion[r] ?? 0));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(max - min, 1e-6);
  const out = {};
  for (const r of regions) {
    const v = Math.log1p(countsByRegion[r] ?? 0);
    out[r] = Math.round(8 + ((v - min) / span) * 87);
  }
  return out;
}

async function main() {
  console.log('Fetching', OURAIRPORTS_CSV);
  const res = await globalThis.fetch(OURAIRPORTS_CSV, {
    headers: {
      'User-Agent': 'WorldMonitor/1.0 (UAP observation context ingest; +https://worldmonitor.app)',
      Accept: 'text/csv',
    },
  });
  if (!res.ok) throw new Error(`OurAirports fetch ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const header = parseCsvFields(lines[0] ?? '');
  const typeIdx = header.indexOf('type');
  const isoIdx = header.indexOf('iso_country');
  if (typeIdx < 0 || isoIdx < 0) throw new Error('Unexpected airports.csv header');

  const countsByRegion = {};
  for (const id of Object.values(ISO2_TO_REGION)) countsByRegion[id] = 0;

  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line?.trim()) continue;
    const f = parseCsvFields(line);
    const type = f[typeIdx]?.trim();
    const iso = (f[isoIdx] ?? '').trim().toUpperCase();
    if (!AIRPORT_TYPES.has(type)) continue;
    const region = ISO2_TO_REGION[iso];
    if (!region) continue;
    countsByRegion[region]++;
  }

  const airTrafficScaled = scaleLog(countsByRegion);
  const base = JSON.parse(readFileSync(CONTEXT_PATH, 'utf8'));

  for (const [regionId, row] of Object.entries(base)) {
    if (regionId === 'Unknown' || !airTrafficScaled[regionId]) continue;
    row.airTraffic = airTrafficScaled[regionId];
  }

  writeFileSync(CONTEXT_PATH, `${JSON.stringify(base, null, 2)}\n`, 'utf8');

  const meta = {
    generatedAt: new Date().toISOString(),
    ourairports: {
      url: OURAIRPORTS_CSV,
      types: [...AIRPORT_TYPES],
      countsByRegion,
    },
  };
  writeFileSync(META_PATH, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  console.log('Updated', CONTEXT_PATH);
  console.log('Wrote', META_PATH);
  for (const r of ['USA', 'Netherlands', 'Australia']) {
    console.log(`  ${r}: airports=${countsByRegion[r]} airTraffic=${base[r]?.airTraffic}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
