import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';
import 'core/i18n/i18n';
import FilterPanel from './FilterPanel';
import type { ReportQuerySnapshot } from './types';
import { useReportFilters } from './useReportFilters';

let reportedProjects: Array<{ id: string; name: string }> = [];
const clients: never[] = [];
const contextOrganizationUsers: never[] = [];
vi.mock('@/modules/clients/ClientsProvider', () => ({ useClients: () => ({ clients }) }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationUsers }),
}));
vi.mock('@/modules/projects/ProjectsProvider', () => ({ useProjects: () => ({ reportedProjects }) }));
vi.mock('@/modules/reports/hooks/useReportUsers', () => ({ useReportUsers: () => contextOrganizationUsers }));

const getReportedUnitsMock: Mock<(...args: unknown[]) => Promise<void>> = vi.fn();
vi.mock('@/modules/reports/hooks/useReportedUnits', () => ({
  getReportedUnits: (...args: unknown[]) => getReportedUnitsMock(...args),
}));

vi.mock('./dateRangePicker', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/modules/reports/filterPanel/filterPanelTag', () => ({
  __esModule: true,
  default: ({ onRemove, value }: { onRemove: () => void; value: string }) => (
    <button onClick={onRemove}>remove {value}</button>
  ),
}));

vi.mock('@/core/theme/multiSearch', () => ({
  __esModule: true,
  default: ({ onChange, name }: { onChange: (values: string[]) => void; name: string }) => (
    <button onClick={() => onChange(['new-id'])}>{name}</button>
  ),
}));

vi.mock('@/modules/reports/hooks/useReportFilterFacets', () => ({
  useReportFilterFacets: () => ({ status: 'unavailable', facets: null, request: vi.fn(), retry: vi.fn() }),
}));

const LocationProbe = (): JSX.Element => {
  const location = useLocation();
  return <output>{location.search}</output>;
};

const BackButton = (): JSX.Element => {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Back</button>;
};

// Mirrors how a real consumer (Report.tsx/PivotTable.tsx) wires the hook to the component --
// this is what proves the hydration-race fix actually works end to end, not just in isolation.
const FilterPanelHarness = ({
  onApplyFilters,
}: {
  onApplyFilters: (snapshot: ReportQuerySnapshot) => Promise<void>;
}): JSX.Element => {
  const filters = useReportFilters();
  return <FilterPanel filters={filters} onApplyFilters={onApplyFilters} />;
};

const setReportedProjects = (projects: Array<{ id: string; name: string }> = []): void => {
  getReportedUnitsMock.mockClear();
  reportedProjects = projects;
};

