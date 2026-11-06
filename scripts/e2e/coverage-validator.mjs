const WORLD_NAMES = new Set(['world-1', 'world-2', 'world-3', 'world-4', 'world-5', 'world-6']);
const ACTOR_NAMES = new Set(['anonymous', 'owner', 'manager', 'pm', 'user']);
const MOCK_PROJECTS = new Set(['mock-chromium', 'mock-firefox', 'mock-webkit']);
const PRIMARY_TAGS = new Set(['mr', 'full', 'live', 'local-proxy']);
/** @type {Record<string, ReadonlySet<string>>} */
const COVERAGE_TIER_TAGS = Object.freeze({
  mr: new Set(['mr']),
  full: new Set(['mr', 'full']),
  live: new Set(['live']),
  'local-proxy': new Set(['local-proxy']),
});
const SUITE_NAMES = new Set(['worlds', 'work-unit-overrides', 'pivot', 'invitations']);
const CONFIG_NAMES = new Set(['mock', 'live', 'local-proxy', 'controlled']);
const EXPECTED_SUITE_REGISTRY = Object.freeze({
  worlds: {
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
  },
  'work-unit-overrides': {
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
  },
  invitations: {
    configs: {
      live: {
        file: 'playwright.invitation-live.config.ts',
        tagPolicy: 'primary-tag',
        targets: [{ project: 'invitation-live-chromium', tier: 'live', ciJob: 'manual-owned-runtime' }],
      },
    },
  },
  pivot: {
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
  },
});

/** @type {Record<string, string>} */
export const MULTI_SEARCH_CASES = Object.freeze({
  'multi-search-sections': 'mr',
  'multi-search-transfer': 'mr',
  'multi-search-keyboard': 'mr',
  'multi-search-mobile': 'full',
});

/**
 * @typedef {Record<string, unknown>} JsonRecord
 *
 * @typedef {{ world: string, actor: string, project: string }} WorldTarget
 * @typedef {{ environment: string, actors: string[], project: string }} EnvironmentTarget
 *
 * @typedef {object} LegacyE2EEntry
 * @property {'e2e'} kind
 * @property {string} id
 * @property {boolean} backfill
 * @property {string} layer
 * @property {string} tier
 * @property {string} spec
 * @property {string} title
 * @property {WorldTarget | EnvironmentTarget} target
 *
 * @typedef {object} FederatedE2EEntry
 * @property {'e2e'} kind
 * @property {string} id
 * @property {boolean} backfill
 * @property {string} suite
 * @property {string} config
 * @property {string} layer
 * @property {string} tier
 * @property {string} project
 * @property {string} spec
 * @property {string} title
 * @property {JsonRecord & { actors?: unknown[] }} target
 *
 * @typedef {object} TechnicalGateEvidence
 * @property {'technical'} type
 * @property {string} repository
 * @property {string} job
 *
 * @typedef {object} GitlabGateEvidence
 * @property {'external'} type
 * @property {'gitlab'} provider
 * @property {string} projectId
 * @property {string} shaEnv
 * @property {string} job
 * @property {string} artifact
 *
 * @typedef {object} GithubGateEvidence
 * @property {'external'} type
 * @property {'github'} provider
 * @property {string} repository
 * @property {string} shaEnv
 * @property {string} workflow
 * @property {string} event
 * @property {string} branch
 * @property {string} job
 * @property {string} artifact
 * @property {string} file
 * @property {string} evidenceProvider
 * @property {string} providerEndpoint
 * @property {string} model
 * @property {string} configSha256
 * @property {string} inventorySha256
 * @property {number} expectedCases
 *
 * @typedef {TechnicalGateEvidence | GitlabGateEvidence | GithubGateEvidence} GateEvidence
 *
 * @typedef {object} GateEntry
 * @property {'gate'} kind
 * @property {string} id
 * @property {boolean} backfill
 * @property {string} reason
 * @property {string} command
 * @property {GateEvidence} evidence
 *
 * @typedef {object} InfrastructureEntry
 * @property {'infrastructure'} kind
 * @property {string} id
 * @property {boolean} backfill
 * @property {string[]} contracts
 * @property {string} command
 *
 * @typedef {object} PendingInfrastructureEntry
 * @property {'pending-infrastructure'} kind
 * @property {string} id
 * @property {boolean} backfill
 * @property {string} status
 * @property {string} reason
 * @property {string} command
 * @property {string[]} requires
 *
 * @typedef {LegacyE2EEntry | FederatedE2EEntry | GateEntry | InfrastructureEntry | PendingInfrastructureEntry} CoverageEntry
 *
 * @typedef {{ project: string, tier: string, ciJob: string }} SuiteRegistryTarget
 * @typedef {{ file: string, tagPolicy: string, targets: SuiteRegistryTarget[] }} SuiteRegistryConfig
 * @typedef {{ configs: Record<string, SuiteRegistryConfig> }} SuiteRegistryDefinition
 * @typedef {Record<string, SuiteRegistryDefinition>} SuiteRegistry
 *
 * @typedef {{ projectName: string, spec: string, title: string, tags: string[] }} InventoryItem
 * @typedef {Record<string, Record<string, InventoryItem[]>>} FederatedInventories
 *
 * @typedef {{ project: string, spec: string, fullTitle: string }} OverrideBaselineTuple
 *
 * @typedef {object} ValidateCoverageMapOptions
 * @property {CoverageEntry[]} coverageMap
 * @property {string[]} expectedBackfillIds
 * @property {InventoryItem[]} [inventory]
 * @property {SuiteRegistry} [suiteRegistry]
 * @property {OverrideBaselineTuple[]} [workUnitOverridesBaseline]
 * @property {FederatedInventories} [inventories]
 *
 * @typedef {object} CoverageSummary
 * @property {number} entries
 * @property {number} backfills
 * @property {number} browserEntries
 * @property {number} gates
 * @property {number} infrastructure
 * @property {number} pendingInfrastructure
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * @param {unknown} value
 * @param {readonly string[]} expectedKeys
 * @param {string} label
 */
