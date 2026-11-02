import { queryClient } from '@/core/api';
import { getReportedUnits } from '@/modules/reports/hooks/useReportedUnits';

afterEach(() => queryClient.clear());

it('marks inactive report variants stale so reopening them fetches current data', async () => {
  const key = ['reportedUnits', 'acme', 'saved-filter'];
  queryClient.setQueryData(key, ['before-edit']);
  const getFreshReport = vi.fn().mockResolvedValue(['after-edit']);

  await getReportedUnits();

  expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  await expect(queryClient.fetchQuery({ queryKey: key, queryFn: getFreshReport })).resolves.toEqual(['after-edit']);
  expect(getFreshReport).toHaveBeenCalledTimes(1);
});
