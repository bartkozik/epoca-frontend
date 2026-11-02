import { queryClient, saveSession } from '@/core/api';
import { AuthProvider, useAuth } from '@/modules/auth/AuthProvider';
import * as authRequests from '@/modules/auth/requests';
import * as organizationRequests from '@/modules/organizations/requests';
import { getContextOrganizationSlugFromLS, saveContextOrganizationSlugInLS } from '@/modules/organizations/utils';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import type { PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionProviders } from './App';

vi.mock('@/modules/auth/requests', () => ({
  login: vi.fn(),
  invalidateRefreshToken: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/modules/organizations/requests', () => ({
  getOrganizationBySlug: vi.fn(),
  getOrganizationUsers: vi.fn(),
}));
vi.mock('@/modules/clients/ClientsProvider', () => ({
  ClientsProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock('@/modules/projects/ProjectsProvider', () => ({
  ProjectsProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock('@/modules/workingTime/UnitWorkspaceProvider', () => ({
  UnitWorkspaceProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock('@/core/providers/toastProvider', () => ({
  __esModule: true,
  default: () => null,
  ToastProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock('@tanstack/react-query-devtools', () => ({ ReactQueryDevtools: () => null }));
vi.mock('@/app/routing/Router', () => ({
  __esModule: true,
  default: function SessionProbe() {
    const auth = useAuth();
    const workspace = useWorkspace();
    return (
      <>
        <output data-testid="user">{auth.loggedInUser?.id ?? ''}</output>
        <output data-testid="slug">{workspace.contextOrganizationSlug}</output>
        <output data-testid="has-workspace">{String(workspace.isContextOrganizationSlugInLocalStorage)}</output>
        <button onClick={() => void auth.logout()}>Log out</button>
        <button onClick={() => void auth.login('second@example.com', 'password')}>Log in</button>
      </>
    );
  },
}));

const tokenFor = (id: string): string =>
  `header.${btoa(JSON.stringify({ id, exp: Math.floor(Date.now() / 1000) + 3600, roles: [] }))}.signature`;

afterEach(() => {
  queryClient.clear();
  localStorage.clear();
  vi.clearAllMocks();
});

it('clears the mounted workspace on logout and does not reuse it for another user', async () => {
  saveSession(tokenFor('first-user'));
  saveContextOrganizationSlugInLS('acme');
  vi.mocked(organizationRequests.getOrganizationBySlug).mockResolvedValue({
    data: { id: 'org-1', name: 'Acme', slug: 'acme', archivedAt: null },
  } as Awaited<ReturnType<typeof organizationRequests.getOrganizationBySlug>>);
  vi.mocked(organizationRequests.getOrganizationUsers).mockResolvedValue({ data: [] } as unknown as Awaited<
    ReturnType<typeof organizationRequests.getOrganizationUsers>
  >);
  vi.mocked(authRequests.login).mockResolvedValue({ accessToken: tokenFor('second-user'), refreshToken: 'refresh' });

  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionProviders />
      </AuthProvider>
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getByTestId('slug')).toHaveTextContent('acme'));
  expect(screen.getByTestId('has-workspace')).toHaveTextContent('true');

  fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
  await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent(''));
  expect(screen.getByTestId('slug')).toBeEmptyDOMElement();
  expect(screen.getByTestId('has-workspace')).toHaveTextContent('false');
  expect(getContextOrganizationSlugFromLS()).toBeNull();

  const organizationLoads = vi.mocked(organizationRequests.getOrganizationBySlug).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('second-user'));
  const loginMutation = queryClient.getMutationCache().getAll().at(-1);
  expect(loginMutation?.state.variables).toEqual(expect.any(Function));
  expect(loginMutation?.state.data).toBeUndefined();
  expect(screen.getByTestId('slug')).toBeEmptyDOMElement();
  expect(screen.getByTestId('has-workspace')).toHaveTextContent('false');
  expect(organizationRequests.getOrganizationBySlug).toHaveBeenCalledTimes(organizationLoads);
});
