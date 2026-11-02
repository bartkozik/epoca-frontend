import { RawUnit, Unit, UnitState, WorkUnitEntryType } from '@/modules/workingTime/types';
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Mock } from 'vitest';
import Calendar from './Calendar';
import type { UseWorkUnitSubmissionResult } from './UnitForm/useWorkUnitSubmission';

const providerMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clients: vi.fn(),
  projects: vi.fn(),
  toast: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: providerMocks.auth }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({ useWorkspace: providerMocks.workspace }));
vi.mock('@/modules/clients/ClientsProvider', () => ({ useClients: providerMocks.clients }));
vi.mock('@/modules/projects/ProjectsProvider', () => ({ useProjects: providerMocks.projects }));
vi.mock('@/core/providers/toastProvider/ToastProvider', () => ({ useToast: providerMocks.toast }));
const workspaceUiMocks = vi.hoisted(
  (): { modalConfig: Record<string, unknown>; appendNewUnit: Mock; addedUnit: RawUnit | null } => ({
    modalConfig: { type: null },
    appendNewUnit: vi.fn(),
    addedUnit: null,
  }),
);

vi.mock('../UnitWorkspaceProvider', () => ({
  useUnitWorkspace: () => ({
    closeModal: vi.fn(),
    handleDeleteConfirmationCancel: vi.fn(),
    handleUnitAddFormOpen: vi.fn(),
    modalConfig: workspaceUiMocks.modalConfig,
  }),
}));

vi.mock('@/core/theme/modal', () => ({
  __esModule: true,
  default: ({ children, isOpen }: { children: ReactNode; isOpen: boolean }) => (isOpen ? <>{children}</> : null),
}));

vi.mock('./UnitForm', () => ({
  __esModule: true,
  default: ({ onUnitAdded }: { onUnitAdded?: (unit: RawUnit) => void }) => (
    <button type="button" onClick={() => workspaceUiMocks.addedUnit && onUnitAdded?.(workspaceUiMocks.addedUnit)}>
      save unit
    </button>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/core/i18n/i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  DragOverlay: ({ children }: { children: ReactNode }) => <>{children}</>,
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/core/utils/hooks/useWindowSize', () => ({
  __esModule: true,
  default: () => [1440, 900],
}));

vi.mock('./DraggableUnit', () => ({
  __esModule: true,
  default: ({ unit }: { unit: Unit | null }) => (unit ? <div>{unit.description}</div> : null),
}));

vi.mock('./DroppableUnitArea', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const { useUnitsQueryMock, selectModeledUnitsMock } = vi.hoisted(() => ({
  useUnitsQueryMock: vi.fn(),
  selectModeledUnitsMock: vi.fn(),
}));

vi.mock('@/modules/workingTime/hooks/useUnitsQuery', () => ({
  useUnitsQuery: useUnitsQueryMock,
  selectModeledUnits: selectModeledUnitsMock,
}));

vi.mock('@/modules/workingTime/hooks/useReorderMutation', async () => ({
  ...(await vi.importActual('@/modules/workingTime/hooks/useReorderMutation')),
  useAppendNewUnitMutation: () => ({ mutate: workspaceUiMocks.appendNewUnit }),
  useMoveUnitToDateMutation: () => ({ mutate: vi.fn() }),
  useReorderUnitsMutation: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/modules/workingTime/hooks/useDeleteUnitMutation', () => ({
  useDeleteUnitMutation: () => ({ mutate: vi.fn() }),
}));

const DATE = new Date('2026-07-28T12:00:00.000Z');

const mockSubmission: UseWorkUnitSubmissionResult = {
  submitAdd: vi.fn(),
  submitEdit: vi.fn(),
  isSubmitting: false,
  isRetryBlocked: false,
  retryBlockReason: null,
  getFormSession: () => 0,
  isActiveWorkUnitFormSession: () => true,
  resetSubmissionState: vi.fn(),
};

const createUnit = (overrides: Partial<Unit>): Unit => ({
  convertedDate: DATE,
  createdAt: '2026-07-28T08:00:00.000Z',
  date: '2026-07-28',
  description: 'Worklog',
  duration: 'PT8H',
  entryType: WorkUnitEntryType.Worklog,
  formattedCreatedAt: '28/07/2026',
  formattedDate: '28/07/2026',
  formattedDuration: '8:00',
  formattedReportDuration: '8:00',
  id: 'unit-1',
  modifiedAt: '2026-07-28T08:00:00.000Z',
  projectClient: {
    clientColor: '#123456',
    clientId: 'client-1',
    clientName: 'Iterators',
    clientTexture: '',
    projectDescription: '',
    projectId: 'project-1',
    projectName: 'Epoca',
  },
  sequenceIndex: 0,
  state: UnitState.Active,
  taskId: 'CT-509',
  userFullName: 'Test User',
  userId: 'user-1',
  ...overrides,
});

describe('Calendar entry-type totals', () => {
  it('excludes notes from the daily hours summary', () => {
    const worklog = createUnit({});
    const note = createUnit({
      description: 'Administrative note',
      duration: 'PT4H',
      entryType: WorkUnitEntryType.Note,
      formattedDuration: '4:00',
      formattedReportDuration: '4:00',
      id: 'note-1',
      sequenceIndex: 1,
    });
    providerMocks.auth.mockReturnValue({ hasAccess: vi.fn(() => true), loggedInUser: { id: 'user-1' } });
    providerMocks.clients.mockReturnValue({ clients: [] });
    providerMocks.workspace.mockReturnValue({ contextOrganizationUsers: [] });
    providerMocks.projects.mockReturnValue({ projects: [], reportedProjects: [] });
    providerMocks.toast.mockReturnValue({ addToast: vi.fn() });
    useUnitsQueryMock.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });
    selectModeledUnitsMock.mockReturnValue([worklog, note]);

    render(<Calendar dates={[DATE]} weekStart="2026-07-27" weekEnd="2026-08-02" submission={mockSubmission} />);

    expect(screen.getByText('working_time.calendar.text.sum 08:00')).toBeVisible();
    expect(screen.queryByText('working_time.calendar.text.sum 12:00')).not.toBeInTheDocument();
  });
});

