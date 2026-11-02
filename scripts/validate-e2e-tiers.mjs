import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateTierRun } from './e2e/tier-validator.mjs';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
export const PLAYWRIGHT_LIST_TIMEOUT_MS = 60_000;

const tierCommands = Object.freeze([
  { tier: 'mr', args: ['--project=mock-chromium', '--grep', '@mr'] },
  {
    tier: 'full',
    args: ['--project=mock-chromium', '--project=mock-firefox', '--project=mock-webkit'],
  },
  {
    tier: 'live',
    args: ['-c', 'playwright.live.config.ts', '--project=live-chromium', '--grep', '@live'],
  },
  {
    tier: 'live',
    args: ['-c', 'playwright.invitation-live.config.ts', '--project=invitation-live-chromium', '--grep', '@live'],
  },
  {
    tier: 'local-proxy',
    args: ['-c', 'playwright.local-proxy.config.ts', '--project=local-proxy-chromium', '--grep', '@local-proxy'],
  },
]);

export const buildPlaywrightListSpawnOptions = ({ repositoryRoot: cwd, environment = process.env }) => ({
  cwd,
  encoding: 'utf8',
  env: { ...environment, CI: 'true', EPOCA_E2E_LIST_ONLY: 'true' },
  maxBuffer: 64 * 1024 * 1024,
  timeout: PLAYWRIGHT_LIST_TIMEOUT_MS,
  killSignal: 'SIGKILL',
});

export const validateE2ETiers = () =>
  tierCommands.map(({ tier, args }) => {
    const result = spawnSync(
      process.execPath,
      [playwrightCli, 'test', '--list', '--reporter=json', ...args],
      buildPlaywrightListSpawnOptions({ repositoryRoot }),
    );
    return validateTierRun(tier, result, { repositoryRoot, timeoutMs: PLAYWRIGHT_LIST_TIMEOUT_MS });
  });

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    for (const summary of validateE2ETiers()) {
      console.log(`${summary.tier}: ${summary.count} tests (${summary.projects.join(', ')})`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
