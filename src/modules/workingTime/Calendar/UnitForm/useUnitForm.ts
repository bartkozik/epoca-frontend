import { useToast } from '@/core/providers/toastProvider';
import {
  convertTimeFormat,
  DATE_FORMAT,
  getCorrelationIdFromError,
  handleValidationErrors,
} from '@/core/utils/helpers';
import { KeyBoardEventType, useKeyDown, useOnClickOutside } from '@/core/utils/hooks';
import { useDeleteUnitMutation } from '@/modules/workingTime/hooks/useDeleteUnitMutation';
import { showUnitDeleteErrorToast } from '@/modules/workingTime/showUnitDeleteErrorToast';
import { Unit, UnitDto, UnitEditDto, UnitState, WorkUnitEntryType } from '@/modules/workingTime/types';
import { getAvailableHoursForDay } from '@/modules/workingTime/unitCalculations';
import { useUnitWorkspace } from '@/modules/workingTime/UnitWorkspaceProvider';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import type { ClientAndProjectOption } from './ClientAndProjectDropdown';
import { NoteFormSchema, WorklogFormSchema } from './models/unitForm.model';
import type { FormErrors, UnitFormProps } from './types';
import { useUnitFormDraft } from './useUnitFormDraft';
import { useWorkUnitSubmission } from './useWorkUnitSubmission';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useUnitForm({
  date,
  unit,
  isFormInReportView = false,
  units = [],
  submission,
  onUnitAdded,
  onRequestClose,
  onSaveSuccess,
  onDirtyChange,
  onBusyChange,
  interactionBlocked,
  editAdapter,
}: UnitFormProps) {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [isDateSelectorOpen, setIsDateSelectorOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Dayjs>(dayjs(date));
  const [dateInputValue, setDateInputValue] = useState(dayjs(date).format(DATE_FORMAT.DAY_WITH_DOT));
  const unitWorkspace = useUnitWorkspace();
  const {
    clearError,
    closeModal,
    closeEditUnitModal,
    clientAndProjectOptions,
    getContextualClientProject,
    isFormError,
    isNoRequiredFieldsInFormError,
    modalConfig,
    openArchiveReportedUnitConfirm,
    openDeleteUnitConfirmation,
    reportedHours,
    reportedUnitsClientAndProjectOptions,
    resetFormErrors,
    selectedClientAndProject,
    selectedEntryType,
    setIsNoRequiredFieldsInFormError,
    setReportedHours,
    setSelectedClientAndProjectOption,
    setSelectedEntryType,
    setTaskId,
    setUnitDescription,
    setUnitFormErrors,
    taskId,
    unitDescription,
    unitFormErrors,
  } = unitWorkspace;
  const ownSubmission = useWorkUnitSubmission();
  const {
    submitAdd,
    submitEdit,
    isSubmitting,
    isRetryBlocked,
    getFormSession,
    isActiveWorkUnitFormSession,
    resetSubmissionState,
  } = submission ?? ownSubmission;
  const deleteUnitMutation = useDeleteUnitMutation();
  const [isSubmittingForDraft, setIsSubmittingForDraft] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const availableHours = Number(getAvailableHoursForDay(units, selectedDay.toDate(), unit?.id));
  const isNote = selectedEntryType === WorkUnitEntryType.Note;
  useUnitFormDraft({
    unit,
    editAdapter,
    selectedDay,
    setSelectedDay,
    dateInputValue,
    setDateInputValue,
    onDirtyChange,
  });

  useEffect(() => onBusyChange?.(isSubmitting), [isSubmitting, onBusyChange]);

  useEffect(() => {
    if (selectedClientAndProject && (isNote || reportedHours) && unitDescription) resetFormErrors();
  }, [isNote, selectedClientAndProject, reportedHours, unitDescription]);

  const validateDraftForm = (): { newFormErrors: FormErrors; hasError: boolean } => {
    const newFormErrors: FormErrors = { ...unitFormErrors };
    let hasError = false;

    if (!selectedClientAndProject) {
      newFormErrors.projectId = {
        message: t('working_time.calendar.unit_form.error.clients_and_project_required'),
      };
      hasError = true;
    } else delete newFormErrors.projectId;

    if (!isNote && !reportedHours) {
      newFormErrors.duration = {
        message: t('working_time.calendar.unit_form.error.hours_field_required'),
      };
      hasError = true;
    } else delete newFormErrors.duration;

    return { newFormErrors, hasError };
  };

  const handleOnDraftSave = (): void => {
    if (interactionBlocked?.() || isSubmitting || isRetryBlocked) return;

    const { newFormErrors, hasError } = validateDraftForm();
    setUnitFormErrors(newFormErrors);

    if (hasError) {
      setIsNoRequiredFieldsInFormError(true);
      return;
    }

    setIsSubmittingForDraft(true);

    // Ignore responses from a closed form session so they cannot mutate the newly opened form.
    const formSession = getFormSession();
    const onComplete = (): void => {
      if (isActiveWorkUnitFormSession(formSession)) setIsSubmittingForDraft(false);
    };

    if (!unit) {
      void submitAdd(createFormData, true)
        .then((result) => {
          if (result && isActiveWorkUnitFormSession(formSession)) {
            onUnitAdded?.(result);
            addToast({ content: t('toast_message.working_time.add_new_unit') });
            closeModal();
            resetSubmissionState();
          }
        })
        .finally(onComplete);
    } else {
      void submitEdit(unit.id, editFormData, false)
        .then((success) => {
          if (success && isActiveWorkUnitFormSession(formSession)) {
            addToast({ content: t('toast_message.calendar.report_message_updated') });
            handleEditSuccess();
          }
        })
        .finally(onComplete);
    }
  };

  const handleDraftDiscard = (id: string): void => {
    deleteUnitMutation.mutate(
      { workUnitId: id },
      {
        onSuccess: () => addToast({ content: t('toast_message.calendar.draft_discard') }),
        onError: (err) => showUnitDeleteErrorToast(err, getCorrelationIdFromError(err), addToast),
        onSettled: () => {
          closeModal();
          resetSubmissionState();
        },
      },
    );
  };

  const handleClose = (): void => {
    if (interactionBlocked?.()) return;
    if (onRequestClose) {
      onRequestClose();
      return;
    }
    closeModal();
    resetSubmissionState();
  };

  const handleEditSuccess = (): void => {
    closeModal();
    closeEditUnitModal();
    resetSubmissionState();
  };

  useOnClickOutside({
    ref: calendarRef,
    handler: () => setIsDateSelectorOpen(false),
  });

  useKeyDown({
    keyboardEventType: KeyBoardEventType.ENTER,
    action: () => {
      if (!interactionBlocked?.()) formRef.current?.requestSubmit();
    },
    isListening: true,
    options: { ctrlKey: true },
  });

  useKeyDown({
    keyboardEventType: KeyBoardEventType.ESC,
    action: handleClose,
    isListening: true,
  });

  const isActive = unit && unit.state === UnitState.Active;
  const isDraft = unit && unit.state === UnitState.Draft;

  const contextualSelectedClientProject = getContextualClientProject(Boolean(unit));

  const { archived, id, description, unitCreatorIsNoProjectMember } = contextualSelectedClientProject;
  const displayedProject = editAdapter ? editAdapter.project : selectedClientAndProject;
  const displayedTaskId = editAdapter ? editAdapter.taskId : taskId;
  const sourceReadOnly = editAdapter?.sourceReadOnly ?? false;
  const displayedProjectDescription = editAdapter ? (editAdapter.projectDescription ?? '') : description;

  const selectedDate = dayjs(selectedDay).format(DATE_FORMAT.DAY_BE_FORMAT);
  const formattedDuration = convertTimeFormat({ time: reportedHours || 0 });
  const commonFormData = {
    projectId: id,
    date: selectedDate,
    description: unitDescription,
    taskId: taskId,
  };
  const createFormData: UnitDto = {
    ...commonFormData,
    // PATCH ignores null task IDs; only an empty string clears an existing task ID.
    taskId: taskId.trim() ? taskId : null,
    entryType: selectedEntryType,
    ...(isNote ? {} : { duration: formattedDuration }),
  };
  const editFormData: UnitEditDto = {
    ...commonFormData,
    duration: formattedDuration,
  };
  const validationFormData = {
    ...commonFormData,
    projectId: editAdapter ? editAdapter.project?.projectId : commonFormData.projectId,
    duration: isNote ? undefined : formattedDuration,
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    if (sourceReadOnly || editAdapter?.disabled || interactionBlocked?.()) return;
    const newValue = e.target.value;
    setUnitDescription(newValue);

    if (!unitFormErrors.description) return;

    clearError('description');
    setIsNoRequiredFieldsInFormError(false);
  };

  const handleClientAndProjectChange = (option: ClientAndProjectOption | undefined): void => {
    if (interactionBlocked?.() || editAdapter?.disabled || editAdapter?.assignmentReadOnly) return;
    if (option) {
      if (editAdapter) editAdapter.onProjectChange(option);
      else setSelectedClientAndProjectOption(option);
    }
  };

  const handleReportedHoursChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (sourceReadOnly || editAdapter?.disabled || interactionBlocked?.()) return;
    const newValue = e.target.value;
    setReportedHours(newValue);

    if (!unitFormErrors.duration) return;

    clearError('duration');
    setIsNoRequiredFieldsInFormError(false);
  };

  const handleEntryTypeChange = (entryType: WorkUnitEntryType): void => {
    setSelectedEntryType(entryType);

    if (entryType === WorkUnitEntryType.Worklog && selectedDay.isAfter(dayjs(), 'day')) {
      handleSelectDate(dayjs());
    }

    if (entryType === WorkUnitEntryType.Note && unitFormErrors.duration) {
      clearError('duration');
      setIsNoRequiredFieldsInFormError(false);
    }
  };

  const handleDateChange = (date: string): void => {
    if (sourceReadOnly || editAdapter?.disabled || interactionBlocked?.()) return;
    setDateInputValue(date);
  };

  const handleEnterDate = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();

      const value = e.currentTarget.getAttribute('value')?.split('.').reverse().join('-');
      const date = new Date(value || '');
      handleSelectDate(dayjs(date));
    }
  };

  const handleSelectDate = (date: Dayjs): void => {
    if (sourceReadOnly || editAdapter?.disabled || interactionBlocked?.()) return;
    const formattedDate = dayjs(date);
    const isFutureWorklogDate =
      selectedEntryType === WorkUnitEntryType.Worklog && formattedDate.isAfter(dayjs(), 'day');

    if (formattedDate.isValid() && !isFutureWorklogDate) {
      setSelectedDay(formattedDate);
      setIsDateSelectorOpen(false);
      setDateInputValue(formattedDate.format(DATE_FORMAT.DAY_WITH_DOT));
    }
  };

  const handleSubmit = (e: React.SyntheticEvent): void => {
    e.preventDefault();

    if (interactionBlocked?.() || isSubmitting || isRetryBlocked) return;
    if (editAdapter?.disabled || editAdapter?.saveDisabled) return;
    if (editAdapter && sourceReadOnly) {
      void editAdapter.onSubmit(editFormData);
      return;
    }

    const validationResult =
      selectedEntryType === WorkUnitEntryType.Worklog
        ? WorklogFormSchema(availableHours).safeParse(validationFormData)
        : NoteFormSchema.safeParse(validationFormData);

    if (!validationResult.success) {
      const validationErrors = handleValidationErrors(validationResult.error);

      setUnitFormErrors(validationErrors);
      setIsNoRequiredFieldsInFormError(true);
    } else {
      if (editAdapter) {
        void editAdapter.onSubmit(editFormData);
        setIsNoRequiredFieldsInFormError(false);
        return;
      }
      const formSession = getFormSession();

      if (unit) {
        void submitEdit(unit.id, editFormData, true).then((success) => {
          if (success && isActiveWorkUnitFormSession(formSession)) {
            addToast({ content: t('toast_message.calendar.report_message_updated') });
            if (onRequestClose) {
              onDirtyChange?.(false);
              (onSaveSuccess ?? onRequestClose)();
            } else handleEditSuccess();
          }
        });
      } else {
        void submitAdd(createFormData, false).then((result) => {
          if (result && isActiveWorkUnitFormSession(formSession)) {
            onUnitAdded?.(result);
            addToast({ content: t('toast_message.working_time.add_new_unit') });
            closeModal();
            resetSubmissionState();
          }
        });
      }

      setIsNoRequiredFieldsInFormError(false);
    }
  };

  const handleDelete = (): void => {
    if (interactionBlocked?.() || isSubmitting || !unit) return;
    if (isFormInReportView) openArchiveReportedUnitConfirm(unit, date);
    else openDeleteUnitConfirmation(unit as Unit, date);
  };

  return {
    formRef,
    calendarRef,
    descriptionRef,
    selectedDay,
    dateInputValue,
    isDateSelectorOpen,
    setIsDateSelectorOpen,
    handleDateChange,
    handleEnterDate,
    handleSelectDate,
    isNote,
    isActive,
    isDraft,
    handleEntryTypeChange,
    handleClientAndProjectChange,
    displayedProject,
    displayedTaskId,
    displayedProjectDescription,
    sourceReadOnly,
    archived,
    unitCreatorIsNoProjectMember,
    clientAndProjectOptions,
    reportedUnitsClientAndProjectOptions,
    unitFormErrors,
    reportedHours,
    unitDescription,
    taskId,
    setTaskId,
    selectedEntryType,
    selectedClientAndProject,
    handleDescriptionChange,
    handleReportedHoursChange,
    handleSubmit,
    handleDelete,
    handleDraftDiscard,
    handleOnDraftSave,
    isSubmitting,
    isRetryBlocked,
    isSubmittingForDraft,
    isNoRequiredFieldsInFormError,
    isFormError,
    modalConfig,
    isDeletingDraft: deleteUnitMutation.isPending,
  };
}
