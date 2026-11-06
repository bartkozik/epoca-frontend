import { useAuth } from '@/modules/auth/AuthProvider';
import { OrganizationUserRole } from '@/modules/organizations/types';
import { Suspense } from 'react';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { guarded } from './index';

vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    contextOrganizationId: 'workspace-1',
    contextOrganizationLoadFailure: null,
    isContextOrganizationSlugInLocalStorage: true,
  }),
}));

const useAuthMock = vi.mocked(useAuth);

const ownerOnlyRoute = guarded(
  [OrganizationUserRole.Owner],
  [{ path: '/owner-only', element: <div>owner content</div> }],
);

const RoutesUnderTest = (): JSX.Element | null => useRoutes([ownerOnlyRoute]);

describe('guarded', () => {
  it('renders the child route when the role is allowed', async () => {
    useAuthMock.mockReturnValue({
      hasAccessInOrganization: (_organizationId: string, roles: OrganizationUserRole[]) =>
        roles.includes(OrganizationUserRole.Owner),
    } as unknown as ReturnType<typeof useAuth>);

    render(
      <MemoryRouter initialEntries={['/owner-only']}>
        {
}
        <Suspense fallback={null}>
          <RoutesUnderTest />
        </Suspense>
      </MemoryRouter>,
    );

    expect(await screen.findByText('owner content')).toBeInTheDocument();
  });

  it('redirects when the role is not allowed', async () => {
    useAuthMock.mockReturnValue({ hasAccessInOrganization: () => false } as unknown as ReturnType<typeof useAuth>);

    render(
      <MemoryRouter initialEntries={['/owner-only']}>
        <Suspense fallback={null}>
          <RoutesUnderTest />
        </Suspense>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.queryByText('owner content')).not.toBeInTheDocument());
  });
});