const assertExactKeys = (value, expectedKeys, label) => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(
      `${label} has unknown or missing fields: expected ${expected.join(', ')}, received ${actual.join(', ')}`,
    );
  }
};

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {asserts value is string}
 */
const assertString = (value, label) => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
};

/**
 * @param {Record<string, unknown>} entry
 */
const assertCommon = (entry) => {
  assertString(entry.id, 'coverage id');
  if (typeof entry.backfill !== 'boolean') throw new Error(`coverage ${entry.id} backfill must be boolean`);
};

/** @param {{ id: unknown, layer: unknown, tier: unknown, target: Record<string, unknown> }} entry */
const assertWorldTarget = (entry) => {
  assertExactKeys(entry.target, ['world', 'actor', 'project'], `E2E ${String(entry.id)} world target shape`);
  if (!WORLD_NAMES.has(entry.target.world)) throw new Error(`E2E ${String(entry.id)} target has invalid world`);
  if (!ACTOR_NAMES.has(entry.target.actor)) throw new Error(`E2E ${String(entry.id)} target has invalid actor`);
  if (!MOCK_PROJECTS.has(entry.target.project))
    throw new Error(`E2E ${String(entry.id)} target has invalid project`);
  if (entry.layer !== 'mock' && entry.layer !== 'visual')
    throw new Error(`E2E ${String(entry.id)} world target has invalid layer`);
  if (entry.tier !== 'mr' && entry.tier !== 'full')
    throw new Error(`E2E ${String(entry.id)} world target has invalid tier`);
  if (entry.tier === 'mr' && entry.target.project !== 'mock-chromium') {
    throw new Error(`E2E ${String(entry.id)} MR target has invalid project`);
  }
};

/** @param {{ id: unknown, layer: unknown, tier: unknown, target: Record<string, unknown> & { actors?: unknown[] } }} entry */
const assertEnvironmentTarget = (entry) => {
  assertExactKeys(
    entry.target,
    ['environment', 'actors', 'project'],
    `E2E ${String(entry.id)} environment target shape`,
  );
  if (entry.target.environment !== 'live' && entry.target.environment !== 'local-proxy') {
    throw new Error(`E2E ${String(entry.id)} target has invalid environment`);
  }
  if (!Array.isArray(entry.target.actors) || entry.target.actors.length === 0) {
    throw new Error(`E2E ${String(entry.id)} target actors must be non-empty`);
  }
  if (
    new Set(entry.target.actors).size !== entry.target.actors.length ||
    entry.target.actors.some((actor) => !ACTOR_NAMES.has(actor))
  ) {
    throw new Error(`E2E ${String(entry.id)} target has invalid actor`);
  }
  const expected =
    entry.target.environment === 'live'
      ? { layer: 'live', tier: 'live', project: 'live-chromium' }
      : { layer: 'local-proxy', tier: 'local-proxy', project: 'local-proxy-chromium' };
  if (entry.layer !== expected.layer || entry.tier !== expected.tier || entry.target.project !== expected.project) {
    throw new Error(`E2E ${String(entry.id)} environment target has invalid layer, tier, or project`);
  }
};

