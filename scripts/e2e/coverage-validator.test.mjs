import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePlaywrightInventory } from './coverage-inventory.mjs';
import { MULTI_SEARCH_CASES, validateCoverageMap } from './coverage-validator.mjs';
import {
  loadCoverageFixture,
  loadCoverageMap,
  loadCoverageMapSource,
  trustedCoverageFixturePath,
  trustedCoverageMapPath,
} from './load-coverage-map.mjs';

/** @template T @param {T} value @returns {T} */
const clone = (value) => structuredClone(value);

const loadedFixture = loadCoverageFixture();
const completeCoverageMap = loadedFixture.coverageMap;
const expectedBackfillIds = loadedFixture.expectedBackfillIds;

const makeReport = (coverageMap = completeCoverageMap) => {
  const identities = new Set();
  const browserEntries = coverageMap
    .filter((entry) => entry.kind === 'e2e')
    .filter((entry) => {
      if (entry.kind !== 'e2e') return false;
      const identity = `${entry.target.project}\0${entry.spec}\0${entry.title}`;
      if (identities.has(identity)) return false;
      identities.add(identity);
      return true;
    });

  return {
    config: { rootDir: '/repo' },
    suites: browserEntries.map((entry) => ({
      title: entry.spec,
      file: entry.spec,
      specs: [
        {
          title: entry.title,
          file: entry.spec,
          tags: entry.layer === 'visual' ? [entry.tier, 'visual'] : [entry.tier],
          tests: [{ projectName: entry.target.project }],
        },
      ],
    })),
    errors: [],
  };
};

const inventoryFor = (coverageMap = completeCoverageMap) =>
  parsePlaywrightInventory(JSON.stringify(makeReport(coverageMap)), { repositoryRoot: '/repo' });

const validate = (coverageMap = completeCoverageMap, overrides = {}) =>
  validateCoverageMap({
    coverageMap,
    expectedBackfillIds,
    inventory: inventoryFor(coverageMap),
    ...overrides,
  });

/** @param {(entry: (typeof import("./fixtures/coverage-map.fixture.ts"))["coverageMap"][number]) => boolean} predicate @param {(entry: (typeof import("./fixtures/coverage-map.fixture.ts"))["coverageMap"][number]) => unknown} update */
const mutateEntry = (predicate, update) => {
  const map = clone(completeCoverageMap);
  const index = map.findIndex(predicate);
  assert.notEqual(index, -1);
  map[index] = update(map[index]);
  return map;
};

const loadedRealMap = loadCoverageMap();

const makeFederatedInventories = (source = loadedRealMap) => {
  /** @type {import("./coverage-validator.mjs").FederatedInventories} */
  const inventories = {
    worlds: { mock: [], live: [], 'local-proxy': [] },
    'work-unit-overrides': { controlled: [] },
    pivot: { controlled: [] },
    invitations: { live: [] },
  };
  const identities = new Set();
  for (const entry of source.coverageMap.filter((entry) => entry.kind === 'e2e')) {
    const identity = `${entry.suite}\0${entry.config}\0${entry.project}\0${entry.spec}\0${entry.title}`;
    if (identities.has(identity)) continue;
    identities.add(identity);
    inventories[entry.suite][entry.config].push({
      projectName: entry.project,
      spec: entry.spec,
      title: entry.title,
      tags: entry.config === 'controlled' ? [] : entry.layer === 'visual' ? [entry.tier, 'visual'] : [entry.tier],
    });
  }
  for (const baseline of source.WORK_UNIT_OVERRIDES_BASELINE) {
    const identity = `work-unit-overrides\0controlled\0${baseline.project}\0${baseline.spec}\0${baseline.fullTitle}`;
    if (identities.has(identity)) continue;
    identities.add(identity);
    inventories['work-unit-overrides'].controlled.push({
      projectName: baseline.project,
      spec: baseline.spec,
      title: baseline.fullTitle,
      tags: [],
    });
  }
  return inventories;
};

