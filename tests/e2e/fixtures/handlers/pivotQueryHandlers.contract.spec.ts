import { computeFilterFacets, FILTER_FACETS_REQUEST, toFacetCells } from '@/modules/reports/filterPanel/filterFacets';
import { parsePivotResponse } from '@/modules/reports/models/pivotTableQuery.model';
import { expect, test } from '@playwright/test';
import { buildWorld, type ActorName, type WorldName } from '../../worlds';
import { IDS } from '../../worlds/ids';
import { createWorldRuntime, type WorldRuntime } from '../../worlds/runtime';
import { createMockApiDispatcher, MockRequestMismatchError, parseMockRequest } from '../mockApi';
import { pivotQueryHandlers, REPORT_FILTER_FACETS_REQUEST } from './pivotQueryHandlers';
import type { MockResponse } from './types';

const PIVOT_QUERY_URL = 'http://127.0.0.1:5173/__e2e_api/organizations/epoca-e2e/pivot-tables/work-units/query';
const JULY = '?dateFrom=2026-07-01&dateTo=2026-07-31';

interface FacetCellFixture {
  clientId: string;
  projectId: string;
  userId: string;
  durationSum: string;
}

const runtimeFor = (world: WorldName, actor: ActorName = 'owner'): WorldRuntime => {
  const runtime = createWorldRuntime(buildWorld(world));
  runtime.setActor(actor);
  return runtime;
};

const queryFacets = (
  runtime: WorldRuntime,
  query = JULY,
  body: unknown = FILTER_FACETS_REQUEST,
): Promise<MockResponse> =>
  createMockApiDispatcher(runtime, pivotQueryHandlers).dispatch(
    parseMockRequest({ method: 'POST', url: `${PIVOT_QUERY_URL}${query}`, body }),
  );

const facetCells = (json: unknown): FacetCellFixture[] =>
  parsePivotResponse(json, FILTER_FACETS_REQUEST).cells.map(({ row, values }) => {
    const [client, project, user] = row.path;
    return {
      clientId: String(client.value),
      projectId: String(project.value),
      userId: String(user.value),
      durationSum: `${values.durationSum?.seconds ?? -1}s`,
    };
  });

test('report filter facets accept exactly the request the report filters send @mr @technical', () => {
  expect(REPORT_FILTER_FACETS_REQUEST).toEqual(FILTER_FACETS_REQUEST);
});

test('report filter facets sum active worklog hours per client, project and user in the period @mr @technical', async () => {
  const runtime = runtimeFor('world-4');
  const stateBeforeRequest = structuredClone(runtime.state);

  const response = await queryFacets(runtime);

  expect(response.status).toBe(200);
  expect(response.json).toMatchObject({
    filterMembers: [],
    result: { cellCount: 2, displayValueCellCount: 2, maxDisplayValueCellCount: 9_600 },
  });
  expect(facetCells(response.json)).toEqual([
    { clientId: IDS.clientInternal, projectId: IDS.projectAlpha, userId: IDS.user, durationSum: '28776s' },
    {
      clientId: IDS.clientArchived,
      projectId: IDS.projectArchived,
      userId: IDS.archivedUser,
      durationSum: '1800s',
    },
  ]);
  const facets = computeFilterFacets(toFacetCells(parsePivotResponse(response.json, FILTER_FACETS_REQUEST).cells), {
    clientIds: [],
    projectIds: [IDS.projectAlpha],
    userIds: [],
  });
  expect(Object.fromEntries(facets.users)).toEqual({ [IDS.user]: 28_776 });
  expect(Object.fromEntries(facets.projects)).toEqual({ [IDS.projectAlpha]: 28_776, [IDS.projectArchived]: 1_800 });
  expect(runtime.state).toEqual(stateBeforeRequest);
});