/** @param {Record<string, unknown>} entry */
const assertLegacyE2E = (entry) => {
  assertExactKeys(
    entry,
    ['kind', 'id', 'backfill', 'layer', 'tier', 'spec', 'title', 'target'],
    `E2E ${String(/** @type {string | undefined} */ (entry.id) ?? '')}`,
  );
  assertCommon(entry);
  if (!['mock', 'visual', 'live', 'local-proxy'].includes(entry.layer))
    throw new Error(`E2E ${String(entry.id)} has invalid layer`);
  if (!['mr', 'full', 'live', 'local-proxy'].includes(entry.tier))
    throw new Error(`E2E ${String(entry.id)} has invalid tier`);
  assertString(entry.spec, `E2E ${String(entry.id)} spec`);
  assertString(entry.title, `E2E ${String(entry.id)} full title`);
  if (!isRecord(entry.target)) throw new Error(`E2E ${String(entry.id)} target shape must be an object`);
  const hasWorldShape = Object.hasOwn(entry.target, 'world') || Object.hasOwn(entry.target, 'actor');
  const hasEnvironmentShape = Object.hasOwn(entry.target, 'environment') || Object.hasOwn(entry.target, 'actors');
  if (hasWorldShape === hasEnvironmentShape)
    throw new Error(`E2E ${String(entry.id)} target shape must be exactly world or environment`);
  if (hasWorldShape) assertWorldTarget(entry);
  else assertEnvironmentTarget(entry);
};

/**
 * @param {{
 *   id: unknown,
 *   backfill: unknown,
 *   suite: unknown,
 *   config: unknown,
 *   layer: unknown,
 *   tier: unknown,
 *   project: unknown,
 *   spec: unknown,
 *   title: unknown,
 *   target: Record<string, unknown> & { actors?: unknown[] },
 * }} entry
 * @param {SuiteRegistry} suiteRegistry
 */
const assertFederatedE2E = (entry, suiteRegistry) => {
  assertExactKeys(
    entry,
    ['kind', 'id', 'backfill', 'suite', 'config', 'layer', 'tier', 'project', 'spec', 'title', 'target'],
    `E2E ${String(/** @type {string | undefined} */ (entry.id) ?? '')}`,
  );
  assertCommon(entry);
  if (!SUITE_NAMES.has(entry.suite))
    throw new Error(`E2E ${String(entry.id)} has unknown suite: ${String(entry.suite)}`);
  if (!CONFIG_NAMES.has(entry.config))
    throw new Error(`E2E ${String(entry.id)} has unknown config: ${String(entry.config)}`);
  const definition = suiteRegistry[/** @type {string} */ (entry.suite)]?.configs?.[
    /** @type {string} */ (entry.config)
  ];
  if (definition === undefined) {
    throw new Error(
      `E2E ${String(entry.id)} has unknown config ${String(entry.config)} for suite ${String(entry.suite)}`,
    );
  }
  assertString(entry.project, `E2E ${String(entry.id)} project`);
  assertString(entry.spec, `E2E ${String(entry.id)} spec`);
  assertString(entry.title, `E2E ${String(entry.id)} full title`);
  if (!['mock', 'visual', 'live', 'local-proxy', 'controlled'].includes(entry.layer)) {
    throw new Error(`E2E ${String(entry.id)} has invalid layer`);
  }
  if (!Object.hasOwn(COVERAGE_TIER_TAGS, entry.tier)) throw new Error(`E2E ${String(entry.id)} has invalid tier`);
  if (!definition.targets.some(({ project, tier }) => project === entry.project && tier === entry.tier)) {
    throw new Error(
      `E2E ${String(entry.id)} registry target mismatch for ${entry.project}/${String(entry.tier)}`,
    );
  }
  if (!isRecord(entry.target)) throw new Error(`E2E ${String(entry.id)} target shape must be an object`);

  const isOverrideSpec =
    entry.spec.startsWith('tests/workUnitOverrides/') || entry.spec === 'tests/e2e/specs/corrections.spec.ts';
  const isPivotSpec = entry.spec.startsWith('tests/pivotTable/');
  if (entry.suite === 'worlds' && isOverrideSpec) {
    throw new Error(`E2E ${String(entry.id)} cross-suite override spec cannot use worlds`);
  }
  if (entry.suite === 'worlds' && isPivotSpec) {
    throw new Error(`E2E ${String(entry.id)} cross-suite pivot spec cannot use worlds`);
  }
  if (entry.suite === 'work-unit-overrides' && !isOverrideSpec) {
    throw new Error(`E2E ${String(entry.id)} cross-suite world spec cannot use controlled overrides`);
  }
  if (entry.suite === 'pivot' && !isPivotSpec) {
    throw new Error(`E2E ${String(entry.id)} cross-suite non-pivot spec cannot use controlled pivot`);
  }

  if (entry.suite === 'work-unit-overrides') {
    if (entry.config !== 'controlled' || entry.layer !== 'controlled') {
      throw new Error(`E2E ${String(entry.id)} override coverage must use controlled config and layer`);
    }
    assertExactKeys(entry.target, ['environment', 'actors'], `E2E ${String(entry.id)} controlled target shape`);
    if (entry.target.environment !== 'controlled') {
      throw new Error(`E2E ${String(entry.id)} controlled target has invalid environment`);
    }
  } else if (entry.suite === 'pivot') {
    if (entry.config !== 'controlled' || entry.layer !== 'controlled') {
      throw new Error(`E2E ${String(entry.id)} pivot coverage must use controlled config and layer`);
    }
    assertExactKeys(entry.target, ['environment', 'actors'], `E2E ${String(entry.id)} controlled target shape`);
    if (entry.target.environment !== 'controlled') {
      throw new Error(`E2E ${String(entry.id)} controlled target has invalid environment`);
    }
  } else if (entry.config === 'mock') {
    if (entry.layer !== 'mock' && entry.layer !== 'visual') {
      throw new Error(`E2E ${String(entry.id)} world mock target has invalid layer`);
    }
    assertExactKeys(entry.target, ['world', 'actor'], `E2E ${String(entry.id)} world target shape`);
    if (!WORLD_NAMES.has(entry.target.world)) throw new Error(`E2E ${String(entry.id)} target has invalid world`);
    if (!ACTOR_NAMES.has(entry.target.actor)) throw new Error(`E2E ${String(entry.id)} target has invalid actor`);
  } else {
    assertExactKeys(entry.target, ['environment', 'actors'], `E2E ${String(entry.id)} environment target shape`);
    const expectedEnvironment = entry.config === 'live' ? 'live' : 'local-proxy';
    if (entry.target.environment !== expectedEnvironment || entry.layer !== expectedEnvironment) {
      throw new Error(`E2E ${String(entry.id)} environment target has invalid config or layer`);
    }
  }

  if (Object.hasOwn(entry.target, 'actors')) {
    if (!Array.isArray(entry.target.actors) || entry.target.actors.length === 0) {
      throw new Error(`E2E ${String(entry.id)} target actors must be non-empty`);
    }
    if (
      new Set(entry.target.actors).size !== entry.target.actors.length ||
      entry.target.actors.some((actor) => !ACTOR_NAMES.has(actor))
    ) {
      throw new Error(`E2E ${String(entry.id)} target has invalid actor`);
    }
  }
};