const validateFederated = (overrides = {}) =>
  validateCoverageMap({
    coverageMap: loadedRealMap.coverageMap,
    expectedBackfillIds: loadedRealMap.BACKFILL_COVERAGE_IDS,
    suiteRegistry: loadedRealMap.E2E_SUITE_REGISTRY,
    workUnitOverridesBaseline: loadedRealMap.WORK_UNIT_OVERRIDES_BASELINE,
    inventories: makeFederatedInventories(),
    ...overrides,
  });

void test('trusted typed fixture loads as deeply plain data', () => {
  assert.equal(trustedCoverageFixturePath.endsWith('scripts/e2e/fixtures/coverage-map.fixture.ts'), true);
  assert.equal(Object.getPrototypeOf(loadedFixture), Object.prototype);
  assert.equal(Object.getPrototypeOf(loadedFixture.coverageMap[0]), Object.prototype);
  assert.equal(expectedBackfillIds.length, 24);
  assert.equal(new Set(expectedBackfillIds).size, 24);
  assert.equal(completeCoverageMap.length, 31);
});

void test('trusted real map loads as deeply plain data with only its four contract exports', () => {
  assert.equal(trustedCoverageMapPath.endsWith('tests/e2e/coverage-map.ts'), true);
  assert.deepEqual(Object.keys(loadedRealMap).sort(), [
    'BACKFILL_COVERAGE_IDS',
    'E2E_SUITE_REGISTRY',
    'WORK_UNIT_OVERRIDES_BASELINE',
    'coverageMap',
  ]);
  assert.equal(Object.getPrototypeOf(loadedRealMap), Object.prototype);
  assert.equal(Object.getPrototypeOf(loadedRealMap.E2E_SUITE_REGISTRY.worlds), Object.prototype);
});

void test('CT-521 live lifecycle is an explicit unexecuted disposable-infrastructure gate, not generic live coverage', () => {
  const oauthClient = loadedRealMap.coverageMap.filter(({ id, backfill }) => id === 'CT-521' && backfill === false);
  const pending = oauthClient.filter(({ kind }) => kind === 'pending-infrastructure');
  assert.equal(pending.length, 1);
  assert.deepEqual(pending[0], {
    kind: 'pending-infrastructure',
    id: 'CT-521',
    backfill: false,
    status: 'blocked-unexecuted',
    reason:
      'Disposable FE+BE+PostgreSQL review infrastructure and an independent 24-hour janitor are not owned or evidenced in this repository',
    command: 'node .yarn/releases/yarn-4.18.0.cjs test:e2e:live:oauth-client',
    requires: ['protected disposable review stack', 'independent infrastructure janitor'],
  });
  assert.equal(
    oauthClient.some(({ kind, config }) => kind === 'e2e' && config === 'live'),
    false,
  );
});

void test('coverage validation requires exactly one CT-521 pending gate and rejects a live browser claim', () => {
  const missingPending = clone(loadedRealMap.coverageMap).filter(({ kind }) => kind !== 'pending-infrastructure');
  assert.throws(() => validateFederated({ coverageMap: missingPending }), /CT-521.*exactly one pending/i);

  /** @type {import("./coverage-validator.mjs").CoverageEntry[]} */
  const liveClaim = clone(loadedRealMap.coverageMap);
  liveClaim.push({
    kind: 'e2e',
    id: 'CT-521',
    backfill: false,
    suite: 'worlds',
    config: 'live',
    layer: 'live',
    tier: 'live',
    project: 'live-chromium',
    spec: 'tests/e2e/live/cross-stack.spec.ts',
    title: 'CT-521 @live @oauth-client synthetic executed claim',
    target: { environment: 'live', actors: ['owner'] },
  });
  const inventories = makeFederatedInventories({ ...loadedRealMap, coverageMap: liveClaim });
  assert.throws(() => validateFederated({ coverageMap: liveClaim, inventories }), /CT-521.*must not claim live/i);
});

