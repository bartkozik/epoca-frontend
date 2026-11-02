type WorldName = 'world-1' | 'world-2' | 'world-3' | 'world-4' | 'world-5';
type ActorName = 'anonymous' | 'owner' | 'manager' | 'pm' | 'user';

type E2ECoverage = {
  kind: 'e2e';
  id: string;
  backfill: boolean;
  layer: 'mock' | 'visual' | 'live' | 'local-proxy';
  tier: 'mr' | 'full' | 'live' | 'local-proxy';
  spec: string;
  title: string;
  target:
    | { world: WorldName; actor: ActorName; project: string }
    | { environment: 'live' | 'local-proxy'; actors: ActorName[]; project: string };
};

type GateCoverage = {
  kind: 'gate';
  id: string;
  backfill: boolean;
  reason: string;
  command: string;
  evidence:
    | { type: 'technical'; repository: string; job: string }
    | {
        type: 'external';
        provider: 'gitlab';
        projectId: string;
        shaEnv: string;
        job: string;
        artifact: string;
      }
    | {
        type: 'external';
        provider: 'github';
        repository: string;
        shaEnv: string;
        workflow: string;
        event: 'push';
        branch: string;
        job: string;
        artifact: string;
        file: string;
        evidenceProvider: string;
        providerEndpoint: string;
        model: string;
        configSha256: string;
        inventorySha256: string;
        expectedCases: number;
      };
};

type InfrastructureCoverage = {
  kind: 'infrastructure';
  id: 'CT-530';
  backfill: false;
  contracts: string[];
  command: string;
};

type Coverage = E2ECoverage | GateCoverage | InfrastructureCoverage;

