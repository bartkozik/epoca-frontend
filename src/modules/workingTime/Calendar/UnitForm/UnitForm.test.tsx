import enTranslation from '@/core/i18n/locales/en/translation.json';
import plTranslation from '@/core/i18n/locales/pl/translation.json';
import { Unit, UnitState, WorkUnitEntryType } from '@/modules/workingTime/types';
import { fireEvent, render, RenderResult, screen, waitFor } from '@testing-library/react';
import type { Dayjs } from 'dayjs';
import type { Mock } from 'vitest';
import UnitForm from './UnitForm';

const providerMocks = vi.hoisted(() => ({ auth: vi.fn(), toast: vi.fn() }));
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: providerMocks.auth }));
vi.mock('@/core/providers/toastProvider/ToastProvider', () => ({ useToast: providerMocks.toast }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/core/i18n/i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

const { useWorkUnitSubmissionMock, useDeleteUnitMutationMock } = vi.hoisted(() => ({
  useWorkUnitSubmissionMock: vi.fn(),
  useDeleteUnitMutationMock: vi.fn(),
}));

vi.mock('./useWorkUnitSubmission', () => ({
  useWorkUnitSubmission: useWorkUnitSubmissionMock,
}));

vi.mock('@/modules/workingTime/hooks/useDeleteUnitMutation', () => ({
  useDeleteUnitMutation: useDeleteUnitMutationMock,
}));

const { useUnitWorkspaceMock } = vi.hoisted(() => ({ useUnitWorkspaceMock: vi.fn() }));

vi.mock('@/modules/workingTime/UnitWorkspaceProvider', () => ({
  useUnitWorkspace: useUnitWorkspaceMock,
  // eslint-disable-next-line react-hooks/rules-of-hooks -- mocked plain-function export, not a real hook call
  getUnitWorkspaceSnapshotValue: (): unknown => useUnitWorkspaceMock(),
}));

vi.mock('@/core/theme/dateSelector', async () => {
  const dayjsModule = await vi.importActual<typeof import('dayjs')>('dayjs');
  const mockDayjs = (dayjsModule as unknown as { default?: typeof dayjsModule }).default ?? dayjsModule;

  return {
    __esModule: true,
    default: ({ maxDate, onSelectDate }: { maxDate?: Dayjs; onSelectDate: (date: Dayjs) => void }) => (
      <div>
        <output data-testid="date-selector-max-date">{maxDate?.format('YYYY-MM-DD') ?? 'unbounded'}</output>
        <button onClick={() => onSelectDate(mockDayjs('2026-08-10'))} type="button">
          choose future date
        </button>
      </div>
    ),
  };
});

const FORM_DATE = new Date('2026-07-28T00:00:00.000Z');
const selectedClientAndProject = {
  clientColor: '#123456',
  clientId: 'client-1',
  clientName: 'Iterators',
  projectId: 'project-1',
  projectName: 'Epoca',
};

const createUnit = (state: UnitState = UnitState.Draft): Unit => ({
  convertedDate: FORM_DATE,
  createdAt: '2026-07-28T08:00:00.000Z',
  date: '2026-07-28',
  description: 'Implement CT-514',
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
  state,
  taskId: 'CT-514',
  userFullName: 'Test User',
  userId: 'user-1',
});

interface RenderFormOptions {
  entryType?: WorkUnitEntryType;
  isSubmitting?: boolean;
  isRetryBlocked?: boolean;
  reportedHours?: string;
  taskId?: string;
  unit?: Unit;
}

interface RenderFormResult extends RenderResult {
  submitAdd: Mock;
  closeModal: Mock;
  submitEdit: Mock;
  setSelectedEntryType: Mock;
  isActiveWorkUnitFormSession: Mock;
  resetSubmissionState: Mock;
}

const renderForm = ({
  entryType = WorkUnitEntryType.Worklog,
  isSubmitting = false,
  isRetryBlocked = false,
  reportedHours = '8:00',
  taskId = 'CT-514',
  unit,
}: RenderFormOptions = {}): RenderFormResult => {
  const submitAdd = vi.fn().mockResolvedValue(undefined);
  const closeModal = vi.fn();
  const submitEdit = vi.fn().mockResolvedValue(undefined);
  const resetSubmissionState = vi.fn();
  const getFormSession = vi.fn(() => 0);
  const isActiveWorkUnitFormSession = vi.fn(() => true);
  const setSelectedEntryType = vi.fn();
  const workingHoursStore = {
    clearError: vi.fn(),
    clientAndProjectOptions: [selectedClientAndProject],
    closeModal,
    getAvailableHoursForDay: vi.fn(() => 672),
    getContextualClientProject: vi.fn(() => ({
      archived: false,
      description: '',
      id: 'project-1',
      unitCreatorIsNoProjectMember: false,
    })),
    getCurrentSnapshot: vi.fn(() => ({
      reportedHours,
      selectedClientAndProject,
      selectedEntryType: entryType,
      taskId,
      unitDescription: 'Implement CT-514',
    })),
    initializeUnitFormData: vi.fn(),
    isFormError: false,
    isNoRequiredFieldsInFormError: false,
    modalConfig: unit
      ? { date: FORM_DATE, isOpen: true, type: 'edit', unit }
      : { date: FORM_DATE, isOpen: true, type: 'add' },
    openArchiveReportedUnitConfirm: vi.fn(),
    openDeleteUnitConfirmation: vi.fn(),
    reportedHours,
    reportedUnitsClientAndProjectOptions: [selectedClientAndProject],
    resetFormErrors: vi.fn(),
    selectedClientAndProject,
    selectedEntryType: entryType,
    setIsNoRequiredFieldsInFormError: vi.fn(),
    setReportedHours: vi.fn(),
    setSelectedClientAndProjectOption: vi.fn(),
    setSelectedEntryType,
    setTaskId: vi.fn(),
    setUnitDescription: vi.fn(),
    setUnitFormErrors: vi.fn(),
    taskId,
    unitDescription: 'Implement CT-514',
    unitFormErrors: {},
  };
  providerMocks.auth.mockReturnValue({ hasAccess: vi.fn(() => true) });
  providerMocks.toast.mockReturnValue({ addToast: vi.fn() });
  useUnitWorkspaceMock.mockReturnValue(workingHoursStore);
  useWorkUnitSubmissionMock.mockReturnValue({
    submitAdd,
    submitEdit,
    isSubmitting,
    isRetryBlocked,
    getFormSession,
    isActiveWorkUnitFormSession,
    resetSubmissionState,
  });
  useDeleteUnitMutationMock.mockReturnValue({ mutate: vi.fn(), isPending: false });

  const view = render(<UnitForm date={FORM_DATE} unit={unit} />);

  return {
    ...view,
    submitAdd,
    closeModal,
    submitEdit,
    setSelectedEntryType,
    isActiveWorkUnitFormSession,
    resetSubmissionState,
  };
};

const getMainSubmitButton = (): HTMLButtonElement => screen.getByRole('button', { name: 'working_time.common.report' });

const getDraftButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: 'working_time.calendar.unit_form.button.save_draft.label' });