void test('trusted loader rejects imports, dynamic code, ambient access, and non-data exports', () => {
  const invalidSources = [
    "import fs from 'node:fs'; export const coverageMap = [];",
    "export { readFileSync } from 'node:fs';",
    "export const coverageMap = import('node:fs');",
    'export const coverageMap = process.env;',
    "export const coverageMap = require('node:fs');",
    "export const coverageMap = eval('[]');",
    "export const coverageMap = Function('return []')();",
    'export const coverageMap = () => [];',
    'export class CoverageMap {}',
    'export const coverageMap = { get secret() { return 1; } };',
    "export const coverageMap = { ['computed']: 1 };",
  ];

  for (const source of invalidSources) {
    assert.throws(() => loadCoverageMapSource(source, 'malicious.fixture.ts'), /trusted static data/i, source);
  }
});

void test('complete discriminated fixture validates and resolves every browser entry exactly', () => {
  const result = validate();
  assert.deepEqual(result, {
    entries: 31,
    backfills: 24,
    browserEntries: 25,
    gates: 5,
    infrastructure: 1,
    pendingInfrastructure: 0,
  });
});

void test('rejects 23 or 25 historical backfills and duplicate backfill IDs', () => {
  const missing = completeCoverageMap.filter(({ id }) => id !== 'CT-415');
  assert.throws(() => validate(missing), /backfill.*exact/i);

  const extra = [
    ...clone(completeCoverageMap),
    {
      kind: 'gate',
      id: 'CT-999',
      backfill: true,
      reason: 'unexpected fixture gate',
      command: 'fixture command',
      evidence: { type: 'technical', repository: 'epoca', job: 'test_backend' },
    },
  ];
  assert.throws(() => validate(extra), /backfill.*exact/i);

  const duplicateIds = [...expectedBackfillIds.slice(0, -1), expectedBackfillIds[0]];
  assert.throws(
    () =>
      validateCoverageMap({
        coverageMap: completeCoverageMap,
        expectedBackfillIds: duplicateIds,
        inventory: inventoryFor(),
      }),
    /expected backfill.*unique/i,
  );
});

void test('rejects duplicate id plus spec plus title entries', () => {
  const duplicate = clone(completeCoverageMap.find(({ kind, id }) => kind === 'e2e' && id !== 'CT-533'));
  assert.throws(() => validate([...clone(completeCoverageMap), duplicate]), /duplicate coverage identity/i);
});

void test('requires an exact unique project, spec, and full-title inventory match', () => {
  const entry = completeCoverageMap.find(({ kind }) => kind === 'e2e');
  const missingTitle = inventoryFor().map((item) =>
    item.spec === entry.spec && item.title === entry.title ? { ...item, title: `${item.title} changed` } : item,
  );
  assert.throws(
    () => validateCoverageMap({ coverageMap: completeCoverageMap, expectedBackfillIds, inventory: missingTitle }),
    /missing exact inventory match/i,
  );

  const pathOnly = inventoryFor().filter((item) => !(item.spec === entry.spec && item.title === entry.title));
  assert.ok(entry && entry.kind === 'e2e');
  pathOnly.push({ ...inventoryFor()[0], spec: entry.spec, title: 'same path but not the full title' });
  assert.throws(
    () => validateCoverageMap({ coverageMap: completeCoverageMap, expectedBackfillIds, inventory: pathOnly }),
    /missing exact inventory match/i,
  );

  const ambiguous = [
    ...inventoryFor(),
    clone(inventoryFor().find((item) => item.spec === entry.spec && item.title === entry.title)),
  ];
  assert.throws(
    () => validateCoverageMap({ coverageMap: completeCoverageMap, expectedBackfillIds, inventory: ambiguous }),
    /ambiguous exact inventory match/i,
  );
});

