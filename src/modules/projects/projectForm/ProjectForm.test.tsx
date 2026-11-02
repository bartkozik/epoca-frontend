import type { Project } from '@/modules/projects/types';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProjectForm from './ProjectForm';

const {
  clearAllProjectUsers,
  loading,
  mutateUpdate,
  showModuleErrorToast,
  loggedInUser,
  organizationUsers,
  setSelectedProjectMembers,
  setSelectedProjectOwners,
} = vi.hoisted(() => ({
  clearAllProjectUsers: vi.fn(),
  loading: { background: false, initial: false },
  mutateUpdate: vi.fn(),
  showModuleErrorToast: vi.fn(),
  loggedInUser: { id: 'user-1' },
  organizationUsers: [
    { id: 'user-1', firstName: 'Ada', lastName: 'Lovelace', identities: [], organizationRoles: [], archived: false },
  ],
  setSelectedProjectMembers: vi.fn(),
  setSelectedProjectOwners: vi.fn(),
}));

vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => ({ loggedInUser }) }));

vi.mock('@/modules/projects/ProjectsProvider', () => ({
  useProjects: () => ({
    clearAllProjectUsers,
    handleUserAction: vi.fn(),
    initializeProjectData: vi.fn(),
    projects: [],
    selectedProjectMembers: [{ id: 'member-1' }],
    selectedProjectOwners: [{ id: 'owner-1' }],
    setSelectedProjectMembers,
    setSelectedProjectOwners,
  }),
}));
vi.mock('@/modules/projects/hooks/useUpdateProjectMutation', () => ({
  useUpdateProjectMutation: () => ({ mutate: mutateUpdate, isPending: false }),
}));
vi.mock('@/modules/projects/hooks/useCreateProjectMutation', () => ({
  useCreateProjectMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    fetchContextOrganizationUsers: () => Promise.resolve(organizationUsers),
    get isLoadingContextOrganizationUsers() {
      return loading.background;
    },
    get isInitialLoadingContextOrganizationUsers() {
      return loading.initial;
    },
  }),
}));
vi.mock('@/modules/clients/ClientsProvider', () => ({
  useClients: () => ({ clients: [], clientsOptions: [], selectedClient: null, setSelectedClient: vi.fn() }),
}));
vi.mock('@/core/providers/toastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('@/core/utils/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/utils/helpers')>()),
  showModuleErrorToast,
}));
vi.mock('@/modules/projects/projectUserSearch', () => ({ default: () => null }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => {
  vi.clearAllMocks();
  loading.background = false;
  loading.initial = false;
  organizationUsers.splice(0, organizationUsers.length, {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    identities: [],
    organizationRoles: [],
    archived: false,
  });
});

it('preselects the logged-in organization user as owner when creating a project', async () => {
  render(<ProjectForm onCancel={vi.fn()} />);

  await waitFor(() =>
    expect(setSelectedProjectOwners).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'user-1', fullName: 'Ada Lovelace' }),
    ]),
  );
});

it('clears members left over from a previously opened project form when creating a project', async () => {
  render(<ProjectForm onCancel={vi.fn()} withoutClientSelect />);

  expect(setSelectedProjectMembers).toHaveBeenCalledWith([]);
  await waitFor(() => expect(setSelectedProjectOwners).toHaveBeenCalled());
});

it('does not clear the members of the project being edited', async () => {
  render(<ProjectForm project={{ id: 'project-1', name: 'Project', description: '' } as Project} onCancel={vi.fn()} />);

  await waitFor(() => expect(screen.getByRole('textbox', { name: 'common.project_name' })).toHaveValue('Project'));
  expect(setSelectedProjectMembers).not.toHaveBeenCalled();
});

it('keeps the project form and its draft mounted during a background users refresh', () => {
  const project = { id: 'project-1', name: 'Project', description: '' } as Project;
  const onCancel = vi.fn();
  const view = render(<ProjectForm project={project} onCancel={onCancel} />);
  const nameInput = screen.getByRole('textbox', { name: 'common.project_name' });
  fireEvent.change(nameInput, { target: { value: 'Unsaved name' } });

  loading.background = true;
  view.rerender(<ProjectForm project={project} onCancel={onCancel} />);

  expect(screen.getByRole('textbox', { name: 'common.project_name' })).toBe(nameInput);
  expect(nameInput).toHaveValue('Unsaved name');
});

it('keeps selected owners and members available for retry when project update fails', async () => {
  const onCancel = vi.fn();
  render(
    <ProjectForm project={{ id: 'project-1', name: 'Project', description: '' } as Project} onCancel={onCancel} />,
  );

  await waitFor(() => expect(screen.getByRole('textbox', { name: 'common.project_name' })).toHaveValue('Project'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

  expect(mutateUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ memberIds: ['member-1'], ownerIds: ['owner-1'] }),
    expect.any(Object),
  );
  expect(clearAllProjectUsers).not.toHaveBeenCalled();

  const callbacks = mutateUpdate.mock.calls[0][1] as { onError: (error: Error) => void };
  act(() => callbacks.onError(new Error('update failed')));
  expect(clearAllProjectUsers).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
});
