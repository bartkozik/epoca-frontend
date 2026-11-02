import { addToast } from '@/core/providers/toastProvider';
import colorVariables from '@/core/theme/variables.module.scss';
import { getCorrelationIdFromError } from '@/core/utils/helpers';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useClients } from '@/modules/clients/ClientsProvider';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { useDeleteUnitMutation } from '@/modules/workingTime/hooks/useDeleteUnitMutation';
import { useCallback, useMemo, useReducer, useRef } from 'react';
import i18n from 'i18next';
import type { ModalConfig } from './Calendar/ModalConfig';
import type { ClientAndProjectOption } from './Calendar/UnitForm/ClientAndProjectDropdown';
import { showUnitDeleteErrorToast } from './showUnitDeleteErrorToast';
import { WorkUnitEntryType } from './types';
import { UnitWorkspaceContext, type UnitWorkspaceState, type UnitWorkspaceValue } from './UnitWorkspaceContext';

const EMPTY_MODAL_CONFIG: ModalConfig = { isOpen: false, type: null, date: null, unit: null };
const CLIENT_COLOR_DEFAULT = colorVariables.clientColorDefault;

// A unit's own project/client may be missing from the project lists (e.g. the user was detached
// from it); this fallback is built only from data of a unit the user already owns, so it doesn't
// widen the project picker or any other list, and the backend still enforces assignment rules on
// save. Shared by selectedClientAndProject (initializeUnitFormData) and its id (getContextualClientProject)
// so both stay in sync.
const toDetachedProjectOption = (projectClient: {
  projectId: string;
  clientName: string;
  projectName: string;
  clientColor: string;
}): ClientAndProjectOption => ({
  projectId: projectClient.projectId,
  clientName: projectClient.clientName,
  projectName: projectClient.projectName,
  clientColor: projectClient.clientColor,
});

const initialState = (): UnitWorkspaceState => ({
  isArchiveDraftConfirmOpen: false,
  isArchiveReportedUnitConfirmOpen: false,
  isArchiveUnitConfirmOpen: false,
  isFormError: false,
  isNoRequiredFieldsInFormError: false,
  isUnreportedDraftsModalOpen: false,
  isUnreportedDraftsWarningOpen: false,
  modalConfig: EMPTY_MODAL_CONFIG,
  reportedHours: '',
  selectedClientAndProject: undefined,
  selectedEntryType: WorkUnitEntryType.Worklog,
  selectedUnit: undefined,
  taskId: '',
  unitCreatorId: '',
  unitDescription: '',
  unitFormErrors: {},
});

