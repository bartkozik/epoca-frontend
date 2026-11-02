import { webcrypto } from 'node:crypto';
import { ProjectUser, ProjectUserRole } from '@/modules/projects/types';
import { User } from '@/modules/users/types';
import { fireEvent, render, screen } from '@testing-library/react';
import ProjectUserSearch from './ProjectUserSearch';

let testContexts: Record<string, unknown> = {};
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => testContexts.authContext }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => testContexts.workspaceContext,
}));
vi.mock('@/modules/clients/ClientsProvider', () => ({ useClients: () => testContexts.clientsContext }));
vi.mock('@/modules/projects/ProjectsProvider', () => ({ useProjects: () => testContexts.projectsContext }));
vi.mock('@/core/providers/toastProvider', () => ({
  addToast: vi.fn(),
  useToast: () => testContexts.toastContext ?? { addToast: vi.fn() },
}));
const setContexts = (value: Record<string, unknown>): void => {
  testContexts = value;
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

interface AvailableUser {
  id: string;
  displayedName: string;
  email: string;
}

const renderProjectUserSearch = (
  availableUsers: AvailableUser[],
  selectedProjectMembers: { id: string }[] = [],
  selectedProjectOwners: { id: string }[] = [],
  label = ProjectUserRole.Member,
  loggedInUserId?: string,
): void => {
  setContexts({
    authContext: { loggedInUser: loggedInUserId ? { id: loggedInUserId } : undefined },
    workspaceContext: {
      availableToAddContextOrganizationUsers: availableUsers,
      contextOrganizationUsers: availableUsers,
    },
    projectsContext: { selectedProjectMembers, selectedProjectOwners },
  });

  render(
    <ProjectUserSearch
      handleUserAction={vi.fn()}
      label={label}
      placeholder="Search users"
      selectedUsers={[] as User[]}
    />,
  );
};

describe('ProjectUserSearch', () => {
  it('uses available organization emails for selected project avatars', async () => {
    vi.stubGlobal('crypto', webcrypto);
    setContexts({
      authContext: {},
      workspaceContext: {
        availableToAddContextOrganizationUsers: [],
        contextOrganizationUsers: [{ id: 'user-1', email: 'ada@example.com' }],
      },
      projectsContext: { selectedProjectMembers: [], selectedProjectOwners: [] },
    });
    try {
      render(
        <ProjectUserSearch
          handleUserAction={vi.fn()}
          label={ProjectUserRole.Member}
          selectedUsers={[{ id: 'user-1', fullName: 'Ada Lovelace', avatar: '' } as ProjectUser]}
        />,
      );
      expect((await screen.findByRole('img', { name: 'Ada Lovelace' })).getAttribute('src')).toMatch(
        /^https:\/\/gravatar.com\/avatar\/[a-f0-9]{64}\?/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an all-users-added message when no users are available', () => {
    renderProjectUserSearch([]);

    fireEvent.click(screen.getByRole('button', { name: '+' }));
    fireEvent.click(screen.getByRole('textbox'));

    expect(screen.getByText('projects.project_user_search.text.all_users_added')).toBeInTheDocument();
  });

  it('shows a no-matching-users message when the query has no matches', () => {
    renderProjectUserSearch([{ id: 'user-1', displayedName: 'Anna Kowalska', email: 'anna@example.com' }]);

    fireEvent.click(screen.getByRole('button', { name: '+' }));
    fireEvent.click(screen.getByRole('textbox'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'missing' } });

    expect(screen.getByText('projects.project_user_search.text.no_matching_users')).toBeInTheDocument();
  });

  it('excludes members from the owner picker', () => {
    renderProjectUserSearch(
      [{ id: 'user-1', displayedName: 'Anna Kowalska', email: 'anna@example.com' }],
      [{ id: 'user-1' }],
      [],
      ProjectUserRole.Owner,
    );

    fireEvent.click(screen.getByRole('button', { name: '+' }));
    fireEvent.click(screen.getByRole('textbox'));
    expect(screen.queryByText('Anna Kowalska')).not.toBeInTheDocument();
  });

  it('excludes other owners from the member picker but retains the logged-in owner', () => {
    renderProjectUserSearch(
      [
        { id: 'self', displayedName: 'Current User', email: 'self@example.com' },
        { id: 'other', displayedName: 'Other Owner', email: 'other@example.com' },
      ],
      [],
      [{ id: 'self' }, { id: 'other' }],
      ProjectUserRole.Member,
      'self',
    );

    fireEvent.click(screen.getByRole('button', { name: '+' }));
    fireEvent.click(screen.getByRole('textbox'));
    expect(screen.getByText('Current User')).toBeInTheDocument();
    expect(screen.queryByText('Other Owner')).not.toBeInTheDocument();
  });
});
