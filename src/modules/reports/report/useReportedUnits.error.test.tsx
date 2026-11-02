import { queryClient } from '@/core/api';
import { refreshReportedUnits, useReportedUnits } from '@/modules/reports/hooks/useReportedUnits';
import * as requests from '@/modules/workingTime/requests';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme', contextOrganizationUsers: [] }),
}));
vi.mock('@/modules/workingTime/requests', () => ({ getReportedUnits: vi.fn() }));

const wrapper = ({ children }: React.PropsWithChildren): JSX.Element => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient.setQueryDefaults(['reportedUnits'], { retry: false });
});

afterEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

it('exposes an initial report error instead of presenting it as an empty successful report', async () => {
  vi.mocked(requests.getReportedUnits).mockRejectedValueOnce(new Error('service unavailable'));

  const { result } = renderHook(() => useReportedUnits(), { wrapper });

  await waitFor(() => expect(result.current.reportedUnitsError?.message).toBe('service unavailable'));
  expect(result.current.hasReportedUnitsData).toBe(false);
  expect(result.current.loadingReportedUnits).toBe(false);
});

it('retains successful report data when a later refresh fails', async () => {
  vi.mocked(requests.getReportedUnits)
    .mockResolvedValueOnce({ data: { orders: [], workUnits: { results: [] } } } as unknown as Awaited<
      ReturnType<typeof requests.getReportedUnits>
    >)
    .mockRejectedValueOnce(new Error('refresh failed'));

  const { result } = renderHook(() => useReportedUnits(), { wrapper });
  await waitFor(() => expect(result.current.hasReportedUnitsData).toBe(true));

  await act(async () => {
    await result.current.getReportedUnits();
  });

  await waitFor(() => expect(result.current.reportedUnitsError?.message).toBe('refresh failed'));
  expect(result.current.hasReportedUnitsData).toBe(true);
  expect(result.current.reportedUnits).toEqual([]);
});

it('rejects an active report refresh so the correction controller can show its warning', async () => {
  vi.mocked(requests.getReportedUnits)
    .mockResolvedValueOnce({ data: { orders: [], workUnits: { results: [] } } } as unknown as Awaited<
      ReturnType<typeof requests.getReportedUnits>
    >)
    .mockRejectedValueOnce(new Error('refresh failed'));

  const { result } = renderHook(() => useReportedUnits(), { wrapper });
  await waitFor(() => expect(result.current.hasReportedUnitsData).toBe(true));

  await expect(refreshReportedUnits()).rejects.toThrow('refresh failed');
  await waitFor(() => expect(result.current.reportedUnitsError?.message).toBe('refresh failed'));
  expect(result.current.hasReportedUnitsData).toBe(true);
});
