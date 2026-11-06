import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import {
  buildCoverageInventoryCommands,
  buildPlaywrightCoverageListSpawnOptions,
  collectCoverageInventories,
} from '../validate-e2e-coverage.mjs';
import { loadCoverageMap } from './load-coverage-map.mjs';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const suiteRegistry = loadCoverageMap().E2E_SUITE_REGISTRY;

/** @param {{projectName: string, file: string, title: string}} options */
const makeReport = ({ projectName, file, title }) => ({
  config: { rootDir: '/repo' },
  suites: [
    {
      title: file,
      file,
      specs: [{ title, file, tags: [], tests: [{ projectName }] }],
    },
  ],
  errors: [],
});

const makeResult = (report, overrides = {}) => ({
  status: 0,
  signal: null,
  stdout: JSON.stringify(report),
  stderr: '',
  error: undefined,
  ...overrides,
});

void test('coverage inventory commands list each exact secret-free registry config separately', () => {
  const commands = buildCoverageInventoryCommands(loadCoverageMap().E2E_SUITE_REGISTRY);
  assert.deepEqual(commands, [
    { suite: 'worlds', config: 'mock', file: 'playwright.config.ts' },
    { suite: 'worlds', config: 'live', file: 'playwright.live.config.ts' },
    { suite: 'worlds', config: 'local-proxy', file: 'playwright.local-proxy.config.ts' },
    {
      suite: 'work-unit-overrides',
      config: 'controlled',
      file: 'playwright.work-unit-overrides.config.ts',
    },
    { suite: 'invitations', config: 'live', file: 'playwright.invitation-live.config.ts' },
    {
      suite: 'pivot',
      config: 'controlled',
      file: 'playwright.pivot-table.config.ts',
    },
  ]);
  assert.equal(
    commands.some(({ file }) => file.includes('staging')),
    false,
  );
});

void test('coverage list runner is bounded, list-only, and starts no application server', () => {
  const options = buildPlaywrightCoverageListSpawnOptions({
    repositoryRoot: '/repo',
    environment: { PATH: '/trusted/bin' },
  });
  assert.equal(options.cwd, '/repo');
  assert.equal(options.timeout, 60_000);
  assert.equal(options.killSignal, 'SIGKILL');
  assert.equal(options.encoding, 'utf8');
  assert.equal(options.env.CI, 'true');
  assert.equal(options.env.EPOCA_E2E_LIST_ONLY, 'true');
  assert.equal(options.env.PATH, '/trusted/bin');
});

void test('coverage collector invokes exact list-only argv for six configs plus targeted OAuth client mock discovery', () => {
  /** @type {{executable?: string, args: string[], options: import("node:child_process").SpawnSyncOptionsWithStringEncoding}[]} */
  const calls = [];
  const projects = new Map([
    ['playwright.config.ts', 'mock-chromium'],
    ['playwright.live.config.ts', 'live-chromium'],
    ['playwright.local-proxy.config.ts', 'local-proxy-chromium'],
    ['playwright.work-unit-overrides.config.ts', 'desktop-chromium'],
    ['playwright.invitation-live.config.ts', 'invitation-live-chromium'],
    ['playwright.pivot-table.config.ts', 'desktop-chromium'],
  ]);
  /** @type {(executable: string, args: string[], options: import("node:child_process").SpawnSyncOptionsWithStringEncoding) => import("node:child_process").SpawnSyncReturns<string>} */
  const spawn = (executable, args, options) => {
    calls.push({ executable, args, options });
    const file = args.at(-1);
    return makeResult(
      makeReport({
        projectName: projects.get(file),
        file:
          file === 'playwright.work-unit-overrides.config.ts'
            ? 'tests/workUnitOverrides/test.spec.ts'
            : file === 'playwright.pivot-table.config.ts'
              ? 'tests/pivotTable/test.spec.ts'
              : 'tests/e2e/test.spec.ts',
        title: `${file} inventory`,
      }),
    );
  };

  const inventories = collectCoverageInventories({
    suiteRegistry,
    cwd: '/repo',
    environment: { PATH: '/trusted/bin' },
    spawn,
  });

  assert.deepEqual(
    calls.map(({ executable, args }) => ({ executable, args })),
    [
      {
        executable: process.execPath,
        args: [playwrightCli, 'test', '--list', '--reporter=json', '-c', 'playwright.config.ts'],
      },
      {
        executable: process.execPath,
        args: [
          playwrightCli,
          'test',
          '--list',
          '--reporter=json',
          '--grep',
          '@mr.*@oauth-client|@oauth-client.*@mr',
          '-c',
          'playwright.config.ts',
        ],
      },
      {
        executable: process.execPath,
        args: [playwrightCli, 'test', '--list', '--reporter=json', '-c', 'playwright.live.config.ts'],
      },
      {
        executable: process.execPath,
        args: [playwrightCli, 'test', '--list', '--reporter=json', '-c', 'playwright.local-proxy.config.ts'],
      },
      {
        executable: process.execPath,
        args: [playwrightCli, 'test', '--list', '--reporter=json', '-c', 'playwright.work-unit-overrides.config.ts'],
      },
      {
        executable: process.execPath,
        args: [playwrightCli, 'test', '--list', '--reporter=json', '-c', 'playwright.invitation-live.config.ts'],
      },
      {
        executable: process.execPath,
        args: [playwrightCli, 'test', '--list', '--reporter=json', '-c', 'playwright.pivot-table.config.ts'],
      },
    ],
  );
  assert.equal(
    calls.every(({ options }) => options.env.EPOCA_E2E_LIST_ONLY === 'true'),
    true,
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(inventories).flatMap(([suite, configs]) =>
        Object.entries(configs).map(([config, inventory]) => [`${suite}/${config}`, inventory.length]),
      ),
    ),
    {
      'worlds/mock': 2,
      'worlds/live': 1,
      'worlds/local-proxy': 1,
      'work-unit-overrides/controlled': 1,
      'invitations/live': 1,
      'pivot/controlled': 1,
    },
  );
});