describe('FilterPanel URL hydration integration', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-29T12:00:00'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it.each(['', '&pmFilters=true&pmProjects=old-project&pmClients=old-client&isContextualFiltering=true&custom=keep'])(
    'hydrates filters before the single request and canonicalizes dates and retired URL keys (%s)',
    async (legacyParams) => {
      setReportedProjects();
      const onApplyFilters = vi.fn((_snapshot: ReportQuerySnapshot) => Promise.resolve());

      render(
        <MemoryRouter
          initialEntries={[
            '/reports?clients=client-1&projects=project-1&users=user-1&startDate=2026-07-10&endDate=2026-07-20&navigationMode=fixed-length' +
              legacyParams,
          ]}
        >
          <FilterPanelHarness onApplyFilters={onApplyFilters} />
          <LocationProbe />
        </MemoryRouter>,
      );

      await waitFor(() => expect(onApplyFilters).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(
          new URLSearchParams(screen.getByRole('status').textContent?.replace(/^\?/, '')).has('navigationMode'),
        ).toBe(false),
      );

      expect(getReportedUnitsMock).not.toHaveBeenCalled();
      const snapshot = onApplyFilters.mock.calls[0][0];
      expect(snapshot.fromDate.format('YYYY-MM-DD')).toBe('2026-07-10');
      expect(snapshot.toDate?.format('YYYY-MM-DD')).toBe('2026-07-20');
      // These three assertions are the ones that actually exercise the hydration-race fix: if the
      // date-range hydration fired the request before the filter hydration's state had settled,
      // these would come back empty instead of reflecting the URL.
      expect(snapshot.projectIds).toEqual(['project-1']);
      expect(snapshot.userIds).toEqual(['user-1']);
      expect(snapshot.clientIds).toEqual(['client-1']);
      const params = new URLSearchParams(screen.getByRole('status').textContent ?? '');
      expect(params.has('pmFilters')).toBe(false);
      expect(params.has('pmProjects')).toBe(false);
      expect(params.has('pmClients')).toBe(false);
      expect(params.has('isContextualFiltering')).toBe(false);
      expect(params.get('custom')).toBe(legacyParams ? 'keep' : null);
    },
  );

  it('replaces all selected filters from a POP URL before requesting its report', async () => {
    setReportedProjects();
    const onApplyFilters = vi.fn((_snapshot: ReportQuerySnapshot) => Promise.resolve());

    render(
      <MemoryRouter
        initialEntries={[
          '/reports?clients=client-a&startDate=2026-06-01&endDate=2026-06-30',
          '/reports?clients=client-b&projects=project-b&users=user-b&startDate=2026-07-01&endDate=2026-07-31',
        ]}
        initialIndex={1}
      >
        <FilterPanelHarness onApplyFilters={onApplyFilters} />
        <BackButton />
      </MemoryRouter>,
    );

    await waitFor(() => expect(onApplyFilters).toHaveBeenCalledTimes(1));
    expect(onApplyFilters.mock.calls[0][0]).toMatchObject({
      clientIds: ['client-b'],
      projectIds: ['project-b'],
      userIds: ['user-b'],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(onApplyFilters).toHaveBeenCalledTimes(2));
    expect(onApplyFilters.mock.calls[1][0]).toMatchObject({
      clientIds: ['client-a'],
      projectIds: [],
      userIds: [],
    });
  });
});

describe('FilterPanel selection requests', () => {
  it.each([
    ['project', 'projects', 'projectIds'],
    ['user', 'users', 'userIds'],
    ['client', 'clients', 'clientIds'],
  ] as const)('applies and removes the current %s selection', async (control, category, field) => {
    setReportedProjects();
    const onApplyFilters = vi.fn((_snapshot: ReportQuerySnapshot) => Promise.resolve());
    render(
      <MemoryRouter initialEntries={[`/reports?${category}=old-id&startDate=2026-07-01`]}>
        <FilterPanelHarness onApplyFilters={onApplyFilters} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(onApplyFilters).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: control }));
    await waitFor(() => expect(onApplyFilters).toHaveBeenCalledTimes(2));
    expect(onApplyFilters.mock.calls[1][0][field]).toEqual(['new-id']);
    fireEvent.click(screen.getAllByRole('button', { name: 'remove new-id' })[0]);
    await waitFor(() => expect(onApplyFilters).toHaveBeenCalledTimes(3));
    expect(onApplyFilters.mock.calls[2][0][field]).toEqual([]);
  });

  it('clears the all-projects tag and applies the empty selection once', async () => {
    setReportedProjects([{ id: 'only-project', name: 'Only' }]);
    const onApplyFilters = vi.fn((_snapshot: ReportQuerySnapshot) => Promise.resolve());
    render(
      <MemoryRouter initialEntries={['/reports?projects=only-project']}>
        <FilterPanelHarness onApplyFilters={onApplyFilters} />
        <LocationProbe />
      </MemoryRouter>,
    );
    await waitFor(() => expect(onApplyFilters).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByRole('button', { name: /^remove / })[0]);
    await waitFor(() => expect(onApplyFilters).toHaveBeenCalledTimes(2));
    expect(onApplyFilters.mock.calls[1][0].projectIds).toEqual([]);
    expect(screen.queryByRole('button', { name: /^remove / })).not.toBeInTheDocument();
    expect(new URLSearchParams(screen.getByRole('status').textContent ?? '').has('projects')).toBe(false);
  });
});
