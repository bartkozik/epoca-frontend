import { act, fireEvent, render, screen } from '@testing-library/react';
import { UnitWorkspaceProvider } from './UnitWorkspaceProviderComponent';
import WorkingTime from './WorkingTime';

const { fetchClients, fetchProjects, hasAccess, demo, useUnitsQuery } = vi.hoisted(() => ({
  fetchClients: vi.fn(),
  fetchProjects: vi.fn(),
  hasAccess: vi.fn(() => true),
  demo: { isDemo: false },
  useUnitsQuery: vi.fn(() => ({ data: { draftIds: ['draft-1'] }, isLoading: false, isError: false })),
}));

vi.mock('@/core/config/demo', () => demo);

vi.mock('@/modules/auth/AuthProvider', () => ({
  useAuth: () => ({ loggedInUser: { id: 'user-1' }, hasAccess }),
}));
vi.mock('@/modules/clients/ClientsProvider', () => ({ useClients: () => ({ clients: [], fetchClients }) }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    contextOrganizationSlug: 'acme',
    contextOrganizationUsers: [],
    isContextOrganizationSlugInLocalStorage: true,
  }),
}));
vi.mock('@/modules/projects/ProjectsProvider', () => ({
  useProjects: () => ({ projects: [], reportedProjects: [], fetchProjects }),
}));
vi.mock('@/modules/workingTime/hooks/useDeleteUnitMutation', () => ({
  useDeleteUnitMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/modules/workingTime/hooks/useUnitsQuery', () => ({
  useUnitsQuery,
  selectModeledUnits: () => [],
}));
vi.mock('./Calendar/UnitForm/useWorkUnitSubmission', () => ({
  useWorkUnitSubmission: () => ({ isSubmitting: false }),
}));
vi.mock('./bootstrapWorkingTime', () => ({ bootstrapWorkingTime: vi.fn() }));
vi.mock('./useWeekNavigation', () => ({
  useWeekNavigation: () => ({
    dates: [],
    weekStart: '',
    weekEnd: '',
    goToPrevWeek: vi.fn(),
    goToNextWeek: vi.fn(),
    goToToday: vi.fn(),
  }),
}));
vi.mock('@/core/utils/hooks', () => ({ useInactivityDataPolling: vi.fn(), useTitle: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/core/theme/confirmation', () => ({
  default: ({ isOpen, cancelBtnText, onCancel }: { isOpen: boolean; cancelBtnText: string; onCancel: () => void }) =>
    isOpen ? <button onClick={onCancel}>{cancelBtnText}</button> : null,
}));
vi.mock('@/core/theme/loadingArea', () => ({ default: ({ children }: React.PropsWithChildren) => children }));
vi.mock('@/core/theme/scrolledContainer', () => ({ default: ({ children }: React.PropsWithChildren) => children }));
vi.mock('@/core/theme/modal', () => ({ default: () => null }));
vi.mock('@/core/theme/pageHeader', () => ({ default: () => null }));
vi.mock('@/core/theme/snackbar', () => ({ default: () => null }));
vi.mock('./Calendar/Calendar', () => ({ default: () => null }));
vi.mock('./DatePicker/DatePicker', () => ({ default: () => null }));
vi.mock('./DraftsBoard', () => ({ default: () => null }));
vi.mock('./WeeklyHoursBar', () => ({ default: () => null }));

afterEach(() => {
  demo.isDemo = false;
  vi.useRealTimers();
  localStorage.clear();
  vi.clearAllMocks();
});

it('dismisses the unreported-drafts warning for 24 hours, then shows it again', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-29T12:00:00.000Z'));

  render(
    <UnitWorkspaceProvider>
      <WorkingTime />
    </UnitWorkspaceProvider>,
  );

  const later = 'working_time.confirmations.text.report_later';
  expect(screen.getByRole('button', { name: later })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: later }));
  expect(screen.queryByRole('button', { name: later })).not.toBeInTheDocument();

  act(() => void vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1));
  expect(screen.queryByRole('button', { name: later })).not.toBeInTheDocument();

  act(() => void vi.advanceTimersByTime(1));
  expect(screen.getByRole('button', { name: later })).toBeInTheDocument();
});

it.each([
  { isDemo: true, dateFrom: '2025-11-05' },
  { isDemo: false, dateFrom: '2017-01-01' },
])('uses the supported draft range when demo=$isDemo', ({ isDemo, dateFrom }) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-05T12:00:00.000Z'));
  demo.isDemo = isDemo;

  render(
    <UnitWorkspaceProvider>
      <WorkingTime />
    </UnitWorkspaceProvider>,
  );

  expect(useUnitsQuery).toHaveBeenCalledWith(
    expect.objectContaining({ dateFrom, state: 'Draft' }),
    expect.objectContaining({ enabled: true }),
  );
});