void test('coverage collector unions normal and capture-safe targeted OAuth client mock inventories', () => {
  /** @type {{executable?: string, args: string[], options: import("node:child_process").SpawnSyncOptionsWithStringEncoding}[]} */
  const calls = [];
  /** @type {(executable: string, args: string[], options: import("node:child_process").SpawnSyncOptionsWithStringEncoding) => import("node:child_process").SpawnSyncReturns<string>} */
  const spawn = (_executable, args, options) => {
    calls.push({ args, options });
    const targeted = options.env.PLAYWRIGHT_OAUTH_CLIENT_TARGETED === 'true';
    return makeResult(
      makeReport({
        projectName: args.at(-1) === 'playwright.config.ts' ? 'mock-chromium' : 'live-chromium',
        file: 'tests/e2e/specs/integration-clients.spec.ts',
        title: targeted ? 'targeted OAuth client inventory' : 'normal inventory',
      }),
    );
  };

  const inventories = collectCoverageInventories({ suiteRegistry, cwd: '/repo', environment: {}, spawn });
  const mockCalls = calls.filter(({ args }) => args.includes('playwright.config.ts'));
  assert.equal(mockCalls.length, 2);
  assert.equal(mockCalls[0].options.env.PLAYWRIGHT_OAUTH_CLIENT_TARGETED, undefined);
  assert.equal(mockCalls[1].options.env.PLAYWRIGHT_OAUTH_CLIENT_TARGETED, 'true');
  assert.deepEqual(mockCalls[1].args.slice(-4), [
    '--grep',
    '@mr.*@oauth-client|@oauth-client.*@mr',
    '-c',
    'playwright.config.ts',
  ]);
  assert.equal(inventories.worlds.mock.length, 2);
});

void test('coverage collector rejects every failed runner result before accepting inventory', () => {
  const timeout = Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' });
  const cases = [
    {
      name: 'timeout',
      result: makeResult(makeReport({ projectName: 'mock-chromium', file: 'tests/e2e/test.spec.ts', title: 'x' }), {
        status: null,
        signal: 'SIGKILL',
        error: timeout,
      }),
      expected: /worlds\/mock Playwright list timed out after 60000 ms/i,
    },
    {
      name: 'termination signal',
      result: makeResult(makeReport({ projectName: 'mock-chromium', file: 'tests/e2e/test.spec.ts', title: 'x' }), {
        status: null,
        signal: 'SIGTERM',
      }),
      expected: /worlds\/mock Playwright list exited on SIGTERM/i,
    },
    {
      name: 'nonzero status',
      result: makeResult(makeReport({ projectName: 'mock-chromium', file: 'tests/e2e/test.spec.ts', title: 'x' }), {
        status: 7,
      }),
      expected: /worlds\/mock Playwright list exited with status 7/i,
    },
    {
      name: 'stderr',
      result: makeResult(makeReport({ projectName: 'mock-chromium', file: 'tests/e2e/test.spec.ts', title: 'x' }), {
        stderr: 'unexpected warning',
      }),
      expected: /worlds\/mock Playwright list wrote to stderr: unexpected warning/i,
    },
    {
      name: 'malformed JSON',
      result: makeResult(makeReport({ projectName: 'mock-chromium', file: 'tests/e2e/test.spec.ts', title: 'x' }), {
        stdout: '{invalid',
      }),
      expected: /invalid Playwright JSON reporter output/i,
    },
    {
      name: 'zero inventory',
      result: makeResult({ config: { rootDir: '/repo' }, suites: [], errors: [] }),
      expected: /Playwright inventory contains zero tests/i,
    },
  ];

  for (const { name, result, expected } of cases) {
    let calls = 0;
    assert.throws(
      () =>
        collectCoverageInventories({
          suiteRegistry,
          cwd: '/repo',
          spawn: () => {
            calls += 1;
            return result;
          },
        }),
      expected,
      name,
    );
    assert.equal(calls, 1, `${name} must stop before another config is spawned`);
  }
});

void test('coverage collector labels a synchronous spawn failure with its suite and config', () => {
  let calls = 0;
  assert.throws(
    () =>
      collectCoverageInventories({
        suiteRegistry,
        cwd: '/repo',
        spawn: () => {
          calls += 1;
          throw new Error('injected spawn failure');
        },
      }),
    /worlds\/mock Playwright list spawn failed: injected spawn failure/i,
  );
  assert.equal(calls, 1);
});
