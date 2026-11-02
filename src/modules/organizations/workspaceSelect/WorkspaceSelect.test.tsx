import { useAuth } from '@/modules/auth/AuthProvider';
import { useOrganizationsQuery } from '@/modules/organizations/hooks/useOrganizationsQuery';
import type { RawOrganizationsResults } from '@/modules/organizations/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import type { UseQueryResult } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock, MockedFunction } from 'vitest';
import WorkspaceSelect from './WorkspaceSelect';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
}));

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'common.logout': 'Logout',
        'organizations.workspace_select.button.retry': 'Try again',
        'organizations.workspace_select.error.forbidden': 'You do not have access to any workspace.',
        'organizations.workspace_select.error.temporary': 'Workspace service is temporarily unavailable.',
        'organizations.workspace_select.text.workspace_data_fetch_error': 'Workspace data fetch error',
        'organizations.workspace_select.title.select_workspace': 'Select workspace:',
      })[key] || key,
  }),
}));

vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({ useWorkspace: vi.fn() }));

vi.mock('@/modules/organizations/hooks/useOrganizationsQuery', () => ({ useOrganizationsQuery: vi.fn() }));

vi.mock('@/core/theme/button', () => ({
  __esModule: true,
  default: ({ label, onClick }: { label?: string; onClick?: () => void }) => <button onClick={onClick}>{label}</button>,
}));
vi.mock('@/core/theme/icon', () => ({ __esModule: true, default: () => null, icons: { arrowRight: 'arrow-right' } }));
vi.mock('@/core/theme/itemLogo', () => ({ __esModule: true, default: () => null }));
vi.mock('@/core/theme/loadingArea', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/core/theme/logoImage', () => ({ __esModule: true, default: () => null }));
vi.mock('@/core/utils/helpers', () => ({ showToastForError: vi.fn() }));

const useAuthMock = vi.mocked(useAuth);
const useWorkspaceMock = vi.mocked(useWorkspace);
const useOrganizationsQueryMock = useOrganizationsQuery as unknown as MockedFunction<
  () => UseQueryResult<RawOrganizationsResults>
>;

const emptyResults: RawOrganizationsResults = { count: 0, results: [] };

// classifyOrganizationLoadFailure (real, unmocked) derives `forbidden`/`temporary`/etc. off an
// axios-shaped error -- WorkspaceSelect computes organizationLoadFailure locally from query.error
// rather than via a second hook call (see the CT-561 review fix comment in WorkspaceSelect.tsx),
// so these tests drive it through a real error object instead of mocking the classification.
const errorForFailureKind = (failure: { kind: 'forbidden' | 'temporary'; status: number }): Error =>
  Object.assign(new Error(failure.kind), { isAxiosError: true, response: { status: failure.status } });

const mountWorkspaceSelect = (failure: { kind: 'forbidden' | 'temporary'; status: number }): Mock => {
  const refetch = vi.fn().mockResolvedValue({ data: emptyResults });
  useAuthMock.mockReturnValue({
    logout: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useAuth>);
  useWorkspaceMock.mockReturnValue({
    getContextOrganizationBySlug: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useWorkspace>);
  useOrganizationsQueryMock.mockReturnValue({
    data: emptyResults,
    error: errorForFailureKind(failure),
    isFetching: false,
    isLoading: false,
    refetch,
  } as unknown as UseQueryResult<RawOrganizationsResults>);

  render(<WorkspaceSelect />);
  return refetch;
};

describe('WorkspaceSelect organization failure state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a temporary failure once and retries only after the user asks', async () => {
    const refetch = mountWorkspaceSelect({ kind: 'temporary', status: 500 });

    expect(screen.getByText('Workspace service is temporarily unavailable.')).toBeVisible();
    expect(refetch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders forbidden without offering an automatic retry', () => {
    mountWorkspaceSelect({ kind: 'forbidden', status: 403 });

    expect(screen.getByText('You do not have access to any workspace.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});

describe('WorkspaceSelect long organization names', () => {
  const longName = 'A Very Long Organization Name That Should Not Break The Layout';

  const mountWithOrganization = (): void => {
    useAuthMock.mockReturnValue({
      logout: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof useAuth>);
    useWorkspaceMock.mockReturnValue({
      getContextOrganizationBySlug: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof useWorkspace>);
    useOrganizationsQueryMock.mockReturnValue({
      data: {
        count: 2,
        results: [
          { id: 'org-1', name: longName, slug: 'long-org', archivedAt: null },
          // Archived, not rendered by WorkspaceSelect's own filter -- only present so
          // `organizations.length > 1` makes `hasMoreThanOneOrganization` true (mirroring a
          // real multi-org account) while keeping exactly one row on screen for these tests.
          { id: 'org-2', name: 'Other org', slug: 'other-org', archivedAt: '2024-01-01T00:00:00.000Z' },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as UseQueryResult<RawOrganizationsResults>);

    render(<WorkspaceSelect />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not show a tooltip when the name fits on one line', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);

    mountWithOrganization();

    expect(screen.getByText(longName)).toBeVisible();
    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
  });

  it('truncates the name and exposes the full name in a tooltip when it overflows', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);

    mountWithOrganization();

    expect(screen.getAllByText(longName).length).toBeGreaterThan(0);
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(longName);
  });

  it('re-measures truncation when the element is resized after mount', () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    // A regular `function` (not an arrow function) is required here: `window.ResizeObserver` is
    // invoked with `new`, and arrow functions aren't constructible.
    window.ResizeObserver = vi.fn(function MockResizeObserver(callback: ResizeObserverCallback) {
      resizeCallback = callback;
      return { disconnect, observe, unobserve: vi.fn() };
    });

    const scrollWidthSpy = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(100);
    const clientWidthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);

    mountWithOrganization();

    expect(observe).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();

    scrollWidthSpy.mockReturnValue(400);
    clientWidthSpy.mockReturnValue(100);
    act(() => resizeCallback?.([], {} as ResizeObserver));

    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(longName);
  });
});
