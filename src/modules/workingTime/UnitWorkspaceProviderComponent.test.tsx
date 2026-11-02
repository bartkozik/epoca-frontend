import { act, renderHook } from '@testing-library/react';
import { WorkUnitEntryType, type ReportedUnit } from './types';
import { useUnitWorkspace } from './UnitWorkspaceContext';
import { UnitWorkspaceProvider } from './UnitWorkspaceProviderComponent';

const { deleteUnitMock } = vi.hoisted(() => ({ deleteUnitMock: vi.fn() }));
const { showDeleteErrorToastMock } = vi.hoisted(() => ({ showDeleteErrorToastMock: vi.fn() }));

vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => ({ loggedInUser: { id: 'user-1' } }) }));
vi.mock('@/modules/clients/ClientsProvider', () => ({ useClients: () => ({ clients: [] }) }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));
vi.mock('@/modules/projects/ProjectsProvider', () => ({
  useProjects: () => ({ projects: [], reportedProjects: [] }),
}));
vi.mock('@/modules/workingTime/hooks/useDeleteUnitMutation', () => ({
  useDeleteUnitMutation: () => ({ mutate: deleteUnitMock }),
}));
vi.mock('./showUnitDeleteErrorToast', () => ({ showUnitDeleteErrorToast: showDeleteErrorToastMock }));

beforeEach(() => vi.clearAllMocks());

it('keeps reminder actions stable while opening and closing the reminder', () => {
  const { result } = renderHook(useUnitWorkspace, { wrapper: UnitWorkspaceProvider });
  const open = result.current.openUnreportedDraftsWarning;
  const close = result.current.closeUnreportedDraftsWarning;

  act(() => open(true));
  expect(result.current.isUnreportedDraftsWarningOpen).toBe(true);
  expect(result.current.openUnreportedDraftsWarning).toBe(open);
  expect(result.current.closeUnreportedDraftsWarning).toBe(close);

  act(() => close());
  expect(result.current.isUnreportedDraftsWarningOpen).toBe(false);
  expect(result.current.openUnreportedDraftsWarning).toBe(open);
  expect(result.current.closeUnreportedDraftsWarning).toBe(close);
});

it('sends reported unit deletion through the shared mutation', () => {
  const { result } = renderHook(useUnitWorkspace, { wrapper: UnitWorkspaceProvider });

  act(() => result.current.openArchiveReportedUnitConfirm({ id: 'unit-1' } as ReportedUnit, new Date()));
  act(() => result.current.handleArchiveSelectedUnit());

  expect(deleteUnitMock).toHaveBeenCalledWith({ workUnitId: 'unit-1' }, expect.any(Object));
});

it('keeps the archive confirmation open and reports the error when deleting a unit fails', () => {
  const { result } = renderHook(useUnitWorkspace, { wrapper: UnitWorkspaceProvider });
  act(() => result.current.openArchiveUnitConfirmation({ id: 'draft-1' } as ReportedUnit));
  act(() => result.current.handleArchiveSelectedUnit());

  const options = deleteUnitMock.mock.calls[0][1] as { onError: (error: Error) => void };
  act(() => options.onError(new Error('delete failed')));

  expect(result.current.isArchiveUnitConfirmOpen).toBe(true);
  expect(showDeleteErrorToastMock).toHaveBeenCalledOnce();
});

it('loads note data into the edit form and resets it to a new worklog when closed', () => {
  const { result } = renderHook(useUnitWorkspace, { wrapper: UnitWorkspaceProvider });
  const unit = {
    description: 'Reminder note',
    entryType: WorkUnitEntryType.Note,
    formattedDuration: '0:00',
    id: 'note-1',
    taskId: '',
    userId: 'user-1',
  } as never;

  act(() => result.current.initializeUnitFormData(unit));
  expect(result.current).toMatchObject({
    unitDescription: 'Reminder note',
    selectedEntryType: WorkUnitEntryType.Note,
    reportedHours: '0:00',
    unitCreatorId: 'user-1',
  });

  act(() => result.current.closeModal());
  expect(result.current).toMatchObject({
    modalConfig: { isOpen: false, type: null, date: null, unit: null },
    unitDescription: '',
    reportedHours: '',
    taskId: '',
    unitCreatorId: '',
    selectedEntryType: WorkUnitEntryType.Worklog,
  });
});

it('opens edit mode with the supplied unit and its calendar date', () => {
  const { result } = renderHook(useUnitWorkspace, { wrapper: UnitWorkspaceProvider });
  const date = '2026-07-28';
  const unit = { date, id: 'unit-1' } as never;

  act(() => result.current.handleUnitEditFormOpen(unit));

  expect(result.current.modalConfig).toEqual({ isOpen: true, type: 'edit', date: new Date(date), unit });
});

it('falls back to the unit project data when the project is missing from the project lists', () => {
  const { result } = renderHook(useUnitWorkspace, { wrapper: UnitWorkspaceProvider });
  const unit = {
    entryType: WorkUnitEntryType.Worklog,
    formattedDuration: '1:00',
    id: 'unit-1',
    projectClient: {
      clientColor: '#123456',
      clientId: 'client-1',
      clientName: 'Acme',
      projectId: 'project-1',
      projectName: 'Detached project',
    },
    userId: 'user-1',
  } as never;

  act(() => result.current.initializeUnitFormData(unit));

  expect(result.current.selectedClientAndProject).toEqual({
    projectId: 'project-1',
    clientName: 'Acme',
    projectName: 'Detached project',
    clientColor: '#123456',
  });
});

it('keeps the unit project id for saving after editing the description of a detached-project unit', () => {
  const { result } = renderHook(useUnitWorkspace, { wrapper: UnitWorkspaceProvider });
  const unit = {
    description: 'Original description',
    entryType: WorkUnitEntryType.Worklog,
    formattedDuration: '1:00',
    id: 'unit-1',
    projectClient: {
      clientColor: '#123456',
      clientId: 'client-1',
      clientName: 'Acme',
      projectId: 'project-1',
      projectName: 'Detached project',
    },
    userId: 'user-1',
  } as never;

  act(() => result.current.initializeUnitFormData(unit));
  act(() => result.current.setUnitDescription('Updated description'));

  expect(result.current.unitDescription).toBe('Updated description');
  expect(result.current.selectedClientAndProject).toEqual({
    projectId: 'project-1',
    clientName: 'Acme',
    projectName: 'Detached project',
    clientColor: '#123456',
  });
  expect(result.current.getContextualClientProject(true)).toMatchObject({ id: 'project-1' });
});