void test('exact inventory matches enforce primary tier and visual classification semantics', () => {
  const inventory = inventoryFor();
  const liveEntry = completeCoverageMap.find(({ kind, id }) => kind === 'e2e' && id === 'CT-415');
  const visualEntry = completeCoverageMap.find(({ kind, id }) => kind === 'e2e' && id === 'ct-513-info-icon-follow-up');
  const mockEntry = completeCoverageMap.find(({ kind, id }) => kind === 'e2e' && id === 'CT-439');
  const fullEntry = completeCoverageMap.find(
    ({ kind, id, tier }) => kind === 'e2e' && id === 'CT-533' && tier === 'full',
  );
  /** @param {import("./coverage-validator.mjs").InventoryItem[]} source @param {import("./coverage-validator.mjs").LegacyE2EEntry} coverage @param {string[]} tags */
  const replaceTags = (source, coverage, tags) =>
    source.map((item) =>
      item.projectName === coverage.target.project && item.spec === coverage.spec && item.title === coverage.title
        ? { ...item, tags }
        : item,
    );

  assert.throws(
    () =>
      validateCoverageMap({
        coverageMap: completeCoverageMap,
        expectedBackfillIds,
        inventory: replaceTags(inventory, liveEntry, ['mr']),
      }),
    /inventory primary tag.*coverage tier/i,
  );
  assert.throws(
    () =>
      validateCoverageMap({
        coverageMap: completeCoverageMap,
        expectedBackfillIds,
        inventory: replaceTags(inventory, mockEntry, ['mr', 'full']),
      }),
    /exactly one primary tag/i,
  );
  assert.throws(
    () =>
      validateCoverageMap({
        coverageMap: completeCoverageMap,
        expectedBackfillIds,
        inventory: replaceTags(inventory, visualEntry, ['mr']),
      }),
    /visual coverage.*visual tag/i,
  );
  assert.throws(
    () =>
      validateCoverageMap({
        coverageMap: completeCoverageMap,
        expectedBackfillIds,
        inventory: replaceTags(inventory, mockEntry, ['mr', 'visual']),
      }),
    /non-visual coverage.*visual tag/i,
  );
  assert.doesNotThrow(() =>
    validateCoverageMap({
      coverageMap: completeCoverageMap,
      expectedBackfillIds,
      inventory: replaceTags(inventory, fullEntry, ['mr']),
    }),
  );
});

void test('rejects mixed, invalid, and wrong E2E target shapes', () => {
  /** @type {Array<(entry: Record<string, unknown> & {target?: Record<string, unknown>}) => unknown>} */
  const cases = [
    (entry) => ({ ...entry, target: { ...entry.target, world: 'world-1', actor: 'owner' } }),
    (entry) => ({ ...entry, target: { world: 'world-6', actor: 'owner', project: 'mock-chromium' } }),
    (entry) => ({ ...entry, target: { world: 'world-1', actor: 'admin', project: 'mock-chromium' } }),
    (entry) => ({ ...entry, target: { world: 'world-1', actor: 'owner', project: 'live-chromium' } }),
    (entry) => ({ ...entry, target: { world: 'world-1', actor: 'owner' } }),
    (entry) => ({ ...entry, target: { environment: 'preview', actors: ['owner'], project: 'live-chromium' } }),
    (entry) => ({ ...entry, target: { environment: 'live', actors: [], project: 'live-chromium' } }),
  ];

  for (const update of cases) {
    const map = mutateEntry(({ kind, id }) => kind === 'e2e' && id === 'CT-415', update);
    assert.throws(() => validate(map), /e2e.*target|target.*shape|project/i);
  }
});

