import { queryClient } from '@/core/api';
import { getReportedUnits, refreshReportedUnits, useReportedUnits } from '@/modules/reports/hooks/useReportedUnits';
import * as requests from '@/modules/workingTime/requests';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';

let organizationSlug = 'acme';
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: organizationSlug, contextOrganizationUsers: [] }),
}));
vi.mock('@/modules/workingTime/requests', () => ({ getReportedUnits: vi.fn() }));

const wrapper = ({ children }: React.PropsWithChildren): JSX.Element => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
const emptyResult = { data: { orders: [], workUnits: { results: [] } } } as never;
const deferred = (): { promise: Promise<unknown>; resolve: (value: unknown) => void } => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const reportResult = (id: string): never =>
  ({
    data: {
      orders: [],
      workUnits: {
        results: [
          {
            entryType: 'Worklog',
            modifiedAt: '2026-08-20T08:00:00.000Z',
            duration: 'PT1H',
            projectClient: {
              projectName: 'Project',
              clientId: 'client-1',
              projectId: 'project-1',
              clientName: 'Client',
              clientColor: '#123456',
              clientTexture: '',
              projectDescription: '',
            },
            description: id,
            id,
            date: '2026-08-20',
            createdAt: '2026-08-20T08:00:00.000Z',
            userId: 'user-1',
            state: 'Active',
          },
        ],
      },
    },
  }) as never;

beforeEach(() => {
  queryClient.setQueryDefaults(['reportedUnits'], { retry: false });
});

afterEach(() => {
  organizationSlug = 'acme';
  vi.useRealTimers();
  queryClient.clear();
  vi.clearAllMocks();
});

it('fetches reports with the atomic date and filter snapshot supplied by the caller', async () => {
  vi.mocked(requests.getReportedUnits).mockResolvedValue(emptyResult);
  const { result } = renderHook(() => useReportedUnits(), { wrapper });
  await waitFor(() => expect(result.current.hasReportedUnitsData).toBe(true));
  vi.mocked(requests.getReportedUnits).mockClear();

  await act(async () => {
    await result.current.getReportedUnits({
      clientIds: ['client-1'],
      fromDate: dayjs('2026-08-10T14:00:00.000Z'),
      navigationMode: 'fixed-length',
      projectIds: ['project-1'],
      toDate: dayjs('2026-08-20T14:00:00.000Z'),
      today: dayjs('2026-08-21T14:00:00.000Z'),
      userIds: ['user-1'],
    });
  });

  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledOnce());
  expect(requests.getReportedUnits).toHaveBeenCalledWith('acme', {
    includeArchived: false,
    dateFrom: '2026-08-10',
    dateTo: '2026-08-20',
    projectId: ['project-1'],
    userId: ['user-1'],
    clientId: ['client-1'],
  });
});

it('keeps the newest filter result when an older report request resolves later', async () => {
  const initial = deferred();
  const older = deferred();
  const newer = deferred();
  vi.mocked(requests.getReportedUnits)
    .mockReturnValueOnce(initial.promise as never)
    .mockReturnValueOnce(older.promise as never)
    .mockReturnValueOnce(newer.promise as never);
  const { result } = renderHook(() => useReportedUnits(), { wrapper });
  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledOnce());
  initial.resolve(emptyResult);
  await waitFor(() => expect(result.current.hasReportedUnitsData).toBe(true));

  await act(async () => {
    await result.current.getReportedUnits({
      fromDate: dayjs('2026-08-01'),
      toDate: dayjs('2026-08-10'),
      today: dayjs('2026-08-10'),
      navigationMode: 'fixed-length',
    });
  });
  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledTimes(2));
  await act(async () => {
    await result.current.getReportedUnits({
      fromDate: dayjs('2026-08-11'),
      toDate: dayjs('2026-08-20'),
      today: dayjs('2026-08-20'),
      navigationMode: 'fixed-length',
    });
  });
  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledTimes(3));

  newer.resolve(reportResult('newer-row'));
  await waitFor(() => expect(result.current.reportedUnits.map(({ id }) => id)).toEqual(['newer-row']));
  older.resolve(reportResult('older-row'));
  await waitFor(() => expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0));
  expect(result.current.reportedUnits.map(({ id }) => id)).toEqual(['newer-row']);
});

