import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test as base, expect, Page, Request, Route } from '@playwright/test';
import {
  ReplaceWorkUnitOverrideRequestSchema,
  UndoWorkUnitOverrideRequestSchema,
  WorkUnitOverrideHistoryPageSchema,
  WorkUnitOverrideResponseSchema,
  type WorkUnitOverrideHistoryEntry,
  type WorkUnitOverrideResponse,
  type WorkUnitTaskOverride,
} from './contract';

export type FixtureRole = 'Manager' | 'ProjectOwner' | 'Employee' | 'Owner' | 'Superadmin';
export type FixtureLanguage = 'en' | 'pl';
type FixtureAccess = 'full' | 'readOnly' | 'noHistory';
type ProjectClient = NonNullable<WorkUnitOverrideResponse['projectClient']>;
type OverrideSnapshot = NonNullable<WorkUnitOverrideHistoryEntry['before']>;
type FixtureClient = { color: string; id: string; name: string; texture: string; type: string };
type FixtureProject = {
  archivedAt: string;
  client: FixtureClient;
  createdAt: string;
  createdBy: string;
  description: string;
  id: string;
  modifiedAt: string;
  modifiedBy: string;
  name: string;
  organizationId: string;
  projectUsers: Record<string, unknown>[];
  userCount: number;
  userIds: string[];
};
type SourceValue = { description: string; duration: string; projectId: string; projectName: string; taskId: string };
type OverrideState = {
  active: boolean;
  projectId: string | null;
  taskId: WorkUnitTaskOverride;
  revision: number;
  version: number;
};
type RecordedRequest = { body: unknown; method: string; pathname: string; searchParams: URLSearchParams };

export type WorkUnitOverrideFixture = {
  buryUndoCandidateOnOlderPage: () => void;
  catalogProjects: Readonly<ProjectClient>[];
  exports: unknown[];
  historyRequests: RecordedRequest[];
  history: WorkUnitOverrideHistoryEntry[];
  makeNextPivotExportEmpty: () => void;
  makeNextWriteStale: () => void;
  makeNextWriteBySecondManager: () => void;
  makeNextUndoOutcome: (outcome: 'accepted' | 'not-recorded' | 'unknown') => void;
  holdNextCurrentRead: () => () => void;
  holdNextHistoryRead: () => () => void;
  pivotExports: RecordedRequest[];
  requests: RecordedRequest[];
  revokeAccess: () => void;
  state: OverrideState;
  source: SourceValue;
};

const uuid = (group: number, value: number): string =>
  `${String(group).padStart(8, '0')}-0000-4000-8000-${String(value).padStart(12, '0')}`;