/** @param {{ id: unknown, reason: unknown, command: unknown, evidence: GateEvidence }} entry */
const assertGate = (entry) => {
  assertExactKeys(
    entry,
    ['kind', 'id', 'backfill', 'reason', 'command', 'evidence'],
    `gate ${String(/** @type {string | undefined} */ (entry.id) ?? '')}`,
  );
  assertCommon(entry);
  assertString(entry.reason, `gate ${String(entry.id)} reason`);
  assertString(entry.command, `gate ${String(entry.id)} command`);
  if (!isRecord(entry.evidence)) throw new Error(`gate ${String(entry.id)} evidence must be an object`);
  if (entry.evidence.type === 'technical') {
    assertExactKeys(entry.evidence, ['type', 'repository', 'job'], `technical evidence for ${String(entry.id)}`);
    assertString(entry.evidence.repository, `technical evidence repository for ${String(entry.id)}`);
    assertString(entry.evidence.job, `technical evidence job for ${String(entry.id)}`);
    return;
  }
  if (entry.evidence.type === 'external') {
    if (entry.evidence.provider === 'gitlab') {
      assertExactKeys(
        entry.evidence,
        ['type', 'provider', 'projectId', 'shaEnv', 'job', 'artifact'],
        `external evidence for ${String(entry.id)}`,
      );
      for (const field of ['projectId', 'shaEnv', 'job', 'artifact']) {
        assertString(entry.evidence[field], `external evidence ${field} for ${String(entry.id)}`);
      }
      return;
    }
    if (entry.evidence.provider === 'github') {
      assertExactKeys(
        entry.evidence,
        [
          'type',
          'provider',
          'repository',
          'shaEnv',
          'workflow',
          'event',
          'branch',
          'job',
          'artifact',
          'file',
          'evidenceProvider',
          'providerEndpoint',
          'model',
          'configSha256',
          'inventorySha256',
          'expectedCases',
        ],
        `external evidence for ${String(entry.id)}`,
      );
      for (const field of [
        'repository',
        'shaEnv',
        'workflow',
        'event',
        'branch',
        'job',
        'artifact',
        'file',
        'evidenceProvider',
        'providerEndpoint',
        'model',
        'configSha256',
        'inventorySha256',
      ]) {
        assertString(entry.evidence[field], `external evidence ${field} for ${String(entry.id)}`);
      }
      if (!Number.isSafeInteger(entry.evidence.expectedCases) || entry.evidence.expectedCases < 1) {
        throw new Error(`external evidence expectedCases for ${String(entry.id)} must be a positive integer`);
      }
      return;
    }
    throw new Error(`external evidence for ${String(entry.id)} has invalid provider`);
  }
  throw new Error(`gate ${String(entry.id)} has invalid evidence type`);
};