it('keeps the previous rows visible and flagged as refreshing while the new report snapshot loads', async () => {
  const initial = deferred();
  const filtered = deferred();
  vi.mocked(requests.getReportedUnits)
    .mockReturnValueOnce(initial.promise as never)
    .mockReturnValueOnce(filtered.promise as never);
  const { result } = renderHook(() => useReportedUnits(), { wrapper });
  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledOnce());
  initial.resolve(reportResult('old-filter-row'));
  await waitFor(() => expect(result.current.reportedUnits.map(({ id }) => id)).toEqual(['old-filter-row']));
  expect(result.current.isRefreshingReportedUnits).toBe(false);

  await act(async () =>
    result.current.getReportedUnits({
      fromDate: dayjs('2026-08-01'),
      toDate: dayjs('2026-08-10'),
      today: dayjs('2026-08-10'),
      navigationMode: 'fixed-length',
    }),
  );

  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledTimes(2));
  expect(result.current.reportedUnits.map(({ id }) => id)).toEqual(['old-filter-row']);
  expect(result.current.isRefreshingReportedUnits).toBe(true);
  expect(result.current.loadingReportedUnits).toBe(false);

  filtered.resolve(reportResult('new-filter-row'));
  await waitFor(() => expect(result.current.reportedUnits.map(({ id }) => id)).toEqual(['new-filter-row']));
  expect(result.current.isRefreshingReportedUnits).toBe(false);
});

it('never shows the previous organization rows while another organization loads', async () => {
  const other = deferred();
  vi.mocked(requests.getReportedUnits)
    .mockResolvedValueOnce(reportResult('acme-row'))
    .mockReturnValueOnce(other.promise as never);
  const { result, rerender } = renderHook(() => useReportedUnits(), { wrapper });
  await waitFor(() => expect(result.current.reportedUnits.map(({ id }) => id)).toEqual(['acme-row']));

  organizationSlug = 'globex';
  rerender();

  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenLastCalledWith('globex', expect.anything()));
  expect(result.current.reportedUnits).toEqual([]);
  expect(result.current.loadingReportedUnits).toBe(true);
  expect(result.current.isRefreshingReportedUnits).toBe(false);
  other.resolve(emptyResult);
  await waitFor(() => expect(result.current.hasReportedUnitsData).toBe(true));
});

it('uses today as the end of the initial open-ended report range', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 21, 12));
  vi.mocked(requests.getReportedUnits).mockResolvedValue(emptyResult);

  renderHook(() => useReportedUnits(), { wrapper });

  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledOnce());
  expect(requests.getReportedUnits).toHaveBeenCalledWith('acme', {
    includeArchived: false,
    dateFrom: '2026-08-21',
    dateTo: '2026-08-21',
    projectId: [],
    userId: [],
    clientId: [],
  });
});

it('pins the first request to the explicitly captured day for an open-ended snapshot', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 21, 0, 1));
  vi.mocked(requests.getReportedUnits).mockResolvedValue(emptyResult);
  const { result } = renderHook(() => useReportedUnits(), { wrapper });
  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledOnce());

  await act(async () =>
    result.current.getReportedUnits({
      fromDate: dayjs('2026-08-01'),
      navigationMode: 'fixed-length',
      toDate: null,
      today: dayjs('2026-08-20'),
    }),
  );

  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledTimes(2));
  expect(requests.getReportedUnits).toHaveBeenLastCalledWith('acme', {
    includeArchived: false,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-20',
    projectId: [],
    userId: [],
    clientId: [],
  });
});