void test('gate variants reject browser fields, missing evidence fields, and unknown keys', () => {
  /** @type {Array<(entry: {evidence: Record<string, unknown>}) => unknown>} */
  const technicalCases = [
    (entry) => ({ ...entry, world: 'world-1' }),
    (entry) => ({ ...entry, actor: 'owner' }),
    (entry) => ({ ...entry, project: 'mock-chromium' }),
    (entry) => ({ ...entry, spec: 'fixture/gate.spec.ts' }),
    (entry) => ({ ...entry, title: 'gate browser title' }),
    (entry) => ({ ...entry, layer: 'mock' }),
    (entry) => ({ ...entry, tier: 'mr' }),
    (entry) => ({ ...entry, target: { world: 'world-1', actor: 'owner', project: 'mock-chromium' } }),
    (entry) => ({ ...entry, evidence: { type: 'technical', repository: 'epoca' } }),
    (entry) => ({ ...entry, evidence: { type: 'technical', job: 'test_backend' } }),
    (entry) => ({ ...entry, evidence: { ...entry.evidence, title: 'browser field' } }),
  ];
  for (const update of technicalCases) {
    const map = mutateEntry(({ kind, id }) => kind === 'gate' && id === 'CT-429', update);
    assert.throws(() => validate(map), /gate|technical evidence|unknown/i);
  }

  /** @type {Array<(entry: {evidence: Record<string, unknown>}) => unknown>} */
  const externalCases = [
    (entry) => ({
      ...entry,
      evidence: { type: 'external', projectId: 'epoca/epoca', job: 'oauth_e2e', artifact: 'x' },
    }),
    (entry) => ({
      ...entry,
      evidence: {
        type: 'external',
        shaEnv: 'EPOCA_BACKEND_SHA',
        job: 'oauth_e2e',
        artifact: 'oauth-e2e-evidence.json',
      },
    }),
    (entry) => ({
      ...entry,
      evidence: {
        type: 'external',
        projectId: 'epoca/epoca',
        shaEnv: 'EPOCA_BACKEND_SHA',
        artifact: 'oauth-e2e-evidence.json',
      },
    }),
    (entry) => ({
      ...entry,
      evidence: {
        type: 'external',
        projectId: 'epoca/epoca',
        shaEnv: 'EPOCA_BACKEND_SHA',
        job: 'oauth_e2e',
      },
    }),
    (entry) => ({ ...entry, evidence: { ...entry.evidence, project: 'mock-chromium' } }),
  ];
  for (const update of externalCases) {
    const map = mutateEntry(({ kind, id }) => kind === 'gate' && id === 'CT-520', update);
    assert.throws(() => validate(map), /external evidence|unknown/i);
  }
});

void test('infrastructure is only the exact non-backfill CT-530 data shape', () => {
  /** @type {Array<(entry: Record<string, unknown> & {target?: Record<string, unknown>}) => unknown>} */
  const cases = [
    (entry) => ({ ...entry, id: 'CT-999' }),
    (entry) => ({ ...entry, backfill: true }),
    (entry) => ({ ...entry, contracts: [] }),
    (entry) => ({ ...entry, reason: 'not infrastructure data' }),
  ];
  for (const update of cases) {
    const map = mutateEntry(({ kind }) => kind === 'infrastructure', update);
    assert.throws(() => validate(map), /infrastructure/i);
  }
});

void test('CT-533 requires its four distinct behavioral case IDs and exact world-4 owner targets', () => {
  assert.deepEqual(
    completeCoverageMap
      .filter((entry) => entry.kind === 'e2e' && entry.id === 'CT-533')
      .map(({ title }) => title.match(/@multi-search-[\w-]+/)[0].slice(1))
      .sort(),
    Object.keys(MULTI_SEARCH_CASES).sort(),
  );

  /** @type {import("./coverage-validator.mjs").CoverageEntry[]} */
  const removed = clone(completeCoverageMap);
  removed.splice(
    removed.findIndex(({ id }) => id === 'CT-533'),
    1,
  );
  assert.throws(() => validate(removed), /CT-533.*four distinct required cases/i);

  const synthetic = mutateEntry(
    ({ id }) => id === 'CT-533',
    (entry) => ({ ...entry, title: 'CT-533 @mr synthetic collapsed coverage title' }),
  );
  assert.throws(() => validate(synthetic), /CT-533.*four distinct required cases/i);

  const wrongTarget = mutateEntry(
    ({ id }) => id === 'CT-533',
    (entry) => ({ ...entry, target: { world: 'world-3', actor: 'owner', project: 'mock-chromium' } }),
  );
  assert.throws(() => validate(wrongTarget), /CT-533.*world-4.*owner/i);
});

void test('CT-533 rejects an additional non-E2E entry with the same non-backfill ID', () => {
  const extraGate = {
    kind: 'gate',
    id: 'CT-533',
    backfill: false,
    reason: 'synthetic technical exception must not extend CT-533 coverage',
    command: 'fixture invalid CT-533 gate',
    evidence: { type: 'technical', repository: 'epoca-frontend', job: 'validate_e2e' },
  };

  assert.throws(
    () => validate([...clone(completeCoverageMap), extraGate]),
    /CT-533.*exactly four non-backfill E2E entries/i,
  );
});