/** @param {{ id: unknown, backfill: unknown, contracts: unknown[], command: unknown }} entry */
const assertInfrastructure = (entry) => {
  assertExactKeys(entry, ['kind', 'id', 'backfill', 'contracts', 'command'], 'infrastructure');
  if (entry.id !== 'CT-530' || entry.backfill !== false) {
    throw new Error('infrastructure must be non-backfill CT-530');
  }
  if (
    !Array.isArray(entry.contracts) ||
    entry.contracts.length === 0 ||
    entry.contracts.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    throw new Error('infrastructure contracts must be non-empty strings');
  }
  if (new Set(entry.contracts).size !== entry.contracts.length) {
    throw new Error('infrastructure contracts must be unique');
  }
  assertString(entry.command, 'infrastructure command');
};

/** @param {{ id: unknown, backfill: unknown, status: unknown, reason: unknown, command: unknown, requires: unknown[] }} entry */
const assertPendingInfrastructure = (entry) => {
  assertExactKeys(
    entry,
    ['kind', 'id', 'backfill', 'status', 'reason', 'command', 'requires'],
    `pending infrastructure ${String(/** @type {string | undefined} */ (entry.id) ?? '')}`,
  );
  if (entry.id !== 'CT-521' || entry.backfill !== false || entry.status !== 'blocked-unexecuted') {
    throw new Error('pending infrastructure must be the non-backfill unexecuted CT-521 gate');
  }
  assertString(entry.reason, 'pending infrastructure reason');
  if (!/disposable/i.test(entry.reason) || !/janitor/i.test(entry.reason)) {
    throw new Error('pending infrastructure reason must name the disposable stack and janitor blocker');
  }
  if (entry.command !== 'node .yarn/releases/yarn-4.18.0.cjs test:e2e:live:oauth-client') {
    throw new Error('pending infrastructure command must use the guarded CT-521 live target');
  }
  if (
    !Array.isArray(entry.requires) ||
    entry.requires.length !== 2 ||
    new Set(entry.requires).size !== 2 ||
    entry.requires.some((requirement) => typeof requirement !== 'string' || requirement.trim() === '')
  ) {
    throw new Error('pending infrastructure requirements must contain two distinct non-empty dependencies');
  }
};

/**
 * @param {CoverageEntry[]} coverageMap
 * @param {string[]} expectedBackfillIds
 */
const assertBackfills = (coverageMap, expectedBackfillIds) => {
  if (!Array.isArray(expectedBackfillIds) || expectedBackfillIds.length !== 24) {
    throw new Error('expected backfill IDs must contain exactly 24 values');
  }
  expectedBackfillIds.forEach((id) => assertString(id, 'expected backfill id'));
  if (new Set(expectedBackfillIds).size !== expectedBackfillIds.length) {
    throw new Error('expected backfill IDs must be unique');
  }
  const actual = coverageMap.filter(({ backfill }) => backfill).map(({ id }) => id);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expectedBackfillIds);
  if (
    actual.length !== 24 ||
    actualSet.size !== 24 ||
    actualSet.size !== expectedSet.size ||
    [...actualSet].some((id) => !expectedSet.has(id))
  ) {
    throw new Error('backfill coverage must equal the exact expected set of 24 unique IDs');
  }
};

/** @param {CoverageEntry[]} coverageMap */
const assertMultiSearchCoverage = (coverageMap) => {
  const entries = /** @type {Array<LegacyE2EEntry | FederatedE2EEntry>} */ (
    coverageMap.filter(({ id, backfill }) => id === 'CT-533' && backfill === false)
  );
  const cases = entries.map(({ title }) =>
    [...(title ?? '').matchAll(/@multi-search-[\w-]+/g)].map(([tag]) => tag.slice(1))
  );
  if (
    entries.length !== 4 ||
    entries.some(({ kind }) => kind !== 'e2e') ||
    cases.some((tags) => tags.length !== 1 || !Object.hasOwn(MULTI_SEARCH_CASES, tags[0])) ||
    new Set(cases.flat()).size !== 4
  ) {
    throw new Error('CT-533 must contain exactly four non-backfill E2E entries with four distinct required cases');
  }
  if (entries.some((entry, index) =>
    entry.tier !== MULTI_SEARCH_CASES[cases[index][0]] || entry.spec !== 'tests/e2e/specs/multi-search.spec.ts'
  )) {
    throw new Error('CT-533 multi-search cases must retain their required tier and spec');
  }
  if (
    entries.some((entry) => {
      const target = /** @type {Record<string, unknown>} */ (entry.target);
      return (
        !isRecord(target) ||
        target.world !== 'world-4' ||
        target.actor !== 'owner' ||
        (Object.hasOwn(target, 'project') && target.project !== 'mock-chromium')
      );
    })
  ) {
    throw new Error('CT-533 entries must target world-4 as owner in mock-chromium');
  }
  if (
    entries.some((entry) => {
      const record = /** @type {Record<string, unknown>} */ (entry);
      return Object.hasOwn(record, 'project') && record.project !== 'mock-chromium';
    })
  ) {
    throw new Error('CT-533 entries must target world-4 as owner in mock-chromium');
  }
};

