#!/usr/bin/env node
/**
 * Copies OpenSky API client id/secret from credentials.json → .env.local.
 *
 * Security: Both files are gitignored (.env.local, credentials.json). Never commit real values.
 * Run from repo root: node scripts/sync-opensky-env-from-credentials.mjs
 *
 * Env takes precedence at runtime; this script only updates .env.local so tools that read
 * .env.local (and Vite dev after merge) see the same credentials without duplicating JSON.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const credPath = join(root, 'credentials.json');
const envPath = join(root, '.env.local');

function pickStr(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function parseOpenSkyFromCredentials() {
  if (!existsSync(credPath)) {
    console.error(`Missing ${credPath}`);
    process.exit(1);
  }
  const j = JSON.parse(readFileSync(credPath, 'utf8'));
  const nested =
    j.opensky && typeof j.opensky === 'object' && j.opensky !== null ? j.opensky : null;
  const id =
    pickStr(j.OPENSKY_CLIENT_ID) ||
    pickStr(j.client_id) ||
    pickStr(j.clientId) ||
    pickStr(nested?.client_id) ||
    pickStr(nested?.OPENSKY_CLIENT_ID) ||
    pickStr(nested?.clientId);
  const secret =
    pickStr(j.OPENSKY_CLIENT_SECRET) ||
    pickStr(j.client_secret) ||
    pickStr(j.clientSecret) ||
    pickStr(nested?.client_secret) ||
    pickStr(nested?.OPENSKY_CLIENT_SECRET) ||
    pickStr(nested?.clientSecret);
  if (!id || !secret) {
    console.error('credentials.json has no OpenSky keys (OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET or opensky.*).');
    process.exit(1);
  }
  return { id, secret };
}

function quoteEnvValue(val) {
  if (!/[\s#"\\]/.test(val)) return val;
  return `"${String(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function main() {
  const { id, secret } = parseOpenSkyFromCredentials();
  let body = '';
  if (existsSync(envPath)) {
    body = readFileSync(envPath, 'utf8');
  }
  const lines = body.split('\n');
  const skip = new Set(['OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET']);
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return true;
    const eq = t.indexOf('=');
    if (eq === -1) return true;
    const key = t.slice(0, eq).trim();
    return !skip.has(key);
  });
  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  const block = [
    '',
    '# OpenSky — synced from credentials.json (gitignored). Do not commit.',
    `OPENSKY_CLIENT_ID=${quoteEnvValue(id)}`,
    `OPENSKY_CLIENT_SECRET=${quoteEnvValue(secret)}`,
    '',
  ];
  const out = [...kept, ...block].join('\n').replace(/\n{3,}/g, '\n\n');
  writeFileSync(envPath, out.endsWith('\n') ? out : `${out}\n`, 'utf8');
  console.log(`Wrote OPENSKY_* to ${envPath}. Restart dev server if it is running.`);
}

main();