export const ids = {
  organization: uuid(10, 1),
  alternateOrganization: uuid(10, 2),
  actor: uuid(20, 1),
  author: uuid(20, 2),
  secondManager: uuid(20, 3),
  unit: uuid(30, 1),
  outsideUnit: uuid(30, 2),
  sourceProject: uuid(40, 1),
  targetProject: uuid(40, 2),
  alternateProject: uuid(40, 3),
  alternateClientProject: uuid(40, 4),
  outsideProject: uuid(40, 5),
  outsideTarget: uuid(40, 6),
  sourceClient: uuid(50, 1),
  targetClient: uuid(50, 2),
  alternateClient: uuid(50, 3),
};
export const reportUrl = '/report?startDate=2026-07-28&endDate=2026-07-31';
const organizationSlug = 'overrides-e2e';
const pivotUserId = '11111111-1111-4111-8111-111111111111';
const pivotProjectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const pivotClientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const pivotExportCsv = readFileSync(join(__dirname, '../../pivotTable/fixtures/pivot-export.csv'));
const pivotExportXlsx = readFileSync(join(__dirname, '../../pivotTable/fixtures/pivot-export.xlsx'));
const actorId = ids.actor;
const otherUserId = ids.author;
const initialSource = Object.freeze({
  description: 'Immutable source description with a deliberately long suffix '.repeat(4).trim(),
  duration: 'PT7H30M',
  projectId: ids.sourceProject,
  projectName: 'Source Project With A Deliberately Long Name For Responsive Coverage',
  taskId: 'SOURCE-17',
});
const clients = {
  alternate: { color: '#00875a', id: ids.alternateClient, name: 'Alternate Client', texture: '', type: 'External' },
  target: { color: '#6554c0', id: ids.targetClient, name: 'Corrected Client', texture: '', type: 'External' },
  source: { color: '#0052cc', id: ids.sourceClient, name: 'Source Client', texture: '', type: 'External' },
};
function rawUser(id: string, firstName: string, lastName: string, roles: string[]): Record<string, unknown> {
  return {
    archived: false,
    firstName,
    id,
    lastName,
    organizationRoles: roles,
    identities: [
      {
        deviceId: null,
        id: uuid(60, id === actorId ? 1 : 2),
        main: true,
        type: 'MailAddress',
        value: `${id}@example.test`,
      },
    ],
  };
}
function rawProjectUser(id: string, role: 'Member' | 'Owner'): Record<string, unknown> {
  return {
    archived: false,
    archivedAt: '',
    avatar: '',
    color: '',
    createdAt: '2026-01-01T00:00:00Z',
    firstName: id === actorId ? 'Alex' : 'Other',
    fullName: id === actorId ? 'Alex Manager' : 'Other Owner',
    id,
    identities: [],
    isLoggedInUser: id === actorId,
    isSuperAdmin: false,
    lastName: 'Manager',
    modifiedAt: '2026-01-01T00:00:00Z',
    role,
  };
}
function project(id: string, name: string, client: FixtureClient, ownerId = actorId): FixtureProject {
  return {
    archivedAt: '',
    client,
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: ownerId,
    description: `${name} description`,
    id,
    modifiedAt: '2026-01-01T00:00:00Z',
    modifiedBy: ownerId,
    name,
    organizationId: ids.organization,
    projectUsers: [rawProjectUser(ownerId, 'Owner')],
    userCount: 1,
    userIds: [ownerId],
  };
}
const sourceProject = project(ids.sourceProject, initialSource.projectName, clients.source);
const targetProject = project(
  ids.targetProject,
  'Corrected Project With A Deliberately Long Name For Responsive Coverage',
  clients.target,
);
const alternateProject = project(ids.alternateProject, 'Alternate Project', clients.target);
const alternateClientProject = project(ids.alternateClientProject, 'Alternate Client Project', clients.alternate);
const overflowProjects = Array.from({ length: 20 }, (_, index) =>
  project(uuid(40, index + 10), `Overflow Project ${String(index + 1).padStart(2, '0')}`, clients.target),
);
const outsideProject = project(ids.outsideProject, 'Outside Owner Scope', clients.source, ids.secondManager);
const outsideTarget = project(ids.outsideTarget, 'Outside Scope Corrected Project', clients.target, ids.secondManager);
const projectCatalog = [
  sourceProject,
  targetProject,
  alternateProject,
  alternateClientProject,
  ...overflowProjects,
  outsideProject,
  outsideTarget,
];
const allowedProjectIds = projectCatalog.filter(({ userIds }) => userIds.includes(actorId)).map(({ id }) => id);
function projectClient(raw: FixtureProject): ProjectClient {
  return {
    clientId: raw.client.id,
    clientName: raw.client.name,
    clientColor: raw.client.color,
    clientTexture: '',
    projectId: raw.id,
    projectName: raw.name,
    projectDescription: raw.description,
  };
}
function authenticationRole(role: FixtureRole): string {
  return role === 'Manager' ? 'Manager' : role === 'Owner' ? 'Owner' : 'Employee';
}
function fakeAccessToken(role: FixtureRole): string {
  const auth = {
    authedBy: [],
    exp: Math.floor(Date.now() / 1000) + 3600,
    id: actorId,
    identities: [
      { deviceId: null, id: uuid(60, 1), main: true, type: 'MailAddress', value: 'alex.manager@example.test' },
    ],
    isSuperAdmin: role === 'Superadmin',
    roles: [{ organizationId: ids.organization, roles: [authenticationRole(role)] }],
  };
  return `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify(auth)).toString('base64url')}.fixture`;
}
function problem(
  type: string,
  status: number,
  title: string,
  extension?: Record<string, unknown>,
): Record<string, unknown> {
  return { status, title, type, instance: 'cid:controlled-work-unit-overrides', ...(extension ? { extension } : {}) };
}
async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: status >= 400 ? 'application/problem+json' : 'application/json',
    status,
  });
}
function readJson(request: Request): unknown {
  try {
    return request.postDataJSON();
  } catch {
    return request.postData();
  }
}
type PivotKey =
  'UserKey' | 'ProjectKey' | 'ClientKey' | 'YearKey' | 'MonthYearKey' | 'DateKey' | 'EntryTypeKey' | 'TaskKey';
type PivotValue = 'DurationSum' | 'DurationAvg' | 'EntriesCount';
type PivotFilterValue = string | number | null;
type PivotCoordinate = {
  kind: 'GrandTotal' | 'Leaf' | 'Subtotal';
  path: Array<{ key: PivotKey; value: PivotFilterValue }>;
};
type PivotRequest = {
  rows: PivotKey[];
  columns: PivotKey[];
  values: PivotValue[];
  filters: Array<{ key: PivotKey; includedValues: PivotFilterValue[] | null }>;
  options: { rowSubtotals: boolean; columnSubtotals: boolean; grandTotals: boolean };
};

type PivotExportEnvelope = {
  presentation: {
    memberLabels: Array<{ key: PivotKey; label: string; value: PivotFilterValue }>;
  };
  projection: { effectiveDateTo: string };
  query: PivotRequest;
};

const pivotValueFor = (key: PivotKey, index = 0): PivotFilterValue => {
  if (key === 'UserKey') {
    return index === 0 ? pivotUserId : `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`;
  }
  if (key === 'ProjectKey') {
    return index === 0 ? pivotProjectId : `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`;
  }
  if (key === 'ClientKey') {
    return index === 0 ? pivotClientId : `cccccccc-cccc-4ccc-8ccc-${String(index + 1).padStart(12, '0')}`;
  }
  if (key === 'YearKey') return 2020 + index;
  if (key === 'MonthYearKey') {
    const month = (index % 12) + 1;
    return `${2025 + Math.floor(index / 12)}-${String(month).padStart(2, '0')}`;
  }
  if (key === 'DateKey') return `2026-08-${String(index + 1).padStart(2, '0')}`;
  if (key === 'TaskKey') return `PROJ-${index + 1}`;
  return index % 2 === 0 ? 'Worklog' : 'Note';
};

const completeMonthAxisFixture = ['2026-05', '2026-06', '2026-07', '2026-08'] as const;