export const expectedBackfillIds = [
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

export const coverageMap = [
  {
    kind: 'e2e',
    id: 'CT-415',
    backfill: true,
    layer: 'live',
    tier: 'live',
    spec: 'fixture/live.spec.ts',
    title: 'fixture CT-415 @live preserves precise exports',
    target: { environment: 'live', actors: ['owner'], project: 'live-chromium' },
  },
  {
    kind: 'gate',
    id: 'CT-429',
    backfill: true,
    reason: 'fixture PostgreSQL integration gate',
    command: 'fixture backend foreign-key contract',
    evidence: { type: 'technical', repository: 'epoca', job: 'test_backend' },
  },
  {
    kind: 'gate',
    id: 'CT-430',
    backfill: true,
    reason: 'fixture migration integration gate',
    command: 'fixture backend reconciliation contract',
    evidence: { type: 'technical', repository: 'epoca', job: 'test_backend' },
  },
  {
    kind: 'e2e',
    id: 'CT-437',
    backfill: true,
    layer: 'live',
    tier: 'live',
    spec: 'fixture/live.spec.ts',
    title: 'fixture CT-437 @live accepts a long report URI',
    target: { environment: 'live', actors: ['owner'], project: 'live-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-439',
    backfill: true,
    layer: 'mock',
    tier: 'mr',
    spec: 'fixture/reports.spec.ts',
    title: 'fixture CT-439 CT-440 CT-456 @mr shows archived history',
    target: { world: 'world-3', actor: 'owner', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-440',
    backfill: true,
    layer: 'mock',
    tier: 'mr',
    spec: 'fixture/reports.spec.ts',
    title: 'fixture CT-439 CT-440 CT-456 @mr shows archived history',
    target: { world: 'world-3', actor: 'owner', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-441',
    backfill: true,
    layer: 'mock',
    tier: 'mr',
    spec: 'fixture/people.spec.ts',
    title: 'fixture CT-441 @mr enforces organization roles',
    target: { world: 'world-2', actor: 'manager', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-450',
    backfill: true,
    layer: 'mock',
    tier: 'mr',
    spec: 'fixture/people.spec.ts',
    title: 'fixture CT-450 CT-501 @mr edits a project',
    target: { world: 'world-2', actor: 'owner', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-456',
    backfill: true,
    layer: 'mock',
    tier: 'mr',
    spec: 'fixture/reports.spec.ts',
    title: 'fixture CT-439 CT-440 CT-456 @mr shows archived history',
    target: { world: 'world-3', actor: 'owner', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-501',
    backfill: true,
    layer: 'mock',
    tier: 'mr',
    spec: 'fixture/people.spec.ts',
    title: 'fixture CT-450 CT-501 @mr edits a project',
    target: { world: 'world-2', actor: 'owner', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-506',
    backfill: true,
    layer: 'mock',
    tier: 'mr',
    spec: 'fixture/search.spec.ts',
    title: 'fixture CT-506 @mr keeps the final option reachable',
    target: { world: 'world-4', actor: 'owner', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-508',
    backfill: true,
    layer: 'mock',
    tier: 'mr',
    spec: 'fixture/notes.spec.ts',
    title: 'fixture CT-508 CT-509 @mr saves notes outside totals',
    target: { world: 'world-1', actor: 'owner', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-509',
    backfill: true,
    layer: 'mock',
    tier: 'mr',
    spec: 'fixture/notes.spec.ts',
    title: 'fixture CT-508 CT-509 @mr saves notes outside totals',
    target: { world: 'world-1', actor: 'owner', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-511',
    backfill: true,
    layer: 'live',
    tier: 'live',
    spec: 'fixture/live.spec.ts',
    title: 'fixture CT-511 @live reads archived fixture ownership',
    target: { environment: 'live', actors: ['owner'], project: 'live-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-512',
    backfill: true,
    layer: 'live',
    tier: 'live',
    spec: 'fixture/live.spec.ts',
    title: 'fixture CT-512 @live exercises accepted correction behavior',
    target: { environment: 'live', actors: ['owner', 'manager'], project: 'live-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-513',
    backfill: true,
    layer: 'mock',
    tier: 'mr',
    spec: 'fixture/work-units.spec.ts',
    title: 'fixture CT-513 @mr exposes Task ID details',
    target: { world: 'world-5', actor: 'user', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-514',
    backfill: true,
    layer: 'live',
    tier: 'live',
    spec: 'fixture/live.spec.ts',
    title: 'fixture CT-528 CT-514 @live replays one mutation',
    target: { environment: 'live', actors: ['owner'], project: 'live-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-515',
    backfill: true,
    layer: 'mock',
    tier: 'mr',
    spec: 'fixture/work-units.spec.ts',
    title: 'fixture CT-515 @mr never displays 07:60',
    target: { world: 'world-5', actor: 'user', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-516',
    backfill: true,
    layer: 'mock',
    tier: 'mr',
    spec: 'fixture/people.spec.ts',
    title: 'fixture CT-516 @mr preserves more than twenty people',
    target: { world: 'world-2', actor: 'owner', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-517',
    backfill: true,
    layer: 'mock',
    tier: 'mr',
    spec: 'fixture/reports.spec.ts',
    title: 'fixture CT-517 @mr synchronizes report navigation',
    target: { world: 'world-3', actor: 'owner', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-528',
    backfill: true,
    layer: 'live',
    tier: 'live',
    spec: 'fixture/live.spec.ts',
    title: 'fixture CT-528 CT-514 @live replays one mutation',
    target: { environment: 'live', actors: ['owner'], project: 'live-chromium' },
  },
  {
    kind: 'gate',
    id: 'CT-529',
    backfill: true,
    reason: 'fixture repository integration gate',
    command: 'fixture backend repository contract',
    evidence: { type: 'technical', repository: 'epoca', job: 'test_backend' },
  },
  {
    kind: 'e2e',
    id: 'local-staging-api-proxy',
    backfill: true,
    layer: 'local-proxy',
    tier: 'local-proxy',
    spec: 'fixture/local-proxy.spec.ts',
    title: 'fixture local-staging-api-proxy @local-proxy forwards same-origin requests',
    target: { environment: 'local-proxy', actors: ['user'], project: 'local-proxy-chromium' },
  },
  {
    kind: 'e2e',
    id: 'ct-513-info-icon-follow-up',
    backfill: true,
    layer: 'visual',
    tier: 'mr',
    spec: 'fixture/visual.spec.ts',
    title: 'fixture ct-513-info-icon-follow-up @mr @visual shares typography',
    target: { world: 'world-5', actor: 'user', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-533',
    backfill: false,
    layer: 'mock',
    tier: 'mr',
    spec: 'tests/e2e/specs/multi-search.spec.ts',
    title: '@mr @multi-search-sections dzieli zaznaczone i pozostałe opcje oraz filtruje obie sekcje',
    target: { world: 'world-4', actor: 'owner', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-533',
    backfill: false,
    layer: 'mock',
    tier: 'mr',
    spec: 'tests/e2e/specs/multi-search.spec.ts',
    title: '@mr @multi-search-transfer przenosi opcję między sekcjami bez utraty wyszukiwania',
    target: { world: 'world-4', actor: 'owner', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-533',
    backfill: false,
    layer: 'mock',
    tier: 'mr',
    spec: 'tests/e2e/specs/multi-search.spec.ts',
    title: '@mr @multi-search-keyboard zachowuje kolejność klawiatury i reset po ponownym otwarciu',
    target: { world: 'world-4', actor: 'owner', project: 'mock-chromium' },
  },
  {
    kind: 'e2e',
    id: 'CT-533',
    backfill: false,
    layer: 'mock',
    tier: 'full',
    spec: 'tests/e2e/specs/multi-search.spec.ts',
    title: '@full @multi-search-mobile zachowuje jeden scroll mobile locale i tryb kontekstowy',
    target: { world: 'world-4', actor: 'owner', project: 'mock-chromium' },
  },
  {
    kind: 'gate',
    id: 'CT-531',
    backfill: false,
    reason: 'fixture toolchain verification',
    command: 'fixture verify toolchain',
    evidence: { type: 'technical', repository: 'epoca-frontend', job: 'verify_docker_image' },
  },
  {
    kind: 'infrastructure',
    id: 'CT-530',
    backfill: false,
    contracts: ['coverage-map', 'tier-inventory', 'strict-mock-api'],
    command: 'node scripts/validate-e2e-tiers.mjs',
  },
  {
    kind: 'gate',
    id: 'CT-520',
    backfill: false,
    reason: 'fixture backend OAuth evidence',
    command: 'fixture oauth_e2e',
    evidence: {
      type: 'external',
      provider: 'gitlab',
      projectId: 'epoca/epoca',
      shaEnv: 'EPOCA_BACKEND_SHA',
      job: 'oauth_e2e',
      artifact: 'oauth-e2e-evidence.json',
    },
  },
] as const satisfies readonly Coverage[];
