import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parsePlaywrightInventory } from './e2e/coverage-inventory.mjs';
import { validateCoverageMap, validateSuiteRegistry } from './e2e/coverage-validator.mjs';
import { loadCoverageMap } from './e2e/load-coverage-map.mjs';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
export const PLAYWRIGHT_COVERAGE_LIST_TIMEOUT_MS = 60_000;
const OAUTH_CLIENT_MOCK_GREP = '@mr.*@oauth-client|@oauth-client.*@mr';

/** @param {import("./e2e/coverage-validator.mjs").SuiteRegistry} suiteRegistry */
export const buildCoverageInventoryCommands = (suiteRegistry) => {
  validateSuiteRegistry(suiteRegistry);
  return Object.entries(suiteRegistry).flatMap(([suite, { configs }]) =>
    Object.entries(configs).map(([config, { file }]) => ({ suite, config, file })),
  );
};

/** @param {{repositoryRoot: string, environment?: NodeJS.ProcessEnv}} options @returns {import("node:child_process").SpawnSyncOptionsWithStringEncoding} */
export const buildPlaywrightCoverageListSpawnOptions = ({ repositoryRoot: cwd, environment = process.env }) => ({
  cwd,
  encoding: 'utf8',
  env: { ...environment, CI: 'true', EPOCA_E2E_LIST_ONLY: 'true' },
  maxBuffer: 64 * 1024 * 1024,
  timeout: PLAYWRIGHT_COVERAGE_LIST_TIMEOUT_MS,
  killSignal: 'SIGKILL',
});

/** @param {string} label @param {import("node:child_process").SpawnSyncReturns<string>} result @param {string} cwd */
const validateCoverageListRun = (label, result, cwd) => {
  if (result?.error?.code === 'ETIMEDOUT') {
    throw new Error(`${label} Playwright list timed out after ${PLAYWRIGHT_COVERAGE_LIST_TIMEOUT_MS} ms`);
  }
  if (result?.error) throw new Error(`${label} Playwright list failed: ${result.error.message}`);
  if (result?.signal) throw new Error(`${label} Playwright list exited on ${result.signal}`);
  if (result?.status !== 0) throw new Error(`${label} Playwright list exited with status ${String(result?.status)}`);
  if (typeof result.stderr !== 'string' || result.stderr.trim() !== '') {
    throw new Error(`${label} Playwright list wrote to stderr: ${String(result.stderr)}`);
  }
  if (typeof result.stdout !== 'string') throw new Error(`${label} Playwright list stdout must be a string`);
  return parsePlaywrightInventory(result.stdout, { repositoryRoot: cwd });
};

/** @param {{suiteRegistry: import("./e2e/coverage-validator.mjs").SuiteRegistry, cwd?: string, environment?: NodeJS.ProcessEnv, spawn?: typeof spawnSync}} options @returns {import("./e2e/coverage-validator.mjs").FederatedInventories} */
export const collectCoverageInventories = ({
  suiteRegistry,
  cwd = repositoryRoot,
  environment = process.env,
  spawn = spawnSync,
} = {}) => {
  /** @type {import("./e2e/coverage-validator.mjs").FederatedInventories} */
  const inventories = {};
  for (const { suite, config, file } of buildCoverageInventoryCommands(suiteRegistry)) {
    const runs = [
      {
        label: `${suite}/${config}`,
        args: [playwrightCli, 'test', '--list', '--reporter=json', '-c', file],
        environment,
      },
      ...(suite === 'worlds' && config === 'mock'
        ? [
            {
              label: `${suite}/${config}/oauth-client-targeted`,
              args: [playwrightCli, 'test', '--list', '--reporter=json', '--grep', OAUTH_CLIENT_MOCK_GREP, '-c', file],
              environment: { ...environment, PLAYWRIGHT_OAUTH_CLIENT_TARGETED: 'true' },
            },
          ]
        : []),
    ];
    const inventory = [];
    for (const run of runs) {
      let result;
      try {
        result = spawn(
          process.execPath,
          run.args,
          buildPlaywrightCoverageListSpawnOptions({ repositoryRoot: cwd, environment: run.environment }),
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`${run.label} Playwright list spawn failed: ${detail}`);
      }
      inventory.push(...validateCoverageListRun(run.label, result, cwd));
    }
    inventories[suite] ??= {};
    inventories[suite][config] = inventory;
  }
  return inventories;
};

export const validateE2ECoverage = () => {
  const source = loadCoverageMap();
  const inventories = collectCoverageInventories({ suiteRegistry: source.E2E_SUITE_REGISTRY });
  const summary = validateCoverageMap({
    coverageMap: source.coverageMap,
    expectedBackfillIds: source.BACKFILL_COVERAGE_IDS,
    suiteRegistry: source.E2E_SUITE_REGISTRY,
    workUnitOverridesBaseline: source.WORK_UNIT_OVERRIDES_BASELINE,
    inventories,
  });
  return { summary, inventories };
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const { summary, inventories } = validateE2ECoverage();
    const inventorySummary = Object.entries(inventories)
      .flatMap(([suite, configs]) =>
        Object.entries(configs).map(([config, inventory]) => `${suite}/${config}: ${inventory.length}`),
      )
      .join(', ');
    console.log(
      `coverage: ${summary.entries} entries, ${summary.backfills} backfills, ${summary.browserEntries} browser entries, ${summary.pendingInfrastructure} pending infrastructure gates`,
    );
    if (summary.pendingInfrastructure > 0) {
      console.log('pending infrastructure: OAuth client disposable live lifecycle is blocked and unexecuted');
    }
    console.log(`inventories: ${inventorySummary}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