/** @param {CoverageEntry[]} coverageMap */
const assertOAuthClientPendingBoundary = (coverageMap) => {
  const entries = coverageMap.filter(({ id, backfill }) => id === 'CT-521' && backfill === false);
  if (entries.length === 0) return;
  if (entries.filter(({ kind }) => kind === 'pending-infrastructure').length !== 1) {
    throw new Error('CT-521 must contain exactly one pending disposable-infrastructure gate');
  }
  if (
    entries.some((entry) => {
      const record = /** @type {Record<string, unknown>} */ (entry);
      return record.kind === 'e2e' && record.config === 'live';
    })
  ) {
    throw new Error('CT-521 must not claim live browser execution while disposable infrastructure is pending');
  }
};

/**
 * @param {CoverageEntry[]} coverageMap
 * @param {InventoryItem[]} inventory
 */
const assertInventoryMatches = (coverageMap, inventory) => {
  if (!Array.isArray(inventory) || inventory.length === 0) throw new Error('coverage inventory contains zero tests');
  for (const entry of /** @type {Array<LegacyE2EEntry | FederatedE2EEntry>} */ (
    coverageMap.filter(({ kind }) => kind === 'e2e')
  )) {
    const matches = inventory.filter(
      ({ projectName, spec, title }) =>
        projectName === entry.target.project && spec === entry.spec && title === entry.title,
    );
    if (matches.length === 0) throw new Error(`missing exact inventory match for ${entry.spec} :: ${entry.title}`);
    if (matches.length > 1) throw new Error(`ambiguous exact inventory match for ${entry.spec} :: ${entry.title}`);
    const [match] = matches;
    const primaryTags = Array.isArray(match.tags) ? match.tags.filter((tag) => PRIMARY_TAGS.has(tag)) : [];
    if (primaryTags.length !== 1) {
      throw new Error(`exact inventory match requires exactly one primary tag for ${entry.spec} :: ${entry.title}`);
    }
    if (!COVERAGE_TIER_TAGS[entry.tier].has(primaryTags[0])) {
      throw new Error(`inventory primary tag does not satisfy coverage tier ${entry.tier} for ${entry.title}`);
    }
    const visualTags = match.tags.filter((tag) => tag === 'visual');
    if (entry.layer === 'visual' && visualTags.length !== 1) {
      throw new Error(`visual coverage requires exactly one visual tag for ${entry.title}`);
    }
    if (entry.layer !== 'visual' && visualTags.length !== 0) {
      throw new Error(`non-visual coverage must not claim a visual tag for ${entry.title}`);
    }
  }
};

/**
 * @param {unknown} suiteRegistry
 * @returns {asserts suiteRegistry is SuiteRegistry}
 */
const assertExactSuiteRegistry = (suiteRegistry) => {
  if (!isRecord(suiteRegistry)) throw new Error('suite registry must be an object');
  if (JSON.stringify(suiteRegistry) !== JSON.stringify(EXPECTED_SUITE_REGISTRY)) {
    throw new Error('suite registry must equal the exact allowlisted configs, targets, tag policies, and CI jobs');
  }
};

/**
 * @param {unknown} suiteRegistry
 * @returns {SuiteRegistry}
 */
export const validateSuiteRegistry = (suiteRegistry) => {
  assertExactSuiteRegistry(suiteRegistry);
  return suiteRegistry;
};

/**
 * @param {OverrideBaselineTuple[]} baseline
 * @param {InventoryItem[]} controlledInventory
 */
