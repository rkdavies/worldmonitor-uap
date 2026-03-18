#!/usr/bin/env node
/**
 * Restores src/generated/{client,server} from git when missing (committed stubs).
 * @flag --postinstall  Never exit 1 (npm postinstall must not fail).
 */
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const soft = process.argv.includes('--postinstall');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sentinel = resolve(root, 'src/generated/client/worldmonitor/intelligence/v1/service_client.ts');

function fail(msg, code = 1) {
  // eslint-disable-next-line no-console
  console.error(msg);
  process.exit(soft ? 0 : code);
}

if (existsSync(sentinel)) {
  process.exit(0);
}

const gitDir = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8' });
if (gitDir.status !== 0) {
  fail(
    '[restore-generated] src/generated/* missing and not a git repo.\n' +
      '  Fix: use a full git clone, or run `make generate`, or unpack release assets that include src/generated/.\n',
  );
}

// eslint-disable-next-line no-console
console.warn('[restore-generated] Restoring src/generated/client + server from git HEAD…\n');
const co = spawnSync(
  'git',
  ['checkout', 'HEAD', '--', 'src/generated/client', 'src/generated/server'],
  { cwd: root, stdio: 'inherit' },
);

if (co.status !== 0) {
  fail(
    '[restore-generated] git checkout failed. Run:\n  git checkout HEAD -- src/generated/client src/generated/server\n',
    co.status ?? 1,
  );
}

if (!existsSync(sentinel)) {
  fail('[restore-generated] Files still missing after checkout.\n');
}

// eslint-disable-next-line no-console
console.log('[restore-generated] Restored proto-generated stubs.\n');