export function UnitWorkspaceProvider({ children }: React.PropsWithChildren): JSX.Element {
  const [, render] = useReducer((value: number): number => value + 1, 0);
  const state = useRef(initialState());
  const { clients } = useClients();
  const { projects, reportedProjects } = useProjects();
  const { loggedInUser } = useAuth();
  const deleteUnitMutation = useDeleteUnitMutation();
  const patch = useCallback((partial: Partial<UnitWorkspaceState>): void => {
    const changed = Object.entries(partial).some(
      ([key, value]) => !Object.is(state.current[key as keyof UnitWorkspaceState], value),
    );
    if (!changed) return;
    state.current = { ...state.current, ...partial };
    render();
  }, []);
  const openUnreportedDraftsWarning = useCallback(
    (warn: boolean): void => {
      if (warn) patch({ isUnreportedDraftsWarningOpen: true });
    },
    [patch],
  );
  const closeUnreportedDraftsWarning = useCallback(
    (): void => patch({ isUnreportedDraftsWarningOpen: false }),
    [patch],
  );
  const resetForm = (): void =>
    patch({
      unitDescription: '',
      reportedHours: '',
      taskId: '',
      unitCreatorId: '',
      selectedClientAndProject: undefined,
      selectedEntryType: WorkUnitEntryType.Worklog,
      isNoRequiredFieldsInFormError: false,
      isArchiveReportedUnitConfirmOpen: false,
      unitFormErrors: {},
      selectedUnit: undefined,
      isFormError: false,
    });
  const closeModal = (): void => {
    patch({ modalConfig: EMPTY_MODAL_CONFIG });
    resetForm();
  };
  const closeArchiveReportedUnitConfirm = (): void => {
    patch({ isArchiveReportedUnitConfirmOpen: false, selectedUnit: undefined });
    resetForm();
  };
  const closeArchiveUnitConfirmation = (): void => patch({ isArchiveUnitConfirmOpen: false, selectedUnit: undefined });
  const closeArchiveDraftConfirmation = (): void =>
    patch({ isArchiveDraftConfirmOpen: false, selectedUnit: undefined });
  const closeConfirmations = (): void => {
    closeArchiveUnitConfirmation();
    closeArchiveDraftConfirmation();
    closeArchiveReportedUnitConfirm();
  };
  const options = (source: typeof projects): ClientAndProjectOption[] =>
    source
      .map(({ id, client, name }) => ({
        id,
        projectId: id,
        clientName: client?.name ?? '',
        projectName: name,
        clientColor: client?.color ?? CLIENT_COLOR_DEFAULT,
      }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.projectName.localeCompare(b.projectName));
  const activeClientIds = new Set(clients.filter(({ archived }) => !archived).map(({ id }) => id));
  const clientAndProjectOptions = options(
    projects.filter(
      ({ archived, client, userIds }) =>
        !archived && activeClientIds.has(client.id) && Boolean(loggedInUser && userIds.includes(loggedInUser.id)),
    ),
  );
  const reportedUnitsClientAndProjectOptions = options(reportedProjects);

  const value = useMemo<UnitWorkspaceValue>(
    () => ({
      ...state.current,
      clientAndProjectOptions,
      reportedUnitsClientAndProjectOptions,
      getCurrentSnapshot: () => state.current,
      getContextualClientProject: (includeCreator) => {
        const selected = state.current.selectedClientAndProject;
        const project = reportedProjects.find(({ id }) => id === selected?.projectId);
        return {
          description: project?.description ?? '',
          id: project?.id ?? selected?.projectId ?? '',
          archived: project?.archived ?? false,
          unitCreatorIsNoProjectMember: includeCreator
            ? !project?.userIds.includes(state.current.unitCreatorId)
            : false,
        };
      },
      initializeUnitFormData: (unit) =>
        patch({
          selectedClientAndProject: unit.projectClient
            ? (reportedUnitsClientAndProjectOptions.find(
                ({ projectId }) => projectId === unit.projectClient?.projectId,
              ) ?? toDetachedProjectOption(unit.projectClient))
            : undefined,
          selectedEntryType: unit.entryType,
          reportedHours: unit.formattedDuration,
          unitDescription: unit.description ?? '',
          taskId: unit.taskId ?? '',
          unitCreatorId: unit.userId,
        }),
      closeModal,
      openArchiveReportedUnitConfirm: (unit, date) =>
        patch({
          selectedUnit: unit,
          isArchiveReportedUnitConfirmOpen: true,
          modalConfig: { ...state.current.modalConfig, date, isOpen: false } as unknown as ModalConfig,
        }),
      closeArchiveReportedUnitConfirm,
      closeEditUnitModal: () => {
        resetForm();
        patch({ modalConfig: { ...state.current.modalConfig, isOpen: false } as ModalConfig });
      },
      openArchiveUnitConfirmation: (unit) => patch({ isArchiveUnitConfirmOpen: true, selectedUnit: unit }),
      closeArchiveUnitConfirmation,
      openArchiveDraftConfirmation: (unit) => patch({ isArchiveDraftConfirmOpen: true, selectedUnit: unit }),
      closeArchiveDraftConfirmation,
      setIsNoRequiredFieldsInFormError: (value) => patch({ isNoRequiredFieldsInFormError: value }),
      setUnitFormErrors: (errors) => patch({ unitFormErrors: errors, isFormError: true }),
      resetFormErrors: () => patch({ isFormError: false, isNoRequiredFieldsInFormError: false }),
      clearError: (field) =>
        patch({ unitFormErrors: { ...state.current.unitFormErrors, [field]: undefined }, isFormError: false }),
      openDeleteUnitConfirmation: (unit, date) =>
        patch({ modalConfig: { isOpen: true, type: 'deleteConfirmation', date, unit } }),
      handleUnitEditFormOpen: (unit) =>
        patch({ modalConfig: { isOpen: true, type: 'edit', date: new Date(unit.date), unit } }),
      handleReportedUnitEditFormOpen: (unit) =>
        patch({
          selectedUnit: unit,
          modalConfig: { isOpen: true, type: 'reportEdit', date: new Date(unit.date), unit },
        }),
      handleArchiveSelectedUnit: () => {
        const unit = state.current.selectedUnit;
        if (!unit) return;
        deleteUnitMutation.mutate(
          { workUnitId: unit.id },
          {
            onSuccess: () => {
              addToast({ content: i18n.t('toast_message.calendar.report_delete') });
              closeConfirmations();
            },
            onError: (error) => showUnitDeleteErrorToast(error, getCorrelationIdFromError(error), addToast),
          },
        );
      },
      handleUnitAddFormOpen: (date) => patch({ modalConfig: { isOpen: true, type: 'add', date, draft: undefined } }),
      handleDeleteConfirmationCancel: closeModal,
      openUnreportedDraftsWarning,
      closeUnreportedDraftsWarning,
      openUnreportedDraftsModal: () =>
        patch({ isUnreportedDraftsModalOpen: true, isUnreportedDraftsWarningOpen: false }),
      closeUnreportedDraftsModal: () => patch({ isUnreportedDraftsModalOpen: false }),
      setSelectedClientAndProjectOption: (option) => patch({ selectedClientAndProject: option }),
      setSelectedEntryType: (type) => patch({ selectedEntryType: type }),
      setReportedHours: (hours) => patch({ reportedHours: hours.replace(/^[.,:]/, '').replace(/[^0-9,.:]/g, '') }),
      setUnitDescription: (unitDescription) => patch({ unitDescription }),
      setTaskId: (taskId) => patch({ taskId }),
      setUnitCreatorId: (unitCreatorId) => patch({ unitCreatorId }),
    }),
    [
      clientAndProjectOptions,
      deleteUnitMutation,
      reportedProjects,
      reportedUnitsClientAndProjectOptions,
      state.current,
    ],
  );
  return <UnitWorkspaceContext.Provider value={value}>{children}</UnitWorkspaceContext.Provider>;
}
