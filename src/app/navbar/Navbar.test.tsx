import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';

const { workspace, hasAccessInOrganization } = vi.hoisted(() => ({
  workspace: { contextOrganizationId: null as string | null },
  hasAccessInOrganization: vi.fn((organizationId: string) => organizationId === 'owner-workspace'),
}));

vi.mock('@/core/config/demo', () => ({ isDemo: true }));
vi.mock('@/modules/auth/AuthProvider', () => ({
  useAuth: () => ({ hasAccess: () => false, hasAccessInOrganization, userChosenLanguage: '' }),
}));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({ useWorkspace: () => workspace }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: {} }) }));
vi.mock('@/core/theme/logoImage', () => ({ default: () => null }));
vi.mock('./UserAvatarMenu', () => ({ default: () => null }));

it('updates owner navigation when the current workspace resolves or changes', () => {
  workspace.contextOrganizationId = null;
  const view = (
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );
  const { rerender } = render(view);
  expect(screen.queryByRole('link', { name: /common\.clients/ })).not.toBeInTheDocument();

  workspace.contextOrganizationId = 'owner-workspace';
  rerender(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: /common\.clients/ })).toHaveAttribute('href', '/clients');
  expect(screen.getByRole('link', { name: /common\.projects/ })).toHaveAttribute('href', '/projects');
  expect(screen.getByRole('link', { name: /common\.reports/ })).toHaveAttribute('href', '/report');

  workspace.contextOrganizationId = 'another-workspace';
  rerender(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('link', { name: /common\.clients/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /common\.projects/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /common\.reports/ })).not.toBeInTheDocument();
});
