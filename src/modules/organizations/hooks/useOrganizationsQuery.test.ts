import { showToastForError } from '@/core/utils/helpers';
import {
  useHasMoreThanOneOrganization,
  useOrganizationsQuery,
} from '@/modules/organizations/hooks/useOrganizationsQuery';
import { organizationsQueryKey } from '@/modules/organizations/queryKeys';
import * as requests from '@/modules/organizations/requests';
import { saveContextOrganizationSlugInLS } from '@/modules/organizations/utils';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/organizations/requests', () => ({ getOrganizations: vi.fn() }));
const getOrganizationsMock = requests.getOrganizations as unknown as ReturnType<typeof vi.fn>;

const logoutMock = vi.fn();
const checkIfContextOrganizationSlugIsInLocalStorageMock = vi.fn();
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => ({ logout: logoutMock }) }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    checkIfContextOrganizationSlugIsInLocalStorage: checkIfContextOrganizationSlugIsInLocalStorageMock,
  }),
}));

vi.mock('@/core/utils/helpers', () => ({ showToastForError: vi.fn() }));
const showToastForErrorMock = showToastForError as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/modules/organizations/utils', () => ({ saveContextOrganizationSlugInLS: vi.fn() }));
const saveContextOrganizationSlugInLSMock = saveContextOrganizationSlugInLS as unknown as ReturnType<typeof vi.fn>;

const rawOrganization = {
  archivedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  id: 'org-1',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'user-1',
  name: 'Acme',
  slug: 'acme',
};

const wrapper = ({ children }: { children: ReactNode }): ReactElement => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('organizationsQueryKey', () => {
  it('is a flat, unparameterized key', () => {
    expect(organizationsQueryKey()).toEqual(['organizations']);
  });
});

describe('useOrganizationsQuery', () => {
  it('returns the parsed results', async () => {
    getOrganizationsMock.mockResolvedValueOnce({ data: { count: 1, results: [rawOrganization] } });

    const { result } = renderHook(() => useOrganizationsQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.results).toEqual([rawOrganization]);
  });

  it('logs the user out on a 401, without showing a toast', async () => {
    const error = Object.assign(new Error('unauthorized'), {
      isAxiosError: true,
      response: { status: 401 },
    });
    getOrganizationsMock.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useOrganizationsQuery(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
    expect(showToastForErrorMock).not.toHaveBeenCalled();
  });

  it('shows a data-fetch-error toast on a non-401 failure', async () => {
    const error = Object.assign(new Error('server error'), {
      isAxiosError: true,
      response: { status: 500 },
    });
    getOrganizationsMock.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useOrganizationsQuery(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    await waitFor(() => expect(showToastForErrorMock).toHaveBeenCalled());
    expect(logoutMock).not.toHaveBeenCalled();
  });
});

describe('useOrganizationsQuery single-organization auto-select', () => {
  it('persists the slug and re-checks context resolution when there is exactly one organization', async () => {
    getOrganizationsMock.mockResolvedValueOnce({ data: { count: 1, results: [rawOrganization] } });

    const { result } = renderHook(() => useOrganizationsQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(saveContextOrganizationSlugInLSMock).toHaveBeenCalledWith('acme');
    expect(checkIfContextOrganizationSlugIsInLocalStorageMock).toHaveBeenCalled();
  });

  it('does not auto-select when there is more than one organization', async () => {
    getOrganizationsMock.mockResolvedValueOnce({
      data: { count: 2, results: [rawOrganization, { ...rawOrganization, id: 'org-2', slug: 'acme-2' }] },
    });

    const { result } = renderHook(() => useOrganizationsQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(saveContextOrganizationSlugInLSMock).not.toHaveBeenCalled();
    expect(checkIfContextOrganizationSlugIsInLocalStorageMock).not.toHaveBeenCalled();
  });
});

describe('useOrganizationsQuery failure stability', () => {
  it('does not retry a failed load, even though the client default would', async () => {
    const productionDefaultsWrapper = ({ children }: { children: ReactNode }): ReactElement => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
      return createElement(QueryClientProvider, { client: queryClient }, children);
    };

    const error = Object.assign(new Error('server error'), { isAxiosError: true, response: { status: 500 } });
    getOrganizationsMock.mockRejectedValue(error);

    const { result } = renderHook(() => useOrganizationsQuery(), { wrapper: productionDefaultsWrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getOrganizationsMock).toHaveBeenCalledTimes(1);
  });

  it('does not refetch when the window regains focus', async () => {
    getOrganizationsMock.mockResolvedValueOnce({ data: { count: 1, results: [rawOrganization] } });

    const { result } = renderHook(() => useOrganizationsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    getOrganizationsMock.mockClear();

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getOrganizationsMock).not.toHaveBeenCalled();
    focusManager.setFocused(undefined);
  });
});

describe('useHasMoreThanOneOrganization', () => {
  it('is true when the results contain more than one organization', async () => {
    getOrganizationsMock.mockResolvedValueOnce({
      data: { count: 2, results: [rawOrganization, { ...rawOrganization, id: 'org-2', slug: 'acme-2' }] },
    });

    const { result } = renderHook(() => useHasMoreThanOneOrganization(), { wrapper });

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is false with zero or one organization', async () => {
    getOrganizationsMock.mockResolvedValueOnce({ data: { count: 1, results: [rawOrganization] } });

    const { result } = renderHook(() => useHasMoreThanOneOrganization(), { wrapper });

    await waitFor(() => expect(getOrganizationsMock).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});
