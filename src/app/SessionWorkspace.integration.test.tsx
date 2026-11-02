import PermissionRoute from '@/app/routing/permissionRoute/PermissionRoute';
import { getRefreshToken, queryClient, saveRefreshToken, saveSession } from '@/core/api';
import { getRefreshedAccessToken } from '@/core/api/tokenRefresh';
import { ToastProvider } from '@/core/providers/toastProvider';
import { AuthProvider, useAuth } from '@/modules/auth/AuthProvider';
import * as authRequests from '@/modules/auth/requests';
import { RawOrganizationSchema } from '@/modules/organizations/models/organizationDto.model';
import * as orgRequests from '@/modules/organizations/requests';
import { OrganizationUserRole } from '@/modules/organizations/types';
import { saveContextOrganizationSlugInLS } from '@/modules/organizations/utils';
import { WorkspaceProvider } from '@/modules/organizations/WorkspaceProvider';
import { toProject, toProjectUser } from '@/modules/projects/modelProject';
import { RawProjectSchema, RawProjectUserSchema } from '@/modules/projects/models/projectDto.model';
import ProjectForm from '@/modules/projects/projectForm/ProjectForm';
import { ProjectsProvider, useProjects } from '@/modules/projects/ProjectsProvider';
import * as projectRequests from '@/modules/projects/requests';
import { ProjectUserRole } from '@/modules/projects/types';
import type { PropsWithChildren } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosHeaders, type AxiosResponse } from 'axios';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