const assertWorkUnitOverridesBaseline = (baseline, controlledInventory) => {
  if (!Array.isArray(baseline) || baseline.length !== 16) {
    throw new Error('work-unit override baseline must contain exactly 16 tuples');
  }
  const identities = new Set();
  for (const item of baseline) {
    assertExactKeys(item, ['project', 'spec', 'fullTitle'], 'work-unit override baseline tuple');
    assertString(item.project, 'work-unit override baseline project');
    assertString(item.spec, 'work-unit override baseline spec');
    assertString(item.fullTitle, 'work-unit override baseline fullTitle');
    const identity = `${item.project}\0${item.spec}\0${item.fullTitle}`;
    if (identities.has(identity)) throw new Error('work-unit override baseline identities must be unique');
    identities.add(identity);
    const matches = controlledInventory.filter(
      ({ projectName, spec, title }) => projectName === item.project && spec === item.spec && title === item.fullTitle,
    );
    if (matches.length === 0)
      throw new Error(`missing work-unit override baseline tuple: ${item.spec} :: ${item.fullTitle}`);
    if (matches.length > 1)
      throw new Error(`ambiguous work-unit override baseline tuple: ${item.spec} :: ${item.fullTitle}`);
  }
};

/**
 * @param {SuiteRegistry} suiteRegistry
 * @param {FederatedInventories} inventories
 */
const assertFederatedInventories = (suiteRegistry, inventories) => {
  assertExactKeys(inventories, ['worlds', 'work-unit-overrides', 'pivot', 'invitations'], 'federated inventories');
  assertExactKeys(inventories.worlds, ['mock', 'live', 'local-proxy'], 'worlds inventories');
  assertExactKeys(inventories['work-unit-overrides'], ['controlled'], 'work-unit override inventories');
  assertExactKeys(inventories.pivot, ['controlled'], 'pivot inventories');
  assertExactKeys(inventories.invitations, ['live'], 'invitation inventories');
  for (const [suite, suiteDefinition] of Object.entries(suiteRegistry)) {
    for (const [config, configDefinition] of Object.entries(suiteDefinition.configs)) {
      const inventory = inventories[suite][config];
      if (!Array.isArray(inventory) || inventory.length === 0) {
        throw new Error(`${suite}/${config} coverage inventory contains zero tests`);
      }
      /** @type {Map<string, Set<string>>} */
      const targetTiersByProject = new Map();
      for (const { project, tier } of configDefinition.targets) {
        const tiers = targetTiersByProject.get(project) ?? /** @type {Set<string>} */ (new Set());
        tiers.add(tier);
        targetTiersByProject.set(project, tiers);
      }
      for (const item of inventory) {
        assertExactKeys(item, ['projectName', 'spec', 'title', 'tags'], `${suite}/${config} inventory entry`);
        assertString(item.projectName, `${suite}/${config} inventory project`);
        assertString(item.spec, `${suite}/${config} inventory spec`);
        assertString(item.title, `${suite}/${config} inventory title`);
        const targetTiers = targetTiersByProject.get(item.projectName);
        if (targetTiers === undefined) {
          throw new Error(`${suite}/${config} inventory has registry target mismatch: ${item.projectName}`);
        }
        if (!Array.isArray(item.tags)) throw new Error(`${suite}/${config} inventory tags must be an array`);
        const isOverrideSpec =
          item.spec.startsWith('tests/workUnitOverrides/') || item.spec === 'tests/e2e/specs/corrections.spec.ts';
        const isPivotSpec = item.spec.startsWith('tests/pivotTable/');
        if (suite === 'worlds' && isOverrideSpec) {
          throw new Error(`cross-suite spec discovery in ${suite}/${config}: ${item.spec}`);
        }
        if (suite === 'work-unit-overrides' && !isOverrideSpec) {
          throw new Error(`cross-suite spec discovery in ${suite}/${config}: ${item.spec}`);
        }
        if (suite === 'worlds' && isPivotSpec) {
          throw new Error(`cross-suite spec discovery in ${suite}/${config}: ${item.spec}`);
        }
        if (suite === 'pivot' && !isPivotSpec) {
          throw new Error(`cross-suite spec discovery in ${suite}/${config}: ${item.spec}`);
        }
        const primaryTags = item.tags.filter((tag) => PRIMARY_TAGS.has(tag));
        if (configDefinition.tagPolicy === 'primary-tag' && primaryTags.length !== 1) {
          throw new Error(`${suite}/${config} inventory requires exactly one primary tag`);
        }
        if (
          configDefinition.tagPolicy === 'primary-tag' &&
          ![...targetTiers].some((tier) => COVERAGE_TIER_TAGS[tier].has(primaryTags[0]))
        ) {
          throw new Error(
            `${suite}/${config} inventory has registry target mismatch for project ${item.projectName}: primary tag ${primaryTags[0]} does not match a registry tier`,
          );
        }
        if (
          configDefinition.tagPolicy === 'config-owned' &&
          (!['work-unit-overrides', 'pivot'].includes(suite) || config !== 'controlled')
        ) {
          throw new Error('config-owned is allowed only for controlled domain suites');
        }
      }
    }
  }
};