void test('coverage inventory rejects zero tests and reporter errors', () => {
  assert.throws(
    () =>
      parsePlaywrightInventory(JSON.stringify({ config: { rootDir: '/repo' }, suites: [], errors: [] }), {
        repositoryRoot: '/repo',
      }),
    /zero tests/i,
  );
  assert.throws(
    () =>
      parsePlaywrightInventory(
        JSON.stringify({ config: { rootDir: '/repo' }, suites: [], errors: [{ message: 'collection failed' }] }),
        { repositoryRoot: '/repo' },
      ),
    /reporter errors/i,
  );
});

void test('federated registry validates the real map, override baseline subset, and unique CT-511/CT-512 resolution', () => {
  const result = validateFederated();
  assert.deepEqual(result, {
    entries: 103,
    backfills: 24,
    browserEntries: 92,
    gates: 9,
    infrastructure: 1,
    pendingInfrastructure: 1,
  });

  const controlled = makeFederatedInventories()['work-unit-overrides'].controlled;
  for (const id of ['CT-511', 'CT-512']) {
    const entry = loadedRealMap.coverageMap.find((candidate) => candidate.kind === 'e2e' && candidate.id === id);
    assert.ok(entry);
    assert.equal(entry.project, 'desktop-chromium');
    assert.equal(
      controlled.filter(
        ({ projectName, spec, title }) => projectName === entry.project && spec === entry.spec && title === entry.title,
      ).length,
      1,
    );
  }
});

void test('accepted final boundary covers pivot, backend pivot, auth containment, and aggregate overrides', () => {
  assert.equal(loadedRealMap.BACKFILL_COVERAGE_IDS.length, 24);

  const acceptedIds = new Set(loadedRealMap.coverageMap.map(({ id }) => id));
  for (const id of ['CT-534', 'CT-535', 'staging-auth-loop-containment']) assert.equal(acceptedIds.has(id), true, id);

  const pivot = loadedRealMap.E2E_SUITE_REGISTRY.pivot;
  assert.ok(pivot);
  assert.equal(pivot.configs.controlled.file, 'playwright.pivot-table.config.ts');
  assert.deepEqual(pivot.configs.controlled.targets, [
    { project: 'desktop-chromium', tier: 'mr', ciJob: 'e2e_mr' },
    { project: 'touch-chromium', tier: 'full', ciJob: 'e2e_full' },
  ]);

  const ct512 = loadedRealMap.coverageMap.filter(({ kind, id }) => kind === 'e2e' && id === 'CT-512');
  assert.equal(
    ct512.some(({ spec }) => spec === 'tests/e2e/specs/corrections.spec.ts'),
    true,
  );
  assert.equal(
    ct512.some(({ spec, config }) => spec === 'tests/e2e/live/cross-stack.spec.ts' && config === 'live'),
    true,
  );

  const ct520 = loadedRealMap.coverageMap.find(({ kind, id }) => kind === 'gate' && id === 'CT-520');
  const ct522 = loadedRealMap.coverageMap.find(({ kind, id }) => kind === 'gate' && id === 'CT-522');
  const livePivot = loadedRealMap.coverageMap.find(
    ({ kind, id, config }) => kind === 'e2e' && id === 'CT-535' && config === 'live',
  );
  assert.ok(ct520 && ct520.kind === 'gate' && ct520.evidence.type === 'external');
  assert.equal(ct520.evidence.provider, 'gitlab');
  assert.equal(ct522, undefined, 'AI-skill QA is independent and must not gate CT-530');
  assert.equal(livePivot?.spec, 'tests/e2e/live/cross-stack.spec.ts');
  assert.equal(livePivot?.title, 'CT-535 @live binds a pivot query and CSV export to the owned worklog');
});