it('keeps an explicitly captured open-ended snapshot pinned when refetched after midnight', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 20, 23, 59));
  vi.mocked(requests.getReportedUnits).mockResolvedValue(emptyResult);
  const { result } = renderHook(() => useReportedUnits(), { wrapper });
  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledOnce());

  const snapshot = {
    fromDate: dayjs('2026-08-01'),
    navigationMode: 'fixed-length' as const,
    toDate: null,
    today: dayjs('2026-08-20'),
  };
  await act(async () => result.current.getReportedUnits(snapshot));
  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledTimes(2));

  vi.setSystemTime(new Date(2026, 7, 21, 0, 1));
  vi.mocked(requests.getReportedUnits).mockClear();
  await act(async () => result.current.getReportedUnits(snapshot));

  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledOnce());
  expect(requests.getReportedUnits).toHaveBeenCalledWith('acme', {
    includeArchived: false,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-20',
    projectId: [],
    userId: [],
    clientId: [],
  });
});

it('advances an open-ended report range on an implicit refresh after midnight', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 20, 23, 59));
  vi.mocked(requests.getReportedUnits).mockResolvedValue(emptyResult);

  const { result } = renderHook(() => useReportedUnits(), { wrapper });

  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledOnce());
  expect(requests.getReportedUnits).toHaveBeenLastCalledWith('acme', expect.objectContaining({ dateTo: '2026-08-20' }));

  vi.setSystemTime(new Date(2026, 7, 21, 0, 1));
  vi.mocked(requests.getReportedUnits).mockClear();
  await act(async () => result.current.refreshReportedUnitsInBackground());

  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledOnce());
  expect(requests.getReportedUnits).toHaveBeenCalledWith('acme', {
    includeArchived: false,
    dateFrom: '2026-08-20',
    dateTo: '2026-08-21',
    projectId: [],
    userId: [],
    clientId: [],
  });
});

it('reuses the selected report snapshot for a background refresh', async () => {
  vi.mocked(requests.getReportedUnits).mockResolvedValue(emptyResult);
  const { result } = renderHook(() => useReportedUnits(), { wrapper });
  await waitFor(() => expect(result.current.hasReportedUnitsData).toBe(true));
  const snapshot = {
    clientIds: ['client-1'],
    fromDate: dayjs('2026-08-10'),
    isContextualFiltering: true,
    navigationMode: 'fixed-length' as const,
    projectIds: ['project-1'],
    toDate: dayjs('2026-08-20'),
    today: dayjs('2026-08-20'),
    userIds: ['user-1'],
  };

  await act(async () => result.current.getReportedUnits(snapshot));
  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledTimes(2));
  vi.mocked(requests.getReportedUnits).mockClear();
  await act(async () => result.current.refreshReportedUnitsInBackground());

  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledOnce());
  expect(requests.getReportedUnits).toHaveBeenCalledWith('acme', {
    includeArchived: false,
    dateFrom: '2026-08-10',
    dateTo: '2026-08-20',
    projectId: ['project-1'],
    userId: ['user-1'],
    clientId: ['client-1'],
  });
});

it.each([
  ['calendar mutation invalidation', getReportedUnits],
  ['report correction refresh', refreshReportedUnits],
])('keeps the active filters and advances the open end after midnight on %s', async (_source, refresh) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 20, 23, 59));
  vi.mocked(requests.getReportedUnits).mockResolvedValue(emptyResult);
  const { result } = renderHook(() => useReportedUnits(), { wrapper });
  await waitFor(() => expect(result.current.hasReportedUnitsData).toBe(true));

  await act(async () =>
    result.current.getReportedUnits({
      clientIds: ['client-1'],
      fromDate: dayjs('2026-08-01'),
      navigationMode: 'fixed-length',
      projectIds: ['project-1'],
      toDate: null,
      today: dayjs('2026-08-20'),
      userIds: ['user-1'],
    }),
  );
  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledTimes(2));

  vi.setSystemTime(new Date(2026, 7, 21, 0, 1));
  vi.mocked(requests.getReportedUnits).mockClear();
  await act(async () => refresh());

  await waitFor(() => expect(requests.getReportedUnits).toHaveBeenCalledOnce());
  expect(requests.getReportedUnits).toHaveBeenCalledWith('acme', {
    includeArchived: false,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-21',
    projectId: ['project-1'],
    userId: ['user-1'],
    clientId: ['client-1'],
  });
});
