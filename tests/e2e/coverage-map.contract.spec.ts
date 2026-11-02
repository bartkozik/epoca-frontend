import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { parsePlaywrightInventory } from '../../scripts/e2e/coverage-inventory.mjs';
import { BACKFILL_COVERAGE_IDS, coverageMap, E2E_SUITE_REGISTRY, WORK_UNIT_OVERRIDES_BASELINE } from './coverage-map';

const require = createRequire(__filename);
const playwrightCli = require.resolve('@playwright/test/cli');
const repositoryRoot = path.resolve(__dirname, '../..');

const EXPECTED_BACKFILLS = [
  'CT-415',
  'CT-429',
  'CT-430',
  'CT-437',
  'CT-439',
  'CT-440',
  'CT-441',
  'CT-450',
  'CT-456',
  'CT-501',
  'CT-506',
  'CT-508',
  'CT-509',
  'CT-511',
  'CT-512',
  'CT-513',
  'CT-514',
  'CT-515',
  'CT-516',
  'CT-517',
  'CT-528',
  'CT-529',
  'local-staging-api-proxy',
  'ct-513-info-icon-follow-up',
] as const;

test('real coverage map preserves the exact closed backfill set @mr @technical', () => {
  expect(BACKFILL_COVERAGE_IDS).toEqual(EXPECTED_BACKFILLS);
  expect(coverageMap.filter(({ backfill }) => backfill).map(({ id }) => id)).toEqual(EXPECTED_BACKFILLS);
});

test('OAuth client coverage maps exact mock titles and the pending disposable live gate @mr @oauth-client', () => {
  const entries = coverageMap.filter(({ id, backfill }) => id === 'CT-521' && !backfill);
  expect(entries).toHaveLength(8);
  const browserEntries = entries.filter(
    (entry): entry is Extract<(typeof coverageMap)[number], { readonly kind: 'e2e' }> => entry.kind === 'e2e',
  );
  expect(browserEntries).toHaveLength(7);
  expect(browserEntries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        config: 'mock',
        project: 'mock-chromium',
        tier: 'mr',
        spec: 'tests/e2e/specs/integration-clients.spec.ts',
        target: { world: 'world-6', actor: 'owner' },
      }),
      expect.objectContaining({
        title:
          'Owner OAuth integration clients OAuth client @mr @oauth-client Owner opens Details with safe audit fields and paginates isolated events',
        config: 'mock',
        project: 'mock-chromium',
        tier: 'mr',
        spec: 'tests/e2e/specs/integration-clients.spec.ts',
        target: { world: 'world-6', actor: 'owner' },
      }),
      expect.objectContaining({
        config: 'mock',
        project: 'mock-chromium',
        tier: 'mr',
        spec: 'tests/e2e/specs/integration-clients.spec.ts',
        target: { world: 'world-6', actor: 'user' },
      }),
    ]),
  );
  expect(new Set(browserEntries.map(({ title }) => title)).size).toBe(browserEntries.length);
  expect(entries).toContainEqual({
    kind: 'pending-infrastructure',
    id: 'CT-521',
    backfill: false,
    status: 'blocked-unexecuted',
    reason:
      'Disposable FE+BE+PostgreSQL review infrastructure and an independent 24-hour janitor are not owned or evidenced in this repository',
    command: 'node .yarn/releases/yarn-4.18.0.cjs test:e2e:live:oauth-client',
    requires: ['protected disposable review stack', 'independent infrastructure janitor'],
  });
});

test('suite registry owns the exact controlled work-unit override configuration @mr @technical', () => {
  expect(E2E_SUITE_REGISTRY.worlds).toEqual({
    configs: {
      mock: {
        file: 'playwright.config.ts',
        tagPolicy: 'primary-tag',
        targets: [
          { project: 'mock-chromium', tier: 'mr', ciJob: 'e2e_mr' },
          { project: 'mock-chromium', tier: 'full', ciJob: 'e2e_full' },
          { project: 'mock-firefox', tier: 'full', ciJob: 'e2e_full' },
          { project: 'mock-webkit', tier: 'full', ciJob: 'e2e_full' },
        ],
      },
      live: {
        file: 'playwright.live.config.ts',
        tagPolicy: 'primary-tag',
        targets: [{ project: 'live-chromium', tier: 'live', ciJob: 'e2e_live' }],
      },
      'local-proxy': {
        file: 'playwright.local-proxy.config.ts',
        tagPolicy: 'primary-tag',
        targets: [{ project: 'local-proxy-chromium', tier: 'local-proxy', ciJob: 'e2e_local_proxy' }],
      },
    },
  });
  expect(E2E_SUITE_REGISTRY['work-unit-overrides']).toEqual({
    configs: {
      controlled: {
        file: 'playwright.work-unit-overrides.config.ts',
        tagPolicy: 'config-owned',
        targets: [
          { project: 'desktop-chromium', tier: 'mr', ciJob: 'e2e_mr' },
          { project: 'mobile-chromium', tier: 'mr', ciJob: 'e2e_mr' },
        ],
      },
    },
  });
  expect(E2E_SUITE_REGISTRY.pivot).toEqual({
    configs: {
      controlled: {
        file: 'playwright.pivot-table.config.ts',
        tagPolicy: 'config-owned',
        targets: [
          { project: 'desktop-chromium', tier: 'mr', ciJob: 'e2e_mr' },
          { project: 'touch-chromium', tier: 'full', ciJob: 'e2e_full' },
        ],
      },
    },
  });
  expect(WORK_UNIT_OVERRIDES_BASELINE).toHaveLength(16);
});

test('override baseline is a unique required subset and CT-511/CT-512 resolve once on desktop @mr @technical', () => {
  const childEnvironment = { ...process.env };
  delete childEnvironment.FORCE_COLOR;
  delete childEnvironment.NO_COLOR;
  const result = spawnSync(
    process.execPath,
    [playwrightCli, 'test', '--list', '--reporter=json', '-c', 'playwright.work-unit-overrides.config.ts'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...childEnvironment, CI: 'true', EPOCA_E2E_LIST_ONLY: 'true' },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60_000,
      killSignal: 'SIGKILL',
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  const inventory = parsePlaywrightInventory(result.stdout, { repositoryRoot });
  const baselineIdentities = WORK_UNIT_OVERRIDES_BASELINE.map(
    ({ project, spec, fullTitle }) => `${project}\0${spec}\0${fullTitle}`,
  );
  expect(new Set(baselineIdentities).size).toBe(16);
  for (const baseline of WORK_UNIT_OVERRIDES_BASELINE) {
    expect(
      inventory.filter(
        ({ projectName, spec, title }) =>
          projectName === baseline.project && spec === baseline.spec && title === baseline.fullTitle,
      ),
    ).toHaveLength(1);
  }
  for (const id of ['CT-511', 'CT-512']) {
    const entries = coverageMap.filter(({ id: entryId, backfill }) => entryId === id && backfill);
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry.kind).toBe('e2e');
    if (entry.kind !== 'e2e') throw new Error(`${id} must be an E2E entry`);
    expect(entry).toMatchObject({
      suite: 'work-unit-overrides',
      config: 'controlled',
      layer: 'controlled',
      tier: 'mr',
      project: 'desktop-chromium',
    });
    expect(
      inventory.filter(
        ({ projectName, spec, title }) => projectName === entry.project && spec === entry.spec && title === entry.title,
      ),
    ).toHaveLength(1);
  }
});
