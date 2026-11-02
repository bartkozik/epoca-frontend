import { expect, test } from '@playwright/test';
import { buildWorld } from '../../worlds';
import { IDS } from '../../worlds/ids';
import { createWorldRuntime } from '../../worlds/runtime';
import { createMockApiDispatcher, parseMockRequest } from '../mockApi';
import { reportHandlers } from './reportHandlers';

const EXPORT_URL = 'http://127.0.0.1:5173/__e2e_api/organizations/epoca-e2e/work-units/export?format=csv';
const UNKNOWN_UUID = '90000000-0000-4000-8000-000000000001';

const columnNames = {
  clientName: 'Client',
  createdAt: 'Created at',
  date: 'Date',
  description: 'Description',
  duration: 'Reported hours',
  entryType: 'Type',
  modifiedAt: 'Modified at',
  projectName: 'Project',
  taskId: 'Task ID',
  userFullName: 'User',
};

const pmColumnNames = {
  ...columnNames,
  pmClientName: 'PM Client',
  pmProjectName: 'PM Project',
  pmTaskId: 'PM Task ID',
};

interface ExportBodyFixture {
  ids: string[];
  projectIds: string[];
  userIds: string[];
  clientIds: string[];
  columnNames: Record<string, string>;
  includePmClassification?: boolean;
}

const validExportBody = (): ExportBodyFixture => ({
  ids: [IDS.worklogPrecise],
  projectIds: [],
  userIds: [],
  clientIds: [],
  columnNames: { ...columnNames },
});

const validPmExportBody = (): ExportBodyFixture => ({
  ...validExportBody(),
  columnNames: { ...pmColumnNames },
  includePmClassification: true,
});

test('report export accepts the exact effective ten-column selected-row payload @mr @technical', async () => {
  const runtime = createWorldRuntime(buildWorld('world-4'));
  const stateBeforeRequest = structuredClone(runtime.state);

  const response = await createMockApiDispatcher(runtime, reportHandlers).dispatch(
    parseMockRequest({ method: 'POST', url: EXPORT_URL, body: validExportBody() }),
  );

  expect(response.status).toBe(200);
  expect(runtime.state).toEqual(stateBeforeRequest);
});

test('report export rejects the retired parallel PM payload @mr @technical', async () => {
  const runtime = createWorldRuntime(buildWorld('world-4'));
  const stateBeforeRequest = structuredClone(runtime.state);

  const response = await createMockApiDispatcher(runtime, reportHandlers).dispatch(
    parseMockRequest({ method: 'POST', url: EXPORT_URL, body: validPmExportBody() }),
  );

  expect(response.status).toBe(400);
  expect(runtime.state).toEqual(stateBeforeRequest);
});

const invalidPmContractCases = [
  {
    name: 'PM columns without includePmClassification',
    mutate: (body: ExportBodyFixture) => {
      body.columnNames = { ...pmColumnNames };
    },
  },
  {
    name: 'includePmClassification true without PM columns',
    mutate: (body: ExportBodyFixture) => {
      body.includePmClassification = true;
    },
  },
  {
    name: 'includePmClassification true with an incomplete PM column set',
    mutate: (body: ExportBodyFixture) => {
      const { pmTaskId: _pmTaskId, ...incompletePmColumnNames } = pmColumnNames;
      body.columnNames = incompletePmColumnNames;
      body.includePmClassification = true;
    },
  },
  {
    name: 'includePmClassification false',
    mutate: (body: ExportBodyFixture) => {
      body.columnNames = { ...pmColumnNames };
      body.includePmClassification = false;
    },
  },
] as const;

for (const { name, mutate } of invalidPmContractCases) {
  test(`report export rejects ${name} without mutating runtime @mr @technical`, async () => {
    const runtime = createWorldRuntime(buildWorld('world-4'));
    const stateBeforeRequest = structuredClone(runtime.state);
    const body = validExportBody();
    mutate(body);

    const response = await createMockApiDispatcher(runtime, reportHandlers).dispatch(
      parseMockRequest({ method: 'POST', url: EXPORT_URL, body }),
    );

    expect(response.status).toBe(400);
    expect(runtime.state).toEqual(stateBeforeRequest);
  });
}

test('report export rejects unknown body keys without mutating runtime @mr @technical', async () => {
  const runtime = createWorldRuntime(buildWorld('world-4'));
  const stateBeforeRequest = structuredClone(runtime.state);
  const body = { ...validExportBody(), unexpected: true };

  const response = await createMockApiDispatcher(runtime, reportHandlers).dispatch(
    parseMockRequest({ method: 'POST', url: EXPORT_URL, body }),
  );

  expect(response.status).toBe(400);
  expect(runtime.state).toEqual(stateBeforeRequest);
});