describe('UnitForm project description label', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the label typography class to the project description text', () => {
    renderForm();

    const labelText = screen.getByText('working_time.calendar.unit_form.title.project_description');

    expect(labelText).toHaveClass('projectDescriptionLabelText');
    screen.getAllByText('i').forEach((infoIcon) => expect(infoIcon).not.toHaveClass('projectDescriptionLabelText'));
  });
});

describe('UnitForm task ID field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the Task ID input expanded by default, before the description', () => {
    renderForm({ taskId: '' });

    const taskIdInput = screen.getByRole('textbox', { name: 'common.task_id' });
    const descriptionInput = screen.getByRole('textbox', { name: 'working_time.calendar.unit_form.field.description' });

    expect(taskIdInput).toBeVisible();
    expect(taskIdInput).toHaveValue('');
    expect(screen.queryByRole('button', { name: /add_task_id/ })).not.toBeInTheDocument();
    expect(taskIdInput.compareDocumentPosition(descriptionInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('creates a unit without a task ID as null rather than an empty string', () => {
    const { submitAdd } = renderForm({ taskId: '' });

    fireEvent.submit(getMainSubmitButton());

    expect(submitAdd).toHaveBeenCalledTimes(1);
    expect(submitAdd.mock.calls[0][0]).toMatchObject({ taskId: null });
  });

  it('sends an empty task ID on edit so the update clears a previously set one', () => {
    const { submitEdit } = renderForm({ taskId: '', unit: createUnit(UnitState.Active) });

    fireEvent.submit(screen.getByRole('button', { name: 'common.update' }));

    expect(submitEdit).toHaveBeenCalledTimes(1);
    expect(submitEdit.mock.calls[0][1]).toMatchObject({ taskId: '' });
  });
});

describe('UnitForm retry blocking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables submit and draft actions for a blocked add form', () => {
    renderForm({ isRetryBlocked: true });

    expect(getMainSubmitButton()).toBeDisabled();
    expect(getDraftButton()).toBeDisabled();
  });

  it('disables otherwise available submit and draft actions for a blocked draft edit form', () => {
    renderForm({ isRetryBlocked: true, unit: createUnit(UnitState.Draft) });

    expect(getMainSubmitButton()).toBeDisabled();
    expect(getDraftButton()).toBeDisabled();
  });

  it('does not submit a blocked edit form through its native submit path', () => {
    const { submitAdd, submitEdit } = renderForm({
      isRetryBlocked: true,
      unit: createUnit(UnitState.Draft),
    });

    fireEvent.submit(getMainSubmitButton());

    expect(submitAdd).not.toHaveBeenCalled();
    expect(submitEdit).not.toHaveBeenCalled();
  });

  it('does not submit a blocked form through Ctrl+Enter', () => {
    const { submitAdd, submitEdit } = renderForm({ isRetryBlocked: true });

    fireEvent.keyDown(document, { ctrlKey: true, key: 'Enter' });

    expect(submitAdd).not.toHaveBeenCalled();
    expect(submitEdit).not.toHaveBeenCalled();
  });

  it('guards draft saving while blocked even if a click bypasses the disabled control', () => {
    const { submitAdd, submitEdit } = renderForm({
      isRetryBlocked: true,
      unit: createUnit(UnitState.Draft),
    });
    const draftButton = getDraftButton();
    Reflect.set(draftButton, 'disabled', false);

    fireEvent.click(draftButton);

    expect(submitAdd).not.toHaveBeenCalled();
    expect(submitEdit).not.toHaveBeenCalled();
  });

  it('keeps Escape available to close a blocked form', () => {
    const { closeModal } = renderForm({ isRetryBlocked: true });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(closeModal).toHaveBeenCalledTimes(1);
  });

  it('submits a normal valid add form once', () => {
    const { submitAdd } = renderForm();
    const submitButton = getMainSubmitButton();

    expect(submitButton).toBeEnabled();
    fireEvent.submit(submitButton);

    expect(submitAdd).toHaveBeenCalledTimes(1);
    expect(submitAdd).toHaveBeenCalledWith(
      {
        date: '2026-07-28',
        description: 'Implement CT-514',
        duration: 'PT8H0M',
        entryType: WorkUnitEntryType.Worklog,
        projectId: 'project-1',
        taskId: 'CT-514',
      },
      false,
    );
  });

  it('saves a normal draft once and keeps the form open after local completion', async () => {
    const { submitAdd, closeModal } = renderForm();
    const draftButton = getDraftButton();

    expect(draftButton).toBeEnabled();
    fireEvent.click(draftButton);

    expect(submitAdd).toHaveBeenCalledTimes(1);
    expect(submitAdd).toHaveBeenCalledWith(
      {
        date: '2026-07-28',
        description: 'Implement CT-514',
        duration: 'PT8H0M',
        entryType: WorkUnitEntryType.Worklog,
        projectId: 'project-1',
        taskId: 'CT-514',
      },
      true,
    );
    await waitFor(() => expect(draftButton).toBeEnabled());
    expect(closeModal).not.toHaveBeenCalled();
  });

  it('does not let a late successful add close a newer form session', async () => {
    const { submitAdd, closeModal, isActiveWorkUnitFormSession, resetSubmissionState } = renderForm();
    let resolveSubmission: (unit: Unit) => void;
    submitAdd.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSubmission = resolve;
        }),
    );

    fireEvent.submit(getMainSubmitButton());
    fireEvent.keyDown(document, { key: 'Escape' });
    isActiveWorkUnitFormSession.mockReturnValue(false);
    resolveSubmission!(createUnit());

    await waitFor(() => expect(isActiveWorkUnitFormSession).toHaveBeenCalled());
    expect(closeModal).toHaveBeenCalledTimes(1);
    expect(resetSubmissionState).toHaveBeenCalledTimes(1);
  });

  it('does not let a late successful edit close a newer form session', async () => {
    const { submitEdit, closeModal, isActiveWorkUnitFormSession, resetSubmissionState } = renderForm({
      unit: createUnit(UnitState.Active),
    });
    let resolveSubmission: (success: boolean) => void;
    submitEdit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSubmission = resolve;
        }),
    );

    fireEvent.submit(screen.getByRole('button', { name: 'common.update' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    isActiveWorkUnitFormSession.mockReturnValue(false);
    resolveSubmission!(true);

    await waitFor(() => expect(isActiveWorkUnitFormSession).toHaveBeenCalled());
    expect(closeModal).toHaveBeenCalledTimes(1);
    expect(resetSubmissionState).toHaveBeenCalledTimes(1);
  });

  it('does not let a late successful draft save close a newer form session', async () => {
    const { submitEdit, closeModal, isActiveWorkUnitFormSession, resetSubmissionState } = renderForm({
      unit: createUnit(UnitState.Draft),
    });
    let resolveSubmission: (success: boolean) => void;
    submitEdit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSubmission = resolve;
        }),
    );

    fireEvent.click(getDraftButton());
    fireEvent.keyDown(document, { key: 'Escape' });
    isActiveWorkUnitFormSession.mockReturnValue(false);
    resolveSubmission!(true);

    await waitFor(() => expect(isActiveWorkUnitFormSession).toHaveBeenCalled());
    expect(closeModal).toHaveBeenCalledTimes(1);
    expect(resetSubmissionState).toHaveBeenCalledTimes(1);
  });

  it('disables and guards both submission handlers while a unit is being submitted', () => {
    const { submitAdd, submitEdit } = renderForm({ isSubmitting: true });
    const buttons = screen.getAllByRole('button');
    const submitButton = buttons[buttons.length - 1];
    const draftButton = getDraftButton();

    expect(submitButton).toBeDisabled();
    expect(draftButton).toBeDisabled();

    Reflect.set(submitButton, 'disabled', false);
    Reflect.set(draftButton, 'disabled', false);
    fireEvent.submit(submitButton);
    fireEvent.click(draftButton);

    expect(submitAdd).not.toHaveBeenCalled();
    expect(submitEdit).not.toHaveBeenCalled();
  });
});

