import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const yarnPath = path.join(repositoryRoot, '.yarn/releases/yarn-4.18.0.cjs');

const aggregateCommands = Object.freeze({
  ci: Object.freeze([
    Object.freeze(['playwright', 'test', '--project=mock-chromium', '--grep', '@mr']),
    Object.freeze(['test:e2e:mock:oauth-client']),
    Object.freeze(['playwright', 'test', '--config=playwright.work-unit-overrides.config.ts']),
    Object.freeze(['playwright', 'test', '--config=playwright.pivot-table.config.ts', '--project=desktop-chromium']),
  ]),
  all: Object.freeze([
    Object.freeze(['playwright', 'test', '--project=mock-chromium', '--project=mock-firefox', '--project=mock-webkit']),
    Object.freeze(['test:e2e:mock:oauth-client']),
    Object.freeze(['playwright', 'test', '--config=playwright.work-unit-overrides.config.ts']),
    Object.freeze(['playwright', 'test', '--config=playwright.pivot-table.config.ts']),
  ]),
});

export const getAggregateCommands = (tier) => {
  const commands = aggregateCommands[tier];
  if (!commands) throw new Error(`Unknown aggregate E2E tier: ${String(tier)}`);
  return commands.map((command) => [...command]);
};

export const runAggregateE2E = ({ tier, listOnly = false, spawnImpl = spawnSync, environment = process.env } = {}) => {
  for (const command of getAggregateCommands(tier)) {
    const result = spawnImpl(process.execPath, [yarnPath, ...command, ...(listOnly ? ['--list'] : [])], {
      cwd: repositoryRoot,
      env: listOnly ? { ...environment, EPOCA_E2E_LIST_ONLY: 'true' } : environment,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.signal) throw new Error(`Aggregate E2E command terminated by ${result.signal}`);
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const [first, second, ...rest] = process.argv.slice(2);
    if (
      rest.length > 0 ||
      (first === '--print' && !second) ||
      (first !== '--print' && second !== undefined && second !== '--list')
    )
      throw new Error('Usage: run-e2e-aggregate.mjs [--print] <ci|all> [--list]');

    const printOnly = first === '--print';
    const tier = printOnly ? second : first;
    if (printOnly) console.log(JSON.stringify(getAggregateCommands(tier)));
    else process.exitCode = runAggregateE2E({ tier, listOnly: second === '--list' });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