void test('federated registry fails closed for unknown suites, configs, jobs, and config-owned drift', () => {
  const unknownSuite = clone(loadedRealMap.coverageMap);
  unknownSuite.find(({ kind }) => kind === 'e2e').suite = 'unknown-suite';
  assert.throws(() => validateFederated({ coverageMap: unknownSuite }), /unknown suite/i);

  const unknownConfig = clone(loadedRealMap.coverageMap);
  unknownConfig.find(({ kind }) => kind === 'e2e').config = 'unknown-config';
  assert.throws(() => validateFederated({ coverageMap: unknownConfig }), /unknown config/i);

  const unknownJob = clone(loadedRealMap.E2E_SUITE_REGISTRY);
  unknownJob.worlds.configs.mock.targets[0].ciJob = 'unknown_job';
  assert.throws(() => validateFederated({ suiteRegistry: unknownJob }), /suite registry.*exact|unknown.*job/i);

  const configOwnedWorlds = clone(loadedRealMap.E2E_SUITE_REGISTRY);
  configOwnedWorlds.worlds.configs.mock.tagPolicy = 'config-owned';
  assert.throws(() => validateFederated({ suiteRegistry: configOwnedWorlds }), /config-owned|suite registry.*exact/i);
});

void test('federated worlds accept executable full-tier primary tags for a registered mock project', () => {
  const inventories = makeFederatedInventories();
  for (const tag of ['mr', 'full']) {
    inventories.worlds.mock.push({
      projectName: 'mock-firefox',
      spec: `tests/e2e/worlds/registry-full-${tag}.spec.ts`,
      title: `mock Firefox full target accepts ${tag}`,
      tags: [tag],
    });
  }

  assert.doesNotThrow(() => validateFederated({ inventories }));
});

void test('federated worlds reject live, local, and cross-project primary-tag mis-tagging', () => {
  /** @type {{config: string, projectName: string, tags: string[]}[]} */
  const cases = [
    { config: 'live', projectName: 'live-chromium', tags: ['mr'] },
    { config: 'local-proxy', projectName: 'local-proxy-chromium', tags: ['live'] },
    { config: 'mock', projectName: 'mock-firefox', tags: ['live'] },
  ];

  for (const { config, projectName, tags } of cases) {
    const inventories = makeFederatedInventories();
    inventories.worlds[config].push({
      projectName,
      spec: 'tests/e2e/worlds/registry-tier-binding.spec.ts',
      title: `${config} ${projectName} rejects ${tags[0]} leakage`,
      tags,
    });

    assert.throws(
      () => validateFederated({ inventories }),
      new RegExp(`${config}.*${projectName}.*primary tag.*registry tier`, 'i'),
    );
  }
});

void test('federated registry rejects override/pivot-on-world and world-on-controlled cross-suite discovery', () => {
  const overrideOnWorlds = clone(loadedRealMap.coverageMap);
  const overrideEntry = overrideOnWorlds.find(({ kind, id }) => kind === 'e2e' && id === 'CT-511');
  Object.assign(overrideEntry, {
    suite: 'worlds',
    config: 'mock',
    layer: 'mock',
    project: 'mock-chromium',
    target: { world: 'world-4', actor: 'manager' },
  });
  assert.throws(() => validateFederated({ coverageMap: overrideOnWorlds }), /cross-suite|override.*world/i);

  const worldOnControlled = clone(loadedRealMap.coverageMap);
  const worldEntry = worldOnControlled.find(({ kind, id }) => kind === 'e2e' && id === 'CT-439');
  Object.assign(worldEntry, {
    suite: 'work-unit-overrides',
    config: 'controlled',
    layer: 'controlled',
    project: 'desktop-chromium',
    target: { environment: 'controlled', actors: ['owner'] },
  });
  assert.throws(() => validateFederated({ coverageMap: worldOnControlled }), /cross-suite|world.*controlled/i);

  const pivotOnWorlds = clone(loadedRealMap.coverageMap);
  const pivotEntry = pivotOnWorlds.find(({ kind, id }) => kind === 'e2e' && id === 'CT-534');
  Object.assign(pivotEntry, {
    suite: 'worlds',
    config: 'mock',
    layer: 'mock',
    tier: 'full',
    project: 'mock-chromium',
    target: { world: 'world-4', actor: 'owner' },
  });
  assert.throws(() => validateFederated({ coverageMap: pivotOnWorlds }), /cross-suite|pivot.*world/i);

  const crossSuiteInventories = makeFederatedInventories();
  crossSuiteInventories.worlds.mock.push({
    projectName: 'mock-chromium',
    spec: 'tests/workUnitOverrides/workUnitOverrides.spec.ts',
    title: 'cross-suite override discovery @mr',
    tags: ['mr'],
  });
  assert.throws(() => validateFederated({ inventories: crossSuiteInventories }), /cross-suite.*spec/i);

  const pivotInWorldInventory = makeFederatedInventories();
  pivotInWorldInventory.worlds.mock.push({
    projectName: 'mock-chromium',
    spec: 'tests/pivotTable/pivotTable.spec.ts',
    title: 'cross-suite pivot discovery @full',
    tags: ['full'],
  });
  assert.throws(() => validateFederated({ inventories: pivotInWorldInventory }), /cross-suite.*spec/i);
});

