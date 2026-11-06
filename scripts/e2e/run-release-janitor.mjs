import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, openSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPrivateStateRoot, isExpiredReleaseRun } from './release-state.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
export function runReleaseJanitor() {
  if (process.env.EPOCA_RELEASE_JANITOR !== 'true') throw new Error('Janitor requires explicit opt-in');
  const stateRoot = assertPrivateStateRoot(process.env.EPOCA_RELEASE_STATE_ROOT);
  let failed = false;
  for (const entry of readdirSync(stateRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const directory = path.join(stateRoot, entry.name);
    const manifest = path.join(directory, 'test-results/.live-run.json');
    if (!existsSync(manifest)) continue;
    const stat = lstatSync(manifest);
    if (!stat.isFile() || stat.isSymbolicLink() || !isExpiredReleaseRun(entry.name, stat.mtimeMs, Date.now())) continue;
    const log = openSync(path.join(directory, 'janitor.log'), 'a', 0o600);
    try {
      const result = spawnSync(
        process.execPath,
        [
          require.resolve('@playwright/test/cli'),
          'test',
          '-c',
          path.join(root, 'playwright.release-janitor.config.ts'),
        ],
        {
          cwd: directory,
          env: { ...process.env, EPOCA_RELEASE_RUN_ID: entry.name.slice(0, -'-deploy'.length) },
          stdio: ['ignore', log, log],
          timeout: 180_000,
          killSignal: 'SIGTERM',
        },
      );
      if (result.error || result.signal || result.status !== 0) failed = true;
    } finally {
      closeSync(log);
    }
    if (!existsSync(manifest)) rmSync(directory, { recursive: true });
  }
  return failed ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runReleaseJanitor();
  } catch {
    console.error('Guarded release janitor failed; private state retained.');
    process.exitCode = 1;
  }
}