const pivotResponse = (request: PivotRequest, searchParams: URLSearchParams): Record<string, unknown> => {
  const usesCompleteMonthAxisFixture =
    request.columns.length === 1 &&
    request.columns[0] === 'MonthYearKey' &&
    searchParams.get('dateFrom') === '2026-02-01' &&
    searchParams.get('dateTo') === '2026-08-20';
  const coordinate = (keys: PivotKey[], index: number): PivotCoordinate => ({
    kind: 'Leaf',
    path: keys.map((key) => ({ key, value: pivotValueFor(key, index) })),
  });
  const coordinateCount = (keys: PivotKey[], populatedCount: number): number => {
    if (keys.length === 0) return 1;
    if (keys.length === 1 && keys[0] === 'EntryTypeKey') return 2;
    return populatedCount;
  };
  const leafRowCoordinates = Array.from({ length: coordinateCount(request.rows, 18) }, (_, index) =>
    coordinate(request.rows, index),
  );
  const rowCoordinates: PivotCoordinate[] = [...leafRowCoordinates];
  if (request.options.rowSubtotals && request.rows.length > 1 && leafRowCoordinates[0]) {
    rowCoordinates.push({ kind: 'Subtotal', path: leafRowCoordinates[0].path.slice(0, -1) });
  }
  if (request.options.grandTotals && request.rows.length > 0) rowCoordinates.push({ kind: 'GrandTotal', path: [] });
  const leafColumnCoordinates = usesCompleteMonthAxisFixture
    ? completeMonthAxisFixture.map<PivotCoordinate>((month) => ({
        kind: 'Leaf',
        path: [{ key: 'MonthYearKey', value: month }],
      }))
    : Array.from({ length: coordinateCount(request.columns, 3) }, (_, index) => coordinate(request.columns, index));
  const columnCoordinates: PivotCoordinate[] = [...leafColumnCoordinates];
  if (request.options.grandTotals && request.columns.length > 0) {
    columnCoordinates.push({ kind: 'GrandTotal', path: [] });
  }
  const metricValues = request.values.reduce<Record<string, unknown>>((values, value) => {
    if (value === 'DurationSum') values.durationSum = 'PT2H';
    if (value === 'DurationAvg') values.durationAvg = 'PT2H';
    if (value === 'EntriesCount') values.entriesCount = 1;
    return values;
  }, {});

  return {
    cells: rowCoordinates.flatMap((row) => columnCoordinates.map((column) => ({ column, row, values: metricValues }))),
    filterMembers: request.filters.map(({ includedValues, key }) => {
      const defaultValue = pivotValueFor(key);
      const selectedValues = includedValues ?? [defaultValue];
      const domainValues = key === 'EntryTypeKey' ? ['Worklog', 'Note'] : [defaultValue];
      const members = Array.from(
        new Map([...selectedValues, ...domainValues].map((value) => [JSON.stringify(value), value])).values(),
      );
      return { key, members: members.map((value) => ({ available: true, value })) };
    }),
    result: {
      cellCount: rowCoordinates.length * columnCoordinates.length,
      displayValueCellCount: rowCoordinates.length * columnCoordinates.length * request.values.length,
      maxDisplayValueCellCount: 9_600,
    },
  };
};

const calendarMonths = (dateFrom: string, effectiveDateTo: string): string[] => {
  const [startYear, startMonth] = dateFrom.split('-').map(Number);
  const [endYear, endMonth] = effectiveDateTo.split('-').map(Number);
  const start = startYear * 12 + startMonth - 1;
  const end = endYear * 12 + endMonth - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) {
    throw new Error(`Invalid controlled pivot export projection ${dateFrom}..${effectiveDateTo}`);
  }
  return Array.from({ length: end - start + 1 }, (_, offset) => {
    const monthIndex = start + offset;
    return `${Math.floor(monthIndex / 12)}-${String((monthIndex % 12) + 1).padStart(2, '0')}`;
  });
};

const validatePivotExportEnvelope = (
  body: unknown,
  searchParams: URLSearchParams,
  selectedLanguage: FixtureLanguage,
): PivotExportEnvelope => {
  const envelope = body as Partial<PivotExportEnvelope>;
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  if (!dateFrom || !dateTo || envelope.projection?.effectiveDateTo !== dateTo) {
    throw new Error('Controlled pivot export must project through the accepted closed-range dateTo');
  }
  if (!envelope.query || !envelope.presentation || !Array.isArray(envelope.presentation.memberLabels)) {
    throw new Error('Controlled pivot export envelope is incomplete');
  }

  if (envelope.query.columns.length === 1 && envelope.query.columns[0] === 'MonthYearKey') {
    const formatter = new Intl.DateTimeFormat(selectedLanguage, {
      month: 'long',
      timeZone: 'UTC',
      year: 'numeric',
    });
    const labels = new Map(
      envelope.presentation.memberLabels
        .filter(({ key }) => key === 'MonthYearKey')
        .map(({ label, value }) => [String(value), label]),
    );
    calendarMonths(dateFrom, envelope.projection.effectiveDateTo).forEach((month) => {
      const [year, monthNumber] = month.split('-').map(Number);
      const expected = formatter.format(new Date(Date.UTC(year, monthNumber - 1, 1)));
      if (labels.get(month) !== expected) {
        throw new Error(`Controlled pivot export is missing localized synthesized label ${month}=${expected}`);
      }
    });
  }

  return envelope as PivotExportEnvelope;
};

