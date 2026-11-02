import { LOCAL_STORAGE_AUTH_NAME } from '@/core/config/localStorageKeys';
import { useOrganizationsQuery } from '@/modules/organizations/hooks/useOrganizationsQuery';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { MockedFunction } from 'vitest';
import * as requests from './requests';
import { useWorkspace, WorkspaceProvider } from './WorkspaceProvider';

const { logoutMock } = vi.hoisted(() => ({ logoutMock: vi.fn() }));
vi.mock('@/modules/auth/AuthProvider', () => ({
  useAuth: () => ({
    loggedInUser: { id: 'user-1', email: 'person@example.com', isSuperAdmin: false },
    loggedInUserRoles: [],
    logout: logoutMock,
  }),
}));
vi.mock('@/core/utils/helpers', () => ({
  createFullName: ({ firstName, lastName }: { firstName: string; lastName: string }) => `${firstName} ${lastName}`,
  getUserMailFromIdentity: vi.fn(() => 'person@example.com'),
  showModuleErrorToast: vi.fn(),
  showToastForError: vi.fn(),
}));
vi.mock('./requests', () => ({
  getOrganizationBySlug: vi.fn(),
  getOrganizations: vi.fn(),
  getOrganizationUsers: vi.fn(),
  getOrganizationUserProjects: vi.fn(),
}));

const getOrganizationsMock = requests.getOrganizations as MockedFunction<typeof requests.getOrganizations>;
const getOrganizationBySlugMock = requests.getOrganizationBySlug as MockedFunction<
  typeof requests.getOrganizationBySlug
>;

const wrapper = ({ children }: { children: ReactNode }): ReactElement => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, createElement(WorkspaceProvider, null, children));
};

describe('single-organization id resolution (integration)', () => {
  afterEach(() => {
    localStorage.removeItem(LOCAL_STORAGE_AUTH_NAME.CONTEXT_ORG_SLUG);
    localStorage.removeItem(LOCAL_STORAGE_AUTH_NAME.CONTEXT_ORG_ID);
    vi.clearAllMocks();
  });

  it('resolves the workspace id after a fresh single-organization login', async () => {
    expect(localStorage.getItem(LOCAL_STORAGE_AUTH_NAME.CONTEXT_ORG_SLUG)).toBeNull();

    getOrganizationsMock.mockResolvedValue({
      data: { count: 1, results: [{ archivedAt: null, id: 'org-only', name: 'Only Organization', slug: 'only-org' }] },
    } as never);
    getOrganizationBySlugMock.mockResolvedValue({
      data: { archivedAt: null, id: 'org-only', name: 'Only Organization', slug: 'only-org' },
    } as never);

    const { result } = renderHook(() => ({ organizations: useOrganizationsQuery(), workspace: useWorkspace() }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.organizations.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.workspace.contextOrganizationId).toBe('org-only'));

    expect(getOrganizationBySlugMock).toHaveBeenCalledWith('only-org');
    expect(localStorage.getItem(LOCAL_STORAGE_AUTH_NAME.CONTEXT_ORG_ID)).toBe('org-only');
  });
});