vi.mock('@/modules/clients/ClientsProvider', () => ({
  useClients: () => ({
    clients: [],
    clientsOptions: [],
    selectedClient: null,
    setSelectedClient: vi.fn(),
    selectedFilterTypeMemberProject: 'All',
  }),
}));
vi.mock('@/modules/projects/requests', () => ({ getProjects: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/modules/auth/requests', () => ({ loginWithRefreshToken: vi.fn(), invalidateRefreshToken: vi.fn() }));
vi.mock('@/modules/organizations/requests', () => ({
  getOrganizationBySlug: vi.fn(),
  getOrganizationUsers: vi.fn(),
  getOrganizationUserProjects: vi.fn(),
}));

const accessToken = `header.${btoa(
  JSON.stringify({
    id: 'user-1',
    exp: 4102444800,
    identities: [],
    roles: [
      { organizationId: 'org-1', roles: ['Owner'] },
      { organizationId: 'org-2', roles: ['Owner'] },
    ],
  }),
)}.sig`;
const organization = RawOrganizationSchema.parse({ id: 'org-1', slug: 'acme', name: 'Acme' });

function response<T>(data: T): AxiosResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {}, config: { headers: new AxiosHeaders() } };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const AuthWrapper = ({ children }: PropsWithChildren): JSX.Element => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
};

// Match App's session boundary: changing user remounts workspace state, refreshing the same
// user's session preserves it. Both paths must receive the organization selected by SSO.
const SessionWorkspace = ({ children }: PropsWithChildren): JSX.Element => {
  const { loggedInUser } = useAuth();
  return <WorkspaceProvider key={loggedInUser?.id ?? 'anonymous'}>{children}</WorkspaceProvider>;
};

const SessionWrapper = ({ children }: PropsWithChildren): JSX.Element => {
  return (
    <AuthWrapper>
      <SessionWorkspace>{children}</SessionWorkspace>
    </AuthWrapper>
  );
};

beforeEach(() => {
  vi.mocked(orgRequests.getOrganizationBySlug).mockResolvedValue(response(organization));
  vi.mocked(orgRequests.getOrganizationUsers).mockResolvedValue(response([]));
  vi.mocked(orgRequests.getOrganizationUserProjects).mockResolvedValue(response([]));
  vi.mocked(projectRequests.getProjects).mockResolvedValue(response({ results: [], count: 0 }));
  vi.mocked(authRequests.invalidateRefreshToken).mockResolvedValue(response(undefined));
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  localStorage.clear();
  vi.resetAllMocks();
});

it('shares a token refresh between a permission change and the API interceptor', async () => {
  saveSession(accessToken);
  saveRefreshToken('same-token');
  const pending = deferred<Awaited<ReturnType<typeof authRequests.loginWithRefreshToken>>>();
  vi.mocked(authRequests.loginWithRefreshToken).mockReturnValue(pending.promise);
  const { result } = renderHook(useAuth, { wrapper: AuthWrapper });

  const interceptorRefresh = getRefreshedAccessToken('same-token');
  const permissionRefresh = result.current.refreshAfterPermissionGrant();
  expect(authRequests.loginWithRefreshToken).toHaveBeenCalledTimes(1);

  await act(async () => {
    pending.resolve({ accessToken, refreshToken: 'next-token' });
    await Promise.all([interceptorRefresh, permissionRefresh]);
  });
  expect(result.current.isAuthenticated).toBe(true);
  expect(getRefreshToken()).toBe('next-token');
});

it('keeps an authorized protected route while resolving an organization from its saved slug', async () => {
  saveSession(accessToken);
  saveContextOrganizationSlugInLS(organization.slug);
  const pending = deferred<Awaited<ReturnType<typeof orgRequests.getOrganizationBySlug>>>();
  vi.mocked(orgRequests.getOrganizationBySlug).mockReturnValue(pending.promise);
  render(
    <SessionWrapper>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/working-time" element={<div>Redirected home</div>} />
          <Route element={<PermissionRoute allowedRoles={[OrganizationUserRole.Owner]} />}>
            <Route path="/protected" element={<div>Protected screen</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionWrapper>,
  );

  expect(screen.queryByText('Redirected home')).not.toBeInTheDocument();
  await act(async () => {
    pending.resolve(response(organization));
    await pending.promise;
  });

  expect(await screen.findByText('Protected screen')).toBeInTheDocument();
  expect(screen.queryByText('Redirected home')).not.toBeInTheDocument();
});

// SSO session/workspace regressions now exercise the actual callback and keyed
// SessionProviders in SamlInvitation.integration.test.tsx.

it('preserves unsaved project fields and assignments after a successful token refresh', async () => {
  saveSession(accessToken);
  saveRefreshToken('refresh');
  saveContextOrganizationSlugInLS(organization.slug);
  vi.mocked(authRequests.loginWithRefreshToken).mockResolvedValue({ accessToken, refreshToken: 'next' });
  const project = toProject(
    RawProjectSchema.parse({
      id: 'project-1',
      name: 'Original',
      description: 'Original description',
      client: { id: 'client-1', name: 'Client' },
    }),
  );
  const owner = toProjectUser(RawProjectUserSchema.parse({ id: 'new-owner', role: ProjectUserRole.Owner }));
  const member = toProjectUser(RawProjectUserSchema.parse({ id: 'new-member', role: ProjectUserRole.Member }));
  let refreshPromise: Promise<void> | undefined;
  const ProjectEditor = (): JSX.Element => {
    const auth = useAuth();
    const projects = useProjects();
    return (
      <>
        <ProjectForm project={project} onCancel={vi.fn()} />
        <button
          onClick={() => {
            projects.setSelectedProjectOwners([owner]);
            projects.setSelectedProjectMembers([member]);
          }}
        >
          Change assignments
        </button>
        <button
          onClick={() => {
            refreshPromise = auth.refreshAfterPermissionGrant();
          }}
        >
          Refresh session
        </button>
        <output data-testid="owners">{projects.selectedProjectOwners.map(({ id }) => id).join(',')}</output>
        <output data-testid="members">{projects.selectedProjectMembers.map(({ id }) => id).join(',')}</output>
      </>
    );
  };
  render(
    <SessionWrapper>
      <ToastProvider>
        <ProjectsProvider>
          <ProjectEditor />
        </ProjectsProvider>
      </ToastProvider>
    </SessionWrapper>,
  );
  const nameInput = await screen.findByRole('textbox', { name: 'common.project_name' });
  await waitFor(() => expect(nameInput).toHaveValue('Original'));
  const descriptionInput = screen.getByRole('textbox', { name: /projects.common.project_description/ });

  fireEvent.change(nameInput, { target: { value: 'Unsaved name' } });
  fireEvent.change(descriptionInput, { target: { value: 'Unsaved description' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change assignments' }));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh session' }));
  expect(refreshPromise).toBeDefined();
  await act(async () => {
    await refreshPromise;
  });
  expect(getRefreshToken()).toBe('next');

  expect(nameInput).toHaveValue('Unsaved name');
  expect(descriptionInput).toHaveValue('Unsaved description');
  expect(screen.getByTestId('owners')).toHaveTextContent(owner.id);
  expect(screen.getByTestId('members')).toHaveTextContent(member.id);
});