test('report filter facets keep notes as zero hours and skip inactive entries and other dates @mr @technical', async () => {
  const runtime = runtimeFor('world-5');
  const precise = runtime.state.workUnits.find(({ id }) => id === IDS.worklogPrecise);
  const historical = runtime.state.workUnits.find(({ id }) => id === IDS.worklogHistorical);
  if (!precise || !historical) throw new Error('world-5 must inherit the precise and historical worklogs');
  historical.state = 'Archived';
  runtime.state.workUnits.push({ ...precise, id: '50000000-0000-4000-8000-000000000099', state: 'Draft' });

  const july = await queryFacets(runtime);
  expect(facetCells(july.json)).toEqual([
    { clientId: IDS.clientInternal, projectId: IDS.projectAlpha, userId: IDS.user, durationSum: '32376s' },
  ]);
  expect((july.json as { cells: Array<{ values: unknown }> }).cells[0].values).toEqual({
    durationSum: 'PT8H59M36S',
  });

  const notesOnly = await queryFacets(runtime, '?dateFrom=2026-07-16&dateTo=2026-07-16');
  expect(notesOnly.status).toBe(200);
  expect((notesOnly.json as { cells: Array<{ values: unknown }> }).cells.map(({ values }) => values)).toEqual([
    { durationSum: 'PT0S' },
  ]);

  const empty = await queryFacets(runtime, '?dateFrom=2026-06-01&dateTo=2026-06-30');
  expect(empty.json).toEqual({
    cells: [],
    filterMembers: [],
    result: { cellCount: 0, displayValueCellCount: 0, maxDisplayValueCellCount: 9_600 },
  });
  expect(facetCells(empty.json)).toEqual([]);
});

test('report filter facets leave every other pivot layout unhandled @mr @technical', async () => {
  const runtime = runtimeFor('world-4');
  const layouts = [
    { ...FILTER_FACETS_REQUEST, rows: ['UserKey'] },
    { ...FILTER_FACETS_REQUEST, columns: ['MonthYearKey'] },
    { ...FILTER_FACETS_REQUEST, values: ['DurationSum', 'EntriesCount'] },
    { ...FILTER_FACETS_REQUEST, filters: [{ key: 'UserKey', includedValues: [IDS.user] }] },
    { ...FILTER_FACETS_REQUEST, options: { rowSubtotals: true, columnSubtotals: false, grandTotals: true } },
  ];

  for (const body of layouts) {
    await expect(queryFacets(runtime, JULY, body)).rejects.toBeInstanceOf(MockRequestMismatchError);
  }
  expect(runtime.journal.entries.map(({ handlerId, error }) => ({ handlerId, error: Boolean(error) }))).toEqual(
    layouts.map(() => ({ handlerId: 'pivot-query-report-filter-facets', error: true })),
  );
});

const invalidPeriodCases = [
  { name: 'a missing dateTo', query: '?dateFrom=2026-07-01' },
  { name: 'a repeated dateFrom', query: '?dateFrom=2026-07-01&dateFrom=2026-07-02&dateTo=2026-07-31' },
  { name: 'an impossible calendar date', query: '?dateFrom=2026-02-30&dateTo=2026-03-31' },
  { name: 'a reversed period', query: '?dateFrom=2026-07-31&dateTo=2026-07-01' },
  { name: 'a pre-filtered project', query: `${JULY}&projectId=${IDS.projectAlpha}` },
  { name: 'a pre-filtered user', query: `${JULY}&userId=${IDS.user}` },
  { name: 'a pre-filtered client', query: `${JULY}&clientId=${IDS.clientInternal}` },
] as const;

for (const { name, query } of invalidPeriodCases) {
  test(`report filter facets reject ${name} without mutating runtime @mr @technical`, async () => {
    const runtime = runtimeFor('world-4');
    const stateBeforeRequest = structuredClone(runtime.state);

    const response = await queryFacets(runtime, query);

    expect(response.status).toBe(400);
    expect(runtime.state).toEqual(stateBeforeRequest);
  });
}

for (const actor of ['pm', 'user'] as const) {
  test(`report filter facets refuse the ${actor} actor like the backend management-role check @mr @technical`, async () => {
    const response = await queryFacets(runtimeFor('world-4', actor));

    expect(response.status).toBe(403);
  });
}

test('report filter facets answer the manager actor @mr @technical', async () => {
  const response = await queryFacets(runtimeFor('world-4', 'manager'));

  expect(response.status).toBe(200);
});