/**
 * @param {CoverageEntry[]} coverageMap
 * @param {SuiteRegistry} suiteRegistry
 * @param {FederatedInventories} inventories
 */
const assertFederatedInventoryMatches = (coverageMap, suiteRegistry, inventories) => {
  for (const entry of /** @type {FederatedE2EEntry[]} */ (coverageMap.filter(({ kind }) => kind === 'e2e'))) {
    const definition = suiteRegistry[entry.suite].configs[entry.config];
    const matches = inventories[entry.suite][entry.config].filter(
      ({ projectName, spec, title }) => projectName === entry.project && spec === entry.spec && title === entry.title,
    );
    if (matches.length === 0) {
      throw new Error(
        `missing exact federated inventory match for ${entry.suite}/${entry.config} ${entry.spec} :: ${entry.title}`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `ambiguous exact federated inventory match for ${entry.suite}/${entry.config} ${entry.spec} :: ${entry.title}`,
      );
    }
    if (definition.tagPolicy === 'primary-tag') {
      const primaryTags = matches[0].tags.filter((tag) => PRIMARY_TAGS.has(tag));
      if (primaryTags.length !== 1) {
        throw new Error(`exact inventory match requires exactly one primary tag for ${entry.title}`);
      }
      if (!COVERAGE_TIER_TAGS[entry.tier].has(primaryTags[0])) {
        throw new Error(`inventory primary tag does not satisfy coverage tier ${entry.tier} for ${entry.title}`);
      }
      const visualTags = matches[0].tags.filter((tag) => tag === 'visual');
      if (entry.layer === 'visual' && visualTags.length !== 1) {
        throw new Error(`visual coverage requires exactly one visual tag for ${entry.title}`);
      }
      if (entry.layer !== 'visual' && visualTags.length !== 0) {
        throw new Error(`non-visual coverage must not claim a visual tag for ${entry.title}`);
      }
    }
  }
};

/**
 * @param {ValidateCoverageMapOptions} options
 * @returns {CoverageSummary}
 */
export const validateCoverageMap = ({
  coverageMap,
  expectedBackfillIds,
  inventory,
  suiteRegistry,
  workUnitOverridesBaseline,
  inventories,
}) => {
  if (!Array.isArray(coverageMap) || coverageMap.length === 0)
    throw new Error('coverage map must be a non-empty array');
  const federated = suiteRegistry !== undefined || workUnitOverridesBaseline !== undefined || inventories !== undefined;
  if (federated) {
    assertExactSuiteRegistry(suiteRegistry);
    assertFederatedInventories(suiteRegistry, inventories);
  }
  for (const entry of coverageMap) {
    if (!isRecord(entry)) throw new Error('coverage entry must be an object');
    if (entry.kind === 'e2e') {
      if (federated) assertFederatedE2E(entry, suiteRegistry);
      else assertLegacyE2E(entry);
    } else if (entry.kind === 'gate') assertGate(entry);
    else if (entry.kind === 'infrastructure') assertInfrastructure(entry);
    else if (entry.kind === 'pending-infrastructure') assertPendingInfrastructure(entry);
    else throw new Error(`coverage entry has invalid kind: ${String(entry.kind)}`);
  }

  const identities = new Set();
  for (const entry of /** @type {Array<LegacyE2EEntry | FederatedE2EEntry>} */ (
    coverageMap.filter(({ kind }) => kind === 'e2e')
  )) {
    const identity = `${entry.id}\0${entry.spec}\0${entry.title}`;
    if (identities.has(identity)) throw new Error(`duplicate coverage identity for ${entry.id}`);
    identities.add(identity);
  }
  assertBackfills(coverageMap, expectedBackfillIds);
  assertMultiSearchCoverage(coverageMap);
  assertOAuthClientPendingBoundary(coverageMap);
  if (federated) {
    assertWorkUnitOverridesBaseline(workUnitOverridesBaseline, inventories['work-unit-overrides'].controlled);
    assertFederatedInventoryMatches(coverageMap, suiteRegistry, inventories);
  } else {
    assertInventoryMatches(coverageMap, inventory);
  }

  return {
    entries: coverageMap.length,
    backfills: coverageMap.filter(({ backfill }) => backfill).length,
    browserEntries: coverageMap.filter(({ kind }) => kind === 'e2e').length,
    gates: coverageMap.filter(({ kind }) => kind === 'gate').length,
    infrastructure: coverageMap.filter(({ kind }) => kind === 'infrastructure').length,
    pendingInfrastructure: coverageMap.filter(({ kind }) => kind === 'pending-infrastructure').length,
  };
};