void test('override baseline requires 16 unique exact identities while allowing additional valid controlled tests', () => {
  const missing = clone(loadedRealMap.WORK_UNIT_OVERRIDES_BASELINE).slice(1);
  assert.throws(() => validateFederated({ workUnitOverridesBaseline: missing }), /work-unit override baseline.*16/i);

  const duplicate = clone(loadedRealMap.WORK_UNIT_OVERRIDES_BASELINE);
  duplicate[15] = clone(duplicate[0]);
  assert.throws(
    () => validateFederated({ workUnitOverridesBaseline: duplicate }),
    /work-unit override baseline.*unique/i,
  );

  const missingInventory = makeFederatedInventories();
  const missingIdentity = loadedRealMap.WORK_UNIT_OVERRIDES_BASELINE[0];
  missingInventory['work-unit-overrides'].controlled = missingInventory['work-unit-overrides'].controlled.filter(
    ({ projectName, spec, title }) =>
      projectName !== missingIdentity.project || spec !== missingIdentity.spec || title !== missingIdentity.fullTitle,
  );
  assert.throws(
    () => validateFederated({ inventories: missingInventory }),
    /missing work-unit override baseline tuple/i,
  );

  const additional = makeFederatedInventories();
  additional['work-unit-overrides'].controlled.push({
    projectName: 'desktop-chromium',
    spec: 'tests/workUnitOverrides/workUnitOverrides.spec.ts',
    title: 'additional accepted controlled override scenario',
    tags: [],
  });
  assert.doesNotThrow(() => validateFederated({ inventories: additional }));
});

void test('coverage tuples must exist literally in their registry target', () => {
  const mismatch = clone(loadedRealMap.coverageMap);
  const entry = mismatch.find((candidate) => candidate.kind === 'e2e' && candidate.id === 'CT-533');
  entry.project = 'mock-firefox';
  entry.tier = 'mr';
  const inventories = makeFederatedInventories();
  inventories.worlds.mock.push({
    projectName: entry.project,
    spec: entry.spec,
    title: entry.title,
    tags: ['mr'],
  });
  assert.throws(() => validateFederated({ coverageMap: mismatch, inventories }), /registry target mismatch/i);
});

void test('multi-search wording may change while stable cases remain discoverable', () => {
  const changed = mutateEntry(
    ({ id }) => id === 'CT-533',
    (entry) => ({
      ...entry,
      title: ('title' in entry ? entry.title : '').replace(
        'dzieli zaznaczone i pozostałe opcje oraz filtruje obie sekcje',
        'filters both option sections',
      ),
    }),
  );
  assert.doesNotThrow(() => validate(changed));
});

void test('multi-search rejects duplicate, unknown, multiple case tags and changed tiers', () => {
  for (const replacement of [
    '@multi-search-transfer',
    '@multi-search-unknown',
    '@multi-search-sections @multi-search-transfer',
  ]) {
    const changed = mutateEntry(
      (entry) => 'title' in entry && entry.title.includes('@multi-search-sections'),
      (entry) => ({
        ...entry,
        title: ('title' in entry ? entry.title : '').replace('@multi-search-sections', replacement),
      }),
    );
    assert.throws(() => validate(changed), /four distinct required cases/);
  }
  const changed = mutateEntry(
    (entry) => 'title' in entry && entry.title.includes('@multi-search-mobile'),
    (entry) => ({
      ...entry,
      tier: 'mr',
      title: ('title' in entry ? entry.title : '').replace('@full', '@mr'),
    }),
  );
  assert.throws(() => validate(changed), /required tier and spec/);
});
