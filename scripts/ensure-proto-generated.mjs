#!/usr/bin/env node
/**
 * Fresh clones often lack src/generated/* until buf runs. Vite config no longer
 * static-imports server stubs, but the SPA still needs client stubs.
 */
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sentinel = resolve(root, 'src/generated/client/worldmonitor/market/v1/service_client.ts');

if (existsSync(sentinel)) {
  process.exit(0);
}

// eslint-disable-next-line no-console
console.warn('[ensure-proto] Generated client stubs missing — running `npx buf generate` in proto/ …\n');

const r = spawnSync('npx', ['buf', 'generate'], {
  cwd: resolve(root, 'proto'),
  stdio: 'inherit',
  shell: true,
  env: { ...process.env },
});

if (r.status !== 0) {
  // eslint-disable-next-line no-console
  console.error(
    '\n[ensure-proto] buf generate failed. Install buf or run: cd proto && npx buf generate\n',
  );
  process.exit(r.status ?? 1);
}

if (!existsSync(sentinel)) {
  // eslint-disable-next-line no-console
  console.error('[ensure-proto] Stubs still missing after buf generate.\n');
  process.exit(1);
}