test('report export rejects unknown effective column keys without mutating runtime @mr @technical', async () => {
  const runtime = createWorldRuntime(buildWorld('world-4'));
  const stateBeforeRequest = structuredClone(runtime.state);
  const body = validExportBody();
  body.columnNames.unexpected = 'Unexpected';

  const response = await createMockApiDispatcher(runtime, reportHandlers).dispatch(
    parseMockRequest({ method: 'POST', url: EXPORT_URL, body }),
  );

  expect(response.status).toBe(400);
  expect(runtime.state).toEqual(stateBeforeRequest);
});

const nonEmptySourceFilterCases = [
  { field: 'projectIds', value: IDS.projectAlpha },
  { field: 'userIds', value: IDS.user },
  { field: 'clientIds', value: IDS.clientInternal },
] as const satisfies ReadonlyArray<{
  field: 'projectIds' | 'userIds' | 'clientIds';
  value: string;
}>;

for (const { field, value } of nonEmptySourceFilterCases) {
  test(`report export rejects non-empty ${field} for a selected-row export without mutating runtime @mr @technical`, async () => {
    const runtime = createWorldRuntime(buildWorld('world-4'));
    const stateBeforeRequest = structuredClone(runtime.state);
    const body = validExportBody();
    body[field] = [value];

    const response = await createMockApiDispatcher(runtime, reportHandlers).dispatch(
      parseMockRequest({ method: 'POST', url: EXPORT_URL, body }),
    );

    expect(response.status).toBe(400);
    expect(runtime.state).toEqual(stateBeforeRequest);
  });
}

test('report export rejects a selected-row export without ids without mutating runtime @mr @technical', async () => {
  const runtime = createWorldRuntime(buildWorld('world-4'));
  const stateBeforeRequest = structuredClone(runtime.state);
  const body = validExportBody();
  body.ids = [];

  const response = await createMockApiDispatcher(runtime, reportHandlers).dispatch(
    parseMockRequest({ method: 'POST', url: EXPORT_URL, body }),
  );

  expect(response.status).toBe(400);
  expect(runtime.state).toEqual(stateBeforeRequest);
});

const invalidIdentifierCases = [
  { field: 'ids', kind: 'malformed', value: 'not-a-uuid' },
  { field: 'ids', kind: 'unknown', value: UNKNOWN_UUID },
  { field: 'projectIds', kind: 'malformed', value: 'not-a-uuid' },
  { field: 'projectIds', kind: 'unknown', value: UNKNOWN_UUID },
  { field: 'userIds', kind: 'malformed', value: 'not-a-uuid' },
  { field: 'userIds', kind: 'unknown', value: UNKNOWN_UUID },
  { field: 'clientIds', kind: 'malformed', value: 'not-a-uuid' },
  { field: 'clientIds', kind: 'unknown', value: UNKNOWN_UUID },
] as const satisfies ReadonlyArray<{
  field: 'ids' | 'projectIds' | 'userIds' | 'clientIds';
  kind: 'malformed' | 'unknown';
  value: string;
}>;

for (const { field, kind, value } of invalidIdentifierCases) {
  test(`report export rejects ${kind} ${field} without mutating runtime @mr @technical`, async () => {
    const runtime = createWorldRuntime(buildWorld('world-4'));
    const stateBeforeRequest = structuredClone(runtime.state);
    const body = validExportBody();
    body[field] = [value];

    const response = await createMockApiDispatcher(runtime, reportHandlers).dispatch(
      parseMockRequest({ method: 'POST', url: EXPORT_URL, body }),
    );

    expect(response.status).toBe(400);
    expect(runtime.state).toEqual(stateBeforeRequest);
  });
}

test('report export rejects comma-joined column name keys without mutating runtime @mr @technical', async () => {
  const runtime = createWorldRuntime(buildWorld('world-4'));
  const stateBeforeRequest = structuredClone(runtime.state);
  const body = validExportBody();
  const { clientName: _clientName, createdAt: _createdAt, ...remainingColumnNames } = body.columnNames;
  body.columnNames = { 'clientName,createdAt': 'Injected key', ...remainingColumnNames };

  const response = await createMockApiDispatcher(runtime, reportHandlers).dispatch(
    parseMockRequest({ method: 'POST', url: EXPORT_URL, body }),
  );

  expect(response.status).toBe(400);
  expect(runtime.state).toEqual(stateBeforeRequest);
});
