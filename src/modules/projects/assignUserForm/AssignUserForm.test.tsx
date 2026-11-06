import * as requests from '@/modules/projects/requests';
import { ProjectUserRole } from '@/modules/projects/types';
import type { User } from '@/modules/users/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AssignUserForm from './AssignUserForm';

vi.mock('@/modules/projects/requests', () => ({ addUser: vi.fn() }));
const addUserMock = requests.addUser as unknown as ReturnType<typeof vi.fn>;

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

vi.mock('i18next', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

const selectedUser: User = {
  archived: false,
  archivedAt: '',
  avatar: '',
  color: '',
  createdAt: '',
  displayedName: 'Adam Jankowski',
  email: 'adam@example.com',
  firstName: 'Adam',
  fullName: 'Adam Jankowski',
  id: 'user-1',
  identities: [],
  isLoggedInUser: false,
  isSuperAdmin: false,
  lastName: 'Jankowski',
  modifiedAt: '',
  projects: [],
};

let queryClient: QueryClient;
const renderWithProvider = (ui: JSX.Element): ReturnType<typeof render> =>
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

describe('AssignUserForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('clears the selected user and disables submission when the selected name is edited', () => {
    let selectedUserState: User | null = selectedUser;
    const setSelectedProjectUser = vi.fn((user: User | null) => {
      selectedUserState = user;
    });

    setContexts({
      workspaceContext: {
        availableUsersOptions: [{ label: 'Adam Jankowski', value: 'user-1' }],
        contextOrganizationUsers: [],
        fetchContextOrganizationUsers: vi.fn(),
        isLoadingContextOrganizationUsers: false,
      },
      projectsContext: {
        closeAssignProjectUserModal: vi.fn(),
        selectedProject: { id: 'project-1' },
        get selectedProjectUser() {
          return selectedUserState;
        },
        selectedProjectUserRoleOption: undefined,
        selectedUserRole: null,
        setSelectedProjectUser,
        setSelectedUserRole: vi.fn(),
      },
      toastContext: { addToast: vi.fn() },
    });

    const view = renderWithProvider(<AssignUserForm onCancel={vi.fn()} />);

    const submitButton = screen.getByRole('button', { name: 'projects.common.assign_user' });
    expect(submitButton).toBeEnabled();

    fireEvent.change(screen.getByPlaceholderText('projects.assign_user_form.search.assign_list.placeholder'), {
      target: { value: '' },
    });

    expect(setSelectedProjectUser).toHaveBeenCalledWith(null);
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <AssignUserForm onCancel={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(submitButton).toBeDisabled();
  });

  it('disables the submit button while the assign mutation is in flight, to prevent duplicate submits', async () => {
    let resolveAddUser: () => void = () => {};
    addUserMock.mockReturnValue(new Promise<void>((resolve) => (resolveAddUser = resolve)));

    setContexts({
      workspaceContext: {
        availableUsersOptions: [],
        contextOrganizationUsers: [],
        fetchContextOrganizationUsers: vi.fn(),
        isLoadingContextOrganizationUsers: false,
      },
      projectsContext: {
        closeAssignProjectUserModal: vi.fn(),
        selectedProject: { id: 'project-1' },
        selectedProjectUser: selectedUser,
        selectedProjectUserRoleOption: { value: ProjectUserRole.Member, label: 'Member' },
        selectedUserRole: ProjectUserRole.Member,
        setSelectedProjectUser: vi.fn(),
        setSelectedUserRole: vi.fn(),
      },
      toastContext: { addToast: vi.fn() },
    });

    renderWithProvider(<AssignUserForm onCancel={vi.fn()} />);

    const submitButton = screen.getByRole('button', { name: 'projects.common.assign_user' });
    expect(submitButton).toBeEnabled();

    fireEvent.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());

    resolveAddUser();
    await waitFor(() => expect(submitButton).toBeEnabled());
  });

  it('does not offer users already assigned to the selected project', () => {
    setContexts({
      workspaceContext: {
        contextOrganizationUsers: [
          { id: 'user-1', displayedName: 'Adam Jankowski', email: 'adam@example.com', archived: false },
          { id: 'user-2', displayedName: 'Anna Nowak', email: 'anna@example.com', archived: false },
        ],
        fetchContextOrganizationUsers: vi.fn(),
        isLoadingContextOrganizationUsers: false,
      },
      projectsContext: {
        selectedProject: { id: 'project-1', projectUsers: [{ id: 'user-1' }] },
        selectedProjectUser: null,
        selectedProjectUserRoleOption: undefined,
        selectedUserRole: ProjectUserRole.Member,
        setSelectedProjectUser: vi.fn(),
        setSelectedUserRole: vi.fn(),
      },
      toastContext: { addToast: vi.fn() },
    });

    renderWithProvider(<AssignUserForm onCancel={vi.fn()} />);
    fireEvent.click(screen.getByPlaceholderText('projects.assign_user_form.search.assign_list.placeholder'));

    expect(screen.queryByText('Adam Jankowski')).not.toBeInTheDocument();
    expect(screen.getByText('Anna Nowak')).toBeInTheDocument();
  });

  it('keeps the user picker mounted during a background users refresh', () => {
    const workspaceContext = {
      contextOrganizationUsers: [],
      fetchContextOrganizationUsers: vi.fn(),
      isInitialLoadingContextOrganizationUsers: false,
      isLoadingContextOrganizationUsers: false,
    };
    setContexts({
      workspaceContext,
      projectsContext: {
        selectedProject: { id: 'project-1' },
        selectedProjectUser: null,
        selectedProjectUserRoleOption: undefined,
        selectedUserRole: null,
        setSelectedProjectUser: vi.fn(),
        setSelectedUserRole: vi.fn(),
      },
      toastContext: { addToast: vi.fn() },
    });

    const onCancel = vi.fn();
    const view = renderWithProvider(<AssignUserForm onCancel={onCancel} />);
    const searchInput = screen.getByPlaceholderText('projects.assign_user_form.search.assign_list.placeholder');
    fireEvent.change(searchInput, { target: { value: 'Draft search' } });

    workspaceContext.isLoadingContextOrganizationUsers = true;
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <AssignUserForm onCancel={onCancel} />
      </QueryClientProvider>,
    );

    expect(screen.getByPlaceholderText('projects.assign_user_form.search.assign_list.placeholder')).toBe(searchInput);
    expect(searchInput).toHaveValue('Draft search');
  });
});
