import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OAUTH_CLIENT_LIVE_ARGUMENTS = Object.freeze([
  '.yarn/releases/yarn-4.18.0.cjs',
  'playwright',
  'test',
  '-c',
  'playwright.live.config.ts',
  '--project=live-chromium',
  '--grep',
  '@live.*@oauth-client|@oauth-client.*@live',
]);

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const extra = process.argv.slice(2);
  if (extra.length > 1 || (extra.length === 1 && extra[0] !== '--list')) {
    throw new Error('Only the optional --list argument is supported');
  }
  const result = spawnSync(process.execPath, [...OAUTH_CLIENT_LIVE_ARGUMENTS, ...extra], {
    env: { ...process.env, PLAYWRIGHT_LIVE_OAUTH_CLIENT_TARGETED: 'true' },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