describe('UnitForm entry types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('submits a Note without duration and allows an unbounded date selector', () => {
    const { submitAdd } = renderForm({ entryType: WorkUnitEntryType.Note, reportedHours: '' });
    const submitButton = getMainSubmitButton();

    expect(screen.getByText('working_time.calendar.unit_form.question.what_to_add')).toBeVisible();
    expect(screen.getByRole('button', { name: 'working_time.entry_type.note' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'working_time.entry_type.worklog' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      screen.queryByPlaceholderText('working_time.calendar.unit_form.placeholder.duration'),
    ).not.toBeInTheDocument();
    expect(submitButton).toBeEnabled();

    fireEvent.click(screen.getByRole('textbox', { name: 'working_time.calendar.unit_form.field.selected_date' }));

    expect(screen.getByTestId('date-selector-max-date')).toHaveTextContent('unbounded');

    fireEvent.submit(submitButton);

    expect(submitAdd).toHaveBeenCalledWith(
      {
        date: '2026-07-28',
        description: 'Implement CT-514',
        entryType: WorkUnitEntryType.Note,
        projectId: 'project-1',
        taskId: 'CT-514',
      },
      false,
    );
  });

  it('keeps the Worklog date selector capped at today', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-30T12:00:00.000Z'));
    renderForm();

    fireEvent.click(screen.getByRole('textbox', { name: 'working_time.calendar.unit_form.field.selected_date' }));

    expect(screen.getByTestId('date-selector-max-date')).toHaveTextContent('2026-07-30');
  });

  it('clamps a future Note date when a new form switches back to Worklog', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-30T12:00:00.000Z'));
    const { setSelectedEntryType } = renderForm({ entryType: WorkUnitEntryType.Note, reportedHours: '' });
    const dateInput = screen.getByRole('textbox', { name: 'working_time.calendar.unit_form.field.selected_date' });

    fireEvent.click(dateInput);
    fireEvent.click(screen.getByRole('button', { name: 'choose future date' }));
    expect(dateInput).toHaveValue('10.08.2026');

    fireEvent.click(screen.getByRole('button', { name: 'working_time.entry_type.worklog' }));

    expect(setSelectedEntryType).toHaveBeenCalledWith(WorkUnitEntryType.Worklog);
    expect(dateInput).toHaveValue('30.07.2026');
  });

  it('shows the saved type as information on edit and keeps entryType out of the PATCH payload', () => {
    const note = createUnit(UnitState.Active);
    note.entryType = WorkUnitEntryType.Note;
    note.duration = 'PT0S';
    note.formattedDuration = '0:00';
    const { submitEdit } = renderForm({ entryType: WorkUnitEntryType.Note, reportedHours: '0:00', unit: note });

    expect(screen.queryByText('working_time.calendar.unit_form.question.what_to_add')).not.toBeInTheDocument();
    expect(screen.getByText('working_time.calendar.unit_form.information.added_as')).toBeVisible();
    expect(screen.getByText('working_time.entry_type.note')).toBeVisible();
    expect(
      screen.queryByRole('group', { name: 'working_time.calendar.unit_form.question.what_to_add' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'working_time.entry_type.note' })).not.toBeInTheDocument();

    fireEvent.submit(screen.getByRole('button', { name: 'common.update' }));

    expect(submitEdit).toHaveBeenCalledTimes(1);
    // submitEdit's argument order is (workUnitId, dto, shouldFinalize) -- the dto is the second
    // argument, unlike the old store's editUnit(dto, unitId, shouldFinalize).
    expect(submitEdit.mock.calls[0][0]).toBe('unit-1');
    expect(submitEdit.mock.calls[0][1]).not.toHaveProperty('entryType');
    expect(submitEdit.mock.calls[0][1]).toMatchObject({
      date: '2026-07-28',
      description: 'Implement CT-514',
      projectId: 'project-1',
      taskId: 'CT-514',
    });
  });

  it('shows a saved time entry as information without a switch', () => {
    renderForm({ unit: createUnit(UnitState.Active) });

    expect(screen.getByText('working_time.calendar.unit_form.information.added_as')).toBeVisible();
    expect(screen.getByText('working_time.entry_type.worklog')).toBeVisible();
    expect(
      screen.queryByRole('group', { name: 'working_time.calendar.unit_form.question.what_to_add' }),
    ).not.toBeInTheDocument();
  });

  it('uses human-readable copy in both supported languages', () => {
    expect(enTranslation['working_time.calendar.unit_form.question.what_to_add']).toBe('What would you like to add?');
    expect(plTranslation['working_time.calendar.unit_form.question.what_to_add']).toBe('Co chcesz dodać?');
    expect(enTranslation['working_time.calendar.unit_form.information.added_as']).toBe('Added as:');
    expect(plTranslation['working_time.calendar.unit_form.information.added_as']).toBe('Dodano jako:');
    expect(enTranslation['working_time.entry_type.worklog']).toBe('Time entry');
    expect(plTranslation['working_time.entry_type.worklog']).toBe('Czas pracy');
  });
});

