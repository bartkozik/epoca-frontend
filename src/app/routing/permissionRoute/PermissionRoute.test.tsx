import { useAuth } from '@/modules/auth/AuthProvider';
import { OrganizationUserRole } from '@/modules/organizations/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import PermissionRoute from './PermissionRoute';

vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({ useWorkspace: vi.fn() }));

const useAuthMock = vi.mocked(useAuth);
const useWorkspaceMock = vi.mocked(useWorkspace);

interface AuthStub {
  hasAccessInOrganization: (organizationId: string, allowedRoles: OrganizationUserRole[]) => boolean;
  isResolvingCurrentOrganization: boolean;
}

const renderProtectedRoute = (auth: AuthStub): void => {
  useAuthMock.mockReturnValue(auth as unknown as ReturnType<typeof useAuth>);
  useWorkspaceMock.mockReturnValue({
    contextOrganizationId: auth.isResolvingCurrentOrganization ? null : 'workspace-1',
    contextOrganizationLoadFailure: null,
    isContextOrganizationSlugInLocalStorage: auth.isResolvingCurrentOrganization,
  } as ReturnType<typeof useWorkspace>);

  render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/working-time" element={<div>redirected home</div>} />
        <Route element={<PermissionRoute allowedRoles={[OrganizationUserRole.Owner]} />}>
          <Route path="/protected" element={<div>protected content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
};

describe('PermissionRoute', () => {
  it('shows a loading state while the current organization is still resolving, without rendering content or redirecting', () => {
    renderProtectedRoute({ hasAccessInOrganization: vi.fn(() => true), isResolvingCurrentOrganization: true });

    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    expect(screen.queryByText('redirected home')).not.toBeInTheDocument();
  });

  it('renders the protected content once resolved and access is granted', () => {
    renderProtectedRoute({ hasAccessInOrganization: vi.fn(() => true), isResolvingCurrentOrganization: false });

    expect(screen.getByText('protected content')).toBeInTheDocument();
  });

  it('redirects to the index path once resolved and access is denied (does not hang)', () => {
    renderProtectedRoute({ hasAccessInOrganization: vi.fn(() => false), isResolvingCurrentOrganization: false });

    expect(screen.getByText('redirected home')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });
});