async function installControlledApi(
  page: Page,
  role: FixtureRole,
  selectedLanguage: FixtureLanguage,
  access: FixtureAccess,
  _historyDepth: number,
): Promise<WorkUnitOverrideFixture> {
  const source: SourceValue = { ...initialSource };
  const state: OverrideState = {
    active: _historyDepth > 0,
    projectId: _historyDepth > 0 ? ids.targetProject : null,
    taskId:
      _historyDepth > 0
        ? { mode: 'Set', value: _historyDepth === 30 ? 'CORRECTED-OLD' : `CORRECTED-${_historyDepth}` }
        : { mode: 'Inherit' },
    revision: 40,
    version: _historyDepth,
  };
  const requests: RecordedRequest[] = [];
  const exports: unknown[] = [];
  const historyRequests: RecordedRequest[] = [];
  const pivotExports: RecordedRequest[] = [];
  const unhandled: string[] = [];
  let nextWriteIsStale = false;
  let nextWriteActor: { id: string; displayName: string } | undefined;
  let nextUndoOutcome: 'accepted' | 'not-recorded' | 'unknown' | undefined;
  let nextHistoryFails = false;
  let nextPivotExportIsEmpty = false;
  let revoked = false;
  let worklogDeleted = false;
  let pendingCurrent: Promise<void> | undefined;
  let pendingHistory: Promise<void> | undefined;
  const sourceClient = (): ProjectClient =>
    projectClient(projectCatalog.find(({ id }) => id === source.projectId) ?? sourceProject);
  const effectiveProjectFor = (projectId: string | null): ProjectClient =>
    projectClient(
      projectCatalog.find(({ id }) => id === projectId) ??
        projectCatalog.find(({ id }) => id === source.projectId) ??
        sourceProject,
    );
  const effectiveProject = (): ProjectClient => effectiveProjectFor(state.projectId);
  const effectiveTaskFor = (taskId: WorkUnitTaskOverride): string | null =>
    taskId.mode === 'Set' ? taskId.value : taskId.mode === 'Clear' ? null : source.taskId;
  const effectiveTask = (): string | null => effectiveTaskFor(state.taskId);
  const canAccess = (): boolean => role !== 'Employee' && !revoked;
  const permissions = (): WorkUnitOverrideResponse['override']['permissions'] => ({
    allowedProjectIds: canAccess() && access !== 'readOnly' ? allowedProjectIds : [],
    canEdit: canAccess() && access !== 'readOnly',
    canDelete: canAccess() && access !== 'readOnly',
    canViewHistory: canAccess() && access !== 'noHistory',
  });
  const historyProject = ({
    projectId,
    projectName,
    clientId,
    clientName,
  }: ProjectClient): OverrideSnapshot['source']['projectClient'] => ({
    projectId,
    projectName,
    clientId,
    clientName,
  });
  const snapshotFor = ({ projectId, taskId }: Pick<OverrideState, 'projectId' | 'taskId'>): OverrideSnapshot => ({
    source: { projectClient: historyProject(sourceClient()), taskId: source.taskId },
    effective: {
      projectClient: historyProject(effectiveProjectFor(projectId)),
      taskId: effectiveTaskFor(taskId),
    },
    projectId,
    taskIdOverrideSet: taskId.mode !== 'Inherit',
    taskId: { ...taskId },
  });
  const snapshot = (): OverrideSnapshot => snapshotFor(state);
  const historicalTask = (version: number): WorkUnitTaskOverride =>
    version === 0
      ? { mode: 'Inherit' }
      : { mode: 'Set', value: version === 30 ? 'CORRECTED-OLD' : `CORRECTED-${version}` };
  const history: WorkUnitOverrideHistoryEntry[] = Array.from({ length: _historyDepth }, (_, index) => {
    const version = index + 1;
    return {
      id: uuid(70, version),
      actor: {
        id: version % 2 ? ids.secondManager : actorId,
        displayName: version % 2 ? 'Morgan Second Manager' : 'Alex Manager',
      },
      before: snapshotFor({
        projectId: version === 1 ? null : ids.targetProject,
        taskId: historicalTask(version - 1),
      }),
      after: snapshotFor({ projectId: ids.targetProject, taskId: historicalTask(version) }),
      changedAt: `2026-07-${String(version).padStart(2, '0')}T12:00:00Z`,
      operation: 'Replace',
      version,
      provenance: 'WorkUnitOverride',
      parentCorrectionId: version === 1 ? null : uuid(70, version - 1),
      revertsEventId: null,
      revertedBy: null,
      legacyBefore: null,
      legacyAfter: null,
    };
  });
  history.reverse();
  const candidateId = (): string | null => {
    const latest = history[0];
    if (!latest || latest.version !== state.version || latest.provenance !== 'WorkUnitOverride') return null;
    if (latest.operation === 'Replace' || latest.operation === 'Clear') return latest.id;
    return latest.operation === 'Undo' ? (latest.parentCorrectionId ?? null) : null;
  };
  const undoMetadata = (): NonNullable<WorkUnitOverrideResponse['override']['undo']> => {
    const candidateEventId = candidateId();
    if (!candidateEventId) return { candidateEventId: null, canUndo: false, reason: 'NoCorrection' };
    if (!permissions().canEdit) return { candidateEventId, canUndo: false, reason: 'Forbidden' };
    return { candidateEventId, canUndo: true, reason: null };
  };
  const dto = (): WorkUnitOverrideResponse =>
    WorkUnitOverrideResponseSchema.parse({
      createdAt: '2026-07-28T08:00:00Z',
      date: '2026-07-28',
      description: source.description,
      duration: source.duration,
      entryType: 'Worklog',
      id: ids.unit,
      modifiedAt: '2026-07-28T08:00:00Z',
      projectClient: sourceClient(),
      effectiveProjectClient: effectiveProject(),
      effectiveTaskId: effectiveTask(),
      revision: state.revision,
      state: 'Active',
      taskId: source.taskId,
      userId: role === 'Employee' ? actorId : otherUserId,
      userFullName: role === 'Employee' ? 'Alex Manager' : 'Taylor Author',
      override: {
        active: state.active,
        projectId: state.projectId,
        taskId: state.taskId,
        version: state.version,
        hasHistory: history.length > 0,
        lastChangedAt: history[0]?.changedAt ?? null,
        lastChangedBy: history[0]?.actor ?? null,
        permissions: permissions(),
        undo: undoMetadata(),
      },
    });
  const appendEvent = (
    before: ReturnType<typeof snapshot>,
    operation: 'Replace' | 'Clear' | 'Undo',
    actor = { id: actorId, displayName: 'Alex Manager' },
    links: { parentCorrectionId?: string | null; revertsEventId?: string | null } = {},
  ): void => {
    const parentCorrectionId = links.parentCorrectionId === undefined ? candidateId() : links.parentCorrectionId;
    state.revision += 1;
    state.version += 1;
    state.active = state.projectId !== null || state.taskId.mode !== 'Inherit';
    history.unshift({
      id: uuid(70, state.version),
      version: state.version,
      actor,
      operation,
      changedAt: new Date(Date.UTC(2026, 6, 31, 12, state.version)).toISOString(),
      provenance: 'WorkUnitOverride',
      before,
      after: snapshot(),
      parentCorrectionId,
      revertsEventId: links.revertsEventId ?? null,
      revertedBy: null,
      legacyBefore: null,
      legacyAfter: null,
    });
  };
  const applyUndo = (actor = { id: actorId, displayName: 'Alex Manager' }): boolean => {
    const targetId = candidateId();
    const target = history.find(({ id }) => id === targetId);
    if (
      !target ||
      target.provenance !== 'WorkUnitOverride' ||
      (target.operation !== 'Replace' && target.operation !== 'Clear')
    )
      return false;
    const before = snapshot();
    state.projectId = target.before.projectId;
    state.taskId = { ...target.before.taskId };
    appendEvent(before, 'Undo', actor, {
      parentCorrectionId: target.parentCorrectionId,
      revertsEventId: target.id,
    });
    return true;
  };
  const deny = async (route: Route): Promise<void> =>
    json(route, problem('result:work-unit-override:forbidden', 403, 'Override access forbidden'), 403);
  await page.addInitScript(
    ({ language, orgId, orgSlug }) => {
      const hostname = window.location.hostname;
      window.localStorage.setItem(`IteratorsEpoca__org__slug_${hostname}`, orgSlug);
      window.localStorage.setItem(`IteratorsEpoca__org__id_${hostname}`, orgId);
      window.localStorage.setItem(`IteratorsEpoca__user__lang_${hostname}`, language);
    },
    { language: selectedLanguage, orgId: ids.organization, orgSlug: organizationSlug },
  );

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      // Never allow external fonts, analytics, auth or API calls to escape the fixture.
      await route.abort('blockedbyclient');
      return;
    }
    if (!url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }
    const pathname = url.pathname.replace(/^\/api/, '');
    const method = request.method();
    const recorded: RecordedRequest = {
      body: readJson(request),
      method,
      pathname,
      searchParams: new URLSearchParams(url.search),
    };
    requests.push(recorded);
    if (method === 'POST' && pathname === '/auth/login') {
      await json(route, { accessToken: fakeAccessToken(role), refreshToken: 'fixture-refresh-token' });
      return;
    }
    if (method === 'POST' && pathname === '/auth/refresh-token') {
      await json(route, { accessToken: fakeAccessToken(role), refreshToken: 'fixture-refresh-token' });
      return;
    }
    if (method === 'DELETE' && pathname.startsWith('/auth/refresh-tokens/')) {
      await route.fulfill({ body: '', status: 204 });
      return;
    }
    if (method === 'GET' && pathname === '/organizations/iterators/saml/authn') {
      await json(route, problem('controlled-fixture:sso-disabled', 404, 'SSO disabled'), 404);
      return;
    }
    if (method === 'GET' && pathname === '/organizations') {
      await json(route, {
        count: 2,
        results: [
          {
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00Z',
            createdBy: rawUser(actorId, 'Alex', 'Manager', [authenticationRole(role)]),
            id: ids.organization,
            modifiedAt: '2026-01-01T00:00:00Z',
            modifiedBy: rawUser(actorId, 'Alex', 'Manager', [authenticationRole(role)]),
            name: 'Overrides E2E',
            slug: organizationSlug,
          },
          {
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00Z',
            createdBy: rawUser(actorId, 'Alex', 'Manager', [authenticationRole(role)]),
            id: ids.alternateOrganization,
            modifiedAt: '2026-01-01T00:00:00Z',
            modifiedBy: rawUser(actorId, 'Alex', 'Manager', [authenticationRole(role)]),
            name: 'Other Workspace',
            slug: 'other-workspace',
          },
        ],
      });
      return;
    }
    if (method === 'GET' && pathname === `/organizations/${organizationSlug}`) {
      await json(route, {
        archivedAt: null,
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: rawUser(actorId, 'Alex', 'Manager', [authenticationRole(role)]),
        id: ids.organization,
        modifiedAt: '2026-01-01T00:00:00Z',
        modifiedBy: rawUser(actorId, 'Alex', 'Manager', [authenticationRole(role)]),
        name: 'Overrides E2E',
        slug: organizationSlug,
      });
      return;
    }
    if (method === 'GET' && pathname === `/organizations/${organizationSlug}/users`) {
      await json(route, [
        rawUser(actorId, 'Alex', 'Manager', [authenticationRole(role)]),
        rawUser(otherUserId, 'Taylor', 'Author', ['Employee']),
      ]);
      return;
    }
    if (method === 'GET' && pathname === `/organizations/${organizationSlug}/users/${actorId}/details`) {
      const assignments =
        role === 'Employee'
          ? []
          : projectCatalog
              .filter(({ projectUsers }) =>
                projectUsers.some((projectUser) => projectUser.id === actorId && projectUser.role === 'Owner'),
              )
              .map(({ client, id, name }) => ({
                clientId: client.id,
                clientName: client.name,
                projectId: id,
                projectName: name,
                role: 'Owner',
              }));
      await json(route, assignments);
      return;
    }
    if (method === 'GET' && pathname === `/users/${actorId}`) {
      await json(route, {
        archivedAt: '',
        avatar: '',
        color: '',
        createdAt: '2026-01-01T00:00:00Z',
        firstName: 'Alex',
        id: actorId,
        identities: [
          {
            confirmationCode: null,
            confirmed: true,
            createdAt: '2026-01-01T00:00:00Z',
            id: uuid(60, 1),
            main: true,
            type: 'MailAddress',
            userId: actorId,
            value: `${actorId}@example.test`,
          },
        ],
        isSuperAdmin: false,
        lastName: 'Manager',
        modifiedAt: '2026-01-01T00:00:00Z',
      });
      return;
    }
    if (method === 'GET' && pathname === `/organizations/${organizationSlug}/clients`) {
      await json(route, {
        count: Object.keys(clients).length,
        results: Object.values(clients).map((client) => ({
          ...client,
          archivedAt: '',
          createdAt: '2026-01-01T00:00:00Z',
          createdBy: actorId,
          createdByDetails: rawUser(actorId, 'Alex', 'Manager', [authenticationRole(role)]),
          logo: '',
          modifiedAt: '2026-01-01T00:00:00Z',
          modifiedBy: actorId,
          modifiedByDetails: rawUser(actorId, 'Alex', 'Manager', [authenticationRole(role)]),
          organizationId: ids.organization,
          projectCount: 2,
        })),
      });
      return;
    }
    if (method === 'GET' && pathname === `/organizations/${organizationSlug}/projects`) {
      const visibleProjects = projectCatalog.map((item) =>
        role === 'Employee'
          ? { ...item, projectUsers: [rawProjectUser(ids.secondManager, 'Owner')], userIds: [ids.secondManager] }
          : item,
      );
      await json(route, {
        count: projectCatalog.length,
        results: visibleProjects,
      });
      return;
    }
    if (method === 'POST' && pathname === `/organizations/${organizationSlug}/pivot-tables/work-units/query`) {
      await json(route, pivotResponse(recorded.body as PivotRequest, recorded.searchParams));
      return;
    }
    if (method === 'POST' && pathname === `/organizations/${organizationSlug}/pivot-tables/work-units/export`) {
      pivotExports.push(recorded);
      validatePivotExportEnvelope(recorded.body, recorded.searchParams, selectedLanguage);
      if (nextPivotExportIsEmpty) {
        nextPivotExportIsEmpty = false;
        await route.fulfill({ body: '', status: 204 });
        return;
      }
      const format = url.searchParams.get('format');
      const xlsx = format === 'xlsx';
      const dateFrom = url.searchParams.get('dateFrom');
      const dateTo = url.searchParams.get('dateTo');
      await route.fulfill({
        body: xlsx ? pivotExportXlsx : pivotExportCsv,
        headers: {
          'Content-Disposition': `attachment; filename="pivot_table_${dateFrom}_${dateTo}.${xlsx ? 'xlsx' : 'csv'}"`,
          'Content-Type': xlsx
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv; charset=utf-8',
        },
        status: 200,
      });
      return;
    }

    if (method === 'GET' && pathname === `/organizations/${organizationSlug}/work-units`) {
      expect(
        [...url.searchParams.keys()].filter((key) => /^(includePmClassification|pmProjectId|pmClientId)$/.test(key)),
      ).toEqual([]);
      const current = dto();
      const results: WorkUnitOverrideResponse[] = worklogDeleted ? [] : [current];
      if (role === 'ProjectOwner')
        results.push({
          ...current,
          id: ids.outsideUnit,
          description: 'Outside scope source description',
          duration: 'PT1H',
          projectClient: projectClient(outsideProject),
          taskId: 'OUTSIDE-1',
          effectiveProjectClient: projectClient(outsideTarget),
          effectiveTaskId: 'OUTSIDE-CORRECTED',
          override: {
            ...current.override,
            permissions: { allowedProjectIds: [], canEdit: false, canDelete: false, canViewHistory: false },
          },
        });
      const selected = (key: string, candidate: string | undefined): boolean =>
        !url.searchParams.has(key) || url.searchParams.getAll(key).includes(candidate ?? '');
      const filtered = results.filter(
        (unit) =>
          selected('projectId', unit.effectiveProjectClient?.projectId) &&
          selected('clientId', unit.effectiveProjectClient?.clientId) &&
          selected('userId', unit.userId) &&
          (!url.searchParams.has('dateFrom') || unit.date >= url.searchParams.get('dateFrom')!) &&
          (!url.searchParams.has('dateTo') || unit.date <= url.searchParams.get('dateTo')!),
      );
      await json(route, {
        draftIds: [],
        orders: [{ date: current.date, ids: filtered.map(({ id }) => id) }],
        workUnits: { count: filtered.length, results: filtered },
      });
      return;
    }
    const unitPath = `/organizations/${organizationSlug}/work-units/${ids.unit}`;
    const overridePath = `${unitPath}/override`;
    if (pathname === `${overridePath}/undo` && method === 'POST') {
      if (!canAccess() || !permissions().canEdit) {
        await deny(route);
        return;
      }
      const parsed = UndoWorkUnitOverrideRequestSchema.safeParse(recorded.body);
      if (!parsed.success) {
        await json(
          route,
          problem('result:work-unit-override:invalid-request', 400, 'Invalid override request', {
            field: 'targetEventId',
          }),
          400,
        );
        return;
      }
      if (nextWriteIsStale) {
        nextWriteIsStale = false;
        const before = snapshot();
        state.taskId = { mode: 'Set', value: 'SERVER-WON' };
        appendEvent(before, 'Replace', { id: ids.secondManager, displayName: 'Morgan Second Manager' });
      }
      if (parsed.data.expectedRevision !== state.revision) {
        await json(
          route,
          problem('result:work-unit-override:stale-revision', 409, 'Work unit revision is stale', {
            currentRevision: state.revision,
          }),
          409,
        );
        return;
      }
      const currentCandidateId = candidateId();
      if (parsed.data.targetEventId !== currentCandidateId) {
        await json(
          route,
          problem('result:work-unit-override:stale-undo-target', 409, 'Undo target is stale', {
            currentRevision: state.revision,
          }),
          409,
        );
        return;
      }
      const controlledOutcome = nextUndoOutcome;
      nextUndoOutcome = undefined;
      if (controlledOutcome === 'not-recorded' || controlledOutcome === 'unknown') {
        nextHistoryFails = controlledOutcome === 'unknown';
        await route.abort('connectionfailed');
        return;
      }
      if (!applyUndo()) {
        await json(
          route,
          problem('result:work-unit-override:stale-undo-target', 409, 'Undo target is stale', {
            currentRevision: state.revision,
          }),
          409,
        );
        return;
      }
      if (controlledOutcome === 'accepted') {
        await route.abort('connectionfailed');
        return;
      }
      await json(route, dto());
      return;
    }
    if (pathname === overridePath && ['GET', 'PUT', 'DELETE'].includes(method)) {
      if (method === 'GET' && pendingCurrent) await pendingCurrent;
      if (!canAccess()) {
        await deny(route);
        return;
      }
      if (method === 'GET') {
        await json(route, dto());
        return;
      }
      const parsed = method === 'PUT' ? ReplaceWorkUnitOverrideRequestSchema.safeParse(recorded.body) : null;
      if (method === 'PUT' && !parsed?.success) {
        await json(
          route,
          problem('result:work-unit-override:invalid-request', 400, 'Invalid override request', { field: 'taskId' }),
          400,
        );
        return;
      }
      const expectedRevision = parsed?.success
        ? parsed.data.expectedRevision
        : Number(url.searchParams.get('expectedRevision'));
      if (method === 'DELETE') {
        expect([...url.searchParams.keys()]).toEqual(['expectedRevision']);
        expect(recorded.body).toBeNull();
      }
      if (nextWriteIsStale) {
        nextWriteIsStale = false;
        const before = snapshot();
        state.taskId = { mode: 'Set', value: 'SERVER-WON' };
        appendEvent(before, 'Replace', { id: ids.secondManager, displayName: 'Morgan Second Manager' });
      }
      if (expectedRevision !== state.revision) {
        await json(
          route,
          problem('result:work-unit-override:stale-revision', 409, 'Work unit revision is stale', {
            currentRevision: state.revision,
          }),
          409,
        );
        return;
      }
      if (!permissions().canEdit) {
        await deny(route);
        return;
      }
      if (parsed?.success && parsed.data.projectId && !allowedProjectIds.includes(parsed.data.projectId)) {
        await json(
          route,
          problem('result:work-unit-override:project-unavailable', 400, 'Project is unavailable', {
            field: 'projectId',
          }),
          400,
        );
        return;
      }
      const before = snapshot();
      const projectId = parsed?.success ? parsed.data.projectId : null;
      let taskId: WorkUnitTaskOverride = parsed?.success ? parsed.data.taskId : { mode: 'Inherit' };
      if ((taskId.mode === 'Set' && taskId.value === source.taskId) || (taskId.mode === 'Clear' && !source.taskId))
        taskId = { mode: 'Inherit' };
      const normalizedProject = projectId === source.projectId ? null : projectId;
      if (state.projectId !== normalizedProject || JSON.stringify(state.taskId) !== JSON.stringify(taskId)) {
        state.projectId = normalizedProject;
        state.taskId = taskId;
        appendEvent(before, method === 'DELETE' ? 'Clear' : 'Replace', nextWriteActor);
        nextWriteActor = undefined;
      }
      await json(route, dto());
      return;
    }
    if (method === 'GET' && pathname === `${unitPath}/override-history`) {
      historyRequests.push(recorded);
      if (pendingHistory) await pendingHistory;
      if (nextHistoryFails) {
        nextHistoryFails = false;
        await json(route, problem('controlled-fixture:unknown-history', 503, 'History unavailable'), 503);
        return;
      }
      if (!permissions().canViewHistory) {
        await deny(route);
        return;
      }
      expect([...url.searchParams.keys()].sort()).toEqual(['pageNumber', 'pageSize', 'upToVersion']);
      const upToVersion = Number(url.searchParams.get('upToVersion'));
      const pageNumber = Number(url.searchParams.get('pageNumber'));
      const pageSize = Number(url.searchParams.get('pageSize'));
      expect(upToVersion).toBeLessThanOrEqual(state.version);
      expect(pageSize).toBe(25);
      const frozen = history.filter(({ version }) => version <= upToVersion);
      const reversals = new Map(
        frozen
          .filter(
            (entry): entry is WorkUnitOverrideHistoryEntry & { revertsEventId: string } =>
              entry.provenance === 'WorkUnitOverride' && entry.operation === 'Undo' && entry.revertsEventId !== null,
          )
          .map((entry) => [entry.revertsEventId, entry]),
      );
      const rendered = frozen.map((entry) => {
        const reversal = reversals.get(entry.id);
        return {
          ...entry,
          revertedBy: reversal ? { eventId: reversal.id, actor: reversal.actor, changedAt: reversal.changedAt } : null,
        };
      });
      const start = (pageNumber - 1) * pageSize;
      await json(
        route,
        WorkUnitOverrideHistoryPageSchema.parse({
          count: rendered.length,
          pageNumber,
          pageSize,
          upToVersion,
          results: rendered.slice(start, start + pageSize),
        }),
      );
      return;
    }
    if (method === 'DELETE' && pathname === unitPath) {
      if (!['Owner', 'Superadmin'].includes(role)) {
        await deny(route);
        return;
      }
      worklogDeleted = true;
      await route.fulfill({ body: '', status: 204 });
      return;
    }
    if (method === 'PATCH' && pathname === unitPath) {
      if (!['Employee', 'Owner', 'Superadmin'].includes(role)) {
        await deny(route);
        return;
      }
      const body = recorded.body as { description: string; duration: string; taskId: string; projectId: string };
      expect(request.headers()['idempotency-key']).toBeTruthy();
      expect(body.projectId).toBe(source.projectId);
      expect(body.taskId).toBe(source.taskId);
      source.description = body.description;
      source.duration = body.duration;
      state.revision += 1;
      const result = dto();
      result.override.permissions = { allowedProjectIds: [], canEdit: false, canDelete: false, canViewHistory: false };
      await json(route, result);
      return;
    }
    if (method === 'POST' && pathname === `/organizations/${organizationSlug}/work-units/export`) {
      const body = recorded.body as {
        ids: string[];
        columnNames: Record<string, string>;
        clientIds: string[];
        projectIds: string[];
        userIds: string[];
      };
      expect(Object.keys(body).sort()).toEqual(['clientIds', 'columnNames', 'ids', 'projectIds', 'userIds']);
      expect(Object.keys(body.columnNames).sort()).toEqual([
        'clientName',
        'createdAt',
        'date',
        'description',
        'duration',
        'entryType',
        'modifiedAt',
        'projectName',
        'taskId',
        'userFullName',
      ]);
      expect(body.ids).toEqual([ids.unit]);
      expect([body.clientIds, body.projectIds, body.userIds]).toEqual([[], [], []]);
      expect(url.searchParams.get('format')).toBe('csv');
      exports.push(body);
      const current = dto();
      const values: Record<string, string | null> = {
        clientName: current.effectiveProjectClient?.clientName ?? null,
        projectName: current.effectiveProjectClient?.projectName ?? null,
        taskId: current.effectiveTaskId,
        date: current.date,
        createdAt: current.createdAt,
        modifiedAt: current.modifiedAt,
        description: current.description,
        duration: '7.5',
        entryType: current.entryType,
        userFullName: current.userFullName,
      };
      const quote = (value: string | null): string => `"${(value ?? '').replaceAll('"', '""')}"`;
      const columns = Object.keys(body.columnNames);
      await route.fulfill({
        body: [
          columns.map((key) => quote(body.columnNames[key])).join(','),
          columns.map((key) => quote(values[key])).join(','),
        ].join('\n'),
        contentType: 'text/csv',
        status: 200,
      });
      return;
    }
    if (method === 'POST' && pathname === '/metrics/frontend/error') {
      await route.fulfill({ body: '', status: 204 });
      return;
    }
    const failure = `${method} ${pathname}${url.search}`;
    unhandled.push(failure);
    await json(route, problem('controlled-fixture:unhandled-route', 599, failure), 599);
  });
  const fixture: WorkUnitOverrideFixture = {
    buryUndoCandidateOnOlderPage: () => {
      for (let index = 0; index < 13; index += 1) {
        if (!applyUndo()) throw new Error('Controlled fixture ran out of undo candidates');
      }
    },
    catalogProjects: projectCatalog.map(projectClient),
    exports,
    historyRequests,
    history,
    requests,
    pivotExports,
    source,
    state,
    makeNextPivotExportEmpty: () => {
      nextPivotExportIsEmpty = true;
    },
    makeNextWriteStale: () => {
      nextWriteIsStale = true;
    },
    makeNextWriteBySecondManager: () => {
      nextWriteActor = { id: ids.secondManager, displayName: 'Morgan Second Manager' };
    },
    makeNextUndoOutcome: (outcome) => {
      nextUndoOutcome = outcome;
    },
    holdNextCurrentRead: () => {
      let resolvePending = (): void => {};
      pendingCurrent = new Promise<void>((resolve) => {
        resolvePending = resolve;
      });
      return () => {
        pendingCurrent = undefined;
        resolvePending();
      };
    },
    holdNextHistoryRead: () => {
      let resolvePending = (): void => {};
      pendingHistory = new Promise<void>((resolve) => {
        resolvePending = resolve;
      });
      return () => {
        pendingHistory = undefined;
        resolvePending();
      };
    },
    revokeAccess: () => {
      revoked = true;
    },
  };
  Object.defineProperty(fixture, '__verifyRoutes', {
    enumerable: false,
    value: () => expect(unhandled, 'Every API request must have an explicit controlled fixture route').toEqual([]),
  });
  return fixture;
}
type OverrideFixtures = {
  language: FixtureLanguage;
  overrideApi: WorkUnitOverrideFixture;
  role: FixtureRole;
  access: FixtureAccess;
  historyDepth: number;
};
export const test = base.extend<OverrideFixtures>({
  language: ['en', { option: true }],
  role: ['Manager', { option: true }],
  access: ['full', { option: true }],
  historyDepth: [30, { option: true }],
  overrideApi: async ({ language, page, role, access, historyDepth }, provideFixture) => {
    const fixture = await installControlledApi(page, role, language, access, historyDepth);
    await page.goto('/login');
    await page.getByTestId('loginEmailInput').fill(`${role.toLowerCase()}@example.test`);
    await page.getByTestId('loginPasswordInput').fill('Manager1!');
    await page.getByTestId('loginButton').click();
    await page.waitForURL('**/working-time');
    try {
      await provideFixture(fixture);
    } finally {
      (fixture as WorkUnitOverrideFixture & { __verifyRoutes: () => void }).__verifyRoutes();
    }
  },
});
export { expect };
