import { webcrypto } from 'node:crypto';
import { getProjectUserRoleOptions } from '@/core/utils/options';
import * as requests from '@/modules/projects/requests';
import { ProjectUserRole } from '@/modules/projects/types';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AssignedMemberTable from './AssignedMemberTable';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('i18next', () => ({ __esModule: true, default: { t: (key: string) => key } }));

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

vi.mock('@/modules/projects/requests', () => ({ addUser: vi.fn(), removeUser: vi.fn() }));
const addUserMock = requests.addUser as unknown as ReturnType<typeof vi.fn>;
const removeUserMock = requests.removeUser as unknown as ReturnType<typeof vi.fn>;

const addToastMock = vi.fn();
const getProjectByIdMock = vi.fn();

const makeUsers = (): Record<
  'member' | 'owner',
  { id: string; role: ProjectUserRole; firstName: string; lastName: string; fullName: string; avatar: string }
> => ({
  member: {
    id: 'user-1',
    role: ProjectUserRole.Member,
    firstName: 'Jan',
    lastName: 'Kowalski',
    fullName: 'Jan Kowalski',
    avatar: '',
  },
  owner: {
    id: 'user-2',
    role: ProjectUserRole.Owner,
    firstName: 'Anna',
    lastName: 'Nowak',
    fullName: 'Anna Nowak',
    avatar: '',
  },
});

const renderTable = (): ReturnType<typeof render> => {
  const { member, owner } = makeUsers();
  setContexts({
    workspaceContext: {
      contextOrganizationSlug: 'acme',
      contextOrganizationUsers: [{ id: 'user-1', email: 'jan@example.com' }],
    },
    projectsContext: {
      setSelectedProject: vi.fn(),
      canUserEditProject: () => true,
      getProjectById: getProjectByIdMock,
      getSelectedUserRoleOption: (userId: string) =>
        getProjectUserRoleOptions().find((o) => o.value === [member, owner].find((u) => u.id === userId)?.role),
      openAssignProjectUserModal: vi.fn(),
      selectedProject: { id: 'project-1', archived: false, createdBy: 'user-0', projectUsers: [member, owner] },
      selectedProjectUsers: [owner, member],
    },
    toastContext: { addToast: addToastMock },
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AssignedMemberTable />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const findRow = (name: string): HTMLElement => {
  const row = screen.getAllByRole('row').find((r) => within(r).queryAllByText(name).length > 0);
  if (!row) throw new Error(`No row found for ${name}`);
  return row;
};

describe('AssignedMemberTable', () => {
  it('uses the already loaded organization email for a project member avatar', async () => {
    vi.stubGlobal('crypto', webcrypto);
    try {
      renderTable();
      const image = await screen.findByRole('img', { name: 'Jan Kowalski' });
      expect(image.getAttribute('src')).toMatch(/^https:\/\/gravatar.com\/avatar\/[a-f0-9]{64}\?/);
      expect(screen.queryByRole('img', { name: 'Anna Nowak' })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes a user through the local confirmation modal', async () => {
    removeUserMock.mockResolvedValueOnce(undefined);
    renderTable();

    const row = findRow('Anna Nowak');
    fireEvent.click(within(row).getAllByRole('button', { name: /common\.remove/ })[0]);

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'common.remove' }));

    await waitFor(() => expect(removeUserMock).toHaveBeenCalledWith('acme', 'user-2', 'project-1'));
    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith({ content: 'toast_message.users.user_deassigned' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('changes a user role via the select', async () => {
    addUserMock.mockResolvedValueOnce(undefined);
    renderTable();

    const row = findRow('Jan Kowalski');
    fireEvent.click(within(row).getAllByRole('combobox')[0]);
    fireEvent.click(within(row).getAllByText('common.owner')[0]);

    await waitFor(() => expect(addUserMock).toHaveBeenCalledWith('acme', 'user-1', 'project-1', ProjectUserRole.Owner));
    await waitFor(() =>
      expect(addToastMock).toHaveBeenCalledWith({ content: 'toast_message.users.user_role_change_success' }),
    );
  });

  it('skips the request when the selected role matches the current one', () => {
    renderTable();

    const row = findRow('Jan Kowalski');
    fireEvent.click(within(row).getAllByRole('combobox')[0]);
    fireEvent.click(within(row).getAllByText('common.member')[0]);

    expect(addUserMock).not.toHaveBeenCalled();
  });
});
