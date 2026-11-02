import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OAUTH_CLIENT_MOCK_ARGUMENTS = Object.freeze([
  '.yarn/releases/yarn-4.18.0.cjs',
  'playwright',
  'test',
  '--project=mock-chromium',
  '--grep',
  '@mr.*@oauth-client|@oauth-client.*@mr',
]);

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const extra = process.argv.slice(2);
  if (extra.length > 1 || (extra.length === 1 && extra[0] !== '--list')) {
    throw new Error('Only the optional --list argument is supported');
  }
  const result = spawnSync(process.execPath, [...OAUTH_CLIENT_MOCK_ARGUMENTS, ...extra], {
    env: { ...process.env, PLAYWRIGHT_OAUTH_CLIENT_TARGETED: 'true' },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
