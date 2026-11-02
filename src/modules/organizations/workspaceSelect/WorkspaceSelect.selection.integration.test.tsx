import { paths } from '@/app/routing/paths';
import { queryClient, saveSession } from '@/core/api';
import { showModuleErrorToast } from '@/core/utils/helpers';
import { AuthProvider, useAuth } from '@/modules/auth/AuthProvider';
import * as authRequests from '@/modules/auth/requests';
import { RawOrganizationSchema } from '@/modules/organizations/models/organizationDto.model';
import * as requests from '@/modules/organizations/requests';
import { getContextOrganizationSlugFromLS } from '@/modules/organizations/utils';
import { useWorkspace, WorkspaceProvider } from '@/modules/organizations/WorkspaceProvider';
import type { PropsWithChildren } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AxiosHeaders, type AxiosResponse } from 'axios';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkspaceSelect from './WorkspaceSelect';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/core/utils/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/utils/helpers')>()),
  showModuleErrorToast: vi.fn(),
}));
vi.mock('@/modules/auth/requests', () => ({ invalidateRefreshToken: vi.fn() }));
vi.mock('@/modules/organizations/requests', () => ({
  getOrganizations: vi.fn(),
  getOrganizationBySlug: vi.fn(),
  getOrganizationUsers: vi.fn(),
  getOrganizationUserProjects: vi.fn(),
}));

const organization = RawOrganizationSchema.parse({ id: 'org-1', slug: 'acme', name: 'Acme' });
const otherOrganization = RawOrganizationSchema.parse({ id: 'org-2', slug: 'other', name: 'Other' });
const defaults = queryClient.getDefaultOptions();

function response<T>(data: T): AxiosResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {}, config: { headers: new AxiosHeaders() } };
}

function WorkspaceBoundary({ children }: PropsWithChildren): JSX.Element {
  const { loggedInUser } = useAuth();
  return <WorkspaceProvider key={loggedInUser?.id ?? 'anonymous'}>{children}</WorkspaceProvider>;
}

function Chooser(): JSX.Element {
  const { isAuthenticated } = useAuth();
  const { resetContextOrganizationId } = useWorkspace();
  const { pathname } = useLocation();
  return (
    <>
      <output data-testid="location">{pathname}</output>
      <button onClick={resetContextOrganizationId}>Reset workspace</button>
      {isAuthenticated && <WorkspaceSelect />}
    </>
  );
}

function renderChooser(): void {
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WorkspaceBoundary>
          <MemoryRouter initialEntries={['/chooser']}>
            <Chooser />
          </MemoryRouter>
        </WorkspaceBoundary>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryClient.setDefaultOptions({ queries: { retry: false } });
  saveSession(`header.${btoa(JSON.stringify({ id: 'user-1', exp: 4102444800, identities: [], roles: [] }))}.sig`);
  vi.mocked(requests.getOrganizations).mockResolvedValue(
    response({ results: [organization, otherOrganization], count: 2 }),
  );
  vi.mocked(requests.getOrganizationUsers).mockResolvedValue(response([]));
  vi.mocked(requests.getOrganizationUserProjects).mockResolvedValue(response([]));
  vi.mocked(authRequests.invalidateRefreshToken).mockResolvedValue(response(undefined));
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  queryClient.setDefaultOptions(defaults);
  localStorage.clear();
  vi.resetAllMocks();
});

it('reports a failed selection once, stays in the chooser, and allows retry', async () => {
  const error = Object.assign(new Error('unavailable'), { isAxiosError: true, response: { status: 500 } });
  vi.mocked(requests.getOrganizationBySlug).mockRejectedValueOnce(error).mockResolvedValue(response(organization));
  renderChooser();

  fireEvent.click(await screen.findByText('Acme'));

  await waitFor(() => expect(showModuleErrorToast).toHaveBeenCalledExactlyOnceWith(error, expect.any(Object)));
  expect(screen.getByTestId('location')).toHaveTextContent('/chooser');
  expect(getContextOrganizationSlugFromLS()).toBeNull();

  fireEvent.click(screen.getByText('Acme'));

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(paths.index));
  expect(getContextOrganizationSlugFromLS()).toBe('acme');
  expect(showModuleErrorToast).toHaveBeenCalledTimes(1);
});

it.each(['reset', 'logout'] as const)(
  'ignores a selection cancelled by %s, including a late response',
  async (action) => {
    let resolve!: (value: Awaited<ReturnType<typeof requests.getOrganizationBySlug>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof requests.getOrganizationBySlug>>>((done) => {
      resolve = done;
    });
    vi.mocked(requests.getOrganizationBySlug).mockReturnValue(pending);
    renderChooser();
    fireEvent.click(await screen.findByText('Acme'));
    await waitFor(() => expect(requests.getOrganizationBySlug).toHaveBeenCalledWith('acme'));

    fireEvent.click(screen.getByRole('button', { name: action === 'reset' ? 'Reset workspace' : 'common.logout' }));
    const destination = screen.getByTestId('location').textContent;
    await act(async () => {
      resolve(response(organization));
      await pending;
    });

    expect(showModuleErrorToast).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(destination ?? '');
    expect(screen.getByTestId('location')).not.toHaveTextContent(paths.index);
    expect(getContextOrganizationSlugFromLS()).toBeNull();
  },
);