describe('Calendar new unit ordering', () => {
  const WEEK = Array.from({ length: 7 }, (_, index) => new Date(2026, 6, 27 + index));
  const existingUnit = createUnit({ id: 'existing-1', date: '2026-07-28' });

  const renderAddForm = (addedUnit: RawUnit): void => {
    providerMocks.auth.mockReturnValue({ hasAccess: vi.fn(() => true), loggedInUser: { id: 'user-1' } });
    providerMocks.clients.mockReturnValue({ clients: [] });
    providerMocks.workspace.mockReturnValue({ contextOrganizationUsers: [] });
    providerMocks.projects.mockReturnValue({ projects: [], reportedProjects: [] });
    providerMocks.toast.mockReturnValue({ addToast: vi.fn() });
    useUnitsQueryMock.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });
    selectModeledUnitsMock.mockReturnValue([existingUnit]);
    workspaceUiMocks.modalConfig = { type: 'add', isOpen: true, date: WEEK[1] };
    workspaceUiMocks.addedUnit = addedUnit;

    render(<Calendar dates={WEEK} weekStart="2026-07-27" weekEnd="2026-08-02" submission={mockSubmission} />);
  };

  afterEach(() => {
    workspaceUiMocks.modalConfig = { type: null };
    workspaceUiMocks.addedUnit = null;
    workspaceUiMocks.appendNewUnit.mockReset();
  });

  it('appends a new unit dated inside the visible week to the end of its day', () => {
    renderAddForm({ ...createUnit({ id: 'new-1', date: '2026-07-28' }), userFullName: 'Test User' });

    fireEvent.click(screen.getByRole('button', { name: 'save unit' }));

    expect(workspaceUiMocks.appendNewUnit).toHaveBeenCalledTimes(1);
    expect(workspaceUiMocks.appendNewUnit.mock.calls[0][0]).toMatchObject({
      movedUnitId: 'new-1',
      orderedUnitIds: ['existing-1', 'new-1'],
    });
  });

  it('does not send a day order for a new unit dated outside the visible week', () => {
    renderAddForm({ ...createUnit({ id: 'new-2', date: '2026-08-05' }), userFullName: 'Test User' });

    fireEvent.click(screen.getByRole('button', { name: 'save unit' }));

    expect(workspaceUiMocks.appendNewUnit).not.toHaveBeenCalled();
  });
});
