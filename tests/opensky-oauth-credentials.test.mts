/**
 * Guardrail: OpenSky OAuth accepts env or credentials.json (local dev).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const oauthSrc = readFileSync(join(root, 'server/_shared/opensky-oauth.ts'), 'utf8');

describe('opensky-oauth credentials', () => {
  it('documents env-first and credentials.json fallback', () => {
    assert.match(oauthSrc, /credentials\.json/);
    assert.match(oauthSrc, /OPENSKY_CLIENT_ID/);
    assert.match(oauthSrc, /OPENSKY_CLIENT_SECRET/);
    assert.match(oauthSrc, /getOpenSkyClientCredentials|readOpenSkyCredentialsFromFile/);
  });
});
