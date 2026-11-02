import apiModule from '@/core/api/Api';
import { PIVOT_KEY, PIVOT_VALUE } from './pivotTable/constants';
import { exportPivotTable, exportReport, getPivotTable } from './requests';
import { SpreadsheetFormat } from './types';

vi.mock('@/core/api/Api', () => ({
  __esModule: true,
  default: { post: vi.fn() },
}));

// `./requests`, `./types`, and `./pivotTable/constants` are real (unmocked) modules — only
// `@/core/api/Api` above is mocked — so these can be plain static imports rather than something
// requiring deferred/dynamic resolution. `it.each(...)` below reads `SpreadsheetFormat` while
// Vitest collects tests (synchronously, before any `beforeAll` runs), so it specifically needs to
// be available immediately; a static import (unlike a top-level `await import(...)`, which this
// project's `tsconfig.json` doesn't support) satisfies that too.
const mockPost = vi.mocked(apiModule.post);

beforeEach(() => {
  mockPost.mockReset();
});

describe('exportReport', () => {
  const reportColumnNames = {
    date: 'Date',
    entryType: 'Type',
    clientName: 'Client',
    projectName: 'Project',
    userFullName: 'User',
    taskId: 'Task',
    description: 'Description',
    duration: 'Duration',
    createdAt: 'Created',
    modifiedAt: 'Modified',
  };

  beforeEach(() => {
    mockPost.mockClear();
  });

  it.each([SpreadsheetFormat.CSV, SpreadsheetFormat.XLS])(
    'exports the effective ten-column contract as %s',
    (format) => {
      void exportReport({
        organizationSlug: 'acme',
        format,
        selectedUnitIds: ['unit-1', 'unit-2'],
        columnNames: reportColumnNames,
      });
      expect(mockPost).toHaveBeenCalledWith(
        '/organizations/acme/work-units/export',
        {
          ids: ['unit-1', 'unit-2'],
          columnNames: reportColumnNames,
          projectIds: [],
          userIds: [],
          clientIds: [],
        },
        { params: { format }, responseType: 'blob' },
      );
    },
  );
});

describe('exportPivotTable', () => {
  const canonicalBody =
    '{"query":{"rows":["USER"],"columns":["MONTH_YEAR"],"values":["DURATION_SUM"],"filters":[],"options":{"rowSubtotals":true,"columnSubtotals":true,"grandTotals":true}},"projection":{"effectiveDateTo":"2026-08-20"},"presentation":{"fieldLabels":{},"measureLabels":{},"subtotalLabel":"Subtotal","grandTotalLabel":"Grand total","noClientLabel":"No client","memberLabels":[]}}';
  const params = {
    dateFrom: '2026-08-01',
    projectId: ['project-1', 'project-2'],
    userId: ['user-1', 'user-2'],
    clientId: ['client-1', 'client-2'],
  };

  it.each([SpreadsheetFormat.CSV, SpreadsheetFormat.XLS])(
    'posts the canonical body unchanged for %s with repeated filters and no dateTo',
    (format) => {
      void exportPivotTable({
        organizationSlug: 'acme',
        format,
        params,
        body: canonicalBody,
      });

      expect(mockPost).toHaveBeenCalledWith('/organizations/acme/pivot-tables/work-units/export', canonicalBody, {
        headers: { 'Content-Type': 'application/json' },
        params: { ...params, format },
        responseType: 'blob',
        transformRequest: expect.any(Array) as unknown,
      });

      const config = mockPost.mock.calls[0][2];
      expect(config).toBeDefined();
      const transformRequest = config?.transformRequest as Array<(body: string) => string>;
      expect(transformRequest).toHaveLength(1);
      expect(transformRequest[0](canonicalBody)).toBe(canonicalBody);
      expect(config?.params).not.toHaveProperty('dateTo');
    },
  );
});

describe('getPivotTable', () => {
  it('posts the complete layout to the CT-535 query endpoint and parses its response', async () => {
    const canonicalResponse = (await import('./models/__fixtures__/work-unit-pivot-query-canonical-response.json'))
      .default;
    const request = {
      rows: [PIVOT_KEY.USER, PIVOT_KEY.PROJECT],
      columns: [PIVOT_KEY.MONTH_YEAR],
      values: [PIVOT_VALUE.DURATION_SUM, PIVOT_VALUE.DURATION_AVG, PIVOT_VALUE.ENTRIES_COUNT],
      filters: [{ key: PIVOT_KEY.ENTRY_TYPE, includedValues: ['Worklog'] }],
      options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
    };
    mockPost.mockResolvedValue({
      data: {
        ...canonicalResponse,
        filterMembers: [
          {
            key: PIVOT_KEY.ENTRY_TYPE,
            members: [
              { value: 'Worklog', available: true },
              { value: 'Note', available: true },
            ],
          },
        ],
      },
    });

    const response = await getPivotTable('acme', request, {
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      projectId: ['p1', 'p2'],
      userId: ['u1'],
      clientId: [],
    });

    expect(response.cells).toHaveLength(11);
    expect(response.cells[0].values.durationSum).toEqual({ seconds: 7_200, nanoseconds: 0 });
    expect(response.filterMembers[0].members).toEqual([
      { value: 'Worklog', available: true },
      { value: 'Note', available: true },
    ]);

    expect(mockPost).toHaveBeenCalledWith('/organizations/acme/pivot-tables/work-units/query', request, {
      params: {
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
        projectId: ['p1', 'p2'],
        userId: ['u1'],
        clientId: [],
      },
    });
  });
});
