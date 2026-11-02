import backendGetOverride from '../report/workUnitOverride/__fixtures__/backend-get-override.json';
import backendHistory from '../report/workUnitOverride/__fixtures__/backend-history.json';
import {
  CurrentWorkUnitOverrideHistoryEntrySchema,
  FutureOperationLegacyWorkUnitOverrideHistoryEntrySchema,
  LegacyWorkUnitOverrideHistoryEntrySchema,
  ReplaceWorkUnitOverrideRequestSchema,
  UndoWorkUnitOverrideRequestSchema,
  WorkUnitOverrideHistoryPageSchema,
  WorkUnitOverrideResponseSchema,
  WorkUnitTaskOverrideSchema,
} from './workUnitOverride.model';

const SOURCE_PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const EFFECTIVE_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_CLIENT_ID = '33333333-3333-4333-8333-333333333333';
const EFFECTIVE_CLIENT_ID = '44444444-4444-4444-8444-444444444444';
const WORK_UNIT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTOR_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- local fixture builder keeps literal field names.
const projectClient = (effective = false) => ({
  clientId: effective ? EFFECTIVE_CLIENT_ID : SOURCE_CLIENT_ID,
  clientColor: effective ? '#993366' : '#336699',
  clientTexture: '',
  clientName: effective ? 'Corrected client' : 'Source client',
  projectId: effective ? EFFECTIVE_PROJECT_ID : SOURCE_PROJECT_ID,
  projectName: effective ? 'Corrected project' : 'Source project',
  projectDescription: null,
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- local mutable fixture builder supports malformed cases.
const freshWorkUnitFixture = () => ({
  id: WORK_UNIT_ID,
  userId: USER_ID,
  userFullName: 'Employee Example',
  date: '2026-09-17',
  duration: 'PT1H',
  entryType: 'Worklog',
  description: 'Original employee description',
  taskId: 'SOURCE-17',
  state: 'Active',
  createdAt: '2026-09-17T08:00:00Z',
  modifiedAt: '2026-09-17T08:00:00Z',
  projectClient: projectClient(),
  effectiveProjectClient: projectClient(true),
  effectiveTaskId: null,
  revision: 8,
  override: {
    active: true,
    hasHistory: true,
    version: 3,
    projectId: EFFECTIVE_PROJECT_ID,
    taskId: { mode: 'Clear' },
    lastChangedBy: { id: ACTOR_ID, displayName: 'Manager Example' },
    lastChangedAt: '2026-09-17T09:00:00Z',
    permissions: {
      canEdit: true,
      canDelete: true,
      canViewHistory: true,
      allowedProjectIds: [SOURCE_PROJECT_ID, EFFECTIVE_PROJECT_ID],
    },
    undo: {
      candidateEventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      canUndo: true,
      reason: null,
    } as
      | {
          candidateEventId: string;
          canUndo: boolean;
          reason: null;
        }
      | null
      | undefined,
  },
});

describe('WorkUnitOverrideResponseSchema', () => {
  it('parses the serialized backend GET sample with authoritative undo metadata', () => {
    const parsed = WorkUnitOverrideResponseSchema.parse(backendGetOverride);

    expect(parsed.override.undo).toEqual({
      candidateEventId: '55555555-5555-4555-8555-555555555555',
      canUndo: true,
      reason: null,
    });
  });

  it.each([undefined, null])('accepts a legacy response with %s undo metadata as unavailable', (undo) => {
    const fixture = freshWorkUnitFixture();
    if (undo === undefined) delete fixture.override.undo;
    else fixture.override.undo = undo;

    expect(WorkUnitOverrideResponseSchema.parse(fixture).override.undo).toBe(undo);
  });

  it('parses the backend fixture without replacing explicit effective nulls with source values', () => {
    const parsed = WorkUnitOverrideResponseSchema.parse({ ...freshWorkUnitFixture(), futureField: 'ignored' });

    expect(parsed.projectClient?.projectId).toBe(SOURCE_PROJECT_ID);
    expect(parsed.effectiveProjectClient?.projectId).toBe(EFFECTIVE_PROJECT_ID);
    expect(parsed.taskId).toBe('SOURCE-17');
    expect(parsed.effectiveTaskId).toBeNull();
    expect(parsed).not.toHaveProperty('futureField');
  });

  it.each(['effectiveProjectClient', 'effectiveTaskId', 'revision', 'override'] as const)(
    'rejects a fresh correction response missing required %s instead of falling back',
    (field) => {
      const fixture = freshWorkUnitFixture();
      delete fixture[field];

      expect(WorkUnitOverrideResponseSchema.safeParse(fixture).success).toBe(false);
    },
  );

  it('accepts nullable task and author data from the DTO', () => {
    const parsed = WorkUnitOverrideResponseSchema.parse({
      ...freshWorkUnitFixture(),
      taskId: null,
      effectiveTaskId: null,
      userFullName: null,
    });

    expect(parsed.taskId).toBeNull();
    expect(parsed.effectiveTaskId).toBeNull();
    expect(parsed.userFullName).toBeNull();
  });

  it.each(['projectClient', 'effectiveProjectClient'] as const)('rejects a null %s', (field) => {
    expect(WorkUnitOverrideResponseSchema.safeParse({ ...freshWorkUnitFixture(), [field]: null }).success).toBe(false);
  });

  it('accepts denied permissions and does not infer capabilities from active state', () => {
    const fixture = freshWorkUnitFixture();
    fixture.override.permissions = {
      canEdit: false,
      canDelete: false,
      canViewHistory: false,
      allowedProjectIds: [],
    };

    expect(WorkUnitOverrideResponseSchema.parse(fixture).override.permissions).toEqual(fixture.override.permissions);
  });

  it.each([
    ['revision', Number.MAX_SAFE_INTEGER],
    ['override.version', Number.MAX_SAFE_INTEGER],
  ])('accepts a safe nonnegative integer for %s', (path, value) => {
    const fixture = freshWorkUnitFixture();
    if (path === 'revision') fixture.revision = value;
    else fixture.override.version = value;

    expect(WorkUnitOverrideResponseSchema.safeParse(fixture).success).toBe(true);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects an unsafe revision/version value: %s', (value) => {
    const fixture = freshWorkUnitFixture();
    fixture.revision = value;
    fixture.override.version = value;

    expect(WorkUnitOverrideResponseSchema.safeParse(fixture).success).toBe(false);
  });

  it.each(['canEdit', 'canDelete', 'canViewHistory', 'allowedProjectIds'] as const)(
    'fails closed when the critical permission %s is missing',
    (permission) => {
      const fixture = freshWorkUnitFixture();
      delete fixture.override.permissions[permission];

      expect(WorkUnitOverrideResponseSchema.safeParse(fixture).success).toBe(false);
    },
  );
});

describe('work-unit override task schemas', () => {
  it('accepts only a strict canonical undo target and a safe nonnegative expected revision', () => {
    expect(
      UndoWorkUnitOverrideRequestSchema.parse({
        expectedRevision: 0,
        targetEventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    ).toEqual({ expectedRevision: 0, targetEventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });

    for (const request of [
      { expectedRevision: -1, targetEventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      { expectedRevision: Number.MAX_SAFE_INTEGER + 1, targetEventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      { expectedRevision: 1, targetEventId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' },
      { expectedRevision: 1, targetEventId: 'not-a-uuid' },
      { expectedRevision: 1, targetEventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', extra: true },
    ]) {
      expect(UndoWorkUnitOverrideRequestSchema.safeParse(request).success).toBe(false);
    }
  });

  it.each([{ mode: 'Inherit' }, { mode: 'Clear' }, { mode: 'Set', value: ' TASK-17 ' }])(
    'parses all response task modes without trimming historical/current text: %o',
    (taskId) => {
      expect(WorkUnitTaskOverrideSchema.parse(taskId)).toEqual(taskId);
    },
  );

  it.each([
    { mode: 'Inherit', value: null },
    { mode: 'Inherit', value: 'forbidden' },
    { mode: 'Clear', value: null },
    { mode: 'Clear', value: 'forbidden' },
  ])('rejects value for a no-value task discriminator: %o', (taskId) => {
    expect(WorkUnitTaskOverrideSchema.safeParse(taskId).success).toBe(false);
  });

  it('trims a Set request and counts Unicode code points rather than UTF-16 code units', () => {
    expect(
      ReplaceWorkUnitOverrideRequestSchema.parse({
        expectedRevision: 7,
        projectId: null,
        taskId: { mode: 'Set', value: `  ${'😀'.repeat(255)}  ` },
      }),
    ).toEqual({
      expectedRevision: 7,
      projectId: null,
      taskId: { mode: 'Set', value: '😀'.repeat(255) },
    });
  });

  it.each([{ mode: 'Inherit' as const }, { mode: 'Clear' as const }])(
    'accepts a valid no-value %s request',
    (taskId) => {
      expect(ReplaceWorkUnitOverrideRequestSchema.parse({ expectedRevision: 7, projectId: null, taskId })).toEqual({
        expectedRevision: 7,
        projectId: null,
        taskId,
      });
    },
  );

  it.each([
    { mode: 'Set', value: '   ' },
    { mode: 'Set', value: '😀'.repeat(256) },
    { mode: 'Inherit', value: null },
    { mode: 'Clear', value: null },
  ])('rejects an invalid task request: %o', (taskId) => {
    expect(
      ReplaceWorkUnitOverrideRequestSchema.safeParse({ expectedRevision: 7, projectId: null, taskId }).success,
    ).toBe(false);
  });

  it('requires the complete exact PUT body', () => {
    expect(
      ReplaceWorkUnitOverrideRequestSchema.safeParse({ expectedRevision: 7, taskId: { mode: 'Inherit' } }).success,
    ).toBe(false);
    expect(
      ReplaceWorkUnitOverrideRequestSchema.safeParse({
        expectedRevision: 7,
        projectId: null,
        taskId: { mode: 'Inherit' },
        unexpected: true,
      }).success,
    ).toBe(false);
  });
});

describe('WorkUnitOverrideHistoryPageSchema', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- local fixture builder keeps literal field names.
  const historySnapshot = (taskId: string | null) => ({
    source: {
      projectClient: {
        projectId: SOURCE_PROJECT_ID,
        projectName: '  Source project at event time  ',
        clientId: SOURCE_CLIENT_ID,
        clientName: '  Source client at event time  ',
      },
      taskId: '  SOURCE-17  ',
    },
    effective: {
      projectClient: {
        projectId: EFFECTIVE_PROJECT_ID,
        projectName: '  Corrected project at event time  ',
        clientId: EFFECTIVE_CLIENT_ID,
        clientName: '  Corrected client at event time  ',
      },
      taskId,
    },
    projectId: EFFECTIVE_PROJECT_ID,
    taskIdOverrideSet: true,
    taskId: { mode: 'Clear' },
  });

  it('parses the serialized backend history sample including Undo and revertedBy', () => {
    const parsed = WorkUnitOverrideHistoryPageSchema.parse(backendHistory);

    expect(parsed.results[0]).toMatchObject({
      operation: 'Undo',
      revertsEventId: '55555555-5555-4555-8555-555555555555',
    });
    expect(parsed.results[1].revertedBy).toMatchObject({
      eventId: '66666666-6666-4666-8666-666666666666',
    });
  });

  it('parses new and legacy audit entries while preserving stored snapshot labels and task IDs', () => {
    const page = WorkUnitOverrideHistoryPageSchema.parse({
      count: 2,
      pageNumber: 1,
      pageSize: 25,
      upToVersion: 7,
      results: [
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          version: 7,
          operation: 'Replace',
          actor: { id: ACTOR_ID, displayName: '  Manager at event time  ' },
          changedAt: '2026-09-17T09:00:00Z',
          provenance: 'WorkUnitOverride',
          before: historySnapshot('  BEFORE-17  '),
          after: historySnapshot(null),
          legacyBefore: null,
          legacyAfter: null,
        },
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          version: 3,
          operation: 'Clear',
          actor: { id: ACTOR_ID, displayName: 'Legacy Manager' },
          changedAt: '2026-09-16T09:00:00.123Z',
          provenance: 'LegacyPmSnapshot',
          before: null,
          after: null,
          legacyBefore: {
            projectClient: {
              projectId: EFFECTIVE_PROJECT_ID,
              projectName: '  Historical project label  ',
              clientId: EFFECTIVE_CLIENT_ID,
              clientName: '  Historical client label  ',
            },
            taskId: '  LEGACY-1  ',
          },
          legacyAfter: { projectClient: null, taskId: null },
        },
      ],
    });

    expect(page.results).toMatchObject([
      {
        actor: { displayName: '  Manager at event time  ' },
        provenance: 'WorkUnitOverride',
        before: { source: { taskId: '  SOURCE-17  ' } },
      },
      {
        provenance: 'LegacyPmSnapshot',
        legacyBefore: { taskId: '  LEGACY-1  ' },
        legacyAfter: { projectClient: null },
      },
    ]);
  });

  it('preserves undo ancestry, target and bounded reversal metadata instead of stripping it', () => {
    const parentCorrectionId = 'abababab-abab-4bab-8bab-abababababab';
    const revertsEventId = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';
    const reversalEventId = 'efefefef-efef-4fef-8fef-efefefefefef';
    const parsed = WorkUnitOverrideHistoryPageSchema.parse({
      count: 1,
      pageNumber: 1,
      pageSize: 25,
      upToVersion: 9,
      results: [
        {
          id: revertsEventId,
          version: 8,
          operation: 'Replace',
          actor: { id: ACTOR_ID, displayName: 'Manager' },
          changedAt: '2026-09-17T09:00:00Z',
          provenance: 'WorkUnitOverride',
          before: historySnapshot('BEFORE'),
          after: historySnapshot('AFTER'),
          legacyBefore: null,
          legacyAfter: null,
          parentCorrectionId,
          revertsEventId: null,
          revertedBy: {
            eventId: reversalEventId,
            actor: { id: ACTOR_ID, displayName: 'Undo manager' },
            changedAt: '2026-09-17T10:00:00Z',
          },
        },
      ],
    });

    expect(parsed.results[0]).toMatchObject({ parentCorrectionId, revertsEventId: null });
    expect(parsed.results[0].revertedBy).toEqual({
      eventId: reversalEventId,
      actor: { id: ACTOR_ID, displayName: 'Undo manager' },
      changedAt: '2026-09-17T10:00:00Z',
    });
  });

  it('recognizes Undo only for current provenance and treats it as future for legacy provenance', () => {
    const current = WorkUnitOverrideHistoryPageSchema.parse({
      count: 1,
      pageNumber: 1,
      pageSize: 25,
      upToVersion: 8,
      results: [
        {
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          version: 8,
          operation: 'Undo',
          actor: { id: ACTOR_ID, displayName: 'Manager' },
          changedAt: '2026-09-17T10:00:00Z',
          provenance: 'WorkUnitOverride',
          before: historySnapshot('BEFORE'),
          after: historySnapshot('AFTER'),
          legacyBefore: null,
          legacyAfter: null,
          parentCorrectionId: null,
          revertsEventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          revertedBy: null,
        },
      ],
    });
    expect(current.results[0].operation).toBe('Undo');

    const legacyUndo = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      version: 3,
      operation: 'Undo',
      actor: { id: ACTOR_ID, displayName: 'Legacy Manager' },
      changedAt: '2026-09-16T09:00:00Z',
      provenance: 'LegacyPmSnapshot',
      before: null,
      after: null,
      legacyBefore: { projectClient: null, taskId: null },
      legacyAfter: { projectClient: null, taskId: null },
      parentCorrectionId: null,
      revertsEventId: null,
      revertedBy: null,
    };
    expect(LegacyWorkUnitOverrideHistoryEntrySchema.safeParse(legacyUndo).success).toBe(false);
    expect(FutureOperationLegacyWorkUnitOverrideHistoryEntrySchema.safeParse(legacyUndo).success).toBe(true);
    expect(WorkUnitOverrideHistoryPageSchema.safeParse({ ...current, results: [legacyUndo] }).success).toBe(true);
    expect(CurrentWorkUnitOverrideHistoryEntrySchema.safeParse(current.results[0]).success).toBe(true);
  });

  it.each(['Replace', 'FutureMerge'])(
    'rejects known provenance with %s operation when snapshots are malformed',
    (operation) => {
      expect(
        WorkUnitOverrideHistoryPageSchema.safeParse({
          count: 1,
          pageNumber: 1,
          pageSize: 25,
          upToVersion: 1,
          results: [
            {
              id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              version: 1,
              operation,
              actor: { id: ACTOR_ID, displayName: 'Manager' },
              changedAt: '2026-09-17T09:00:00Z',
              provenance: 'WorkUnitOverride',
              before: null,
              after: null,
              legacyBefore: null,
              legacyAfter: null,
            },
          ],
        }).success,
      ).toBe(false);
    },
  );

  it('preserves an additive operation for safe fallback without weakening known-provenance snapshots', () => {
    const parsed = WorkUnitOverrideHistoryPageSchema.parse({
      count: 1,
      pageNumber: 1,
      pageSize: 25,
      upToVersion: 8,
      results: [
        {
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          version: 8,
          operation: 'FutureMerge',
          actor: { id: ACTOR_ID, displayName: 'Manager' },
          changedAt: '2026-09-17T10:00:00Z',
          provenance: 'WorkUnitOverride',
          before: historySnapshot('BEFORE-17'),
          after: historySnapshot('AFTER-17'),
          legacyBefore: null,
          legacyAfter: null,
        },
      ],
    });

    expect(parsed.results[0].operation).toBe('FutureMerge');
  });

  it.each([
    { pageNumber: 0 },
    { pageSize: 0 },
    { pageSize: 101 },
    { upToVersion: -1 },
    { pageNumber: Number.MAX_SAFE_INTEGER, pageSize: 100 },
  ])('rejects an invalid pagination envelope: %o', (invalid) => {
    expect(
      WorkUnitOverrideHistoryPageSchema.safeParse({
        count: 0,
        pageNumber: 1,
        pageSize: 25,
        upToVersion: 7,
        results: [],
        ...invalid,
      }).success,
    ).toBe(false);
  });

  it('keeps an unknown future provenance as an opaque safe-fallback entry', () => {
    const parsed = WorkUnitOverrideHistoryPageSchema.parse({
      count: 1,
      pageNumber: 1,
      pageSize: 25,
      upToVersion: 8,
      results: [
        {
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          version: 8,
          operation: 'FutureMerge',
          actor: { id: ACTOR_ID, displayName: 'Manager' },
          changedAt: '2026-09-17T10:00:00Z',
          provenance: 'FutureMigration',
          before: { future: true },
          after: null,
          legacyBefore: null,
          legacyAfter: null,
        },
      ],
    });

    expect(parsed.results[0]).toMatchObject({ provenance: 'FutureMigration', operation: 'FutureMerge' });
  });
});