describe('work-unit retry translations', () => {
  const retryMessages = {
    en: enTranslation as Record<string, string>,
    pl: plTranslation as Record<string, string>,
  };

  it.each([
    [
      'toast_message.working_time.idempotency_conflict',
      'Wykryto konflikt ponowienia zapisu. Spróbuj zapisać formularz ponownie.',
      'A save retry conflict was detected. Try saving the form again.',
    ],
    [
      'toast_message.working_time.idempotency_result_expired',
      'Dane wpisów zostały odświeżone, ponieważ nie można już potwierdzić wyniku zapisu. Zamknij i otwórz formularz ponownie.',
      'Work-unit data was refreshed because the save result can no longer be confirmed. Close and reopen the form before starting a new operation.',
    ],
    [
      'toast_message.working_time.idempotency_version_unsupported',
      'Dane wpisów zostały odświeżone z powodu nieobsługiwanej wersji wyniku zapisu. Zamknij i otwórz formularz ponownie.',
      'Work-unit data was refreshed because the save result version is unsupported. Close and reopen the form before starting a new operation.',
    ],
    [
      'toast_message.working_time.retryable_save_error',
      'Nie udało się tymczasowo potwierdzić zapisu. Spróbuj ponownie.',
      'The save could not be confirmed due to a temporary problem. Try again.',
    ],
  ])('provides actionable Polish and English text for %s', (key, polish, english) => {
    expect(retryMessages.pl[key]).toBe(polish);
    expect(retryMessages.en[key]).toBe(english);
  });
});
